import { getAircraftType } from '../data/aircraft';
import { economyCabin } from './cabins';
import { describe, expect, it } from 'vitest';
import airportsJson from '../data/generated/airports.json';
import countriesJson from '../data/generated/countries.json';
import airlinesJson from '../data/generated/airlines.json';
import networksJson from '../data/generated/networks.json';
import detailsJson from '../data/generated/airline-details.json';
import registersJson from '../data/generated/registers.json';
import eurostatJson from '../data/generated/routes-eurostat.json';
import type { Airport, Country } from '../data/types';
import { advance } from './advance';
import { applyCommand } from './commands';
import { aiRouteKey, competitorsOn } from './economics';
import { createGame } from './game';
import { emptyPnl, type GameState } from './state';
import { simTime } from './time';
import { buildRealAirlines } from './realAirlines';
import { buildEngineWorld } from './world';

const real = buildRealAirlines(airlinesJson as never, networksJson as never, detailsJson as never, registersJson as never, eurostatJson);
const world = buildEngineWorld(airportsJson as Airport[], countriesJson as unknown as Record<string, Country>, real);
const ap = (id: string) => world.airportById.get(id)!;

/** A Vienna startup with one A320neo already in service, flying VIE → `dest`. */
function startup(dest: string, frequency: number, fareFactor: number, seed = 1) {
  const state = createGame({ seed, startYear: 2026, timeMode: 'realtime', realism: 'realistic', scheduling: 'simple' });
  const founded = applyCommand(state, world, {
    type: 'FoundAirline',
    payload: { name: 'Danube Air', iata: 'D7', icao: 'DNB', primary: '#c8102e', secondary: '#ffffff', hubId: 'LOWW', capitalEur: 200_000_000, controller: 'human' },
  });
  const airlineId = (founded as { id: string }).id;
  state.aircraft.T1 = {
    id: 'T1', typeId: 'A20N', airlineId, registration: 'OE-LTA', builtYear: 2020, seats: 180, cabin: economyCabin(getAircraftType('A20N'), 180), status: 'active', deliveryAt: state.time, locationId: 'LOWW',
    lease: { lessor: 'AerCap', monthlyRent: { amount: 380_000, currency: 'USD' }, deposit: { amount: 760_000, currency: 'USD' }, startAt: state.time, endAt: state.time + 1e6 },
  };
  const opened = applyCommand(state, world, { type: 'OpenRoute', airlineId, payload: { destinationId: dest, aircraftId: 'T1', frequency, fareFactor } });
  expect(opened.ok).toBe(true);
  return { state, airlineId, routeId: (opened as { id: string }).id };
}

const aiMessages = (state: GameState, kind: string) => state.messages.filter((m) => m.kind === kind && m.airlineId !== null);

describe('AI airlines react by type (2.1b)', () => {
  it('a low-cost airline matches and undercuts a price cut', () => {
    expect(competitorsOn(world, ap('LOWW'), ap('LGAV'))!.some((c) => c.airlineId === 'RYR')).toBe(true);
    const { state } = startup('LGAV', 14, 0.7);
    advance(state, world, simTime(2026, 2, 5)); // every airline has had one monthly review
    const ryanair = state.ai.routes[aiRouteKey('RYR', 'LOWW', 'LGAV')]!;
    expect(ryanair.fare).toBeLessThanOrEqual(0.7);
    expect(ryanair.fare).toBeGreaterThanOrEqual(0.65);
    expect(aiMessages(state, 'aiFare').some((m) => m.params.airline === 'Ryanair')).toBe(true);
  });

  it("the home rival at the player's hub defends with more flights and follows most of a price cut", () => {
    const { state } = startup('EGLL', 14, 0.8);
    const before = competitorsOn(world, ap('LOWW'), ap('EGLL'))!.find((c) => c.airlineId === 'AUA')!.weekly;
    advance(state, world, simTime(2026, 2, 5));
    const austrian = state.ai.routes[aiRouteKey('AUA', 'LOWW', 'EGLL')]!;
    expect(austrian.defended).toBe(true);
    expect(austrian.weeklyAB).toBeGreaterThan(before);
    expect(austrian.fare).toBeLessThan(1.05);
    expect(austrian.fare).toBeGreaterThan(0.8); // follows 80 % of the cut, not all of it
    expect(aiMessages(state, 'aiFrequency').some((m) => m.params.airline === 'Austrian Airlines')).toBe(true);
  });

  it('airlines with a base at the airport enter a route where the player makes good money', () => {
    const { state, airlineId, routeId } = startup('EGLL', 7, 1.2);
    // Pretend the route is full and profitable every month, then watch for an entrant.
    for (let month = 2; month <= 13; month++) {
      advance(state, world, simTime(2026, month, 1) - 1); // just before the 1st, when airlines look at your routes
      state.finance[airlineId]!.history.push({ start: state.time, lines: emptyPnl(), routes: { [routeId]: { flights: 14, seats: 2520, pax: 2300, revenue: 500_000, directCosts: 300_000 } } });
      advance(state, world, simTime(2026, month, 2));
      if (aiMessages(state, 'aiEnter').length) break;
    }
    const entries = aiMessages(state, 'aiEnter');
    expect(entries.length).toBeGreaterThan(0);
    const entrant = [...real.byId.values()].find((a) => a.name === entries[0]!.params.airline)!;
    expect([...entrant.hubs, ...entrant.bases].some((b) => b === 'LOWW' || b === 'EGLL')).toBe(true);
  });

  it('keeps the real world stable when the player does nothing, and stays fast and small', () => {
    const state = createGame({ seed: 9, startYear: 2026, timeMode: 'realtime', realism: 'realistic', scheduling: 'simple' });
    const t0 = performance.now();
    advance(state, world, simTime(2027, 1, 1));
    const seconds = (performance.now() - t0) / 1000;
    const closedReal = Object.entries(state.ai.routes).filter(([, r]) => r.closed && !r.added).length;
    const bankrupt = Object.values(state.ai.airlines).filter((a) => a.status === 'bankrupt').length;
    expect(closedReal).toBeLessThan(0.02 * 51_760);
    expect(bankrupt).toBeLessThan(15);
    expect(Object.values(state.ai.routes).filter((r) => r.added).length).toBeGreaterThan(100); // airlines grow
    expect(JSON.stringify(state).length).toBeLessThan(1_500_000);
    // ≈ 4.5 s on a laptop; GitHub's small build machine runs other test files at the same time.
    expect(seconds).toBeLessThan(18);
  }, 60_000);

  it('is deterministic', () => {
    const run = () => {
      const { state } = startup('LGAV', 10, 0.8, 4);
      advance(state, world, simTime(2026, 3, 1));
      return JSON.stringify(state.ai);
    };
    expect(run()).toBe(run());
  }, 60_000);
});


// Phase 6.2: taking over Austrian Airlines today.
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
import { buildRealAirlines } from './realAirlines';
import { pairsOfRoute, validateSpecs } from './schedule';
import { simTime } from './time';
import { buildEngineWorld } from './world';

const real = buildRealAirlines(airlinesJson as never, networksJson as never, detailsJson as never, registersJson as never, eurostatJson);
const world = buildEngineWorld(airportsJson as Airport[], countriesJson as unknown as Record<string, Country>, real);
const ap = (id: string) => world.airportById.get(id)!;

function austrian(start = simTime(2026, 10, 29)) {
  const state = createGame({ seed: 3, startYear: 2026, startTime: start, timeMode: 'weekly', realism: 'realistic', scheduling: 'detailed' }, world);
  const result = applyCommand(state, world, { type: 'TakeOverAirline', payload: { realId: 'AUA' } });
  expect(result.ok).toBe(true);
  return { state, id: (result as { id: string }).id };
}

describe('taking over Austrian Airlines (6.2)', () => {
  it('brings the real fleet, routes, timetable, cash and partners', () => {
    const { state, id } = austrian();
    const airline = state.airlines[id]!;
    expect(airline.name).toBe('Austrian Airlines');
    expect([airline.iata, airline.icao, airline.hubId, airline.realId]).toEqual(['OS', 'AUA', 'LOWW', 'AUA']);
    expect(airline.cash).toEqual({ amount: 350_000_000, currency: 'EUR' });
    const fleet = Object.values(state.aircraft).filter((a) => a.airlineId === id);
    // The official register's 68 aircraft fly now; 17 group allocations are still to come.
    expect(fleet.filter((a) => a.status === 'active')).toHaveLength(real.byId.get('AUA')!.registered.length);
    expect(fleet.filter((a) => a.status === 'delivering')).toHaveLength(17);
    expect(fleet.some((a) => a.registration === 'OE-LBI')).toBe(true);
    // Every active aircraft flies; every route's timetable is valid.
    for (const a of fleet.filter((x) => x.status === 'active')) expect(Object.values(state.flights).some((p) => p.aircraftId === a.id)).toBe(true);
    const routes = Object.values(state.routes);
    expect(routes.length).toBeGreaterThan(100);
    for (const r of routes) {
      const specs = pairsOfRoute(state, r.id);
      expect(validateSpecs(state, world, r, specs)).toBeNull();
    }
    expect(airline.partners).toEqual(expect.arrayContaining(['DLH', 'SWR', 'BEL', 'EWG', 'EDW']));
    // Austrian no longer flies as an AI airline: the player's flights are the supply.
    expect(competitorsOn(world, ap('LOWW'), ap('EGLL'), undefined, state.ai)!.some((c) => c.airlineId === 'AUA')).toBe(false);
  });

  it('runs realistically: about break-even in the first winter month', () => {
    const { state, id } = austrian(simTime(2026, 11, 2));
    advance(state, world, simTime(2026, 12, 1));
    const month = state.finance[id]!.months.at(-1)!;
    const costs = Object.entries(month.lines).filter(([k]) => k !== 'revenue').reduce((s, [, v]) => s + v, 0);
    const margin = (month.lines.revenue - costs) / month.lines.revenue;
    expect(margin).toBeGreaterThan(-0.12);
    expect(margin).toBeLessThan(0.12);
    let pax = 0;
    let transfer = 0;
    for (const r of Object.values(month.routes)) {
      pax += r.pax;
      transfer += r.transfer ?? 0;
    }
    expect(pax).toBeGreaterThan(600_000); // real: ≈ 1 m passengers in November
    expect(transfer / pax).toBeGreaterThan(0.25);
  }, 60_000);

  it('group partners leave the player alone', () => {
    const { state, id } = austrian();
    // A deep price cut to Frankfurt (Lufthansa's hub): Lufthansa doesn't follow it.
    const route = Object.values(state.routes).find((r) => r.destinationId === 'EDDF')!;
    expect(applyCommand(state, world, { type: 'UpdateRoute', airlineId: id, payload: { routeId: route.id, aircraftId: route.aircraftId, frequency: route.frequency, fareFactor: 0.6, flights: pairsOfRoute(state, route.id) } }).ok).toBe(true);
    advance(state, world, simTime(2026, 12, 5));
    expect(state.ai.routes[aiRouteKey('DLH', 'EDDF', 'LOWW')]?.fare ?? 1.05).toBeGreaterThan(1);
    const entries = state.messages.filter((m) => m.kind === 'aiEnter' && ['Lufthansa', 'Swiss International Air Lines', 'Eurowings'].includes(String(m.params.airline)));
    expect(entries).toHaveLength(0);
  }, 60_000);
});

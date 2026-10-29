// Phase 6.2: taking over Austrian Airlines today.
import { describe, expect, it } from 'vitest';
import airportsJson from '../data/generated/airports.json';
import countriesJson from '../data/generated/countries.json';
import airlinesJson from '../data/generated/airlines.json';
import networksJson from '../data/generated/networks.json';
import detailsJson from '../data/generated/airline-details.json';
import registersJson from '../data/generated/registers.json';
import eurostatJson from '../data/generated/routes-eurostat.json';
import historyJson from '../data/generated/airline-history.json';
import fxJson from '../data/generated/fx-history.json';
import airportHistoryJson from '../data/generated/airport-history.json';
import type { Airport, Country } from '../data/types';
import { advance } from './advance';
import { applyCommand } from './commands';
import { aiRouteKey, competitorsOn } from './economics';
import { createGame, migrate } from './game';
import { buildRealAirlines } from './realAirlines';
import { pairsOfRoute, validateSpecs } from './schedule';
import { simTime } from './time';
import { validateCabin } from './cabins';
import { getAircraftType } from '../data/aircraft';
import { buildEngineWorld, worldCache } from './world';
import type { GameState } from './state';
import { toDate } from './time';

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
    // Every cabin fits its aircraft, with about Austrian's real seat counts (Austrian A320: 174 incl. blocked business seats).
    for (const a of fleet) expect(validateCabin(getAircraftType(a.typeId), a.cabin), `${a.registration} ${a.typeId}`).toBeNull();
    // Real A320: 174 seats, of which ~10 middle seats are blocked in business → ~164 to sell.
    expect(fleet.find((a) => a.typeId === 'A320')!.seats).toBeGreaterThan(155);
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

  it('repairs cabins that are too long in saves from before the fix', () => {
    const { state } = austrian();
    const a = Object.values(state.aircraft).find((x) => x.typeId === 'A320')!;
    a.cabin = [{ cls: 'J', product: 'euro', pitch: 31, seats: 20 }, { cls: 'Y', product: 'economy', pitch: 30, seats: 154 }];
    const loaded = migrate(JSON.parse(JSON.stringify(state)))!;
    const fixed = loaded.aircraft[a.id]!;
    expect(validateCabin(getAircraftType('A320'), fixed.cabin)).toBeNull();
    expect(fixed.seats).toBe(fixed.cabin.reduce((s, c) => s + c.seats, 0));
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

// Phase 6.4: Austrian in past years.
const realPast = buildRealAirlines(airlinesJson as never, networksJson as never, detailsJson as never, registersJson as never, eurostatJson, historyJson as never);
const worldAt = worldCache({ airports: airportsJson as Airport[], countries: countriesJson as unknown as Record<string, Country>, realAirlines: realPast, fxHistory: fxJson as never, airportHistory: airportHistoryJson as never });
const provider = (s: GameState) => worldAt(s.options.startYear, toDate(s.time));

function austrianIn(year: number) {
  const start = simTime(year, 1, 1);
  const state = createGame({ seed: 3, startYear: year, startTime: start, timeMode: 'weekly', realism: 'realistic', scheduling: 'detailed' }, provider({ options: { startYear: year }, time: start } as GameState));
  const result = applyCommand(state, provider(state), { type: 'TakeOverAirline', payload: { realId: 'AUA' } });
  expect(result.ok).toBe(true);
  const id = (result as { id: string }).id;
  const fleet = Object.values(state.aircraft).filter((a) => a.airlineId === id);
  const count = (type: string) => fleet.filter((a) => a.typeId === type).length;
  return { state, id, airline: state.airlines[id]!, fleet, count };
}

describe('taking over Austrian Airlines in past years (6.4)', () => {
  it('1985: the DC-9 and MD-80 fleet, schillings, no partners yet, a valid timetable', () => {
    const { state, airline, fleet, count } = austrianIn(1985);
    expect(count('DC93')).toBe(9);
    expect(count('MD82')).toBe(13);
    expect(count('A320')).toBe(0);
    expect(fleet.every((a) => a.registration.startsWith('OE-L') && a.owned)).toBe(true);
    expect(new Set(fleet.map((a) => a.registration)).size).toBe(fleet.length);
    expect(airline.currency).toBe('ATS');
    expect(airline.partners).toEqual([]);
    const routes = Object.values(state.routes);
    expect(routes.length).toBeGreaterThan(25);
    const w = provider(state);
    for (const r of routes) expect(validateSpecs(state, w, r, pairsOfRoute(state, r.id))).toBeNull();
    // Austrian no longer flies as an AI airline in this game.
    expect(state.ai.airlines.AUA?.status).toBe('player');
  });

  it('partners follow history: Qualiflyer in 1999, Star Alliance and subsidiaries in 2001, the Lufthansa Group later', () => {
    const in1999 = austrianIn(1999).airline.partners!;
    expect(in1999).toEqual(expect.arrayContaining(['Q694098', 'Q660191'])); // Swissair, Tyrolean
    expect(in1999).not.toContain('DLH');
    const in2001 = austrianIn(2001).airline.partners!;
    expect(in2001).toEqual(expect.arrayContaining(['DLH', 'UAL', 'Q660191', 'Q1807298'])); // Star + Tyrolean + Lauda Air
    expect(in2001).not.toContain('Q694098');
    expect(austrianIn(2012).airline.partners).toEqual(expect.arrayContaining(['DLH', 'SWR', 'EWG']));
  }, 60_000);

  it('subsidiaries at Vienna fly for Austrian: in 2001 Tyrolean and Lauda Air join with their aircraft and routes', () => {
    const { state, fleet } = austrianIn(2001);
    const joined = state.messages.filter((m) => m.kind === 'subsidiaryJoined').map((m) => m.params.airline);
    expect(joined).toEqual(expect.arrayContaining(['Tyrolean Airways', 'Lauda Air']));
    expect(state.ai.airlines.Q660191?.status).toBe('player');
    expect(state.ai.airlines.Q1807298?.status).toBe('player');
    // Tyrolean's turboprops and regional jets and Lauda Air's Boeings are in the fleet now.
    expect(fleet.some((a) => a.typeId.startsWith('DH8'))).toBe(true);
    expect(fleet.some((a) => a.typeId === 'B763')).toBe(true);
    const w = provider(state);
    for (const r of Object.values(state.routes)) expect(validateSpecs(state, w, r, pairsOfRoute(state, r.id))).toBeNull();
  }, 60_000);

  it('1985 runs about like the real Austrian of the time (small profit or loss)', () => {
    const { state, id } = austrianIn(1985);
    advance(state, provider, simTime(1985, 4, 1));
    const month = state.finance[id]!.months.at(-1)!;
    const costs = Object.entries(month.lines).filter(([k]) => k !== 'revenue').reduce((s, [, v]) => s + v, 0);
    const margin = (month.lines.revenue - costs) / month.lines.revenue;
    // Real: a small profit (≈ 3 % over 1985); the model's whole year 1985: ≈ +3 %, March alone a little more.
    expect(margin).toBeGreaterThan(-0.15);
    expect(margin).toBeLessThan(0.2);
  }, 120_000);
});

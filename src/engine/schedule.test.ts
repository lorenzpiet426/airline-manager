import { economyCabin } from './cabins';
import { describe, expect, it } from 'vitest';
import airportsJson from '../data/generated/airports.json';
import countriesJson from '../data/generated/countries.json';
import airlinesJson from '../data/generated/airlines.json';
import networksJson from '../data/generated/networks.json';
import detailsJson from '../data/generated/airline-details.json';
import registersJson from '../data/generated/registers.json';
import eurostatJson from '../data/generated/routes-eurostat.json';
import { getAircraftType } from '../data/aircraft';
import type { Airport, Country } from '../data/types';
import { advance } from './advance';
import { applyCommand, type FlightSpec } from './commands';
import { competitorDepartures, routeWeek, type PlannedFlight } from './economics';
import { weeklyLegs } from './flights';
import { createGame, migrate } from './game';
import { buildRealAirlines } from './realAirlines';
import { ensureFlights, pairsOfRoute } from './schedule';
import { SAVE_VERSION, type GameState } from './state';
import { fromDate, simTime, utcOffsetMin } from './time';
import { blockMinutes, DAYS_ALL } from './timetable';
import { buildEngineWorld } from './world';

const real = buildRealAirlines(airlinesJson as never, networksJson as never, detailsJson as never, registersJson as never, eurostatJson);
const world = buildEngineWorld(airportsJson as Airport[], countriesJson as unknown as Record<string, Country>, real);
const ap = (id: string) => world.airportById.get(id)!;
const MAY = new Date(Date.UTC(2026, 4, 12));
const A320 = getAircraftType('A20N');

function startup(scheduling: 'simple' | 'detailed') {
  const state = createGame({ seed: 1, startYear: 2026, timeMode: 'realtime', realism: 'realistic', scheduling });
  const founded = applyCommand(state, world, {
    type: 'FoundAirline',
    payload: { name: 'Danube Air', iata: 'D7', icao: 'DNB', primary: '#c8102e', secondary: '#ffffff', hubId: 'LOWW', capitalEur: 200_000_000, controller: 'human' },
  });
  const airlineId = (founded as { id: string }).id;
  for (const id of ['T1', 'T2']) {
    state.aircraft[id] = {
      id, typeId: 'A20N', airlineId, registration: `OE-L${id}`, builtYear: 2020, seats: 180, cabin: economyCabin(A320, 180), status: 'active', deliveryAt: state.time, locationId: 'LOWW',
      lease: { lessor: 'AerCap', monthlyRent: { amount: 380_000, currency: 'USD' }, deposit: { amount: 760_000, currency: 'USD' }, startAt: state.time, endAt: state.time + 1e6 },
    };
  }
  return { state, airlineId };
}

const flights = (pairs: [number, number][], dir: 0 | 1 = 0): PlannedFlight[] =>
  pairs.map(([dep, days]) => ({ dir, days, dep, type: A320, seats: 180, cabin: economyCabin(A320, 180), ageYears: 5 }));
const week = (from: string, to: string, timetable: PlannedFlight[], date = MAY) =>
  routeWeek(world, ap(from), ap(to), { type: A320, seats: 180, frequency: 7, fareFactor: 1, ageYears: 5, rampUp: 1, flights: timetable }, date);

describe('flight times', () => {
  it('flies faster eastbound with the westerlies (Vienna–New York)', () => {
    const km = 6840;
    const west = blockMinutes(900, ap('LOWW'), ap('KJFK'), km);
    const east = blockMinutes(900, ap('KJFK'), ap('LOWW'), km);
    expect(west - east).toBeGreaterThan(30);
    expect(west - east).toBeLessThan(90);
    expect(west % 5).toBe(0);
  });

  it('knows summer time', () => {
    expect(utcOffsetMin('Europe/Vienna', fromDate(new Date(Date.UTC(2026, 0, 15))))).toBe(60);
    expect(utcOffsetMin('Europe/Vienna', fromDate(MAY))).toBe(120);
    expect(utcOffsetMin('America/New_York', fromDate(MAY))).toBe(-240);
  });
});

describe('when passengers want to fly', () => {
  it('prefers a morning departure to one in the middle of the night', () => {
    const morning = week('LOWW', 'EGLL', flights([[7 * 60, DAYS_ALL]]));
    const night = week('LOWW', 'EGLL', flights([[2 * 60, DAYS_ALL]]));
    expect(night.pax).toBeLessThan(0.5 * morning.pax);
  });

  it('shares passengers between two flights at the same time, but not between morning and evening', () => {
    const clustered = week('LOWW', 'EGLL', flights([[7 * 60, DAYS_ALL], [7 * 60 + 10, DAYS_ALL]]));
    const spread = week('LOWW', 'EGLL', flights([[7 * 60, DAYS_ALL], [18 * 60, DAYS_ALL]]));
    expect(spread.demand).toBeGreaterThan(1.1 * clustered.demand);
  });

  it('has busier Fridays than Tuesdays on a holiday route', () => {
    const w = week('LOWW', 'LEPA', flights([[9 * 60, DAYS_ALL]]));
    expect(w.byFlight[0]!.flights).toBe(7);
    const fri = week('LOWW', 'LEPA', flights([[9 * 60, 1 << 4]]));
    const tue = week('LOWW', 'LEPA', flights([[9 * 60, 1 << 1]]));
    expect(fri.demand).toBeGreaterThan(1.15 * tue.demand);
  });

  it('gives competitors believable timetables (Austrian to London: morning wave out of Vienna, returns later)', () => {
    const time = fromDate(MAY);
    const out = competitorDepartures(world, 'AUA', ap('LOWW'), ap('EGLL'), 28, time);
    expect(out).toHaveLength(4);
    expect(out[0]!.dep).toBeGreaterThanOrEqual(6 * 60);
    expect(out[0]!.dep).toBeLessThan(7 * 60 + 30);
    const back = competitorDepartures(world, 'AUA', ap('EGLL'), ap('LOWW'), 28, time);
    // The first return leaves London after the first flight from Vienna has arrived and turned around.
    expect(back[0]!.dep).toBeGreaterThan(out[0]!.dep - 60 + 135);
  });
});

describe('Detailed scheduling', () => {
  const spec = (aircraftId: string, dep: number, days = DAYS_ALL, groundMin = 45): FlightSpec => ({ aircraftId, dep, days, groundMin });
  const open = (state: GameState, airlineId: string, destinationId: string, specs: FlightSpec[]) =>
    applyCommand(state, world, { type: 'OpenRoute', airlineId, payload: { destinationId, aircraftId: '', frequency: 0, fareFactor: 1, flights: specs } });

  it('opens a route with its own timetable and numbers every pair', () => {
    const { state, airlineId } = startup('detailed');
    const r = open(state, airlineId, 'EGLL', [spec('T1', 7 * 60), spec('T2', 7 * 60 + 30, 0b0011111), spec('T1', 17 * 60 + 30)]);
    expect(r.ok).toBe(true);
    const route = state.routes[(r as { id: string }).id]!;
    expect(route.frequency).toBe(7 + 5 + 7);
    const numbers = pairsOfRoute(state, route.id).map((p) => p.flightNumber);
    expect(new Set(numbers).size).toBe(3);
    expect(numbers).toContain(101);
  });

  it('refuses overlaps, too-short turnarounds and wrong times; allows a night stop', () => {
    const { state, airlineId } = startup('detailed');
    expect(open(state, airlineId, 'EGLL', [spec('T1', 7 * 60), spec('T1', 9 * 60)])).toEqual({ ok: false, error: 'overlap' });
    expect(open(state, airlineId, 'EGLL', [spec('T1', 7 * 60, DAYS_ALL, 10)])).toEqual({ ok: false, error: 'groundTooShort' });
    expect(open(state, airlineId, 'EGLL', [spec('T1', 7 * 60 + 3)])).toEqual({ ok: false, error: 'timeInvalid' });
    expect(open(state, airlineId, 'EGLL', [])).toEqual({ ok: false, error: 'noFlights' });
    // Night stop: out at 21:00, back next morning.
    expect(open(state, airlineId, 'LGAV', [spec('T1', 21 * 60, DAYS_ALL, 9 * 60)]).ok).toBe(true);
    // The morning after, the aircraft is still on its way back from Athens.
    expect(open(state, airlineId, 'EGLL', [spec('T1', 6 * 60)])).toEqual({ ok: false, error: 'overlap' });
    expect(open(state, airlineId, 'EGLL', [spec('T1', 11 * 60)]).ok).toBe(true);
  });

  it('only books the weekdays that are flown', () => {
    const { state, airlineId } = startup('detailed');
    const r = open(state, airlineId, 'EGLL', [spec('T1', 7 * 60, 0b0011111)]); // Monday–Friday
    const routeId = (r as { id: string }).id;
    advance(state, world, simTime(2026, 1, 19)); // to Monday 19 January
    const fin = state.finance[airlineId]!;
    const lastWeek = fin.history.at(-1)!;
    expect(lastWeek.routes[routeId]!.flights).toBe(10);
    expect(weeklyLegs(state, world, 'T1')).toHaveLength(10);
  });

  it('switches a Simple game to Detailed and keeps its timetable', () => {
    const { state, airlineId } = startup('simple');
    applyCommand(state, world, { type: 'OpenRoute', airlineId, payload: { destinationId: 'EGLL', aircraftId: 'T1', frequency: 14, fareFactor: 1 } });
    const before = Object.values(state.flights).reduce((s, p) => s + p.days.toString(2).split('1').length - 1, 0);
    expect(before).toBe(14);
    expect(applyCommand(state, world, { type: 'SetScheduling', airlineId, payload: { scheduling: 'detailed' } }).ok).toBe(true);
    expect(state.options.scheduling).toBe('detailed');
    const numbers = Object.values(state.flights).map((p) => p.flightNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(applyCommand(state, world, { type: 'SetScheduling', airlineId, payload: { scheduling: 'detailed' } })).toEqual({ ok: false, error: 'alreadyDetailed' });
  });

  it('plans the pairs of saves from before 2.2', () => {
    const { state, airlineId } = startup('simple');
    applyCommand(state, world, { type: 'OpenRoute', airlineId, payload: { destinationId: 'LGAV', aircraftId: 'T1', frequency: 7, fareFactor: 1 } });
    const old = JSON.parse(JSON.stringify(state)) as Partial<GameState>;
    old.version = 5;
    delete old.flights;
    delete (old.options as Partial<GameState['options']>).scheduling;
    const upgraded = migrate(old)!;
    expect(upgraded.version).toBe(SAVE_VERSION);
    ensureFlights(upgraded, world);
    expect(Object.keys(upgraded.flights).length).toBeGreaterThan(0);
    expect(weeklyLegs(upgraded, world, 'T1')).toHaveLength(14);
  });
});

describe('key figures', () => {
  it('computes load factor, RASK and CASK from the weekly accounts', async () => {
    const { periodKpis } = await import('./kpis');
    const { state, airlineId } = startup('detailed');
    applyCommand(state, world, { type: 'OpenRoute', airlineId, payload: { destinationId: 'EGLL', aircraftId: '', frequency: 0, fareFactor: 1, flights: [{ aircraftId: 'T1', dep: 420, days: DAYS_ALL, groundMin: 45 }] } });
    advance(state, world, simTime(2026, 1, 19));
    const week = state.finance[airlineId]!.history.at(-1)!;
    const k = periodKpis(week, state.routes, 7, 2);
    const stats = Object.values(week.routes)[0]!;
    expect(k.loadFactor).toBeCloseTo(stats.pax / stats.seats, 5);
    expect(k.ask).toBeCloseTo(stats.seats * Object.values(state.routes)[0]!.distanceKm, 0);
    expect(k.rask! * k.ask).toBeCloseTo(k.revenue, 0);
    expect(k.cask!).toBeGreaterThan(k.caskExFuel!);
    expect(k.utilisation).toBeGreaterThan(1); // one aircraft of two flies ~5 h a day
    expect(k.utilisation).toBeLessThan(5);
    // Accounts from before 1.5 have no seat-km: rebuilt from the route distance.
    const old = structuredClone(week);
    for (const s of Object.values(old.routes)) delete s.ask, delete s.rpk, delete s.blockHours;
    const k2 = periodKpis(old, state.routes, 7, 2);
    expect(k2.ask).toBeCloseTo(k.ask, 0);
    expect(k2.utilisation).toBeNull();
  });
});

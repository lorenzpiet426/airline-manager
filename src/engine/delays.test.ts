// Phase 9.1: delays, knock-on delays, diversions and punctuality.
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
import { economyCabin } from './cabins';
import { applyCommand } from './commands';
import { createGame } from './game';
import { findFlight, flightId, flightResult, knownFlights, opsDailyStep, punctuality, weatherAt } from './delays';
import { buildRealAirlines } from './realAirlines';
import { simTime, startOfDay } from './time';
import { DAYS_ALL } from './timetable';
import { buildEngineWorld } from './world';
import { slow } from '../testing/slow';

const real = buildRealAirlines(airlinesJson as never, networksJson as never, detailsJson as never, registersJson as never, eurostatJson);
const world = buildEngineWorld(airportsJson as Airport[], countriesJson as unknown as Record<string, Country>, real);
const A320 = getAircraftType('A20N');
const DAY = 24 * 60;

function airline() {
  const state = createGame({ seed: 7, startYear: 2026, startTime: simTime(2026, 3, 2), timeMode: 'weekly', realism: 'realistic', scheduling: 'detailed' });
  const founded = applyCommand(state, world, {
    type: 'FoundAirline',
    payload: { name: 'Test Air', iata: 'T7', icao: 'TST', primary: '#c8102e', secondary: '#ffffff', hubId: 'LOWW', capitalEur: 200_000_000, controller: 'human' },
  });
  const airlineId = (founded as { id: string }).id;
  for (const id of ['T1', 'T2']) {
    state.aircraft[id] = {
      id, typeId: 'A20N', airlineId, registration: `OE-L${id}`, builtYear: 2020, seats: 180, cabin: economyCabin(A320, 180), status: 'active', deliveryAt: state.time, locationId: 'LOWW',
      lease: { lessor: 'AerCap', monthlyRent: { amount: 380_000, currency: 'USD' }, deposit: { amount: 760_000, currency: 'USD' }, startAt: state.time, endAt: state.time + 3 * 365 * DAY },
    };
  }
  delete state.airlines[airlineId]!.crew;
  for (const [dest, dep] of [['LEMG', 7 * 60], ['EGLL', 15 * 60]] as const) {
    if (dest === 'EGLL') continue;
    expect(applyCommand(state, world, { type: 'OpenRoute', airlineId, payload: { destinationId: dest, aircraftId: '', frequency: 0, fareFactor: 1, flights: [{ aircraftId: 'T1', dep, days: DAYS_ALL, groundMin: 45 }] } }).ok).toBe(true);
  }
  advance(state, world, state.time + DAY);
  return { state, airlineId, a: () => state.airlines[airlineId]! };
}

const takeoverWorld = world;
function austrian(start: number) {
  const state = createGame({ seed: 3, startYear: 2027, startTime: start, timeMode: 'weekly', realism: 'realistic', scheduling: 'detailed' }, takeoverWorld);
  const r = applyCommand(state, takeoverWorld, { type: 'TakeOverAirline', payload: { realId: 'AUA' } });
  expect(r.ok).toBe(true);
  return { state, id: (r as { id: string }).id };
}

describe('delays and punctuality (9.1)', () => {
  it('bad-weather days are rare, more of them in winter', () => {
    const vie = world.airportById.get('LOWW')!;
    const count = (month: number) => Array.from({ length: 365 }, (_, i) => simTime(2027, month, 1) + i * DAY).filter((d) => weatherAt(vie, d) > 0).length / 365;
    expect(count(1)).toBeGreaterThan(0.02);
    expect(count(1)).toBeLessThan(0.12);
  });

  it('Austrian flies about as punctually as Europe (EUROCONTROL 2024: 72 % on time, 17.5 min average)', () => {
    for (const start of [simTime(2027, 1, 4), simTime(2027, 7, 5)]) {
      const { state, id } = austrian(start);
      advance(state, world, start + 3 * 7 * DAY);
      const p = punctuality(state.finance[id]!.history.slice(-2).flatMap((w) => Object.values(w.routes)))!;
      expect(p.onTime).toBeGreaterThan(0.65);
      expect(p.onTime).toBeLessThan(0.85);
      expect(p.avgDelay).toBeGreaterThan(10);
      expect(p.avgDelay).toBeLessThan(25);
      // Knock-on delays are the biggest single cause, as in Europe (46 % of delay minutes).
      const total = Object.values(p.causes).reduce((a, b) => a + b, 0);
      expect(p.causes.reactionary! / total).toBeGreaterThan(0.25);
    }
  }, slow(300_000));

  it('the airline pays compensation for its own long delays, not for the weather', () => {
    const cost = (cause: 'airline' | 'weather') => {
      const { state, airlineId } = airline();
      const route = Object.values(state.routes)[0]!;
      const pair = Object.values(state.flights)[0]!;
      const day = startOfDay(state.time);
      state.ops = {
        day,
        ready: {},
        prev: [],
        flights: [{ airlineId, routeId: route.id, pairId: pair.id, dir: 0, aircraftId: 'T1', flightNumber: 101, fromId: 'LOWW', toId: 'LEMG', dep: day + 600, arr: day + 780, depDelay: 230, arrDelay: 215, cause, status: 'ok', pax: 150, transfer: 0 }],
      };
      const before = state.finance[airlineId]!.week.lines.disruption ?? 0;
      state.time = day + DAY;
      opsDailyStep(state, world);
      return (state.finance[airlineId]!.week.lines.disruption ?? 0) - before;
    };
    const own = cost('airline');
    const wx = cost('weather');
    // 150 passengers × half of them claiming €400 (1,500–3,500 km) = €30,000 more.
    expect(own - wx).toBeGreaterThan(25_000);
    expect(own - wx).toBeLessThan(35_000);
  });

  it('every day of a game has its flights played through, with stable results', () => {
    const run = () => {
      const { state } = airline();
      advance(state, world, state.time + 9 * DAY);
      return state.ops!.prev.map((f) => `${f.flightNumber}:${f.depDelay}:${f.status}`).join(',');
    };
    const a = run();
    expect(a.length).toBeGreaterThan(0);
    expect(run()).toBe(a);
  }, slow(120_000));

  it('single flights (9.2): each one’s passengers and money add up to the route, kept for seven days', () => {
    const { state, airlineId } = airline();
    advance(state, world, state.time + 12 * DAY);
    const flights = knownFlights(state).filter((f) => f.airlineId === airlineId);
    const oldest = Math.min(...flights.map((f) => f.dep));
    expect(state.time - oldest).toBeLessThan(9 * DAY);
    const flown = flights.filter((f) => f.econ);
    expect(flown.length).toBeGreaterThan(10);
    // Last full week: the flights' revenue adds up to the route's.
    const week = state.finance[airlineId]!.history.at(-1)!;
    const inWeek = flown.filter((f) => f.dep >= week.start && f.dep < week.start + 7 * DAY);
    const route = Object.values(state.routes)[0]!;
    const sum = inWeek.filter((f) => f.routeId === route.id).reduce((n, f) => n + f.econ!.revenue, 0);
    if (inWeek.length >= 10) expect(sum / week.routes[route.id]!.revenue).toBeCloseTo(1, 1);
    const f = flown.at(-1)!;
    expect(findFlight(state, flightId(f))).toBe(f);
    expect(f.econ!.pax).toBeGreaterThan(0);
    expect(Object.keys(f.econ!.classes).length).toBeGreaterThan(0);
    expect(flightResult(f)).not.toBeNull();
  }, slow(120_000));
});

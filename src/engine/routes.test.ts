import { describe, expect, it } from 'vitest';
import airportsJson from '../data/generated/airports.json';
import countriesJson from '../data/generated/countries.json';
import type { Airport, Country } from '../data/types';
import { getAircraftType } from '../data/aircraft';
import { advance } from './advance';
import { applyCommand } from './commands';
import { checkRoute, market, routeWeek, totalCosts } from './economics';
import { airborne, weeklyLegs } from './flights';
import { createGame, migrate } from './game';
import { distanceKm } from './geo';
import { pnlCosts, type GameState } from './state';
import { MINUTES_PER_DAY, simTime, startOfWeek } from './time';
import { buildEngineWorld, longestHardRunwayM } from './world';

const airports = airportsJson as Airport[];
const world = buildEngineWorld(airports, countriesJson as unknown as Record<string, Country>);
const ap = (id: string) => world.airportById.get(id)!;
const JAN = new Date(Date.UTC(2026, 0, 15));
const APR = new Date(Date.UTC(2026, 3, 15));
const JUL = new Date(Date.UTC(2026, 6, 15));

// Eurostat avia_par_at, 2019, passengers carried, both directions (all airlines, incl. transfer passengers).
const EUROSTAT_2019: [string, string, number][] = [
  ['LOWW', 'EGLL', 833_930], ['LOWW', 'LFPG', 944_404], ['LOWW', 'EHAM', 943_705], ['LOWW', 'EDDB', 966_659],
  ['LOWW', 'LEBL', 640_052], ['LOWW', 'LIRF', 558_401], ['LOWW', 'LGAV', 330_018], ['LOWW', 'EBBR', 454_019],
  ['LOWW', 'ESSA', 264_672], ['LOWW', 'EPWA', 386_021], ['LOWW', 'LEMD', 564_199], ['LOWW', 'KJFK', 126_844],
  ['LOWW', 'KORD', 163_006], ['LOWW', 'CYYZ', 152_583], ['LOWW', 'ZBAA', 147_021], ['LOWS', 'EGKK', 130_413],
  ['LOWG', 'EDDF', 237_802], ['LOWS', 'LEPA', 93_125], ['LOWI', 'EGKK', 187_448], ['LOWL', 'LGIR', 24_180],
];

describe('demand model calibration', () => {
  it('matches real 2019 route sizes within a factor of about 2 on average', () => {
    const logErrors = EUROSTAT_2019.map(([a, b, real]) => Math.log(market(world, ap(a), ap(b)).annualPax / real));
    const rms = Math.sqrt(logErrors.reduce((s, e) => s + e * e, 0) / logErrors.length);
    expect(rms).toBeLessThan(Math.log(2));
    for (const e of logErrors) expect(Math.abs(e)).toBeLessThan(Math.log(4));
  });

  it('leaves very short routes to trains (Vienna–Budapest is tiny compared with Vienna–London)', () => {
    expect(market(world, ap('LOWW'), ap('LHBP')).annualPax).toBeLessThan(0.5 * market(world, ap('LOWW'), ap('EGLL')).annualPax);
  });

  it('gives an A320neo on Vienna–London believable unit costs and load factors', () => {
    const type = getAircraftType('A20N');
    const week = routeWeek(world, ap('LOWW'), ap('EGLL'), { type, seats: 165, frequency: 14, fareFactor: 1, ageYears: 5, rampUp: 1 }, APR);
    const ask = week.seats * distanceKm(ap('LOWW'), ap('EGLL'));
    const caskCents = (totalCosts(week.costs) / ask) * 100;
    expect(caskCents).toBeGreaterThan(3); // without crew and lease, which are paid per aircraft
    expect(caskCents).toBeLessThan(8);
    // A newcomer at the market fare against established airlines fills well under the usual ~80 %.
    expect(week.loadFactor).toBeGreaterThan(0.3);
    expect(week.loadFactor).toBeLessThan(0.8);
    expect(week.fareUsd).toBeGreaterThan(100);
    expect(week.fareUsd).toBeLessThan(300);
  });

  it('fills fewer seats at higher fares', () => {
    const type = getAircraftType('A20N');
    const at = (fareFactor: number) =>
      routeWeek(world, ap('LOWW'), ap('LGAV'), { type, seats: 165, frequency: 7, fareFactor, ageYears: 5, rampUp: 1 }, JAN).pax;
    expect(at(0.7)).toBeGreaterThan(at(1));
    expect(at(1)).toBeGreaterThan(at(1.3));
  });
});

describe('balance (no easy money)', () => {
  const a321 = getAircraftType('A21N');
  const week = (dest: string, fareFactor: number, date: Date, frequency = 2) =>
    routeWeek(world, ap('LOWW'), ap(dest), { type: a321, seats: 206, frequency, fareFactor, ageYears: 8, rampUp: 1 }, date);

  it('a route nobody flies non-stop still competes with one-stop connections: +50 % fares empty the plane', () => {
    expect(market(world, ap('LOWW'), ap('KPVD')).incumbentFlights).toBe(0);
    expect(week('KPVD', 1.5, JUL).loadFactor).toBeLessThan(0.5);
    expect(week('KPVD', 1.5, JUL).pax).toBeLessThan(0.5 * week('KPVD', 1, JUL).pax);
  });

  it('summer is busier than winter on a holiday route', () => {
    expect(week('LEPA', 1, JUL, 7).demand).toBeGreaterThan(1.4 * week('LEPA', 1, JAN, 7).demand);
  });

  it('price cuts win fewer passengers from incumbents than the cut suggests (they match half)', () => {
    const base = week('LGAV', 1, APR, 7).demand;
    expect(week('LGAV', 0.7, APR, 7).demand).toBeLessThan(2.5 * base);
  });
});

describe('route rules', () => {
  it('enforces range', () => {
    expect(checkRoute(world, getAircraftType('A20N'), ap('LOWW'), ap('KJFK'))).toBe('range');
    expect(checkRoute(world, getAircraftType('A21N-XLR'), ap('LOWW'), ap('KJFK'))).toBeNull();
  });

  it('enforces runway length', () => {
    const vie = ap('LOWW');
    const short = airports.find((a) => {
      const r = longestHardRunwayM(a);
      return r >= 900 && r <= 1200 && distanceKm(vie, a) < 1500;
    })!;
    expect(short).toBeDefined();
    expect(checkRoute(world, getAircraftType('A20N'), vie, short)).toBe('runwayDestination');
    expect(checkRoute(world, getAircraftType('AT76'), vie, short)).toBeNull();
  });

  it('enforces ETOPS over the Pacific (Honolulu–Los Angeles)', () => {
    expect(checkRoute(world, getAircraftType('E295'), ap('PHNL'), ap('KLAX'))).toBe('etops');
    expect(checkRoute(world, getAircraftType('B789'), ap('PHNL'), ap('KLAX'))).toBeNull();
  });
});

function airlineWithAircraft(typeId = 'A20N') {
  const state = createGame({ seed: 1, startYear: 2026, timeMode: 'realtime', realism: 'realistic' });
  const founded = applyCommand(state, world, {
    type: 'FoundAirline',
    payload: { name: 'Danube Air', iata: 'D7', icao: 'DNB', primary: '#c8102e', secondary: '#ffffff', hubId: 'LOWW', capitalEur: 75_000_000, controller: 'human' },
  });
  const airlineId = (founded as { id: string }).id;
  // Put a known aircraft straight into service for the test.
  state.aircraft.T1 = {
    id: 'T1', typeId, airlineId, registration: 'OE-LTA', builtYear: 2020, seats: getAircraftType(typeId).seats.typical,
    status: 'active', deliveryAt: state.time, locationId: 'LOWW',
    lease: { lessor: 'AerCap', monthlyRent: { amount: 380_000, currency: 'USD' }, deposit: { amount: 760_000, currency: 'USD' }, startAt: state.time, endAt: state.time + 1e6 },
  };
  return { state, airlineId };
}

describe('operating routes', () => {
  it('opens a route, flies it and files weekly profit-and-loss reports', () => {
    const { state, airlineId } = airlineWithAircraft();
    const opened = applyCommand(state, world, {
      type: 'OpenRoute',
      airlineId,
      payload: { destinationId: 'EGLL', aircraftId: 'T1', frequency: 14, fareFactor: 1 },
    });
    expect(opened.ok).toBe(true);
    const route = state.routes[(opened as { id: string }).id]!;
    expect(route.flightNumber).toBe(101);
    expect(route.distanceKm).toBeGreaterThan(1200);

    advance(state, world, simTime(2026, 2, 20));
    const fin = state.finance[airlineId]!;
    expect(fin.history.length).toBeGreaterThanOrEqual(2);
    const lastWeek = fin.history[fin.history.length - 1]!;
    expect(lastWeek.lines.revenue).toBeGreaterThan(0);
    expect(pnlCosts(lastWeek.lines)).toBeGreaterThan(0);
    const stats = lastWeek.routes[route.id]!;
    expect(stats.flights).toBeCloseTo(28, 5);
    expect(stats.pax / stats.seats).toBeGreaterThan(0.2);
    expect(stats.pax / stats.seats).toBeLessThan(1);
    expect(state.messages.some((m) => m.kind === 'weekReport')).toBe(true);
    // Months add up to the same totals as weeks (every day is booked into both).
    expect(fin.months).toHaveLength(1);
    expect(fin.months[0]!.start).toBe(simTime(2026, 1, 1));
    const total = (periods: { lines: { revenue: number } }[]) => periods.reduce((s, p) => s + p.lines.revenue, 0);
    expect(total([...fin.months, fin.month])).toBeCloseTo(total([...fin.history, fin.week]), 0);
    // Passengers grow during the first weeks (ramp-up).
    const first = fin.history.find((w) => w.routes[route.id])!.routes[route.id]!;
    expect(first.pax).toBeLessThan(stats.pax);
  });

  it('refuses impossible plans', () => {
    const { state, airlineId } = airlineWithAircraft();
    const open = (destinationId: string, frequency: number, fareFactor = 1) =>
      applyCommand(state, world, { type: 'OpenRoute', airlineId, payload: { destinationId, aircraftId: 'T1', frequency, fareFactor } });
    expect(open('KJFK', 7)).toEqual({ ok: false, error: 'range' });
    expect(open('EGLL', 60)).toEqual({ ok: false, error: 'aircraftBusy' });
    expect(open('EGLL', 7, 3)).toEqual({ ok: false, error: 'fareInvalid' });
    expect(open('LOWW', 7)).toEqual({ ok: false, error: 'sameAirport' });
    expect(open('EGLL', 7).ok).toBe(true);
    expect(open('EGLL', 7)).toEqual({ ok: false, error: 'routeExists' });
    // The same aircraft can fly a second route while it has hours left.
    expect(open('LIRF', 7).ok).toBe(true);
  });

  it('builds a weekly flight pattern and knows where the aircraft is', () => {
    const { state, airlineId } = airlineWithAircraft();
    applyCommand(state, world, { type: 'OpenRoute', airlineId, payload: { destinationId: 'EGLL', aircraftId: 'T1', frequency: 14, fareFactor: 1 } });
    const legs = weeklyLegs(state, world, 'T1');
    expect(legs).toHaveLength(28);
    // First departure: Monday 06:00 Vienna time (05:00 UTC).
    expect(legs[0]!.dep).toBe(5 * 60);
    // Legs never overlap.
    for (let i = 1; i < legs.length; i++) expect(legs[i]!.dep).toBeGreaterThanOrEqual(legs[i - 1]!.arr);
    const monday = startOfWeek(simTime(2026, 1, 12));
    const flying = airborne(legs, world, monday + legs[0]!.dep + 60);
    expect(flying?.leg.flightNumber).toBe(101);
    expect(flying!.progress).toBeGreaterThan(0.3);
    expect(airborne(legs, world, monday + 2 * 60)).toBeNull(); // 03:00 Vienna: on the ground
    expect(airborne(legs, world, monday + MINUTES_PER_DAY + legs[0]!.dep + 30)).not.toBeNull();
  });
});

describe('saves from Phase 1.3', () => {
  it('upgrades a version 1 save', () => {
    const state = createGame({ seed: 3, startYear: 2026, timeMode: 'weekly', realism: 'realistic' }) as Partial<GameState>;
    delete state.routes;
    delete state.finance;
    state.queue = state.queue!.filter((e) => e.kind !== 'dayStart');
    state.version = 1;
    const upgraded = migrate(JSON.parse(JSON.stringify(state)))!;
    expect(upgraded.version).toBe(5);
    expect(upgraded.ai).toEqual({ routes: {}, added: {}, airlines: {} });
    expect(upgraded.routes).toEqual({});
    expect(upgraded.queue.some((e) => e.kind === 'dayStart')).toBe(true);
  });
});

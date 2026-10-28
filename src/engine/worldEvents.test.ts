import { describe, expect, it } from 'vitest';
import airportsJson from '../data/generated/airports.json';
import countriesJson from '../data/generated/countries.json';
import { getAircraftType } from '../data/aircraft';
import type { Airport, Country } from '../data/types';
import { advance } from './advance';
import { economyCabin } from './cabins';
import { applyCommand } from './commands';
import { routeWeek } from './economics';
import { createGame, migrate } from './game';
import { planFor } from './operations';
import { SAVE_VERSION, type GameState, type WorldEvent } from './state';
import { MINUTES_PER_DAY, simTime, startOfDay, toDate } from './time';
import { conditionsOf, REAL_DATA_END } from './worldEvents';
import { buildEngineWorld } from './world';

const world = buildEngineWorld(airportsJson as Airport[], countriesJson as unknown as Record<string, Country>);
const DAY = MINUTES_PER_DAY;
const ap = (id: string) => world.airportById.get(id)!;

function startup(start = REAL_DATA_END, seed = 9) {
  const state = createGame({ seed, startYear: 2026, startTime: start, timeMode: 'realtime', realism: 'realistic', scheduling: 'simple' });
  const r = applyCommand(state, world, {
    type: 'FoundAirline',
    payload: { name: 'Danube Air', iata: 'D7', icao: 'DNB', primary: '#c8102e', secondary: '#ffffff', hubId: 'LOWW', capitalEur: 200_000_000, controller: 'human' },
  });
  return { state, airlineId: (r as { id: string }).id };
}

function withRoute() {
  const { state, airlineId } = startup();
  state.aircraft.W1 = {
    id: 'W1', typeId: 'A20N', airlineId, registration: 'OE-LWA', builtYear: 2020, seats: 180, cabin: economyCabin(getAircraftType('A20N'), 180),
    status: 'active', deliveryAt: state.time, locationId: 'LOWW', paint: 0,
    lease: { lessor: 'AerCap', monthlyRent: { amount: 300_000, currency: 'USD' }, deposit: { amount: 600_000, currency: 'USD' }, startAt: state.time, endAt: state.time + 3000 * DAY },
  };
  applyCommand(state, world, { type: 'OpenRoute', airlineId, payload: { destinationId: 'LFPG', aircraftId: 'W1', frequency: 14, fareFactor: 1 } });
  return { state, airlineId };
}

describe('the simulated world', () => {
  it('follows the real fuel prices and invents nothing before the real data ends', () => {
    const { state } = startup(simTime(2026, 1, 5));
    advance(state, world, simTime(2026, 9, 1));
    expect(state.world.events).toHaveLength(0);
    expect(conditionsOf(state, world).fuelSpot).toBeCloseTo(conditionsOf(state, world, simTime(2026, 9, 1)).fuelSpot);
    expect(conditionsOf(state, world, simTime(2026, 3, 20)).fuelSpot).toBeGreaterThan(3.5); // the real March 2026 spike
  });

  it('produces events at realistic rates, a plausible fuel price and exchange rates over 20 years', () => {
    const { state } = startup();
    const fuel: number[] = [];
    const seen: WorldEvent[] = [];
    for (let y = 0; y < 20; y++) {
      advance(state, world, state.time + 365 * DAY);
      fuel.push(state.world.fuel);
      for (const e of state.world.events) if (!seen.some((s) => s.id === e.id)) seen.push(e);
    }
    const count = (kind: string) => seen.filter((e) => e.kind === kind).length;
    expect(count('atcStrike')).toBeGreaterThan(80);
    expect(count('atcStrike')).toBeLessThan(200);
    expect(count('recession')).toBeGreaterThanOrEqual(1);
    expect(count('recession')).toBeLessThan(15);
    expect(count('winterStorm')).toBeGreaterThan(80);
    expect(seen.every((e) => e.end > e.start)).toBe(true);
    // Fuel: around its long-run level (≈ $2.4 rising with inflation), never absurd.
    for (const f of fuel) {
      expect(f).toBeGreaterThan(0.6);
      expect(f).toBeLessThan(12);
    }
    expect(state.fx.USD).toBeGreaterThan(0.7);
    expect(state.fx.USD).toBeLessThan(1.7);
    // Pegs hold: Hong Kong dollars per US dollar stay the same.
    expect(state.fx.HKD! / state.fx.USD!).toBeCloseTo(8.7768 / 1.1188, 1);
    expect(state.fx.DKK).toBeCloseTo(7.4747, 3);
  });

  it('is the same every time for the same save', () => {
    const run = () => {
      const { state } = startup(REAL_DATA_END, 21);
      advance(state, world, state.time + 3 * 365 * DAY);
      return JSON.stringify([state.world.events.map((e) => [e.kind, e.start]), state.world.fuel, state.fx.USD]);
    };
    expect(run()).toBe(run());
  });
});

describe('effects on the airlines', () => {
  it('a recession cuts demand, business travel most', () => {
    const { state } = startup();
    state.world.events.push({ id: 'R', kind: 'recession', start: state.time, end: state.time + 400 * DAY, continents: ['EU'], depth: 0.15 });
    const mid = state.time + 120 * DAY;
    const c = conditionsOf(state, world, mid);
    const biz = c.demand(ap('LOWW'), ap('LFPG'), 'business');
    const leisure = c.demand(ap('LOWW'), ap('LFPG'), 'leisure');
    expect(biz).toBeLessThan(leisure);
    expect(leisure).toBeLessThan(1);
    expect(c.demand(ap('KJFK'), ap('KLAX'), 'business')).toBe(1);
    const plan = { type: getAircraftType('A20N'), seats: 180, frequency: 14, fareFactor: 1, ageYears: 5, rampUp: 1 };
    const date = toDate(mid);
    const good = routeWeek(world, ap('LOWW'), ap('LFPG'), plan, date, { conditions: conditionsOf(startup().state, world, mid) });
    const bad = routeWeek(world, ap('LOWW'), ap('LFPG'), plan, date, { conditions: c });
    expect(bad.pax).toBeLessThan(good.pax);
    expect(bad.revenue).toBeLessThan(good.revenue * 0.97);
  });

  it('a closed airport cancels flights; passengers get care, not compensation', () => {
    const { state, airlineId } = withRoute();
    advance(state, world, state.time + 10 * DAY);
    const day = startOfDay(state.time) + DAY;
    advance(state, world, day);
    state.world.events.push({ id: 'X', kind: 'atcStrike', start: day, end: day + DAY, countries: ['FR'], depth: 1 });
    const route = Object.values(state.routes)[0]!;
    expect(planFor(state, world, route, day + 12 * 60)).toBeNull();
    const before = state.finance[airlineId]!.week.lines.disruption;
    advance(state, world, day + DAY + 60);
    const msg = state.messages.find((m) => m.kind === 'eventCancellations');
    expect(msg).toBeDefined();
    expect(Number(msg!.params.flights)).toBeGreaterThanOrEqual(2);
    expect(state.finance[airlineId]!.week.lines.disruption - before).toBeGreaterThan(0);
  });

  it('traffic grows over the years, and the competition with it', () => {
    const { state } = startup();
    const now = conditionsOf(state, world, REAL_DATA_END);
    const later = conditionsOf(state, world, REAL_DATA_END + 10 * 365.25 * DAY);
    expect(now.trend).toBeCloseTo(1);
    expect(later.trend).toBeGreaterThan(1.3);
    expect(later.trend).toBeLessThan(1.4);
  });
});

describe('saves from before Phase 5.1', () => {
  it('get a world state', () => {
    const { state } = startup();
    const old = JSON.parse(JSON.stringify(state)) as GameState;
    old.version = 10;
    delete (old as Partial<GameState>).world;
    const upgraded = migrate(old)!;
    expect(upgraded.version).toBe(SAVE_VERSION);
    expect(upgraded.world.events).toEqual([]);
    expect(upgraded.world.fuel).toBeGreaterThan(1);
  });
});

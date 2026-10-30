// Phase 10.4: the board, targets, getting fired, the career.
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
import { boardSeats, careerRecord, jobOffers, ownerOf, review } from './board';
import { buildRealAirlines } from './realAirlines';
import type { Airline, GameState } from './state';
import { simTime } from './time';
import { DAYS_ALL } from './timetable';
import { buildEngineWorld } from './world';

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

/** Makes every target of the year unreachable (or easy) for a review. */
function goals(a: Airline, goal: number) {
  for (const t of a.board!.targets) t.goal = t.kind === 'cash' ? goal * 10_000 : goal;
}

describe('the board (10.4)', () => {
  it('a startup: investors want profit by year three, money in the bank and punctual flights', () => {
    const { a } = airline();
    const board = a().board!;
    expect(board.owner).toBe('investors');
    expect(board.confidence).toBe(60);
    expect(board.targets.map((t) => t.kind).sort()).toEqual(['cash', 'margin', 'onTime']);
    expect(board.targets.find((t) => t.kind === 'margin')!.goal).toBe(-0.3);
    // Six shareholder seats by D'Hondt: investors (70 %) four, the founder (30 %) two; no employee seats yet.
    expect(boardSeats(a(), 'AT')).toEqual([
      { kind: 'player', name: 'player', seats: 2 },
      { kind: 'investors', name: 'investors', seats: 4 },
    ]);
  });

  it('reviews every quarter; misses in the first year count half', () => {
    const { state, a } = airline();
    advance(state, world, simTime(2026, 7, 2));
    const board = a().board!;
    expect(board.reviews.length).toBe(1);
    expect(board.reviews[0]!.at).toBe(simTime(2026, 7, 1));
    expect(board.targets.find((t) => t.kind === 'onTime')!.goal).not.toBeNull();
    goals(a(), 0.9);
    const before = board.confidence;
    const r = review(state, world, a());
    // Every target missed fully: −12 points, halved in the first year (and less again in a crisis such as 2026's war).
    expect(r.results.every((x) => x.score < 0)).toBe(true);
    const full = 12 * 0.5 * (r.crisis ? 0.4 : 1);
    expect(r.delta).toBeLessThan(0);
    expect(-r.delta).toBeLessThanOrEqual(full + 0.05);
    expect(board.confidence).toBeCloseTo(before + r.delta, 0);
    // After the first year misses count fully.
    board.since -= 365 * DAY;
    expect(review(state, world, a()).delta).toBeCloseTo(2 * r.delta, 0);
  });

  it('a warning first, then dismissal at a later review; the game stands still and the career goes on', () => {
    const { state, a } = airline();
    advance(state, world, simTime(2026, 7, 2));
    const board = a().board!;
    board.since -= 2 * 365 * DAY;
    board.confidence = 21;
    goals(a(), 0.9);
    expect(review(state, world, a()).outcome).toBe('warning');
    expect(board.warnedAt).toBe(state.time);
    expect(review(state, world, a()).outcome).toBe('dismissed');
    expect(state.dismissed).toBe(state.time);
    expect(state.career!.jobs[0]).toMatchObject({ airline: 'Test Air', reason: 'dismissed' });
    expect(state.career!.wealthEur).toBeGreaterThan(0);
    expect(applyCommand(state, world, { type: 'CloseRoute', airlineId: a().id, payload: { routeId: Object.keys(state.routes)[0]! } })).toEqual({ ok: false, error: 'dismissed' });
    const time = state.time;
    advance(state, world, time + 30 * DAY);
    expect(state.time).toBe(time);
  });

  it('a player with the majority of the shares cannot be dismissed', () => {
    const { state, a } = airline();
    const e = a().equity!;
    e.holders.find((h) => h.kind === 'player')!.shares = e.shares * 0.6;
    e.holders.find((h) => h.kind === 'investors')!.shares = e.shares * 0.4;
    const board = a().board!;
    board.since -= 2 * 365 * DAY;
    board.confidence = 10;
    board.warnedAt = state.time - 90 * DAY;
    goals(a(), 0.9);
    expect(review(state, world, a()).outcome).not.toBe('dismissed');
    expect(state.dismissed).toBeUndefined();
  });

  it('bankruptcy ends the job', () => {
    const { state, a } = airline();
    a().bankruptAt = state.time;
    advance(state, world, state.time + DAY);
    expect(state.career!.jobs[0]!.reason).toBe('bankrupt');
    expect(state.dismissed).toBeDefined();
  });

  it('a group or the state puts in capital instead of letting its airline go bankrupt', () => {
    const { state, a } = airline();
    a().board!.owner = 'group';
    a().cash = { amount: -5_000_000, currency: a().currency };
    advance(state, world, state.time + DAY);
    expect(a().cash.amount).toBeGreaterThan(0);
    expect(a().board!.events.at(-1)!.kind).toBe('capitalInjection');
    expect(a().board!.confidence).toBeLessThan(60);
    expect(state.dismissed).toBeUndefined();
  });

  it('owners: the state, the stock market, a group', () => {
    const base = { equity: { shares: 100, listed: true, holders: [{ kind: 'public', name: 'public', shares: 100 }] } } as unknown as Airline;
    expect(ownerOf(base)).toBe('public');
    base.equity!.holders.push({ kind: 'state', name: 'Republic', shares: 51 });
    expect(ownerOf(base)).toBe('state');
    base.equity!.holders = [{ kind: 'group', name: 'Lufthansa Group', shares: 100 }];
    expect(ownerOf(base)).toBe('group');
  });

  it('career: job offers need three years and a decent margin; a new game brings the wealth', () => {
    const job = (years: number, margin: number) => ({ airline: 'X', from: 0, to: years * 365.25 * DAY, reason: 'dismissed' as const, margin });
    expect(careerRecord({ jobs: [job(2, 0.05), job(2, -0.03)] }).years).toBeCloseTo(4);
    expect(careerRecord({ jobs: [job(2, 0.05), job(2, -0.03)] }).margin).toBeCloseTo(0.01);
    expect(jobOffers({ career: { jobs: [job(4, 0.02)], wealthEur: 0 } } as GameState)).toEqual(['AUA']);
    expect(jobOffers({ career: { jobs: [job(1, 0.02)], wealthEur: 0 } } as GameState)).toEqual([]);
    expect(jobOffers({ career: { jobs: [job(5, -0.05)], wealthEur: 0 } } as GameState)).toEqual([]);
    expect(jobOffers({ career: { jobs: [{ ...job(5, 0.03), realId: 'AUA' }], wealthEur: 0 } } as GameState)).toEqual([]);
    const state = createGame({ seed: 1, startYear: 2026, timeMode: 'weekly', realism: 'realistic', scheduling: 'detailed', career: { jobs: [job(4, 0.02)], wealthEur: 3_000_000 } });
    const r = applyCommand(state, world, {
      type: 'FoundAirline',
      payload: { name: 'Second Air', iata: 'S2', icao: 'SCD', primary: '#c8102e', secondary: '#ffffff', hubId: 'LOWW', capitalEur: 75_000_000, controller: 'human' },
    });
    const e = state.airlines[(r as { id: string }).id]!.equity!;
    expect(e.playerCash).toBe(3_000_000);
    expect(state.career!.jobs.length).toBe(1);
  });
});

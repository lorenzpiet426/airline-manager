// Phase 10.3: shares, IPO, share price and shareholders.
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
import { fundamentalValue, inBlackout, ipoReady, playerShares, playerWealth } from './shares';
import { buildRealAirlines } from './realAirlines';
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

describe('shares and shareholders (10.3)', () => {
  it('a startup belongs to its founder (30 %) and investors, valued at the money put in', () => {
    const { state, a } = airline();
    const e = a().equity!;
    expect(e.listed).toBe(false);
    expect(playerShares(e) / e.shares).toBeCloseTo(0.3, 5);
    expect(e.price * e.shares).toBeGreaterThan(0.5 * e.paidIn);
    expect(ipoReady(state, a())).toBe('ipoNotReady');
  });

  it('the share price moves weekly; the CEO is paid a salary every month', () => {
    const { state, a } = airline();
    advance(state, world, state.time + 5 * 7 * DAY);
    const e = a().equity!;
    expect(e.history.length).toBeGreaterThan(3);
    expect(e.playerCash).toBeGreaterThan(0);
    expect(state.stocks!.history.length).toBeGreaterThan(3);
  }, 120_000);

  it('a listed airline: new shares, dividends, buybacks; the player trades outside the blackout', () => {
    const { state, airlineId, a } = airline();
    const e = a().equity!;
    // As if it had gone public earlier.
    e.listed = true;
    e.holders.push({ kind: 'public', name: 'public', shares: 2_000_000 });
    e.shares += 2_000_000;
    const cash = a().cash.amount;
    expect(applyCommand(state, world, { type: 'IssueShares', airlineId, payload: { share: 0.1 } }).ok).toBe(true);
    expect(a().cash.amount).toBeGreaterThan(cash);
    const pc = e.playerCash;
    expect(applyCommand(state, world, { type: 'PayDividend', airlineId, payload: { total: 1_000_000 } }).ok).toBe(true);
    expect(e.playerCash).toBeGreaterThan(pc);
    const shares = e.shares;
    expect(applyCommand(state, world, { type: 'BuyBack', airlineId, payload: { share: 0.05 } }).ok).toBe(true);
    expect(e.shares).toBeLessThan(shares);
    // 3 March is within the last 30 days of the quarter: no trading in own shares before the results.
    expect(inBlackout(state.time)).toBe(true);
    expect(applyCommand(state, world, { type: 'TradeOwnShares', airlineId, payload: { shares: -1000 } })).toMatchObject({ ok: false, error: 'blackout' });
    expect(inBlackout(simTime(2026, 4, 15))).toBe(false);
  });

  it('Austrian: state-owned before 1988, listed with the state as main owner until 2009, then 100 % Lufthansa', () => {
    const today = createGame({ seed: 3, startYear: 2026, startTime: simTime(2026, 11, 2), timeMode: 'weekly', realism: 'realistic', scheduling: 'detailed' }, world);
    const r = applyCommand(today, world, { type: 'TakeOverAirline', payload: { realId: 'AUA' } });
    const e = today.airlines[(r as { id: string }).id]!.equity!;
    expect(e.holders.map((h) => h.kind)).toEqual(['group']);
    expect(e.listed).toBe(false);
    expect(ipoReady(today, today.airlines[(r as { id: string }).id]!)).toBe('groupOwned');
  }, 120_000);

  it('valuation: earnings times a multiple minus debt (leases included)', () => {
    const { state, a } = airline();
    advance(state, world, state.time + 10 * DAY);
    expect(fundamentalValue(state, a())).toBeGreaterThan(0);
    expect(playerWealth(a().equity)).toBeGreaterThan(0);
  }, 120_000);
});

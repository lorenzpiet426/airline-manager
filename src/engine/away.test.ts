import { describe, expect, it } from 'vitest';
import airportsJson from '../data/generated/airports.json';
import countriesJson from '../data/generated/countries.json';
import { getAircraftType } from '../data/aircraft';
import type { Airport, Country } from '../data/types';
import { advance } from './advance';
import { awaySummary, markAway } from './away';
import { economyCabin } from './cabins';
import { applyCommand } from './commands';
import { createGame } from './game';
import { pnlCosts } from './state';
import { MINUTES_PER_DAY, simTime, startOfDay } from './time';
import { buildEngineWorld } from './world';
import { slotHolding } from './slots';

const world = buildEngineWorld(airportsJson as Airport[], countriesJson as unknown as Record<string, Country>);

function realClockGame(start = simTime(2026, 10, 28) + 14 * 60 + 37) {
  const state = createGame({ seed: 9, startYear: 2026, startTime: start, timeMode: 'realclock', realism: 'realistic', scheduling: 'simple' });
  // These tests fly to Heathrow, where a newcomer would get no slots (Phase 7.2): the test airline holds some.
  state.slots = { EGLL: slotHolding(20) };
  const r = applyCommand(state, world, {
    type: 'FoundAirline',
    payload: { name: 'Danube Air', iata: 'D7', icao: 'DNB', primary: '#c8102e', secondary: '#ffffff', hubId: 'LOWW', capitalEur: 75_000_000, controller: 'human' },
  });
  const airlineId = (r as { id: string }).id;
  state.aircraft.T1 = {
    id: 'T1', typeId: 'A20N', airlineId, registration: 'OE-LTA', builtYear: 2020, seats: 180, cabin: economyCabin(getAircraftType('A20N'), 180),
    status: 'active', deliveryAt: state.time, locationId: 'LOWW',
    lease: { lessor: 'AerCap', monthlyRent: { amount: 380_000, currency: 'USD' }, deposit: { amount: 760_000, currency: 'USD' }, startAt: state.time, endAt: state.time + 1e6 },
  };
  applyCommand(state, world, { type: 'OpenRoute', airlineId, payload: { destinationId: 'EGLL', aircraftId: 'T1', frequency: 14, fareFactor: 1 } });
  return { state, airlineId };
}

describe('real clock', () => {
  it('starts a game now, with the first day closing at the next midnight', () => {
    const start = simTime(2026, 10, 28) + 14 * 60 + 37;
    const { state } = realClockGame(start);
    expect(state.time).toBe(start);
    expect(state.queue.find((e) => e.kind === 'dayStart')!.at).toBe(startOfDay(start) + MINUTES_PER_DAY);
  });

  it('switches an existing game: behind today = catches up, ahead of today = keeps its date', () => {
    const behind = createGame({ seed: 1, startYear: 2026, timeMode: 'realtime', realism: 'realistic', scheduling: 'simple' });
    const ahead = createGame({ seed: 1, startYear: 2027, timeMode: 'realtime', realism: 'realistic', scheduling: 'simple' });
    for (const s of [behind, ahead]) {
      applyCommand(s, world, { type: 'FoundAirline', payload: { name: 'Danube Air', iata: 'D7', icao: 'DNB', primary: '#c8102e', secondary: '#ffffff', hubId: 'LOWW', capitalEur: 75_000_000, controller: 'human' } });
    }
    const now = simTime(2026, 10, 28);
    const id = Object.keys(behind.airlines)[0]!;
    expect(applyCommand(behind, world, { type: 'SetTimeMode', airlineId: id, payload: { timeMode: 'realclock', now } }).ok).toBe(true);
    expect(behind.options).toMatchObject({ timeMode: 'realclock', clockOffset: 0 });
    applyCommand(ahead, world, { type: 'SetTimeMode', airlineId: Object.keys(ahead.airlines)[0]!, payload: { timeMode: 'realclock', now } });
    expect(ahead.options.clockOffset).toBe(simTime(2027, 1, 1) - now);
    expect(applyCommand(behind, world, { type: 'SetTimeMode', airlineId: id, payload: { timeMode: 'realclock', now } })).toEqual({ ok: false, error: 'alreadyRealClock' });
  });

  it('sums up ten days away exactly like the accounts', () => {
    const { state, airlineId } = realClockGame();
    advance(state, world, state.time + 2 * MINUTES_PER_DAY);
    const mark = markAway(state, airlineId)!;
    const fin = state.finance[airlineId]!;
    // Revenue booked from the mark on, straight from the daily accounts: weeks closed since + the running week.
    const before = fin.week.lines.revenue;
    advance(state, world, state.time + 10 * MINUTES_PER_DAY);
    const report = awaySummary(state, mark)!;
    const closed = fin.history.filter((w) => w.start >= mark.weekStart);
    const expected = closed.reduce((s, w) => s + w.lines.revenue, 0) + fin.week.lines.revenue - before;
    expect(report.revenue).toBeCloseTo(expected, 6);
    expect(report.revenue).toBeGreaterThan(0);
    expect(report.flights).toBeGreaterThan(20); // 14 round trips a week (Simple planning leaves some days empty)
    expect(report.result).toBeCloseTo(report.revenue - (closed.reduce((s, w) => s + pnlCosts(w.lines), 0) + pnlCosts(fin.week.lines) - mark.week.costs), 6);
    expect(report.messages.every((m) => m.airlineId === airlineId)).toBe(true);
    expect(report.to - report.from).toBe(10 * MINUTES_PER_DAY);
  });
});

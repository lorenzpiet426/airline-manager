import { describe, expect, it } from 'vitest';
import airportsJson from '../data/generated/airports.json';
import countriesJson from '../data/generated/countries.json';
import { AIRCRAFT_TYPES, getAircraftType } from '../data/aircraft';
import { CHECK_SHARE, checkQuote, failureChance, HANGAR_BUILD_MONTHS, PROGRAMME, reserveRateUsd, TYPICAL_FH_PER_YEAR } from '../data/maintenance';
import type { Airport, Country } from '../data/types';
import { advance } from './advance';
import { economyCabin } from './cabins';
import { schedule } from './core';
import { applyCommand } from './commands';
import { createGame, migrate } from './game';
import { checksDue, checkOffer, dueOf, ensureMaint, initialMaint, longestHubStayMin } from './maintenance';
import { planFor } from './operations';
import { SAVE_VERSION, type GameState } from './state';
import { addMonths, MINUTES_PER_DAY, simTime, startOfDay } from './time';
import { buildEngineWorld } from './world';

const world = buildEngineWorld(airportsJson as Airport[], countriesJson as unknown as Record<string, Country>);
const DAY = MINUTES_PER_DAY;

function startup() {
  const state = createGame({ seed: 5, startYear: 2026, startTime: simTime(2026, 10, 28), timeMode: 'realtime', realism: 'realistic', scheduling: 'simple' });
  const r = applyCommand(state, world, {
    type: 'FoundAirline',
    payload: { name: 'Danube Air', iata: 'D7', icao: 'DNB', primary: '#c8102e', secondary: '#ffffff', hubId: 'LOWW', capitalEur: 200_000_000, controller: 'human' },
  });
  return { state, airlineId: (r as { id: string }).id };
}

/** A leased A320neo in service at VIE, flying VIE–LHR `frequency` times a week. */
function withAircraft(id: string, frequency = 14, builtYear = 2018) {
  const { state, airlineId } = startup();
  state.aircraft[id] = {
    id, typeId: 'A20N', airlineId, registration: `OE-L${id}`, builtYear, seats: 180, cabin: economyCabin(getAircraftType('A20N'), 180),
    status: 'active', deliveryAt: state.time, locationId: 'LOWW',
    lease: { lessor: 'AerCap', monthlyRent: { amount: 300_000, currency: 'USD' }, deposit: { amount: 600_000, currency: 'USD' }, startAt: state.time, endAt: state.time + 3000 * DAY },
  };
  if (frequency) applyCommand(state, world, { type: 'OpenRoute', airlineId, payload: { destinationId: 'EGLL', aircraftId: id, frequency, fareFactor: 1 } });
  ensureMaint(state, state.aircraft[id]!);
  return { state, airlineId, aircraft: state.aircraft[id]! };
}
const cash = (state: GameState, id: string) => state.airlines[id]!.cash.amount;

describe('check programme', () => {
  it('makes checks about a fifth of maintenance costs, like the hourly costs they replace', () => {
    for (const id of ['AT76', 'E295', 'A20N', 'B38M', 'B789', 'A359']) {
      const type = getAircraftType(id);
      const p = PROGRAMME[type.category];
      const fh = TYPICAL_FH_PER_YEAR[type.category];
      const perYear =
        (fh / p.aFh) * checkQuote(type, 'A', 8).usd +
        checkQuote(type, 'C', 8).usd / Math.min(p.cMonths / 12, p.cFh / fh) +
        checkQuote(type, 'D', 8).usd / p.dYears;
      const share = perYear / (type.maintUsdPerBlockHour * 1.08 * fh);
      expect(share, id).toBeGreaterThan(CHECK_SHARE * 0.5);
      expect(share, id).toBeLessThan(CHECK_SHARE * 1.8);
    }
  });

  it('prices every type, bigger and older aircraft higher', () => {
    for (const type of AIRCRAFT_TYPES) expect(checkQuote(type, 'C', 5).usd, type.id).toBeGreaterThan(0);
    expect(checkQuote(getAircraftType('A21N'), 'C', 5).usd).toBeGreaterThan(checkQuote(getAircraftType('A19N'), 'C', 5).usd);
    expect(checkQuote(getAircraftType('A20N'), 'D', 20).usd).toBeGreaterThan(checkQuote(getAircraftType('A20N'), 'D', 5).usd);
    expect(checkQuote(getAircraftType('A20N'), 'D', 20).days).toBeGreaterThan(checkQuote(getAircraftType('A20N'), 'D', 5).days);
    // Airframe reserves for an A320neo: in the order of $70–110 per flight hour (≈ $20k a month).
    expect(reserveRateUsd(getAircraftType('A20N'))).toBeGreaterThan(60);
    expect(reserveRateUsd(getAircraftType('A20N'))).toBeLessThan(120);
  });

  it('starts new aircraft fresh, leased ones after a transition C-check, used ones somewhere in their cycles', () => {
    const type = getAircraftType('A20N');
    const now = simTime(2026, 10, 28);
    const fresh = initialMaint('x', type, 2026, now, 'new');
    expect(checksDue(type, fresh, now, 0).d).toBe(addMonths(now, 144));
    const leased = initialMaint('x', type, 2014, now, 'transition');
    expect(leased.c.at).toBe(now);
    expect(leased.fh).toBeGreaterThan(30_000);
    // Twelve-year-old aircraft: in its second D-cycle.
    expect(leased.d.at).toBeGreaterThan(simTime(2014, 1, 1));
    for (const key of ['a', 'b', 'c', 'd', 'e']) {
      const used = initialMaint(key, type, 2012, now, 'used');
      expect(used.c.at).toBeGreaterThanOrEqual(used.d.at);
      expect(used.c.at).toBeLessThanOrEqual(now);
      expect(checksDue(type, used, now, 8).c).toBeGreaterThan(now - DAY);
    }
    // The 7,500-hour limit comes before 36 months for a busy A320.
    const busy = checksDue(type, fresh, now, 12);
    expect(busy.c).toBeLessThan(addMonths(now, 36));
  });
});

describe('heavy checks', () => {
  it('are planned ahead, take the aircraft out of service and are paid from the lessor\'s reserves', () => {
    const { state, airlineId, aircraft } = withAircraft('T1');
    const m = aircraft.maint!;
    // Last C-check 33 months ago: due in about three months.
    m.c = { at: addMonths(state.time, -33), fh: m.fh - 2000 };
    m.reserves = 2_000_000;
    advance(state, world, state.time + 2 * DAY);
    expect(m.plan?.kind).toBe('C');
    expect(state.messages.some((x) => x.kind === 'checkPlanned')).toBe(true);
    const start = m.plan!.start;
    expect(start).toBeLessThanOrEqual(dueOf(state, world, aircraft)!.next.due);
    // Planned in the winter low season.
    const month = new Date(Date.UTC(1950, 0, 1) + start * 60_000).getUTCMonth() + 1;
    expect(month === 11 || month === 12 || month <= 3).toBe(true);

    const cashBefore = cash(state, airlineId);
    advance(state, world, start + DAY + 60);
    expect(m.inCheck?.kind).toBe('C');
    expect(planFor(state, world, Object.values(state.routes)[0]!, state.time)).toBeNull();
    // The reserves paid for it; only the daily costs went out.
    expect(m.reserves!).toBeLessThan(2_000_000);
    expect(cashBefore - cash(state, airlineId)).toBeLessThan(10_000_000);
    advance(state, world, m.inCheck!.until + DAY);
    expect(m.inCheck).toBeUndefined();
    expect(m.c.at).toBeGreaterThan(start);
    expect(state.messages.some((x) => x.kind === 'checkDone')).toBe(true);
    expect(planFor(state, world, Object.values(state.routes)[0]!, state.time)).not.toBeNull();
  });

  it('owned aircraft pay the check themselves and write it off until the next one', () => {
    const { state, airlineId, aircraft } = withAircraft('T2');
    delete aircraft.lease;
    aircraft.owned = { price: 30_000_000, boughtAt: state.time, residual: 3_000_000, writtenOffAt: state.time + 20 * 365 * DAY };
    const m = aircraft.maint!;
    delete m.reserves;
    m.c = { at: addMonths(state.time, -36), fh: m.fh - 2000 };
    const before = cash(state, airlineId);
    advance(state, world, state.time + 3 * DAY);
    expect(m.inCheck?.kind).toBe('C');
    // Short notice: the check had to start right away (an MRO charges extra).
    expect(before - cash(state, airlineId)).toBeGreaterThan(checkQuote(getAircraftType('A20N'), 'C', 8).usd * 0.8);
    expect(m.amort!.perDay).toBeGreaterThan(0);
    expect(m.amort!.until).toBeGreaterThan(addMonths(state.time, 30));
  });

  it('lets the player move a check between tomorrow and its due date', () => {
    const { state, airlineId, aircraft } = withAircraft('T3');
    const due = dueOf(state, world, aircraft)!.next.due;
    const move = (start: number) => applyCommand(state, world, { type: 'MoveCheck', airlineId, payload: { aircraftId: 'T3', start } });
    expect(move(state.time)).toEqual({ ok: false, error: 'dateInvalid' });
    expect(move(due + 2 * DAY)).toEqual({ ok: false, error: 'dateInvalid' });
    expect(move(state.time + 60 * DAY).ok).toBe(true);
    expect(aircraft.maint!.plan!.start).toBe(startOfDay(state.time + 60 * DAY));
    expect(aircraft.maint!.plan!.moved).toBe(true);
    // Booked two months ahead: no short-notice premium. Ten days ahead: there is one.
    const normal = checkOffer(state, aircraft, 'C', state.time + 60 * DAY, state.time);
    const rushed = checkOffer(state, aircraft, 'C', state.time + 10 * DAY, state.time);
    expect(rushed.usd).toBeGreaterThan(normal.usd * 1.2);
  });
});

describe('A-checks', () => {
  it('are done overnight at the hub, or ground an aircraft that never spends a night there', () => {
    const night = withAircraft('N1', 7);
    expect(longestHubStayMin(night.state, world, night.aircraft)).toBeGreaterThan(8 * 60);
    night.aircraft.maint!.a = { at: night.state.time, fh: night.aircraft.maint!.fh - 800 };
    advance(night.state, world, night.state.time + 2 * DAY);
    expect(night.aircraft.maint!.inCheck).toBeUndefined();
    expect(night.aircraft.maint!.a.at).toBeGreaterThan(night.state.time - 3 * DAY);

    const { state, airlineId, aircraft } = withAircraft('N2', 0);
    state.options.scheduling = 'detailed';
        applyCommand(state, world, {
      type: 'OpenRoute',
      airlineId,
      payload: {
        destinationId: 'LPPT', aircraftId: 'N2', frequency: 0, fareFactor: 1,
        // Out in the afternoon, a night in Lisbon, back next morning: only ~6 hours a day at the hub.
        flights: [{ aircraftId: 'N2', dep: 15 * 60, days: 0b1111111, groundMin: 10 * 60 }],
      },
    });
    expect(longestHubStayMin(state, world, aircraft)).toBeLessThan(8 * 60);
    aircraft.maint!.a = { at: state.time, fh: aircraft.maint!.fh - 800 };
    advance(state, world, state.time + 2 * DAY);
    expect(state.messages.some((x) => x.kind === 'aCheckGrounded')).toBe(true);
  });
});

describe('technical failures', () => {
  it('cancel flights, cost repairs and EU 261 compensation, and hurt the reputation', () => {
    const { state, airlineId, aircraft } = withAircraft('F1', 14);
    advance(state, world, state.time + 8 * DAY);
    const day = startOfDay(state.time) + DAY;
    advance(state, world, day);
    const m = aircraft.maint!;
    delete m.aog;
    state.queue = state.queue.filter((e) => e.kind !== 'failure');
    m.aog = { from: day + 5 * 60, until: day + 30 * 60, hours: 25 };
    schedule(state, { at: m.aog.from, kind: 'failure', aircraftId: 'F1' });
    const before = state.finance[airlineId]!.week.lines.disruption;
    advance(state, world, day + 6 * 60);
    const msg = state.messages.find((x) => x.kind === 'failure');
    expect(msg).toBeDefined();
    expect(Number(msg!.params.flights)).toBeGreaterThanOrEqual(2);
    expect(state.finance[airlineId]!.week.lines.disruption - before).toBeGreaterThan(10_000);
    expect(state.reputation[airlineId]!.week.Y!.disruption).toBeLessThan(0);
    // The day's flights from 05:00 UTC on don't count.
    const route = Object.values(state.routes)[0]!;
    const plan = planFor(state, world, route, day + 23 * 60);
    expect(plan?.flights?.length ?? 0).toBeLessThan(4);
  });

  it('happen now and then, more often to old aircraft', () => {
    const count = (builtYear: number) => {
      let n = 0;
      for (const seed of [1, 2, 3, 4]) {
        const { state } = withAircraft(`R${seed}`, 14, builtYear);
        state.rng = seed * 7919;
        advance(state, world, state.time + 365 * DAY);
        n += state.messages.filter((x) => x.kind === 'failure').length;
      }
      return n;
    };
    // Four aircraft for a year with 4 departures a day: a handful of failures.
    const young = count(2024);
    expect(young).toBeGreaterThanOrEqual(1);
    expect(young).toBeLessThan(30);
    expect(failureChance(22, 0.5, false)).toBeGreaterThan(1.5 * failureChance(4, 0.5, false));
    expect(failureChance(4, 1, false)).toBeGreaterThan(failureChance(4, 0, false));
    expect(failureChance(4, 0.5, true)).toBeGreaterThan(failureChance(4, 0.5, false));
  });
});

describe('own hangar', () => {
  it('takes 18 months to build and makes checks cheaper', () => {
    const { state, airlineId, aircraft } = withAircraft('H1');
    const mro = checkOffer(state, aircraft, 'C', state.time + 60 * DAY, state.time);
    expect(mro.where).toBe('mro');
    const before = cash(state, airlineId);
    expect(applyCommand(state, world, { type: 'BuildHangar', airlineId, payload: { size: 'narrow' } }).ok).toBe(true);
    expect(before - cash(state, airlineId)).toBeGreaterThan(5_000_000);
    advance(state, world, addMonths(state.time, HANGAR_BUILD_MONTHS) + 2 * DAY);
    expect(state.messages.some((x) => x.kind === 'hangarReady')).toBe(true);
    const own = checkOffer(state, aircraft, 'C', state.time + 60 * DAY, state.time);
    expect(own.where).toBe('hangar');
    expect(own.usd).toBeLessThan(mro.usd * 0.7);
  });
});

describe('saves from before Phase 4.2', () => {
  it('get maintenance histories, hangars and the compensation line', () => {
    const { state } = withAircraft('M1');
    const old = JSON.parse(JSON.stringify(state)) as GameState;
    old.version = 8;
    delete (old as Partial<GameState>).hangars;
    delete old.aircraft.M1!.maint;
    delete old.aircraft.M1!.lease!.reserveUsdPerFh;
    for (const fin of Object.values(old.finance)) delete (fin.week.lines as Partial<typeof fin.week.lines>).disruption;
    const upgraded = migrate(old)!;
    expect(upgraded.version).toBe(SAVE_VERSION);
    expect(upgraded.hangars).toEqual({});
    expect(upgraded.aircraft.M1!.maint!.c.at).toBe(upgraded.time);
    expect(upgraded.aircraft.M1!.lease!.reserveUsdPerFh).toBeGreaterThan(0);
    expect(Object.values(upgraded.finance)[0]!.week.lines.disruption).toBe(0);
  });
});

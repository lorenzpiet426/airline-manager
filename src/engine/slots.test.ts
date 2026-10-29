// Phase 7.2: airport slots and night curfews.
import { describe, expect, it } from 'vitest';
import airportsJson from '../data/generated/airports.json';
import countriesJson from '../data/generated/countries.json';
import airlinesJson from '../data/generated/airlines.json';
import networksJson from '../data/generated/networks.json';
import detailsJson from '../data/generated/airline-details.json';
import registersJson from '../data/generated/registers.json';
import eurostatJson from '../data/generated/routes-eurostat.json';
import { getAircraftType } from '../data/aircraft';
import { curfewAtTime } from '../data/curfews';
import type { Airport, Country } from '../data/types';
import { economyCabin } from './cabins';
import { applyCommand } from './commands';
import { createGame } from './game';
import { buildRealAirlines } from './realAirlines';
import { freeSlots, seasonChange, seasonStarts, slotHolding, slotPriceUsd, slotUse } from './slots';
import { simTime, toDate } from './time';
import { DAYS_ALL } from './timetable';
import { buildEngineWorld } from './world';

const real = buildRealAirlines(airlinesJson as never, networksJson as never, detailsJson as never, registersJson as never, eurostatJson);
const world = buildEngineWorld(airportsJson as Airport[], countriesJson as unknown as Record<string, Country>, real);
const A320 = getAircraftType('A20N');

function startup() {
  const state = createGame({ seed: 1, startYear: 2026, startTime: simTime(2026, 11, 2), timeMode: 'weekly', realism: 'realistic', scheduling: 'detailed' });
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
const open = (state: ReturnType<typeof startup>['state'], airlineId: string, dest: string, dep: number, groundMin = 45) =>
  applyCommand(state, world, { type: 'OpenRoute', airlineId, payload: { destinationId: dest, aircraftId: '', frequency: 0, fareFactor: 1, flights: [{ aircraftId: 'T1', dep, days: DAYS_ALL, groundMin }] } });

describe('night curfews (7.2)', () => {
  it('know the real rules and their years', () => {
    expect(curfewAtTime('EDDF', 23 * 60 + 30, 2015)?.kind).toBe('ban'); // Frankfurt since 2011
    expect(curfewAtTime('EDDF', 23 * 60 + 30, 2005)).toBeNull();
    expect(curfewAtTime('LSZH', 6 * 60, 2026)).toBeNull(); // Zurich opens at 06:00
    expect(curfewAtTime('LSZH', 5 * 60 + 55, 2026)?.kind).toBe('ban');
    expect(curfewAtTime('LOWW', 2 * 60, 2026)).toBeNull(); // Vienna: no ban
    expect(curfewAtTime('EGKK', 2 * 60, 2026)?.kind).toBe('quota');
  });

  it('refuse a flight landing in Frankfurt after 23:00', () => {
    const { state, airlineId } = startup();
    // Vienna 21:45 → Frankfurt ≈ 23:05.
    expect(open(state, airlineId, 'EDDF', 21 * 60 + 45)).toMatchObject({ ok: false, error: 'curfewDestination' });
    expect(open(state, airlineId, 'EDDF', 9 * 60).ok).toBe(true);
  });
});

describe('slots (7.2)', () => {
  it('Heathrow is full at the peak, Vienna has room', () => {
    const { state } = startup();
    expect(slotUse(world, 'EGLL', state.time)).toBe(1);
    expect(freeSlots(state, world, 'EGLL', 8)).toBe(0); // Monday 08–09
    expect(freeSlots(state, world, 'LOWW', 8)).toBeGreaterThan(10);
    // Back in 1985 air travel was far smaller: Heathrow had room.
    expect(slotUse(world, 'EGLL', simTime(1985, 6, 1))).toBeLessThan(0.7);
  });

  it('a newcomer gets no Heathrow slot at 07:00, but can buy the missing ones and then fly', () => {
    const { state, airlineId } = startup();
    const r = open(state, airlineId, 'EGLL', 7 * 60);
    expect(r).toMatchObject({ ok: false, error: 'noSlot' });
    // Nothing was changed by the refused plan.
    expect(Object.keys(state.routes)).toHaveLength(0);
    const shortfall = (r as { slots: { airportId: string; hours: number[] } }).slots;
    expect(shortfall.airportId).toBe('EGLL');
    expect(shortfall.hours.length).toBeGreaterThan(0);
    // Prices: a peak slot pair of 2016 cost about $60 m (14 slots a week).
    expect(slotPriceUsd('EGLL', 8, state.time)! * 14).toBeGreaterThan(55e6);
    const cash = state.airlines[airlineId]!.cash.amount;
    expect(applyCommand(state, world, { type: 'BuySlots', airlineId, payload: shortfall })).toEqual({ ok: true });
    expect(state.airlines[airlineId]!.cash.amount).toBeLessThan(cash);
    expect(open(state, airlineId, 'EGLL', 7 * 60).ok).toBe(true);
    // Not tradable in the EU (Lisbon): requests instead.
    expect(applyCommand(state, world, { type: 'BuySlots', airlineId, payload: { airportId: 'LPPT', hours: [8] } })).toMatchObject({ ok: false, error: 'notTradable' });
  });

  it('use it or lose it, and requests decided at the season start', () => {
    const { state, airlineId } = startup();
    state.slots = { EGLL: { ...slotHolding(0), weeks: 20 } };
    state.slots.EGLL!.held[30] = 2; // held all season, never flown
    applyCommand(state, world, { type: 'RequestSlots', airlineId, payload: { airportId: 'LPPT', hours: [8, 8, 9, 3] } });
    seasonChange(state, world);
    expect(state.slots.EGLL!.held[30]).toBe(0);
    const lisbon = state.slots.LPPT!;
    expect(lisbon.requests.every((n) => n === 0)).toBe(true);
    expect(lisbon.held[3]).toBe(1); // 03:00 Monday: free capacity
    expect(state.messages.some((m) => m.kind === 'slotSeason' && m.params.lost === 2)).toBe(true);
  });

  it('IATA seasons start on the last Sunday of March and October', () => {
    const [summer, winter] = seasonStarts(2026);
    expect(toDate(summer).toISOString().slice(0, 10)).toBe('2026-03-29');
    expect(toDate(winter).toISOString().slice(0, 10)).toBe('2026-10-25');
  });
});

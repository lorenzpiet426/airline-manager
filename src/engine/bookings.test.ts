// Phase 9.3: fare buckets, booking curves and live bookings.
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
import { bookedWithin, willingToPay } from './bookings';
import { knownFlights } from './delays';
import { buildRealAirlines } from './realAirlines';
import type { GameState } from './state';
import { simTime } from './time';
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

const saverSold = (state: GameState) =>
  Object.values(state.bookings ?? {}).reduce((n, r) => n + (r.sold.Y?.saver ?? 0), 0);

describe('booking classes and live bookings (9.3)', () => {
  it('travellers: business pays more and books later', () => {
    expect(willingToPay('leisure', 0.6)).toBeGreaterThan(willingToPay('leisure', 1));
    expect(willingToPay('business', 1.3)).toBeGreaterThan(willingToPay('leisure', 1.3));
    // Three weeks before departure most holidaymakers have booked, most business travellers haven't.
    expect(1 - bookedWithin('leisure', false, 21)).toBeGreaterThan(0.35);
    expect(1 - bookedWithin('business', false, 21)).toBeLessThan(0.15);
  });

  it('flights sell day by day: cheap buckets first, closing before departure; the flown flight carries what was booked', () => {
    const { state, airlineId } = airline();
    advance(state, world, state.time + 10 * DAY);
    const recs = Object.values(state.bookings ?? {}).filter((r) => r.airlineId === airlineId);
    // On sale up to 60 days ahead (Málaga is short-haul), twice a day (out and back).
    expect(recs.length).toBeGreaterThan(100);
    const total = (r: (typeof recs)[number]) => Object.values(r.sold.Y ?? {}).reduce((a, b) => a + b, 0);
    const near = recs.filter((r) => r.dep - state.time < 3 * DAY);
    const far = recs.filter((r) => r.dep - state.time > 45 * DAY);
    const avg = (xs: typeof recs) => xs.reduce((n, r) => n + total(r), 0) / xs.length;
    expect(avg(near)).toBeGreaterThan(avg(far));
    // Saver closes 14 days before departure: a flight in under two weeks sells no more saver seats.
    const soon = recs.find((r) => r.dep - state.time > 3 * DAY && r.dep - state.time < 10 * DAY)!;
    const saverThen = soon.sold.Y?.saver ?? 0;
    advance(state, world, state.time + DAY);
    expect(state.bookings![`${soon.key}:${soon.dep}`]!.sold.Y?.saver ?? 0).toBeCloseTo(saverThen, 6);
    // A flown flight's passengers are its bookings.
    const flown = knownFlights(state).filter((f) => f.econ).at(-1)!;
    expect(flown.econ!.pax).toBeGreaterThan(50);
    expect(flown.econ!.pax).toBeLessThanOrEqual(flown.econ!.seats + 1e-6);
  }, slow(180_000));

  it('the airline decides: no saver seats on a route, and its own buckets', () => {
    const { state, airlineId } = airline();
    const route = Object.values(state.routes)[0]!;
    expect(applyCommand(state, world, { type: 'SetBucketLimits', airlineId, payload: { routeId: route.id, cls: 'Y', limits: { saver: 0 } } }).ok).toBe(true);
    // Flights already on sale keep the saver seats they sold; no new ones are sold anywhere.
    const before = saverSold(state);
    advance(state, world, state.time + 3 * DAY);
    expect(saverSold(state)).toBeLessThanOrEqual(before);
    // Buckets need one that sells until departure without a limit.
    const closed = [{ id: 'early', name: 'Early', factor: 0.7, flexible: false, closeDays: 21, share: null }];
    expect(applyCommand(state, world, { type: 'SetFareBuckets', airlineId, payload: { cls: 'Y', buckets: closed } })).toMatchObject({ ok: false, error: 'bucketsNeedOpen' });
    const mine = [...closed, { id: 'walkup', name: 'Walk-up', factor: 1.3, flexible: true, closeDays: 0, share: null }];
    expect(applyCommand(state, world, { type: 'SetFareBuckets', airlineId, payload: { cls: 'Y', buckets: mine } }).ok).toBe(true);
    // Far-off flights sell every third day.
    advance(state, world, state.time + 4 * DAY);
    const r = Object.values(state.bookings!).find((x) => x.dep - state.time > 30 * DAY)!;
    expect(Object.keys(r.sold.Y ?? {})).toContain('early');
  }, slow(180_000));
});

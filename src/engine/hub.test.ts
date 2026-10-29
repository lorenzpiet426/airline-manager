// Phase 7.3: gates and lounges at the player's hub.
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
import { economyCabin, standardCabin } from './cabins';
import { applyCommand } from './commands';
import { routeWeek } from './economics';
import { createGame } from './game';
import { freeGates, gatesAt, groundContext, hubGates, LOUNGE_EXPERIENCE } from './hub';
import { buildRealAirlines } from './realAirlines';
import { simTime } from './time';
import { DAYS_ALL } from './timetable';
import { buildEngineWorld } from './world';

const real = buildRealAirlines(airlinesJson as never, networksJson as never, detailsJson as never, registersJson as never, eurostatJson);
const world = buildEngineWorld(airportsJson as Airport[], countriesJson as unknown as Record<string, Country>, real);
const ap = (id: string) => world.airportById.get(id)!;
const A320 = getAircraftType('A20N');

function startup() {
  const state = createGame({ seed: 1, startYear: 2026, startTime: simTime(2026, 11, 2), timeMode: 'weekly', realism: 'realistic', scheduling: 'detailed' });
  const founded = applyCommand(state, world, {
    type: 'FoundAirline',
    payload: { name: 'Danube Air', iata: 'D7', icao: 'DNB', primary: '#c8102e', secondary: '#ffffff', hubId: 'LOWW', capitalEur: 200_000_000, controller: 'human' },
  });
  const airlineId = (founded as { id: string }).id;
  for (const id of ['T1', 'T2', 'T3']) {
    state.aircraft[id] = {
      id, typeId: 'A20N', airlineId, registration: `OE-L${id}`, builtYear: 2020, seats: 180, cabin: economyCabin(A320, 180), status: 'active', deliveryAt: state.time, locationId: 'LOWW',
      lease: { lessor: 'AerCap', monthlyRent: { amount: 380_000, currency: 'USD' }, deposit: { amount: 760_000, currency: 'USD' }, startAt: state.time, endAt: state.time + 1e6 },
    };
  }
  return { state, airlineId };
}
const open = (state: ReturnType<typeof startup>['state'], airlineId: string, dest: string, aircraftId: string, dep: number) =>
  applyCommand(state, world, { type: 'OpenRoute', airlineId, payload: { destinationId: dest, aircraftId: '', frequency: 0, fareFactor: 1, flights: [{ aircraftId, dep, days: DAYS_ALL, groundMin: 45 }] } });

describe('gates (7.3)', () => {
  it('a hub has contact gates and remote stands; full airports have none left', () => {
    expect(gatesAt(ap('LOWW'))).toEqual({ contact: 37, remote: 67 });
    const { state, airlineId } = startup();
    expect(freeGates(state, world, airlineId, 'LOWW').contact).toBeGreaterThan(5);
    expect(freeGates(state, world, airlineId, 'EGLL').contact).toBe(0);
  });

  it('flights rent the remote stands they need; contact gates are rented on purpose and go first', () => {
    const { state, airlineId } = startup();
    // Two aircraft leaving at the same time need two gates.
    expect(open(state, airlineId, 'LEMG', 'T1', 9 * 60).ok).toBe(true);
    expect(open(state, airlineId, 'LIRF', 'T2', 9 * 60).ok).toBe(true);
    expect(hubGates(state, world, airlineId).peak).toBe(2);
    expect(state.airlines[airlineId]!.gates).toEqual({ contact: 0, remote: 2 });
    expect(state.messages.some((m) => m.kind === 'gatesRented')).toBe(true);
    // Fewer gates than the timetable needs: refused.
    expect(applyCommand(state, world, { type: 'RentGates', airlineId, payload: { contact: 0, remote: 1 } })).toMatchObject({ ok: false, error: 'gatesNeeded' });
    expect(applyCommand(state, world, { type: 'RentGates', airlineId, payload: { contact: 1, remote: 1 } }).ok).toBe(true);
    const gates = hubGates(state, world, airlineId).gateOf;
    expect([...gates.values()].filter((g) => g === 'contact').length).toBeGreaterThan(0);
    expect([...gates.values()].filter((g) => g === 'remote').length).toBeGreaterThan(0);
  });

  it('a bus to a remote stand costs money and passengers notice it', () => {
    const plan = { type: A320, seats: 180, frequency: 7, fareFactor: 1, ageYears: 5, rampUp: 1, flights: [{ dir: 0 as const, days: DAYS_ALL, dep: 540, type: A320, seats: 180, cabin: economyCabin(A320, 180), ageYears: 5, key: 'P1:0' }] };
    const date = new Date(Date.UTC(2026, 4, 12));
    const at = (gate: 'contact' | 'remote') => routeWeek(world, ap('LOWW'), ap('LEMG'), plan, date, { ground: { hubId: 'LOWW', gateOf: new Map([['P1:0', gate]]) } });
    const contact = at('contact');
    const remote = at('remote');
    expect(remote.costs.handling).toBeGreaterThan(contact.costs.handling);
    expect(remote.experience.Y!.ground! / remote.experience.Y!.pax).toBeLessThan(0);
    expect(contact.experience.Y!.ground ?? 0).toBe(0);
  });
});

describe('lounges (7.3)', () => {
  it('cost money and months to build, and premium passengers rate them', () => {
    const { state, airlineId } = startup();
    const cash = state.airlines[airlineId]!.cash.amount;
    expect(applyCommand(state, world, { type: 'BuildLounge', airlineId, payload: { seats: 20, quality: 'premium' } })).toMatchObject({ ok: false, error: 'loungeInvalid' });
    expect(applyCommand(state, world, { type: 'BuildLounge', airlineId, payload: { seats: 200, quality: 'premium' } }).ok).toBe(true);
    expect(applyCommand(state, world, { type: 'BuildLounge', airlineId, payload: { seats: 100, quality: 'standard' } })).toMatchObject({ ok: false, error: 'loungeExists' });
    // 200 seats × $30,000 ≈ $6 m.
    expect(cash - state.airlines[airlineId]!.cash.amount).toBeGreaterThan(4_500_000);
    // Not open yet; once open, business passengers leaving the hub get its bonus instead of a contract lounge.
    expect(groundContext(state, world, airlineId)!.lounge).toBeUndefined();
    state.airlines[airlineId]!.lounges![0]!.readyAt = state.time;
    const g = groundContext(state, world, airlineId)!;
    expect(g.lounge!.experience).toBe(LOUNGE_EXPERIENCE.premium);
    const cabin = standardCabin(A320, 'twoShort');
    const plan = { type: A320, seats: 180, frequency: 7, fareFactor: 1, ageYears: 5, rampUp: 1, flights: [{ dir: 0 as const, days: DAYS_ALL, dep: 540, type: A320, seats: 180, cabin, ageYears: 5 }] };
    const week = routeWeek(world, ap('LOWW'), ap('EGLL'), plan, new Date(Date.UTC(2026, 4, 12)), { ground: g });
    expect(week.experience.J!.ground! / week.experience.J!.pax).toBeCloseTo(LOUNGE_EXPERIENCE.premium, 5);
    expect(week.experience.Y!.ground ?? 0).toBe(0);
  });
});

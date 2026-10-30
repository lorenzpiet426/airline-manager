// Phase 9.4: frequent-flyer programmes.
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
import { loyaltyPull, tierShares } from './loyalty';
import { buildRealAirlines } from './realAirlines';
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

describe('frequent-flyer programmes (9.4)', () => {
  it('an own programme: members join over months, points pile up, award seats fly, and it pulls travellers', () => {
    const { state, airlineId, a } = airline();
    expect(applyCommand(state, world, { type: 'StartLoyalty', airlineId, payload: { name: 'Danube Miles' } }).ok).toBe(true);
    expect(applyCommand(state, world, { type: 'StartLoyalty', airlineId, payload: { name: 'Again' } })).toMatchObject({ ok: false, error: 'loyaltyExists' });
    advance(state, world, state.time + 10 * 7 * DAY);
    const p = a().loyalty!;
    expect(p.weeks.length).toBeGreaterThan(5);
    expect(p.memberShare).toBeGreaterThan(p.weeks[0]!.memberShare);
    expect(p.points).toBeGreaterThan(0);
    expect(p.weeks.at(-1)!.awards).toBeGreaterThan(0);
    expect(p.awardRate).toBeLessThanOrEqual(p.awardShare + 1e-9);
    const pull = loyaltyPull(state, a())!;
    expect(pull.business).toBeGreaterThan(pull.leisure);
    expect(pull.leisure).toBeGreaterThan(1);
  }, slow(240_000));

  it('lower status thresholds make more status members; rules are checked', () => {
    const easy = tierShares({ silver: 500, gold: 1_500, platinum: 4_000 });
    const hard = tierShares({ silver: 5_000, gold: 12_000, platinum: 30_000 });
    expect(easy.silver).toBeGreaterThan(hard.silver);
    expect(easy.gold).toBeGreaterThan(hard.gold);
    const { state, airlineId } = airline();
    applyCommand(state, world, { type: 'StartLoyalty', airlineId, payload: { name: 'Danube Miles' } });
    const bad = { name: 'X', earn: 4, thresholds: { silver: 5_000, gold: 4_000, platinum: 10_000 }, awardShare: 0.05, expiryMonths: 36 };
    expect(applyCommand(state, world, { type: 'SetLoyalty', airlineId, payload: bad })).toMatchObject({ ok: false, error: 'loyaltyInvalid' });
    expect(applyCommand(state, world, { type: 'SetLoyalty', airlineId, payload: { ...bad, thresholds: { silver: 1_000, gold: 3_000, platinum: 8_000 }, earn: 6 } }).ok).toBe(true);
    expect(applyCommand(state, world, { type: 'LeaveLoyalty', airlineId, payload: {} }).ok).toBe(true);
    expect(state.airlines[airlineId]!.loyalty).toBeUndefined();
  });

  it('Austrian keeps Miles & More: the group programme, its rules fixed', () => {
    const state = createGame({ seed: 3, startYear: 2026, startTime: simTime(2026, 11, 2), timeMode: 'weekly', realism: 'realistic', scheduling: 'detailed' }, world);
    const r = applyCommand(state, world, { type: 'TakeOverAirline', payload: { realId: 'AUA' } });
    const id = (r as { id: string }).id;
    const p = state.airlines[id]!.loyalty!;
    expect(p.kind).toBe('partner');
    expect(p.name).toBe('Miles & More');
    const rules = { name: 'Mine', earn: 6, thresholds: { silver: 1_000, gold: 3_000, platinum: 8_000 }, awardShare: 0.05, expiryMonths: 36 };
    expect(applyCommand(state, world, { type: 'SetLoyalty', airlineId: id, payload: rules })).toMatchObject({ ok: false, error: 'loyaltyPartner' });
  }, slow(120_000));
});

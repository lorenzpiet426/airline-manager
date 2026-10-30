// Phase 8.1: pilots and cabin crew.
import { describe, expect, it } from 'vitest';
import airportsJson from '../data/generated/airports.json';
import countriesJson from '../data/generated/countries.json';
import airlinesJson from '../data/generated/airlines.json';
import networksJson from '../data/generated/networks.json';
import detailsJson from '../data/generated/airline-details.json';
import registersJson from '../data/generated/registers.json';
import eurostatJson from '../data/generated/routes-eurostat.json';
import { getAircraftType } from '../data/aircraft';
import { pilotMarket } from '../data/crews';
import type { Airport, Country } from '../data/types';
import { advance } from './advance';
import { economyCabin } from './cabins';
import { applyCommand } from './commands';
import { crewNeeds, crewPayPerDayUsd, crewShortages, hiringQuota } from './crews';
import { crewCostPerDayUsd } from './economics';
import { createGame } from './game';
import { buildRealAirlines } from './realAirlines';
import { simTime } from './time';
import { DAYS_ALL } from './timetable';
import { buildEngineWorld } from './world';
import { slow } from '../testing/slow';

const real = buildRealAirlines(airlinesJson as never, networksJson as never, detailsJson as never, registersJson as never, eurostatJson);
const world = buildEngineWorld(airportsJson as Airport[], countriesJson as unknown as Record<string, Country>, real);
const A320 = getAircraftType('A20N');

function startup(year = 2026) {
  const state = createGame({ seed: 1, startYear: year, startTime: simTime(year, 11, 2), timeMode: 'weekly', realism: 'realistic', scheduling: 'detailed' });
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
// Two round trips Vienna–Málaga a day on one A320: ≈ 13 block hours a day.
const openMalaga = (state: ReturnType<typeof startup>["state"], airlineId: string) =>
  
  applyCommand(state, world, {
    type: 'OpenRoute',
    airlineId,
    payload: { destinationId: 'LEMG', aircraftId: '', frequency: 0, fareFactor: 1, flights: [{ aircraftId: 'T1', dep: 6 * 60, days: DAYS_ALL, groundMin: 45 }, { aircraftId: 'T1', dep: 14 * 60, days: DAYS_ALL, groundMin: 45 }] },
  });

describe('crews (8.1)', () => {
  it('the timetable decides the headcount: about seven crews (14 pilots) for an A320 flying 13 hours a day', () => {
    const { state, airlineId } = startup();
    expect(openMalaga(state, airlineId).ok).toBe(true);
    const need = crewNeeds(state, airlineId, world).get('LOWW')!;
    const a320 = need.pilots.get('A320')!;
    expect(a320.captains + a320.firstOfficers).toBeGreaterThanOrEqual(12);
    expect(a320.captains + a320.firstOfficers).toBeLessThan(18);
    expect(a320.captains).toBe(a320.firstOfficers);
    expect(need.cabin).toBeGreaterThan(25);
  });

  it('a new airline has to hire: until the crews are trained flights are cancelled and compensated', () => {
    const { state, airlineId } = startup();
    expect(openMalaga(state, airlineId).ok).toBe(true);
    const crew = state.airlines[airlineId]!.crew!;
    // The HR department started hiring at once (rated pilots in 6 weeks, others with a type rating later).
    expect(crew.stations.LOWW!.pipeline.length).toBeGreaterThan(0);
    expect(crewShortages(state, world, airlineId).get('LOWW|A320')).toBe(1);
    advance(state, world, simTime(2026, 11, 10));
    expect(state.messages.some((m) => m.kind === 'crewCancellations')).toBe(true);
    // Twelve weeks later the first crews fly.
    advance(state, world, simTime(2027, 2, 15));
    expect(crewShortages(state, world, airlineId).get('LOWW|A320') ?? 0).toBeLessThan(1);
    expect(state.messages.some((m) => m.kind === 'crewReady')).toBe(true);
  }, slow(120_000));

  it('the job market: few pilots in a shortage, more for better pay', () => {
    expect(pilotMarket(2023)).toBeLessThan(0.6); // shortage
    expect(pilotMarket(2021)).toBeGreaterThan(1.5); // after COVID
    const { state, airlineId } = startup();
    const airline = state.airlines[airlineId]!;
    const normal = hiringQuota(state, world, airline, 'LOWW').pilots;
    expect(applyCommand(state, world, { type: 'SetCrewPay', airlineId, payload: { station: 'LOWW', pay: 1.2 } }).ok).toBe(true);
    expect(hiringQuota(state, world, airline, 'LOWW').pilots).toBeGreaterThan(normal);
    expect(applyCommand(state, world, { type: 'HireCrew', airlineId, payload: { station: 'LOWW', role: 'firstOfficer', family: 'A320', count: 500 } })).toMatchObject({ ok: false, error: 'noCandidates' });
  });

  it('upgrades and type ratings take pilots off the line for weeks and cost money', () => {
    const { state, airlineId } = startup();
    delete state.airlines[airlineId]!.crew; // the first timetable gets its crews (as in old games)
    expect(openMalaga(state, airlineId).ok).toBe(true);
    const s = state.airlines[airlineId]!.crew!.stations.LOWW!;
    const fo = s.pilots.A320!.firstOfficers;
    const cash = state.airlines[airlineId]!.cash.amount;
    expect(applyCommand(state, world, { type: 'TrainCrew', airlineId, payload: { station: 'LOWW', kind: 'upgrade', family: 'A320', count: 2 } }).ok).toBe(true);
    expect(s.pilots.A320!.firstOfficers).toBe(fo - 2);
    expect(s.pipeline.some((b) => b.source === 'upgrade' && b.count === 2)).toBe(true);
    expect(state.airlines[airlineId]!.cash.amount).toBeLessThan(cash);
    expect(applyCommand(state, world, { type: 'TrainCrew', airlineId, payload: { station: 'LOWW', kind: 'rating', family: 'B737NG', count: 1, from: { family: 'A320', role: 'captain' } } }).ok).toBe(true);
  });

  it('salaries stay about what crews cost before (calibration)', () => {
    const { state, airlineId } = startup();
    delete state.airlines[airlineId]!.crew;
    expect(openMalaga(state, airlineId).ok).toBe(true);
    const airline = state.airlines[airlineId]!;
    const now = crewPayPerDayUsd(state, world, airline);
    // The old formula for one A320 (10 pilots and its cabin crews).
    const before = crewCostPerDayUsd(world, A320, 180, 'AT', economyCabin(A320, 180));
    expect(now / before).toBeGreaterThan(0.8);
    expect(now / before).toBeLessThan(1.6);
  });
});

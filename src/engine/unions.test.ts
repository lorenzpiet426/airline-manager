// Phase 8.2: unions, wage talks and strikes.
import { describe, expect, it } from 'vitest';
import airportsJson from '../data/generated/airports.json';
import countriesJson from '../data/generated/countries.json';
import airlinesJson from '../data/generated/airlines.json';
import networksJson from '../data/generated/networks.json';
import detailsJson from '../data/generated/airline-details.json';
import registersJson from '../data/generated/registers.json';
import eurostatJson from '../data/generated/routes-eurostat.json';
import { getAircraftType } from '../data/aircraft';
import { inflationBefore, strikeCulture } from '../data/unions';
import type { Airport, Country } from '../data/types';
import { advance } from './advance';
import { economyCabin } from './cabins';
import { applyCommand } from './commands';
import { createGame } from './game';
import { buildRealAirlines } from './realAirlines';
import { simTime } from './time';
import { DAYS_ALL } from './timetable';
import { agreementKey, strikeShare } from './unions';
import { buildEngineWorld } from './world';
import { slow } from '../testing/slow';

const real = buildRealAirlines(airlinesJson as never, networksJson as never, detailsJson as never, registersJson as never, eurostatJson);
const world = buildEngineWorld(airportsJson as Airport[], countriesJson as unknown as Record<string, Country>, real);
const A320 = getAircraftType('A20N');
const DAY = 24 * 60;

/** A small airline with one A320 flying to Málaga, its crews employed (like an older game). */
function airline(hubId: string, year = 2026) {
  const state = createGame({ seed: 5, startYear: year, startTime: simTime(year, 3, 2), timeMode: 'weekly', realism: 'realistic', scheduling: 'detailed' });
  const founded = applyCommand(state, world, {
    type: 'FoundAirline',
    payload: { name: 'Test Air', iata: 'T7', icao: 'TST', primary: '#c8102e', secondary: '#ffffff', hubId, capitalEur: 200_000_000, controller: 'human' },
  });
  const airlineId = (founded as { id: string }).id;
  state.aircraft.T1 = {
    id: 'T1', typeId: 'A20N', airlineId, registration: 'D-ATST', builtYear: 2020, seats: 180, cabin: economyCabin(A320, 180), status: 'active', deliveryAt: state.time, locationId: hubId,
    lease: { lessor: 'AerCap', monthlyRent: { amount: 380_000, currency: 'USD' }, deposit: { amount: 760_000, currency: 'USD' }, startAt: state.time, endAt: state.time + 1e6 },
  };
  delete state.airlines[airlineId]!.crew;
  const opened = applyCommand(state, world, {
    type: 'OpenRoute',
    airlineId,
    payload: { destinationId: 'LEMG', aircraftId: '', frequency: 0, fareFactor: 1, flights: [{ aircraftId: 'T1', dep: 7 * 60, days: DAYS_ALL, groundMin: 45 }] },
  });
  expect(opened.ok).toBe(true);
  return { state, airlineId, a: () => state.airlines[airlineId]! };
}

describe('unions and strikes (8.2)', () => {
  it('pilots and cabin crew get an agreement in each country, with the real unions', () => {
    const { state, a } = airline('LOWW');
    advance(state, world, state.time + DAY);
    const labour = a().labour!;
    expect(Object.keys(labour).sort()).toEqual(['AT|cabin', 'AT|pilots']);
    expect(labour['AT|pilots']!.pay).toBe(1);
    expect(labour['AT|pilots']!.until).toBeGreaterThan(state.time + 60 * DAY);
    expect(strikeCulture('AT', 2026).militancy).toBeLessThan(strikeCulture('DE', 2026).militancy);
    expect(strikeCulture('GB', 2010).noticeDays).toBe(7);
    expect(inflationBefore(2023)).toBeGreaterThan(0.06); // 2022
  });

  it('talks open before the agreement ends; a fair offer is signed and raises pay above inflation', () => {
    const { state, airlineId, a } = airline('LOWW');
    advance(state, world, state.time + DAY);
    const key = agreementKey('AT', 'pilots');
    a().labour![key]!.until = state.time + 8 * 7 * DAY;
    advance(state, world, state.time + DAY);
    const talks = a().labour![key]!.talks!;
    expect(state.messages.some((m) => m.kind === 'talksOpened')).toBe(true);
    expect(talks.demand).toBeGreaterThanOrEqual(talks.inflation);
    expect(talks.floor).toBeLessThanOrEqual(talks.demand);
    // A low offer: the union answers, the next offer has to wait two weeks.
    expect(applyCommand(state, world, { type: 'OfferWage', airlineId, payload: { key, raise: 0 } }).ok).toBe(true);
    expect(a().labour![key]!.talks!.round).toBe(1);
    expect(applyCommand(state, world, { type: 'OfferWage', airlineId, payload: { key, raise: 0.01 } })).toMatchObject({ ok: false, error: 'offerTooSoon' });
    advance(state, world, state.time + 14 * DAY);
    const t = a().labour![key]!.talks!;
    expect(applyCommand(state, world, { type: 'OfferWage', airlineId, payload: { key, raise: t.demand } }).ok).toBe(true);
    const signed = a().labour![key]!;
    expect(signed.talks).toBeUndefined();
    expect(signed.pay).toBeGreaterThan(1);
    expect(signed.until).toBeGreaterThan(state.time + 700 * DAY);
    expect(state.messages.some((m) => m.kind === 'agreementSigned')).toBe(true);
  }, slow(120_000));

  it('German pilots without a deal strike: flights cancelled, compensation paid (own staff, after 2021)', () => {
    const { state, airlineId, a } = airline('EDDV');
    advance(state, world, state.time + DAY);
    a().crew!.auto = false; // nobody makes offers
    const key = agreementKey('DE', 'pilots');
    a().labour![key]!.until = state.time + 7 * DAY;
    advance(state, world, state.time + 12 * 7 * DAY);
    expect(state.messages.some((m) => m.kind === 'strikeAnnounced')).toBe(true);
    expect(state.messages.some((m) => m.kind === 'strikeCancellations')).toBe(true);
    const months = state.finance[airlineId]!.months;
    expect(months.reduce((n, m) => n + (m.lines.disruption ?? 0), 0)).toBeGreaterThan(0);
    // The first action in Germany is a warning strike (part of the day).
    const first = state.messages.find((m) => m.kind === 'strikeAnnounced')!;
    expect(first.params.warning).toBe(1);
  }, slow(180_000));

  it('a strike day cancels most flights; mediation brings peace and a proposal', () => {
    const { state, airlineId, a } = airline('EDDV');
    advance(state, world, state.time + DAY);
    a().crew!.auto = false;
    const key = agreementKey('DE', 'pilots');
    const ag = a().labour![key]!;
    ag.until = state.time - DAY;
    advance(state, world, state.time + DAY);
    ag.strikes.push({ from: state.time + DAY, until: state.time + 2 * DAY, announced: state.time, warning: false });
    expect(strikeShare(world, a(), 'EDDV', state.time + DAY)).toBeCloseTo(0.9, 5);
    expect(applyCommand(state, world, { type: 'CallMediation', airlineId, payload: { key } }).ok).toBe(true);
    expect(a().labour![key]!.strikes.length).toBe(0); // called off
    advance(state, world, state.time + 22 * DAY);
    const t = a().labour![key]!.talks!;
    expect(t.proposal).toBeGreaterThan(0);
    expect(applyCommand(state, world, { type: 'AnswerProposal', airlineId, payload: { key, accept: true } }).ok).toBe(true);
    expect(state.messages.some((m) => m.kind === 'agreementSigned' || m.kind === 'mediationRejected')).toBe(true);
  }, slow(120_000));

  it('the HR department negotiates on its own when automatic planning is on', () => {
    const { state, a } = airline('LOWW');
    advance(state, world, state.time + DAY);
    const key = agreementKey('AT', 'cabin');
    a().labour![key]!.until = state.time + 70 * DAY;
    advance(state, world, state.time + 16 * 7 * DAY);
    // Signed without the player (the messages about it have long scrolled out of the log).
    expect(a().labour![key]!.talks).toBeUndefined();
    expect(a().labour![key]!.until).toBeGreaterThan(state.time + 300 * DAY);
  }, slow(180_000));
});

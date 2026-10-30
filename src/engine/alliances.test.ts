// Phase 11.1: alliances and codeshares.
import { describe, expect, it } from 'vitest';
import airportsJson from '../data/generated/airports.json';
import countriesJson from '../data/generated/countries.json';
import airlinesJson from '../data/generated/airlines.json';
import networksJson from '../data/generated/networks.json';
import detailsJson from '../data/generated/airline-details.json';
import registersJson from '../data/generated/registers.json';
import eurostatJson from '../data/generated/routes-eurostat.json';
import { getAircraftType } from '../data/aircraft';
import { REAL_ALLIANCES } from '../data/allianceRules';
import type { Airport, Country } from '../data/types';
import { allianceById, allianceChecks, allianceMembers, alliancePull, alliancesDailyStep, codeshareRefusal, realAllianceOf } from './alliances';
import { economyCabin } from './cabins';
import { applyCommand } from './commands';
import { createGame } from './game';
import { buildRealAirlines } from './realAirlines';
import { addMonths, simTime } from './time';
import { buildEngineWorld } from './world';

const real = buildRealAirlines(airlinesJson as never, networksJson as never, detailsJson as never, registersJson as never, eurostatJson);
const world = buildEngineWorld(airportsJson as Airport[], countriesJson as unknown as Record<string, Country>, real);
const A320 = getAircraftType('A20N');
const oneworld = allianceById('oneworld')!;

function startup(hubId = 'LOWW') {
  const state = createGame({ seed: 3, startYear: 2026, startTime: simTime(2026, 3, 2), timeMode: 'weekly', realism: 'realistic', scheduling: 'detailed' });
  const founded = applyCommand(state, world, {
    type: 'FoundAirline',
    payload: { name: 'Test Air', iata: 'T7', icao: 'TST', primary: '#c8102e', secondary: '#ffffff', hubId, capitalEur: 200_000_000, controller: 'human' },
  });
  const airlineId = (founded as { id: string }).id;
  return { state, airlineId, a: () => state.airlines[airlineId]! };
}

/** Makes the test airline the size of a mid-sized network airline (fleet, destinations, departures, programme, name). */
function grow(state: ReturnType<typeof startup>['state'], airlineId: string) {
  const dests = ['EGLL', 'LFPG', 'EDDF', 'LIRF', 'LEMD', 'EHAM', 'LSZH', 'EKCH', 'ESSA', 'ENGM', 'EFHK', 'EPWA', 'LKPR', 'LHBP', 'LROP', 'LBSF', 'LGAV', 'LTFM', 'LLBG', 'UUEE', 'EIDW', 'LPPT'];
  for (let i = 0; i < 16; i++) {
    const id = `T${i}`;
    state.aircraft[id] = { id, typeId: 'A20N', airlineId, registration: `OE-L${id}`, builtYear: 2020, seats: 180, cabin: economyCabin(A320, 180), status: 'active', deliveryAt: state.time, locationId: 'LOWW' };
  }
  dests.forEach((d, i) => {
    state.routes[`R${i}`] = { id: `R${i}`, airlineId, originId: 'LOWW', destinationId: d, distanceKm: 1000, aircraftId: 'T0', frequency: 7, fareFactor: 1, classFares: { W: 1, J: 1, F: 1 }, flightNumber: 101 + 2 * i, openedAt: state.time };
  });
  state.reputation[airlineId]!.score = 62;
  expect(applyCommand(state, world, { type: 'StartLoyalty', airlineId, payload: { name: 'Test Miles' } }).ok).toBe(true);
}

describe('alliances and codeshares (11.1)', () => {
  it('knows the alliances and their members over time', () => {
    const { state } = startup();
    const star = allianceMembers(state, world, allianceById('star')!);
    expect(star).toEqual(expect.arrayContaining(['DLH', 'AUA', 'UAL', 'SIA']));
    expect(allianceMembers(state, world, oneworld)).toContain('BAW');
    expect(realAllianceOf(state, world, 'AFR')).toBe('skyteam');
    expect(allianceMembers(state, world, allianceById('skyteam')!, simTime(1999, 6, 1))).toEqual([]);
    expect(REAL_ALLIANCES).toHaveLength(3);
  });

  it('a small airline is turned down after the review, with the reasons; Vienna is taken in Star Alliance', () => {
    const { state, airlineId, a } = startup();
    const star = allianceChecks(state, world, a(), allianceById('star')!);
    expect(star.checks.hubFree).toBe(false);
    expect(star.hubMember).toBe('Austrian Airlines');
    expect(applyCommand(state, world, { type: 'ApplyAlliance', airlineId, payload: { alliance: 'oneworld' } }).ok).toBe(true);
    expect(applyCommand(state, world, { type: 'ApplyAlliance', airlineId, payload: { alliance: 'skyteam' } })).toEqual({ ok: false, error: 'applicationRunning' });
    state.time = a().allianceMembership!.readyAt!;
    alliancesDailyStep(state, world);
    expect(a().allianceMembership!.status).toBe('rejected');
    expect(a().allianceMembership!.reasons).toEqual(expect.arrayContaining(['size', 'destinations', 'loyalty']));
    expect(applyCommand(state, world, { type: 'ApplyAlliance', airlineId, payload: { alliance: 'oneworld' } })).toEqual({ ok: false, error: 'waitAfterRejection' });
  });

  it('a mid-sized airline is invited, pays, joins after a year and gains partners, feed and sales', () => {
    const { state, airlineId, a } = startup();
    grow(state, airlineId);
    const check = allianceChecks(state, world, a(), oneworld);
    expect(Object.values(check.checks).every(Boolean)).toBe(true);
    expect(check.sponsor).toBeTruthy();
    expect(applyCommand(state, world, { type: 'ApplyAlliance', airlineId, payload: { alliance: 'oneworld' } }).ok).toBe(true);
    state.time = a().allianceMembership!.readyAt!;
    alliancesDailyStep(state, world);
    expect(a().allianceMembership!.status).toBe('invited');
    const cash = a().cash.amount;
    expect(applyCommand(state, world, { type: 'AcceptAlliance', airlineId, payload: {} }).ok).toBe(true);
    expect(a().cash.amount).toBeLessThan(cash);
    expect(a().allianceMembership!.status).toBe('joining');
    const ready = a().allianceMembership!.readyAt!;
    expect(ready).toBeGreaterThanOrEqual(addMonths(state.time, 12));
    expect(ready).toBeLessThanOrEqual(addMonths(state.time, 18));
    state.time = ready;
    alliancesDailyStep(state, world);
    expect(a().allianceMembership!.status).toBe('member');
    expect(a().partners).toEqual(expect.arrayContaining(['BAW', 'IBE', 'FIN', 'QTR']));
    const pull = alliancePull(state, world, a());
    expect(pull.business).toBeGreaterThan(1.05);
    expect(pull.leisure).toBeGreaterThan(1);
    // Rival alliances' airlines don't codeshare with a oneworld member.
    expect(codeshareRefusal(state, world, a(), 'AFR')).toBe('rivalAlliance');
    expect(applyCommand(state, world, { type: 'LeaveAlliance', airlineId, payload: {} }).ok).toBe(true);
    expect(a().partners).not.toContain('BAW');
  });

  it('codeshares: the hub rival and low-cost airlines say no, a connecting airline signs', () => {
    const { state, airlineId, a } = startup();
    state.reputation[airlineId]!.score = 60;
    expect(codeshareRefusal(state, world, a(), 'AUA')).toBe('competitor');
    expect(codeshareRefusal(state, world, a(), 'RYR')).toBe('lowCost');
    // A network airline flying to Vienna, based elsewhere, in no alliance.
    const candidate = [...real.byId.values()].find(
      (r) => r.model === 'legacy' && !r.hubs.includes('LOWW') && !realAllianceOf(state, world, r.id) && real.routesOf(r.id).some((x) => x.a === 'LOWW' || x.b === 'LOWW'),
    )!;
    expect(candidate).toBeTruthy();
    expect(applyCommand(state, world, { type: 'SignCodeshare', airlineId, payload: { partnerId: candidate.id } }).ok).toBe(true);
    expect(a().partners).toContain(candidate.id);
    expect(applyCommand(state, world, { type: 'EndCodeshare', airlineId, payload: { partnerId: candidate.id } }).ok).toBe(true);
    expect(a().partners).not.toContain(candidate.id);
  });

  it('an own alliance takes airlines that belong to none, not those of the big three', () => {
    const { state, airlineId, a } = startup();
    grow(state, airlineId);
    expect(applyCommand(state, world, { type: 'FoundAlliance', airlineId, payload: { name: 'Danube Alliance' } }).ok).toBe(true);
    expect(applyCommand(state, world, { type: 'InviteToAlliance', airlineId, payload: { partnerId: 'BAW' } })).toEqual({ ok: false, error: 'inAlliance' });
    const candidate = [...real.byId.values()].find(
      (r) => r.model !== 'lowcost' && !r.hubs.includes('LOWW') && !realAllianceOf(state, world, r.id) && r.fleet.reduce((n, f) => n + f.inService, 0) > 0 && r.fleet.reduce((n, f) => n + f.inService, 0) <= 30 && real.routesOf(r.id).some((x) => x.a === 'LOWW' || x.b === 'LOWW'),
    )!;
    expect(applyCommand(state, world, { type: 'InviteToAlliance', airlineId, payload: { partnerId: candidate.id } }).ok).toBe(true);
    expect(a().partners).toContain(candidate.id);
    expect(alliancePull(state, world, a()).business).toBeGreaterThan(1);
    expect(applyCommand(state, world, { type: 'ApplyAlliance', airlineId, payload: { alliance: 'star' } })).toEqual({ ok: false, error: 'alreadyMember' });
  });
});

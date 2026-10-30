// Phase 8.3: heads of department with delegation.
import { describe, expect, it } from 'vitest';
import airportsJson from '../data/generated/airports.json';
import countriesJson from '../data/generated/countries.json';
import airlinesJson from '../data/generated/airlines.json';
import networksJson from '../data/generated/networks.json';
import detailsJson from '../data/generated/airline-details.json';
import registersJson from '../data/generated/registers.json';
import eurostatJson from '../data/generated/routes-eurostat.json';
import { getAircraftType } from '../data/aircraft';
import type { Department } from '../data/managers';
import type { Airport, Country } from '../data/types';
import { advance } from './advance';
import { economyCabin } from './cabins';
import { applyCommand } from './commands';
import { hiringQuota } from './crews';
import { createGame } from './game';
import { managerWageOffer, reliabilityFactor } from './managers';
import { buildRealAirlines } from './realAirlines';
import type { GameState, WageTalks } from './state';
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

/** Hires the first candidate of a department, made to have `skill` stars. */
function hire(state: GameState, airlineId: string, dept: Department, skill: number) {
  const mg = state.airlines[airlineId]!.mgmt!;
  const c = mg.candidates.find((x) => x.dept === dept)!;
  c.skill = skill;
  expect(applyCommand(state, world, { type: 'HireManager', airlineId, payload: { candidateId: c.id } }).ok).toBe(true);
  return mg.heads[dept]!;
}

describe('managers (8.3)', () => {
  it('candidates: made-up local names, rare stars, salaries rising with skill; a head costs a salary', () => {
    const { state, airlineId, a } = airline();
    const c = a().mgmt!.candidates;
    expect(c.length).toBe(15);
    expect(new Set(c.map((x) => x.dept)).size).toBe(5);
    expect(c.every((x) => x.skill >= 1 && x.skill <= 5 && /^\S+ \S+/.test(x.name))).toBe(true);
    const bySkill = [...c].sort((x, y) => x.skill - y.skill);
    if (bySkill[0]!.skill < bySkill.at(-1)!.skill) expect(bySkill[0]!.salaryUsd).toBeLessThan(bySkill.at(-1)!.salaryUsd);
    const overheadBefore = state.finance[airlineId]!.week.lines.overhead;
    hire(state, airlineId, 'maintenance', 4);
    advance(state, world, state.time + 3 * DAY);
    expect(state.finance[airlineId]!.week.lines.overhead - overheadBefore).toBeGreaterThan(0);
    expect(state.messages.some((m) => m.kind === 'managerHired')).toBe(true);
    expect(reliabilityFactor(a(), false)).toBeLessThan(1);
  }, slow(120_000));

  it('a head of revenue proposes fares; approving applies them and keeps forecast and real effect', () => {
    const { state, airlineId, a } = airline();
    advance(state, world, state.time + 5 * 7 * DAY);
    hire(state, airlineId, 'revenue', 5);
    a().mgmt!.delegation.revenue = 'approve';
    // Fares far off: the head sees it.
    for (const r of Object.values(state.routes)) r.fareFactor = 0.6;
    advance(state, world, state.time + 8 * DAY);
    const p = a().mgmt!.proposals.find((x) => x.kind === 'fares');
    expect(p).toBeDefined();
    expect(Number(p!.params.to)).toBeGreaterThan(60);
    expect(applyCommand(state, world, { type: 'ApproveProposal', airlineId, payload: { id: p!.id } }).ok).toBe(true);
    const route = Object.values(state.routes)[0]!;
    expect(route.fareFactor).toBeGreaterThan(0.6);
    const d = a().mgmt!.decisions.at(-1)!;
    expect(d.by).toBe('player');
    expect(d.actualUsd).toBeGreaterThan(0);
  }, slow(180_000));

  it('advice can only be read; a head who decides alone acts and says so', () => {
    const { state, airlineId, a } = airline();
    advance(state, world, state.time + 5 * 7 * DAY);
    hire(state, airlineId, 'revenue', 5);
    expect(applyCommand(state, world, { type: 'SetDelegation', airlineId, payload: { dept: 'revenue', level: 'advise' } }).ok).toBe(true);
    for (const r of Object.values(state.routes)) r.fareFactor = 0.6;
    advance(state, world, state.time + 8 * DAY);
    const p = a().mgmt!.proposals.find((x) => x.kind === 'fares')!;
    expect(p.advice).toBe(true);
    expect(applyCommand(state, world, { type: 'ApproveProposal', airlineId, payload: { id: p.id } })).toMatchObject({ ok: false, error: 'adviceOnly' });
    applyCommand(state, world, { type: 'DeclineProposal', airlineId, payload: { id: p.id } });
    applyCommand(state, world, { type: 'SetDelegation', airlineId, payload: { dept: 'revenue', level: 'auto' } });
    for (const r of Object.values(state.routes)) r.fareFactor = 0.6;
    a().mgmt!.reviewed = {};
    advance(state, world, state.time + 7 * DAY);
    expect(Object.values(state.routes)[0]!.fareFactor).toBeGreaterThan(0.6);
    expect(a().mgmt!.decisions.some((d) => d.by === 'manager')).toBe(true);
    expect(state.messages.some((m) => m.kind === 'managerActions')).toBe(true);
  }, slow(180_000));

  it('skill decides how good the judgement is (wage offers close to what the union signs)', () => {
    const t: WageTalks = { opened: 0, round: 0, demand: 0.05, floor: 0.032, inflation: 0.025, nextRound: 0 };
    const spread = (skill: number) => {
      let sum = 0;
      for (let i = 0; i < 300; i++) sum += Math.abs(managerWageOffer({ id: 'x', dept: 'hr', name: 'A B', skill, experience: 10, specialty: null, salaryUsd: 1 }, t, `s${i}`) - t.floor);
      return sum / 300;
    };
    expect(spread(5)).toBeLessThan(spread(1) / 3);
  });

  it('the head of network planning finds work for an idle aircraft (a timetable that fits)', () => {
    const { state, airlineId, a } = airline();
    hire(state, airlineId, 'network', 5);
    advance(state, world, simTime(2026, 4, 4));
    const p = a().mgmt!.proposals.find((x) => x.kind === 'openRoute');
    expect(p).toBeDefined();
    expect(p!.params.registration).toBe('OE-LT2');
    // The departure time is chosen by the forecast, not simply the first free slot of the day (05:30).
    const flights = (p!.command as { payload: { flights?: { dep: number }[] } }).payload.flights;
    if (flights) expect(flights[0]!.dep).not.toBe(5 * 60 + 30);
    expect(applyCommand(state, world, { type: 'ApproveProposal', airlineId, payload: { id: p!.id } }).ok).toBe(true);
    expect(Object.values(state.routes).length).toBe(2);
  }, slow(180_000));

  it('the head of network planning reworks the timetable: a late flight is moved to a better time', () => {
    const { state, airlineId, a } = airline();
    // Vienna–Málaga at 21:30 (back in the middle of the night), flown for two months already.
    const route = Object.values(state.routes)[0]!;
    const pair = Object.values(state.flights).find((p) => p.routeId === route.id)!;
    pair.dep = 21 * 60 + 30;
    route.openedAt -= 60 * DAY;
    hire(state, airlineId, 'network', 5);
    advance(state, world, simTime(2026, 4, 4));
    const p = a().mgmt!.proposals.find((x) => x.kind === 'retime');
    expect(p).toBeDefined();
    expect(p!.params.from).toBe('21:30');
    expect(String(p!.params.to) < '21:30').toBe(true);
    expect(p!.actualUsd!).toBeGreaterThan(0);
    expect(applyCommand(state, world, { type: 'ApproveProposal', airlineId, payload: { id: p!.id } }).ok).toBe(true);
    expect(state.flights[pair.id]!.dep).not.toBe(21 * 60 + 30);
  }, slow(180_000));

  it('a good head of HR finds more recruits; a taken-over airline brings its heads', () => {
    const { state, airlineId, a } = airline();
    const before = hiringQuota(state, world, a(), 'LOWW').cabin;
    hire(state, airlineId, 'hr', 5);
    expect(hiringQuota(state, world, a(), 'LOWW').cabin).toBeGreaterThan(before);
    expect(a().crew!.auto).toBe(true);
    applyCommand(state, world, { type: 'SetDelegation', airlineId, payload: { dept: 'hr', level: 'approve' } });
    expect(a().crew!.auto).toBe(false);
  });
});

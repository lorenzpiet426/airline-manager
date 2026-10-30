// Managers (Phase 8.3). Each department — network planning, revenue management, fleet, maintenance, HR — can have a
// head. The player decides per department how far the head may go: only advise, act after the player's OK (a proposal
// inbox), or decide alone (also while the player is away in real-clock games). Heads judge their decisions with an
// error that shrinks with skill (a matching specialty helps), so weak managers sometimes set a bad fare or open a losing
// route; every decision keeps the manager's forecast next to the real effect, shown a few weeks later. Good heads also
// help without deciding anything: fewer technical failures, more recruits, cheaper lease extensions. They cost a
// salary, and the best ones are poached by other airlines.
import { getAircraftType } from '../data/aircraft';
import { HANGAR_LIFE_YEARS, HANGARS, OWN_HANGAR_PRICE_SHARE, PROGRAMME, type HangarSize } from '../data/maintenance';
import {
  CANDIDATES,
  DEPARTMENTS,
  JUDGEMENT_NOISE,
  MANAGER_QUIT,
  MANAGER_SEVERANCE_MONTHS,
  managerName,
  POACHED,
  PROPOSAL_DAYS,
  REVEAL_DAYS,
  SALARY_USD,
  SKILL_ODDS,
  SPECIALTIES,
  SPECIALTY_NOISE,
  type Delegation,
  type Department,
} from '../data/managers';
import { stationOf } from './bases';
import { applyCommand, draftRoute, fareRange, type Command } from './commands';
import { book, postMessage } from './core';
import { crewShortfall } from './crews';
import { priceLevelAt } from './era';
import { routeWeek, totalCosts, WEEKLY_AVAILABLE_HOURS, roundTripHours, wageFactor } from './economics';
import { bookPnl, dailyDepreciation, earlyReturnFeeUsd, extensionRentUsd } from './fleet';
import { distanceKm } from './geo';
import { groundContext } from './hub';
import { checkOffer } from './maintenance';
import { convert, money } from './money';
import { planFor } from './operations';
import { aircraftHours, pairsOfAircraft, pairsOfRoute, specFlights, validateSpecs, type FlightSpec } from './schedule';
import type { Aircraft, Airline, ClassFares, GameState, Management, Manager, Proposal, Route, WageTalks } from './state';
import { MINUTES_PER_DAY, toDate, yearOf, type SimTime } from './time';
import { DAYS_ALL } from './timetable';
import { routeTransfers } from './transfers';
import { preview, routeOptions, seasonAhead, waveRebuild, type PlanOption } from './networkPlanning';
import { closureAt, conditionsOf } from './worldEvents';
import { loyaltyPull } from './loyalty';
import type { EngineWorld } from './world';
import { TURNAROUND_MIN } from '../data/aircraft';

const DAY = MINUTES_PER_DAY;
const WEEK = 7 * DAY;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

// Manager matters use their own stable numbers so they never change the game's other random events.
function h01(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
/** A normally distributed number (mean 0, spread 1) from a text. */
const gauss = (text: string) => Math.sqrt(-2 * Math.log(Math.max(1e-9, h01(`${text}|a`)))) * Math.cos(2 * Math.PI * h01(`${text}|b`));

/** How far off a manager's estimates are (share of the effect). */
export const noiseOf = (m: Manager, matches = false) => JUDGEMENT_NOISE[clamp(m.skill, 1, 5) - 1]! * (matches ? SPECIALTY_NOISE : 1);

const monthKey = (time: SimTime) => toDate(time).toISOString().slice(0, 7);
const hubCountry = (world: EngineWorld, airline: Airline) => world.airportById.get(airline.hubId)?.country ?? 'AT';
const usdPerBook = (state: GameState, currency: string) => (state.fx.USD ?? 1) / (state.fx[currency] ?? 1);

// ─── People ──────────────────────────────────────────────────────────────────────

function candidate(world: EngineWorld, airline: Airline, dept: Department, seed: string, skill?: number): Manager {
  let s = skill;
  if (!s) {
    const r = h01(`${seed}|skill`);
    let acc = 0;
    s = 5;
    for (let i = 0; i < SKILL_ODDS.length; i++) if (r < (acc += SKILL_ODDS[i]!)) { s = i + 1; break; }
  }
  const specs = SPECIALTIES[dept];
  return {
    id: `M-${seed}`,
    dept,
    name: managerName(hubCountry(world, airline), h01(`${seed}|first`), h01(`${seed}|last`)),
    skill: s,
    experience: Math.round(2 + s * 4 + h01(`${seed}|exp`) * 6),
    specialty: h01(`${seed}|spec`) < 0.6 ? specs[Math.floor(h01(`${seed}|which`) * specs.length)]! : null,
    salaryUsd: Math.round((SALARY_USD[s - 1]! * (0.9 + 0.2 * h01(`${seed}|pay`))) / 1000) * 1000,
  };
}

function refreshCandidates(state: GameState, world: EngineWorld, airline: Airline): void {
  const month = monthKey(state.time);
  airline.mgmt!.candidates = DEPARTMENTS.flatMap((dept) => Array.from({ length: CANDIDATES }, (_, i) => candidate(world, airline, dept, `${airline.id}|${month}|${dept}|${i}`)));
}

/** Every human airline gets a management record (no heads yet; HR decides alone if crews were planned automatically). */
export function ensureMgmt(state: GameState, world: EngineWorld): void {
  for (const airline of Object.values(state.airlines)) {
    if (airline.controller !== 'human' || airline.mgmt) continue;
    airline.mgmt = {
      heads: {},
      delegation: { network: 'approve', revenue: 'approve', fleet: 'approve', maintenance: 'approve', hr: airline.crew?.auto === false ? 'approve' : 'auto' },
      candidates: [],
      proposals: [],
      decisions: [],
      reviewed: {},
      idleSince: {},
    };
    refreshCandidates(state, world, airline);
  }
}

/** A taken-over airline comes with its heads of department (experienced, skill 3–4). */
export function appointHeads(state: GameState, world: EngineWorld, airlineId: string, delegation: Partial<Record<Department, Delegation>>): void {
  ensureMgmt(state, world);
  const airline = state.airlines[airlineId]!;
  for (const dept of DEPARTMENTS) {
    const seed = `${airlineId}|takeover|${dept}`;
    airline.mgmt!.heads[dept] = { ...candidate(world, airline, dept, seed, h01(`${seed}|level`) < 0.5 ? 3 : 4), hiredAt: state.time };
  }
  Object.assign(airline.mgmt!.delegation, delegation);
  if (airline.crew) airline.crew.auto = airline.mgmt!.delegation.hr === 'auto';
}

/** A manager's yearly salary in USD of the day (hub country's wage level, prices of the year). */
export const salaryUsdNow = (world: EngineWorld, airline: Airline, m: Manager, time: SimTime) => m.salaryUsd * wageFactor(world, hubCountry(world, airline)) * priceLevelAt(time);

export type ManagerError = 'candidateUnknown' | 'noManager' | 'proposalUnknown' | 'adviceOnly' | 'delegationInvalid';

function payOff(state: GameState, world: EngineWorld, airline: Airline, m: Manager): void {
  const usd = (salaryUsdNow(world, airline, m, state.time) * MANAGER_SEVERANCE_MONTHS) / 12;
  const paid = -book(state, airline.id, 'management', money(-Math.round(usd), 'USD')).amount;
  bookPnl(state, airline.id, 'overhead', paid);
}

export function hireManager(state: GameState, world: EngineWorld, airlineId: string, candidateId: string): ManagerError | null {
  const airline = state.airlines[airlineId]!;
  const mg = airline.mgmt!;
  const c = mg.candidates.find((x) => x.id === candidateId);
  if (!c) return 'candidateUnknown';
  const old = mg.heads[c.dept];
  if (old) payOff(state, world, airline, old);
  mg.heads[c.dept] = { ...c, hiredAt: state.time };
  mg.candidates = mg.candidates.filter((x) => x.id !== candidateId);
  postMessage(state, { airlineId, kind: 'managerHired', level: 'info', params: { name: c.name, dept: c.dept, skill: c.skill } });
  return null;
}

export function fireManager(state: GameState, world: EngineWorld, airlineId: string, dept: Department): ManagerError | null {
  const airline = state.airlines[airlineId]!;
  const m = airline.mgmt!.heads[dept];
  if (!m) return 'noManager';
  payOff(state, world, airline, m);
  delete airline.mgmt!.heads[dept];
  airline.mgmt!.proposals = airline.mgmt!.proposals.filter((p) => p.dept !== dept);
  return null;
}

export function setDelegation(state: GameState, airlineId: string, dept: Department, level: Delegation): ManagerError | null {
  const airline = state.airlines[airlineId]!;
  if (!DEPARTMENTS.includes(dept) || !['advise', 'approve', 'auto'].includes(level)) return 'delegationInvalid';
  airline.mgmt!.delegation[dept] = level;
  if (dept === 'hr' && airline.crew) airline.crew.auto = level === 'auto';
  // Waiting proposals follow the new level (advice can't be approved; nothing waits when the head decides alone).
  for (const p of airline.mgmt!.proposals) if (p.dept === dept) p.advice = level === 'advise';
  return null;
}

// ─── Help without deciding ──────────────────────────────────────────────────────

/** Technical failures happen this much more or less often (a good head of maintenance: reliability engineering). */
export function reliabilityFactor(airline: Airline | undefined, wide: boolean): number {
  const m = airline?.mgmt?.heads.maintenance;
  if (!m) return 1;
  return 1.1 - 0.05 * m.skill - (m.specialty === (wide ? 'widebody' : 'narrowbody') ? 0.03 : 0);
}

/** Candidates the job market offers (a good head of HR finds more). */
export function recruitingFactor(airline: Airline | undefined): number {
  const m = airline?.mgmt?.heads.hr;
  if (!m) return 1;
  return 0.9 + 0.05 * m.skill + (m.specialty === 'recruiting' ? 0.05 : 0);
}

/** Lease extensions at this share of the market rent (a good head of fleet negotiates). */
export function leaseRentFactor(airline: Airline | undefined): number {
  const m = airline?.mgmt?.heads.fleet;
  if (!m) return 1;
  return 1.04 - 0.02 * m.skill - (m.specialty === 'leasing' ? 0.01 : 0);
}

// ─── Proposals and decisions ────────────────────────────────────────────────────

let actedToday = 0;
let proposedToday = 0;

type Idea = Pick<Proposal, 'kind' | 'params' | 'target' | 'command' | 'forecastUsd' | 'actualUsd' | 'changes' | 'effectiveAt'>;

function record(state: GameState, mg: Management, p: Proposal, by: 'manager' | 'player'): void {
  mg.decisions.push({ ...p, by, decidedAt: state.time, revealAt: state.time + REVEAL_DAYS * DAY });
  if (mg.decisions.length > 60) mg.decisions.splice(0, mg.decisions.length - 60);
}

/** A manager's idea: done at once if the department decides alone, else waiting in the inbox (or as advice). */
export function propose(state: GameState, world: EngineWorld, airline: Airline, dept: Department, idea: Idea): void {
  const mg = airline.mgmt!;
  if (mg.proposals.some((p) => p.target === idea.target)) return;
  const p: Proposal = { ...idea, id: `P${state.nextId++}`, dept, at: state.time, expiresAt: state.time + PROPOSAL_DAYS * DAY, advice: mg.delegation[dept] === 'advise' };
  if (mg.delegation[dept] === 'auto') {
    if (applyCommand(state, world, p.command).ok) {
      record(state, mg, p, 'manager');
      actedToday++;
    }
    return;
  }
  mg.proposals.push(p);
  proposedToday++;
}

export function approveProposal(state: GameState, world: EngineWorld, airlineId: string, id: string): { error: string } | null {
  const mg = state.airlines[airlineId]!.mgmt!;
  const p = mg.proposals.find((x) => x.id === id);
  if (!p) return { error: 'proposalUnknown' };
  if (p.advice) return { error: 'adviceOnly' };
  mg.proposals = mg.proposals.filter((x) => x.id !== id);
  const r = applyCommand(state, world, p.command);
  if (!r.ok) return { error: r.error };
  record(state, mg, p, 'player');
  return null;
}

export function declineProposal(state: GameState, airlineId: string, id: string): ManagerError | null {
  const mg = state.airlines[airlineId]!.mgmt!;
  if (!mg.proposals.some((x) => x.id === id)) return 'proposalUnknown';
  mg.proposals = mg.proposals.filter((x) => x.id !== id);
  return null;
}

// ─── Revenue management: fares ──────────────────────────────────────────────────

const code = (world: EngineWorld, id: string) => world.airportById.get(id)?.iata ?? id;
const routeName = (world: EngineWorld, r: Route) => `${code(world, r.originId)}–${code(world, r.destinationId)}`;

/** A route's week (USD) at its timetable with fares × `mult` (the prices it would really earn). */
export function routeOutlook(state: GameState, world: EngineWorld, route: Route, mult = 1, rampUp?: number) {
  const from = world.airportById.get(route.originId);
  const to = world.airportById.get(route.destinationId);
  // The route's potential: all its flights (also those a crew shortage, check or strike cancels today).
  const plan = from && to ? planFor(state, world, route, state.time, true) : null;
  if (!plan || !from || !to) return null;
  const [lo, hi] = fareRange(state, from, to);
  const fareFactor = Math.round(clamp(route.fareFactor * mult, Math.max(0.5, lo), Math.min(1.5, hi)) * 100) / 100;
  const classFares = Object.fromEntries(Object.entries(route.classFares ?? {}).map(([k, v]) => [k, Math.round(clamp((v ?? 1) * mult, Math.max(0.5, lo), Math.min(1.5, hi)) * 100) / 100])) as ClassFares;
  const rep = state.reputation[route.airlineId];
  const ground = groundContext(state, world, route.airlineId);
  const loyalty = loyaltyPull(state, state.airlines[route.airlineId]);
  const week = routeWeek(world, from, to, { ...plan, fareFactor, classFares, ...(rampUp ? { rampUp } : {}) }, toDate(state.time), {
    ...(loyalty ? { loyalty } : {}),
    ai: state.ai,
    brand: rep ? { reputation: rep.score, awareness: rep.awareness } : undefined,
    checksSeparate: true,
    conditions: conditionsOf(state, world),
    transfer: routeTransfers(world, state, route),
    ...(ground ? { ground } : {}),
  });
  return { result: week.revenue - totalCosts(week.costs), revenue: week.revenue, fareFactor, classFares };
}

const MULTS = [0.94, 0.97, 1, 1.03, 1.06];

function revenueReview(state: GameState, world: EngineWorld, airline: Airline, m: Manager): void {
  const mg = airline.mgmt!;
  const routes = Object.values(state.routes)
    .filter((r) => r.airlineId === airline.id && state.time - r.openedAt > 4 * WEEK)
    .sort((a, b) => (mg.reviewed[a.id] ?? 0) - (mg.reviewed[b.id] ?? 0))
    .slice(0, 2 + m.skill);
  for (const route of routes) {
    mg.reviewed[route.id] = state.time;
    const outs = MULTS.map((k) => routeOutlook(state, world, route, k));
    if (outs.some((o) => !o)) continue;
    const o = outs as NonNullable<(typeof outs)[number]>[];
    const rev = Math.max(...o.map((x) => x.revenue));
    const premium = Object.keys(route.classFares ?? {}).some((c) => c === 'J' || c === 'F');
    const match = (m.specialty === 'premium' && premium) || (m.specialty === 'longHaul' && route.distanceKm > 4000) || (m.specialty === 'shortHaul' && route.distanceKm <= 4000);
    const sigma = noiseOf(m, match);
    const est = o.map((x, i) => x.result + gauss(`${route.id}|${state.time}|${i}`) * sigma * 0.06 * rev);
    const best = est.indexOf(Math.max(...est));
    const now = o[2]!;
    const pick = o[best]!;
    const gain = est[best]! - est[2]!;
    if (best === 2 || gain < 0.004 * rev || Math.abs(pick.fareFactor - route.fareFactor) < 0.005) continue;
    propose(state, world, airline, 'revenue', {
      kind: 'fares',
      target: `fares|${route.id}`,
      params: { route: routeName(world, route), from: Math.round(route.fareFactor * 100), to: Math.round(pick.fareFactor * 100) },
      command: { type: 'SetFares', airlineId: airline.id, payload: { routeId: route.id, fareFactor: pick.fareFactor, classFares: pick.classFares } },
      forecastUsd: Math.round(gain),
      actualUsd: Math.round(pick.result - now.result),
    });
  }
}

// ─── Network planning: closing and opening routes ───────────────────────────────

/** Average weekly result (USD, before crews and leases) of a route over the last `weeks` weeks. */
function recentResultUsd(state: GameState, airline: Airline, routeId: string, weeks: number): number | null {
  const hist = state.finance[airline.id]?.history.slice(-weeks) ?? [];
  const rows = hist.map((w) => w.routes[routeId]).filter((x) => !!x);
  if (rows.length < weeks) return null;
  return (rows.reduce((n, r) => n + r!.revenue - r!.directCosts, 0) / rows.length) * usdPerBook(state, airline.currency);
}

/**
 * The timetable a network planner proposes for a new route: every departure time the aircraft is free for (05:30–22:00,
 * every 30 minutes) is tried in the market model — travellers' preferred times, the competitors' departures, arrival
 * times — and the most profitable is chosen. The head of network judges each time with an error by skill (Phase 8.3).
 */
function bestSpecs(state: GameState, world: EngineWorld, route: Route, a: Aircraft, perWeek: number, m: Manager): FlightSpec[] | null {
  const order = [0, 2, 4, 6, 1, 3, 5];
  const days = perWeek >= 7 ? DAYS_ALL : order.slice(0, perWeek).reduce((mask, d) => mask | (1 << d), 0);
  const type = getAircraftType(a.typeId);
  const turn = TURNAROUND_MIN[type.category];
  const from = world.airportById.get(route.originId);
  const to = world.airportById.get(route.destinationId);
  if (!from || !to) return null;
  const date = toDate(state.time);
  const conditions = conditionsOf(state, world);
  const age = Math.max(0, yearOf(state.time) - a.builtYear);
  const sigma = noiseOf(m, m.specialty === (type.category === 'widebody' ? 'longHaul' : 'shortHaul'));
  let best: { specs: FlightSpec[]; score: number } | null = null;
  for (let dep = 5 * 60 + 30; dep <= 22 * 60; dep += 30) {
    const specs: FlightSpec[] = [{ aircraftId: a.id, dep, days, groundMin: turn }];
    if (validateSpecs(state, world, route, specs)) continue;
    const flights = specFlights(world, route, a, age, specs[0]!, state.time);
    const w = routeWeek(world, from, to, { type, seats: a.seats, cabin: a.cabin, frequency: perWeek, fareFactor: 1, ageYears: age, rampUp: 1, flights }, date, { ai: state.ai, conditions });
    const result = w.revenue - totalCosts(w.costs);
    const score = result + gauss(`time|${route.destinationId}|${dep}|${state.time}`) * sigma * 0.05 * w.revenue;
    if (!best || score > best.score) best = { specs, score };
  }
  return best?.specs ?? null;
}

// ─── Network: the timetable of routes already flown ─────────────────────────────

/** Seat load factor of a route over the last weeks (null without enough weeks). */
function recentLoad(state: GameState, airline: Airline, routeId: string, weeks: number): number | null {
  const rows = (state.finance[airline.id]?.history.slice(-weeks) ?? []).map((w) => w.routes[routeId]).filter((x) => !!x);
  if (rows.length < weeks) return null;
  const seats = rows.reduce((n, r) => n + r!.seats, 0);
  return seats > 0 ? rows.reduce((n, r) => n + r!.pax, 0) / seats : null;
}

/**
 * The head of network reworks the timetable (Detailed scheduling), as network planners do: one to three routes a month
 * (more with a better head) get the best of many timetable packages (networkPlanning.ts) — other times, other aircraft,
 * trading flights between aircraft, moving an aircraft's run of flights, other times on some days, more or fewer days or
 * flights, bigger aircraft — judged for the whole station with the head's error by skill. Before each season they also
 * rebuild the flights around the hub's waves; that package takes effect on the season's first day.
 */
function timetableReview(state: GameState, world: EngineWorld, airline: Airline, m: Manager): void {
  if (state.options.scheduling !== 'detailed') return;
  const mg = airline.mgmt!;
  const routes = Object.values(state.routes)
    .filter((r) => r.airlineId === airline.id && state.time - r.openedAt > 6 * WEEK)
    .sort((x, y) => (mg.reviewed[`t|${x.id}`] ?? 0) - (mg.reviewed[`t|${y.id}`] ?? 0))
    .slice(0, 1 + Math.floor(m.skill / 2));
  const offer = (o: PlanOption, target: string, revenue: number, effectiveAt?: SimTime) => {
    const est = o.gain + gauss(`tt|${target}|${o.kind}|${JSON.stringify(o.params)}|${state.time}`) * noiseOf(m, false) * 0.04 * revenue;
    return { o, est, target, effectiveAt };
  };
  const picks: ReturnType<typeof offer>[] = [];
  for (const route of routes) {
    mg.reviewed[`t|${route.id}`] = state.time;
    const outlook = routeOutlook(state, world, route);
    if (!outlook) continue;
    const options = routeOptions(state, world, airline, route, recentLoad(state, airline, route.id, 4));
    const best = options.map((o) => offer(o, `tt|${route.id}`, outlook.revenue)).sort((x, y) => y.est - x.est)[0];
    if (best && best.est >= Math.max(0.01 * outlook.revenue, 500)) picks.push(best);
  }
  // Before the next season: a rebuild of the hub's flights around its waves (once per season and station).
  const season = seasonAhead(state.time);
  if (season) {
    for (const station of new Set(Object.values(state.routes).filter((r) => r.airlineId === airline.id).map((r) => r.originId))) {
      const key = `wave|${station}|${season}`;
      if (mg.reviewed[key]) continue;
      mg.reviewed[key] = state.time;
      const o = waveRebuild(state, world, airline, station, 3 + m.skill);
      if (o && o.gain > 1000) picks.push(offer(o, `wave|${station}`, 50 * o.gain, season));
    }
  }
  for (const pick of picks) {
    const { o } = pick;
    const routesOf = [...o.pkg].map(([routeId, flights]) => ({ routeId, flights }));
    propose(state, world, airline, 'network', {
      kind: o.kind,
      target: pick.target,
      params: o.params,
      command: { type: 'UpdateTimetable', airlineId: airline.id, payload: { routes: routesOf, ...(pick.effectiveAt ? { effectiveAt: pick.effectiveAt, label: String(o.params.station ?? o.params.route ?? '') } : {}) } },
      forecastUsd: Math.round(pick.est),
      actualUsd: Math.round(o.gain),
      changes: preview(state, world, airline, o.pkg),
      ...(pick.effectiveAt ? { effectiveAt: pick.effectiveAt } : {}),
    });
  }
}

function networkReview(state: GameState, world: EngineWorld, airline: Airline, m: Manager): void {
  timetableReview(state, world, airline, m);
  // Close: routes that have lost money for two months and still look bad.
  let closes = 0;
  for (const route of Object.values(state.routes)) {
    if (route.airlineId !== airline.id || state.time - route.openedAt < 12 * WEEK || closes >= 2) continue;
    const past = recentResultUsd(state, airline, route.id, 8);
    if (past === null || past >= 0) continue;
    const o = routeOutlook(state, world, route);
    if (!o) continue;
    const sigma = noiseOf(m, m.specialty === (route.distanceKm > 4000 ? 'longHaul' : 'shortHaul'));
    const est = o.result + gauss(`close|${route.id}|${state.time}`) * sigma * 0.1 * o.revenue;
    if (est > -0.02 * o.revenue) continue;
    closes++;
    propose(state, world, airline, 'network', {
      kind: 'closeRoute',
      target: `route|${route.id}`,
      params: { route: routeName(world, route) },
      command: { type: 'CloseRoute', airlineId: airline.id, payload: { routeId: route.id } },
      forecastUsd: Math.round(-est),
      actualUsd: Math.round(-o.result),
    });
  }

  // Open: the aircraft with the most unused hours gets the most promising new destination from its station.
  const idle = Object.values(state.aircraft)
    .filter((a) => a.airlineId === airline.id && a.status === 'active')
    .map((a) => {
      const avail = WEEKLY_AVAILABLE_HOURS[getAircraftType(a.typeId).category];
      return { a, free: avail - aircraftHours(state, a.id), avail };
    })
    .filter((x) => x.free >= 0.3 * x.avail)
    .sort((x, y) => y.free - x.free)[0];
  if (!idle) return;
  const a = idle.a;
  const type = getAircraftType(a.typeId);
  const originId = stationOf(airline, a);
  const origin = world.airportById.get(originId);
  if (!origin) return;
  const served = new Set(Object.values(state.routes).filter((r) => r.airlineId === airline.id && r.originId === originId).map((r) => r.destinationId));
  const date = toDate(state.time);
  const conditions = conditionsOf(state, world);
  const options = [...world.airportById.values()]
    .filter((d) => d.id !== originId && !served.has(d.id) && (d.size === 'large' || d.size === 'medium') && d.longestRunwayM >= type.takeoffM)
    .map((d) => ({ d, km: distanceKm(origin, d) }))
    .filter((x) => x.km >= 300 && x.km <= type.rangeKm * 0.9)
    // Not where flights are banned or airports closed now (e.g. EU–Russia since 2022).
    .filter((x) => closureAt(state, x.d, state.time, origin).share < 0.5 && closureAt(state, origin, state.time, x.d).share < 0.5)
    .sort((x, y) => y.d.marketPop - x.d.marketPop)
    .slice(0, 30);
  const sigma = noiseOf(m, m.specialty === (type.category === 'widebody' ? 'longHaul' : 'shortHaul'));
  let best: { d: (typeof options)[number]['d']; freq: number; est: number } | null = null;
  for (const { d, km } of options) {
    const freq = Math.min(14, Math.floor(idle.free / roundTripHours(type, km)));
    if (freq < 3) continue;
    const w = routeWeek(world, origin, d, { type, seats: a.seats, cabin: a.cabin, frequency: freq, fareFactor: 1, ageYears: Math.max(0, yearOf(state.time) - a.builtYear), rampUp: 1 }, date, { ai: state.ai, conditions });
    const est = w.revenue - totalCosts(w.costs) + gauss(`open|${d.id}|${state.time}`) * sigma * 0.12 * w.revenue;
    if (est > 0.02 * w.revenue && (!best || est > best.est)) best = { d, freq, est };
  }
  if (!best) return;
  const detailed = state.options.scheduling === 'detailed';
  let command: Command;
  let freq = best.freq;
  if (detailed) {
    freq = Math.min(7, freq);
    const specs = bestSpecs(state, world, draftRoute(airline.id, origin, best.d), a, freq, m);
    if (!specs) return;
    command = { type: 'OpenRoute', airlineId: airline.id, payload: { destinationId: best.d.id, originId, aircraftId: a.id, frequency: freq, fareFactor: 1, flights: specs } };
  } else {
    command = { type: 'OpenRoute', airlineId: airline.id, payload: { destinationId: best.d.id, originId, aircraftId: a.id, frequency: freq, fareFactor: 1 } };
  }
  // Try it on a copy of the game: slots, curfews and the timetable must work, and it gives the true effect.
  const sim = structuredClone(state);
  const r = applyCommand(sim, world, command);
  const simRoute = r.ok && r.id ? sim.routes[r.id] : undefined;
  const truth = simRoute ? routeOutlook(sim, world, simRoute, 1, 1) : null;
  if (!truth) return;
  propose(state, world, airline, 'network', {
    kind: 'openRoute',
    target: `open|${a.id}`,
    params: { route: `${code(world, originId)}–${code(world, best.d.id)}`, frequency: freq, registration: a.registration },
    command,
    forecastUsd: Math.round(best.est),
    actualUsd: Math.round(truth.result),
  });
}

// ─── Fleet: lease extensions and idle aircraft ──────────────────────────────────

/** What an aircraft's flights earned a week lately (USD, before crews and leases): its share of its routes' results. */
function aircraftContributionUsd(state: GameState, airline: Airline, a: Aircraft): number {
  let sum = 0;
  const routes = new Set(pairsOfAircraft(state, a.id).map((p) => p.routeId));
  for (const id of routes) {
    const r = recentResultUsd(state, airline, id, 4);
    if (r === null) continue;
    const all = pairsOfRoute(state, id);
    sum += (r * all.filter((p) => p.aircraftId === a.id).length) / Math.max(1, all.length);
  }
  return sum;
}

function fleetReview(state: GameState, world: EngineWorld, airline: Airline, m: Manager): void {
  const mg = airline.mgmt!;
  for (const a of Object.values(state.aircraft)) {
    if (a.airlineId !== airline.id || a.status !== 'active') continue;
    const wide = getAircraftType(a.typeId).category === 'widebody';
    const sigma = noiseOf(m, m.specialty === 'leasing' || m.specialty === (wide ? 'widebody' : 'narrowbody'));
    const flying = pairsOfAircraft(state, a.id).length > 0;
    if (flying) delete mg.idleSince[a.id];
    else mg.idleSince[a.id] ??= state.time;

    // A lease ending within a year: extend it if the aircraft earns more than the new rent.
    if (a.lease && a.lease.endAt - state.time <= 365 * DAY && a.lease.endAt - state.time > 30 * DAY && flying) {
      const rentWeek = ((extensionRentUsd(a, state.time) * leaseRentFactor(airline)) * 12) / 52;
      const truth = aircraftContributionUsd(state, airline, a) - rentWeek;
      const est = truth + gauss(`extend|${a.id}|${state.time}`) * sigma * 0.3 * rentWeek;
      if (est > 0) {
        propose(state, world, airline, 'fleet', {
          kind: 'extendLease',
          target: `aircraft|${a.id}`,
          params: { registration: a.registration, years: 3 },
          command: { type: 'ExtendLease', airlineId: airline.id, payload: { aircraftId: a.id, years: 3 } },
          forecastUsd: Math.round(est),
          actualUsd: Math.round(truth),
        });
      }
    }

    // Standing idle for six weeks: give a leased aircraft back early, sell an owned one.
    const since = mg.idleSince[a.id];
    if (since === undefined || state.time - since < 6 * WEEK) continue;
    let truth: number;
    let command: Command;
    if (a.lease) {
      const weeksLeft = Math.max(1, (a.lease.endAt - state.time) / WEEK);
      const rentWeek = (convert(a.lease.monthlyRent, 'USD', state.fx).amount * 12) / 52;
      truth = rentWeek - earlyReturnFeeUsd(a, state.time) / weeksLeft;
      command = { type: 'ReturnLease', airlineId: airline.id, payload: { aircraftId: a.id } };
    } else if (a.owned) {
      truth = dailyDepreciation(a.owned, state.time) * 7 * usdPerBook(state, airline.currency);
      command = { type: 'SellAircraft', airlineId: airline.id, payload: { aircraftId: a.id } };
    } else continue;
    const est = truth + gauss(`idle|${a.id}|${state.time}`) * sigma * 0.3 * Math.abs(truth);
    if (est <= 0) continue;
    propose(state, world, airline, 'fleet', {
      kind: a.lease ? 'returnLease' : 'sellAircraft',
      target: `aircraft|${a.id}`,
      params: { registration: a.registration, weeks: Math.round((state.time - since) / WEEK) },
      command,
      forecastUsd: Math.round(est),
      actualUsd: Math.round(truth),
    });
  }
}

// ─── Maintenance: an own hangar ─────────────────────────────────────────────────

function maintenanceReview(state: GameState, world: EngineWorld, airline: Airline, m: Manager): void {
  const level = priceLevelAt(state.time);
  for (const size of ['narrow', 'wide'] as HangarSize[]) {
    if (Object.values(state.hangars ?? {}).some((h) => h.airlineId === airline.id && h.size === size)) continue;
    const fleet = Object.values(state.aircraft).filter(
      (a) => a.airlineId === airline.id && a.status === 'active' && (getAircraftType(a.typeId).category === 'widebody') === (size === 'wide'),
    );
    if (fleet.length < 4) continue;
    let spend = 0;
    let days = 0;
    let checks = 0;
    for (const a of fleet) {
      const p = PROGRAMME[getAircraftType(a.typeId).category];
      const c = checkOffer(state, a, 'C', state.time, state.time - 365 * DAY);
      const d = checkOffer(state, a, 'D', state.time, state.time - 365 * DAY);
      spend += c.usd / (p.cMonths / 12) + d.usd / p.dYears;
      days += c.days / (p.cMonths / 12) + d.days / p.dYears;
      checks += 1 / (p.cMonths / 12) + 1 / p.dYears;
    }
    // Two bays: checks beyond what they can take still go to an MRO.
    const capacity = (HANGARS[size].bays * 365) / Math.max(1, days / Math.max(checks, 1e-6));
    const savings = spend * (1 - OWN_HANGAR_PRICE_SHARE) * Math.min(1, capacity / Math.max(checks, 1e-6));
    const yearly = savings - HANGARS[size].runningUsdPerDay * 365 * level - (HANGARS[size].usd * level) / HANGAR_LIFE_YEARS;
    const truth = yearly / 52;
    const sigma = noiseOf(m, m.specialty === (size === 'wide' ? 'widebody' : 'narrowbody'));
    const est = truth + (gauss(`hangar|${size}|${state.time}`) * sigma * 0.3 * savings) / 52;
    if (est <= 0) continue;
    propose(state, world, airline, 'maintenance', {
      kind: 'buildHangar',
      target: `hangar|${size}`,
      params: { size, usd: Math.round(HANGARS[size].usd * level) },
      command: { type: 'BuildHangar', airlineId: airline.id, payload: { size } },
      forecastUsd: Math.round(est),
      actualUsd: Math.round(truth),
    });
  }
}

// ─── HR: crew plans and wage offers ─────────────────────────────────────────────

function hrReview(state: GameState, world: EngineWorld, airline: Airline): void {
  if (airline.mgmt!.delegation.hr === 'auto') return; // crews.ts plans every Monday
  const short = crewShortfall(state, world, airline.id);
  if (short.pilots + short.cabin <= 0) return;
  propose(state, world, airline, 'hr', {
    kind: 'crewPlan',
    target: 'crewPlan',
    params: { pilots: short.pilots, cabin: short.cabin },
    command: { type: 'RunCrewPlan', airlineId: airline.id, payload: {} },
    forecastUsd: null,
    actualUsd: null,
  });
}

/** The head of HR's offer: just above where the head thinks the union will sign (a guess that improves with skill). */
export function managerWageOffer(m: Manager, t: WageTalks, seed: string): number {
  const sigma = noiseOf(m, m.specialty === 'negotiation');
  const guess = t.floor + gauss(seed) * sigma * Math.max(0.005, t.demand - t.inflation * 0.9);
  return Math.round(clamp(guess + 0.001, 0, t.demand) * 1000) / 1000;
}

// ─── Daily step ──────────────────────────────────────────────────────────────────

export function managersDailyStep(state: GameState, world: EngineWorld): void {
  const date = toDate(state.time);
  const day = date.getUTCDate();
  for (const airline of Object.values(state.airlines)) {
    if (airline.controller !== 'human' || !airline.mgmt) continue;
    const mg = airline.mgmt;
    actedToday = proposedToday = 0;
    // Salaries (an overhead of the day).
    const salaries = Object.values(mg.heads).reduce((n, m) => n + salaryUsdNow(world, airline, m!, state.time) / 365, 0);
    if (salaries > 0) bookPnl(state, airline.id, 'overhead', -book(state, airline.id, 'management', money(-Math.round(salaries), 'USD')).amount);
    mg.proposals = mg.proposals.filter((p) => p.expiresAt > state.time);
    if (day === 1) {
      refreshCandidates(state, world, airline);
      for (const [dept, m] of Object.entries(mg.heads)) {
        if (!m || h01(`quit|${m.id}|${monthKey(state.time)}`) >= MANAGER_QUIT + (m.skill >= 4 ? POACHED : 0)) continue;
        delete mg.heads[dept as Department];
        mg.proposals = mg.proposals.filter((p) => p.dept !== dept);
        postMessage(state, { airlineId: airline.id, kind: 'managerLeft', level: 'caution', params: { name: m.name, dept, skill: m.skill } });
      }
    }
    const h = mg.heads;
    if (date.getUTCDay() === 1) {
      if (h.revenue) revenueReview(state, world, airline, h.revenue);
      if (h.hr) hrReview(state, world, airline);
    }
    if (day === 3 && h.network) networkReview(state, world, airline, h.network);
    if (day === 10 && h.fleet) fleetReview(state, world, airline, h.fleet);
    if (day === 17 && h.maintenance) maintenanceReview(state, world, airline, h.maintenance);
    flushMessages(state, airline);
  }
}

/** One line in the log for what the managers did or suggested today. */
export function flushMessages(state: GameState, airline: Airline): void {
  if (actedToday) postMessage(state, { airlineId: airline.id, kind: 'managerActions', level: 'info', params: { count: actedToday } });
  if (proposedToday) postMessage(state, { airlineId: airline.id, kind: 'proposalsWaiting', level: 'info', params: { count: proposedToday } });
  actedToday = proposedToday = 0;
}

/** Waiting proposals, for the screens. */
export const openProposals = (airline: Airline): Proposal[] => airline.mgmt?.proposals ?? [];

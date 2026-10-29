// Delays and punctuality (Phase 9.1). At the start of every day the player's flights of that day are played through
// aircraft by aircraft: each flight may be held up by the airline (late boarding, a small technical snag, handling), air
// traffic flow management, airport congestion or the weather; an aircraft that arrives late leaves late again unless
// the timetable has buffer (knock-on delay), and makes up a little in the air. Late arrivals into a night curfew divert
// (or the flight is cancelled), very bad weather diverts some flights. The next night the day is settled: costs of
// delay, care and EU 261 compensation where the airline is to blame, missed connections at the hub, the passengers'
// verdict for the reputation, and punctuality statistics per route. Random numbers come from stable hashes, so the
// rest of the game's random events stay the same.
import { getAircraftType, TURNAROUND_MIN } from '../data/aircraft';
import { curfewAtTime } from '../data/curfews';
import {
  AIRLINE_DELAY,
  AIRPORT_DELAY,
  ATC_DELAY,
  ATC_REGION,
  BAD_WEATHER_DAY,
  CARE_FROM_MIN,
  CURFEW_GRACE_MIN,
  COMPENSATION_FROM_MIN,
  DELAY_COST_EUR_MIN,
  DIVERSION_EUR_PAX,
  MAX_PADDING_MIN,
  MEAL_EUR,
  MISSED_CONNECTION_EUR,
  MISS_FROM_MIN,
  MISS_MAX_SHARE,
  MISS_RANGE_MIN,
  ON_TIME_MIN,
  PADDING_SHARE,
  QUICK_TURN_SHARE,
  TIGHT_BUFFER_MIN,
  TIGHT_EXTRA_CHANCE,
  WEATHER_DELAY,
  WEATHER_DIVERSION,
  type DelayCause,
} from '../data/delays';
import { CLAIM_SHARE, careEur, EU261_COUNTRIES, eu261Eur } from '../data/maintenance';
import { slotAirport } from '../data/slots';
import type { Airport } from '../data/types';
import { stationsOf } from './bases';
import { closureCancelsPair } from './closures';
import { book, postMessage } from './core';
import { crewCancelsPair } from './crews';
import { priceLevelAt } from './era';
import { bookPnl } from './fleet';
import { distanceKm } from './geo';
import { money } from './money';
import { addExperience } from './reputation';
import { aogCancels, grounded, pairBlocks, pairDepartureUtc, pairsOfAircraft } from './schedule';
import type { Airline, GameState, OpsFlight, RouteStats } from './state';
import { startOfDay, toDate, utcOffsetMin, type SimTime } from './time';
import { strikeCancelsPair } from './unions';
import type { EngineWorld } from './world';

const EU261_FROM_DAY = '2005-02-17';

function h01(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
/** Minutes of one cause: happens with `chance`, then lasts on average `mean` (exponential). */
const draw = (key: string, chance: number, mean: number) => (h01(`${key}|c`) < chance ? Math.round(-mean * Math.log(Math.max(1e-6, h01(`${key}|m`)))) : 0);

/** How bad the weather is at an airport on a day (0 fine … 1 very bad); bad days more often in winter up north. */
export function weatherAt(airport: Airport, day: SimTime): number {
  const month = toDate(day).getUTCMonth();
  const northWinter = airport.lat > 35 && (month <= 1 || month === 11) ? 1.6 : airport.lat < -35 && month >= 5 && month <= 7 ? 1.6 : 1;
  const summerStorms = Math.abs(airport.lat) < 50 && month >= 5 && month <= 8 ? 1.3 : 1;
  const r = h01(`wx|${airport.id}|${day}`);
  const p = BAD_WEATHER_DAY * northWinter * summerStorms;
  return r < p ? 0.5 + (0.5 * (p - r)) / p : 0;
}

/** Why a pair doesn't fly on a day (null = it flies). */
function cancelReason(state: GameState, world: EngineWorld, routeId: string, pairId: string, time: SimTime): string | null {
  const route = state.routes[routeId]!;
  const pair = state.flights[pairId]!;
  const a = state.aircraft[pair.aircraftId]!;
  if (grounded(a, time)) return 'maintenance';
  if (aogCancels(world, route, pair, a, time)) return 'technical';
  if (closureCancelsPair(state, world, route, pair, time)) return 'closure';
  if (strikeCancelsPair(state, world, route, pair, time)) return 'strike';
  if (crewCancelsPair(state, world, route, pair, time)) return 'crew';
  return null;
}

const localMinute = (a: Airport, t: SimTime) => t - startOfDay(t) + utcOffsetMin(a.tz, t);
const inBan = (a: Airport, t: SimTime) => curfewAtTime(a.id, localMinute(a, t), toDate(t).getUTCFullYear())?.kind === 'ban';
/** Too late even for the grace a curfew gives delayed flights. */
const pastGrace = (a: Airport, t: SimTime) => inBan(a, t) && inBan(a, t - CURFEW_GRACE_MIN);

/** The nearest other airport a diverted flight can land at. */
function diversionFor(world: EngineWorld, to: Airport): Airport | null {
  let best: Airport | null = null;
  let bestKm = 400;
  for (const d of world.diversionAirports) {
    if (d.id === to.id) continue;
    const km = distanceKm(d, to);
    if (km < bestKm) {
      best = d;
      bestKm = km;
    }
  }
  return best;
}

/** Last week's passengers per flight of a route (and the transfer share). */
function loadOf(state: GameState, airlineId: string, routeId: string): { pax: number; transfer: number } {
  const s = state.finance[airlineId]?.history.at(-1)?.routes[routeId];
  if (!s || !s.flights) return { pax: 0, transfer: 0 };
  return { pax: s.pax / s.flights, transfer: (s.transfer ?? 0) / s.flights };
}

/** Plays through one airline's flights of the UTC day starting at `day`. */
function simulateAirline(state: GameState, world: EngineWorld, airline: Airline, day: SimTime, ready: Record<string, SimTime>): OpsFlight[] {
  const result: OpsFlight[] = [];
  const congested = (a: Airport) => (slotAirport(a.id) ? AIRPORT_DELAY.congested : 1);
  const atcFactor = (a: Airport) => (ATC_REGION[world.countries[a.country]?.continent ?? ''] ?? 0.5) * (toDate(day).getUTCMonth() >= 5 && toDate(day).getUTCMonth() <= 8 ? 1.5 : 0.8);
  for (const a of Object.values(state.aircraft)) {
    if (a.airlineId !== airline.id || a.status !== 'active') continue;
    const turn = TURNAROUND_MIN[getAircraftType(a.typeId).category];
    const legs: OpsFlight[] = [];
    for (const pair of pairsOfAircraft(state, a.id)) {
      const route = state.routes[pair.routeId];
      if (!route) continue;
      const dep = pairDepartureUtc(world, route, pair, day);
      if (dep === null) continue;
      const { out, back } = pairBlocks(world, a.typeId, route);
      const reason = cancelReason(state, world, route.id, pair.id, dep);
      const load = loadOf(state, airline.id, route.id);
      const base = { airlineId: airline.id, routeId: route.id, pairId: pair.id, aircraftId: a.id, depDelay: 0, arrDelay: 0, cause: null, pax: load.pax, transfer: load.transfer / 2 };
      const status = reason ? ('cancelled' as const) : ('ok' as const);
      const backDep = dep + out + pair.groundMin;
      legs.push({ ...base, dir: 0, flightNumber: pair.flightNumber, fromId: route.originId, toId: route.destinationId, dep, arr: dep + out, status, ...(reason ? { reason } : {}) });
      legs.push({ ...base, dir: 1, flightNumber: pair.flightNumber + 1, fromId: route.destinationId, toId: route.originId, dep: backDep, arr: backDep + back, status, ...(reason ? { reason } : {}) });
    }
    legs.sort((x, y) => x.dep - y.dep);
    let readyAt = ready[a.id] ?? 0;
    let prevArr: number | null = null;
    for (const f of legs) {
      if (f.status === 'cancelled') continue;
      const from = world.airportById.get(f.fromId)!;
      const to = world.airportById.get(f.toId)!;
      const key = `${f.pairId}|${f.dir}|${day}`;
      const tight = prevArr !== null && f.dep - prevArr - turn < TIGHT_BUFFER_MIN;
      const wxFrom = weatherAt(from, day);
      const wxTo = weatherAt(to, day);
      const causes: [DelayCause, number][] = [
        ['airline', draw(`${key}|al`, AIRLINE_DELAY.chance + (tight ? TIGHT_EXTRA_CHANCE : 0), AIRLINE_DELAY.mean)],
        ['atc', draw(`${key}|atc`, ATC_DELAY.chance * Math.max(atcFactor(from), atcFactor(to)), ATC_DELAY.mean)],
        ['airport', draw(`${key}|ap`, AIRPORT_DELAY.chance * congested(from), AIRPORT_DELAY.mean)],
        [
          'weather',
          Math.max(wxFrom, wxTo) > 0
            ? draw(`${key}|wx`, WEATHER_DELAY.badChance * Math.max(wxFrom, wxTo), WEATHER_DELAY.badMean * (1 + Math.max(wxFrom, wxTo)))
            : draw(`${key}|wx`, WEATHER_DELAY.goodChance, WEATHER_DELAY.goodMean),
        ],
      ];
      const [primaryCause, primary] = causes.reduce((x, y) => (y[1] > x[1] ? y : x));
      const others = causes.reduce((n, c) => n + c[1], 0) - primary;
      const knockOn = Math.max(0, readyAt - f.dep);
      const depDelay = Math.round(Math.max(primary, knockOn) + 0.3 * Math.min(primary + others, knockOn) + (knockOn > 0 ? 0 : 0.3 * others));
      const block = f.arr - f.dep;
      const pad = Math.min(MAX_PADDING_MIN, PADDING_SHARE * block);
      f.depDelay = depDelay;
      f.arrDelay = Math.round(depDelay - pad);
      f.cause = depDelay <= 0 ? null : knockOn >= primary ? 'reactionary' : primaryCause;
      // A late departure into the night ban at the origin: cancelled. A late arrival into it at the destination: diverted.
      if (depDelay > 0 && pastGrace(from, f.dep + depDelay) && !inBan(from, f.dep)) {
        f.status = 'cancelled';
        f.reason = 'curfew';
        f.cause = 'curfew';
        readyAt = f.dep + depDelay;
        continue;
      }
      const lateIntoBan = f.arrDelay > 0 && pastGrace(to, f.arr + f.arrDelay) && !inBan(to, f.arr);
      const storm = wxTo > 0.85 && h01(`${key}|div`) < WEATHER_DIVERSION * 4 * (wxTo - 0.75);
      if (lateIntoBan || storm) {
        const alt = diversionFor(world, to);
        if (alt) {
          f.status = 'diverted';
          f.divertedTo = alt.id;
          if (lateIntoBan) f.cause = 'curfew';
          else if (!f.cause) f.cause = 'weather';
          // Passengers reach their airport by bus; the aircraft is back after a ferry flight the next morning.
          f.arrDelay += 150;
        }
      }
      prevArr = f.arr;
      // Late aircraft are turned around faster than the planned minimum.
      readyAt = f.arr + f.arrDelay + (f.arrDelay > 0 ? turn * QUICK_TURN_SHARE : turn) + (f.status === 'diverted' ? 120 : 0);
    }
    ready[a.id] = readyAt;
    result.push(...legs);
  }
  return result;
}

/** At the start of a day: the day before is settled, today's flights are played through. */
export function opsDailyStep(state: GameState, world: EngineWorld): void {
  if (!Object.values(state.airlines).some((a) => a.controller === 'human')) return;
  const day = startOfDay(state.time);
  const ops = (state.ops ??= { day, flights: [], prev: [], ready: {} });
  if (ops.day < day && ops.flights.length) settleDay(state, world, ops.flights);
  ops.prev = ops.day < day ? ops.flights : ops.prev;
  // Carried delays only matter until the next morning.
  for (const [id, t] of Object.entries(ops.ready)) if (t < day) delete ops.ready[id];
  ops.day = day;
  ops.flights = [];
  for (const airline of Object.values(state.airlines)) {
    if (airline.controller !== 'human') continue;
    ops.flights.push(...simulateAirline(state, world, airline, day, ops.ready));
  }
}

/** The costs, statistics and passengers' verdict of a day's flights. */
function settleDay(state: GameState, world: EngineWorld, flights: OpsFlight[]): void {
  const level = priceLevelAt(state.time);
  const byAirline = new Map<string, OpsFlight[]>();
  for (const f of flights) (byAirline.get(f.airlineId) ?? byAirline.set(f.airlineId, []).get(f.airlineId)!).push(f);
  for (const [airlineId, list] of byAirline) {
    const airline = state.airlines[airlineId];
    const fin = state.finance[airlineId];
    if (!airline || !fin) continue;
    const euCarrier = EU261_COUNTRIES.has(world.airportById.get(airline.hubId)?.country ?? '');
    const stations = new Set(stationsOf(airline));
    let eur = 0;
    let unhappy = 0;
    let pax = 0;
    for (const f of list) {
      if (f.status === 'cancelled' && f.reason !== 'curfew') continue;
      const route = state.routes[f.routeId];
      const a = state.aircraft[f.aircraftId];
      if (!route || !a) continue;
      const seats = a.seats;
      const people = Math.round(f.pax);
      const own = f.cause === 'airline' || f.cause === 'reactionary' || f.cause === 'curfew';
      const day = toDate(f.dep).toISOString().slice(0, 10);
      const covered = day >= EU261_FROM_DAY && (euCarrier || EU261_COUNTRIES.has(world.airportById.get(f.fromId)?.country ?? ''));
      const comp = covered && own ? CLAIM_SHARE * eu261Eur(route.distanceKm) : 0;
      if (f.status === 'cancelled') {
        // Cancelled for the curfew: everybody is put up for the night and rebooked.
        eur += people * (careEur(12) + comp);
        unhappy += people * 40;
      } else {
        eur += Math.max(0, f.depDelay) * DELAY_COST_EUR_MIN * (seats / 150);
        if (f.depDelay >= CARE_FROM_MIN) eur += people * MEAL_EUR;
        if (f.arrDelay >= COMPENSATION_FROM_MIN) eur += people * comp;
        if (f.status === 'diverted') eur += people * DIVERSION_EUR_PAX;
        unhappy += people * (Math.max(0, f.arrDelay - ON_TIME_MIN) / 60) * 6 + (f.status === 'diverted' ? people * 20 : 0);
        // Passengers changing planes at the airline's hub miss their connection when the arrival is too late.
        if (stations.has(f.toId) && f.transfer > 0) {
          const missed = f.transfer * Math.min(MISS_MAX_SHARE, Math.max(0, (f.arrDelay - MISS_FROM_MIN) / MISS_RANGE_MIN));
          eur += missed * (MISSED_CONNECTION_EUR + comp);
          unhappy += missed * 20;
        }
      }
      pax += people;
      // Punctuality statistics for the route (in the running week and month).
      for (const period of [fin.week, fin.month]) {
        const s: RouteStats = (period.routes[f.routeId] ??= { flights: 0, seats: 0, pax: 0, revenue: 0, directCosts: 0 });
        s.opsFlights = (s.opsFlights ?? 0) + 1;
        if (f.status === 'ok' && f.arrDelay <= ON_TIME_MIN) s.onTime = (s.onTime ?? 0) + 1;
        s.delayMin = (s.delayMin ?? 0) + Math.max(0, f.depDelay);
        if (f.status === 'diverted') s.diverted = (s.diverted ?? 0) + 1;
        if (f.cause && f.depDelay > 0) (s.causes ??= {})[f.cause] = (s.causes[f.cause] ?? 0) + f.depDelay;
      }
      if (f.status === 'diverted') {
        postMessage(state, { airlineId, kind: 'flightDiverted', level: 'caution', params: { flight: f.flightNumber, from: f.fromId, to: f.toId, alt: f.divertedTo ?? '', cause: f.cause ?? 'weather' } });
      }
    }
    if (eur > 0) {
      const cost = -book(state, airlineId, 'compensation', money(-Math.round(eur * level), 'EUR')).amount;
      bookPnl(state, airlineId, 'disruption', cost);
    }
    const rep = state.reputation[airlineId];
    if (rep && pax > 0 && unhappy > 0) addExperience(rep, { Y: { pax: 0, product: 0, age: 0, value: 0, crowd: 0, disruption: -unhappy } });
  }
}

/** Today's delay of a flight on the map (minutes), if known. */
export function delayOf(state: GameState, aircraftId: string, flightNumber: number, dep: SimTime): OpsFlight | undefined {
  const ops = state.ops;
  if (!ops) return undefined;
  return [...ops.flights, ...ops.prev].find((f) => f.aircraftId === aircraftId && f.flightNumber === flightNumber && Math.abs(f.dep - dep) < 5);
}

/** On-time share and average delay of a set of route statistics (null without data). */
export function punctuality(stats: Iterable<RouteStats>): { onTime: number; avgDelay: number; flights: number; diverted: number; causes: Partial<Record<DelayCause, number>> } | null {
  let flights = 0;
  let onTime = 0;
  let delay = 0;
  let diverted = 0;
  const causes: Partial<Record<DelayCause, number>> = {};
  for (const s of stats) {
    flights += s.opsFlights ?? 0;
    onTime += s.onTime ?? 0;
    delay += s.delayMin ?? 0;
    diverted += s.diverted ?? 0;
    for (const [c, m] of Object.entries(s.causes ?? {}) as [DelayCause, number][]) causes[c] = (causes[c] ?? 0) + m;
  }
  return flights ? { onTime: onTime / flights, avgDelay: delay / flights, flights, diverted, causes } : null;
}


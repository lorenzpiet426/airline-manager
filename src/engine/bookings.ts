// Live bookings (Phase 9.3). Every flight opens for sale weeks before departure (60–120 days by distance). Each day the
// travellers who decide that day arrive — holidaymakers mostly early, business travellers late — and buy the cheapest
// open fare bucket they would pay for; business travellers who need a flexible ticket only take a fixed one if it is
// much cheaper. Buckets stop selling when they reach the seats the airline allows them on the route, or a set number of
// days before departure, so the price of a flight rises as it fills ("dynamic pricing"). How many travellers a flight
// will have in the end comes from the route's market model (economics.ts: competition, timetable, fares, brand),
// worked out once a week; bookings are expected numbers (fractions of passengers), like the rest of the market model.
// When the flight has flown, its bookings replace the market model's passengers and revenue.
import {
  BOOKING_DAYS,
  BUSINESS_NEEDS_FLEX,
  CURTAIN_ECONOMY_PER_SEAT,
  CURVE_MARKS,
  DEFAULT_BUCKETS,
  MAX_BUCKETS,
  FIXED_TICKET_PENALTY,
  salesOpenDays,
  WILLINGNESS,
  type FareBucket,
} from '../data/fares';
import { CLASSES } from './cabins';
import { routeWeek, seasonFactor, type FlightClass, type RouteWeek } from './economics';
import { groundContext } from './hub';
import { planFor, rampUp } from './operations';
import { pairBlocks, pairDepartureUtc, pairsOfRoute } from './schedule';
import type { Airline, BookingRecord, CabinClass, GameState, Route } from './state';
import { MINUTES_PER_DAY, startOfDay, startOfWeek, toDate, utcOffsetMin, type SimTime } from './time';
import { routeTransfers } from './transfers';
import { conditionsOf } from './worldEvents';
import type { EngineWorld } from './world';

const DAY = MINUTES_PER_DAY;
/** Flights further away than this are sold every third day only (fewer sums, the same bookings in total). */
const FAR_DAYS = 14;
const CLASS_INDEX: Record<CabinClass, number> = { F: 0, J: 1, W: 2, Y: 3 };
type Segment = 'leisure' | 'business' | 'transfer';

/** The airline's buckets for a class (the defaults until it sets its own). */
export const bucketsOf = (airline: Airline | undefined, cls: CabinClass): readonly FareBucket[] => airline?.fares?.[cls] ?? DEFAULT_BUCKETS;

/** Share of a cabin a bucket may sell on a route (the route's own setting, else the bucket's default; null = no limit). */
export function limitOf(route: Route, cls: CabinClass, bucket: FareBucket): number | null {
  const own = route.bucketLimits?.[cls];
  return own && bucket.id in own ? (own[bucket.id] ?? null) : bucket.share;
}

// ─── Travellers ─────────────────────────────────────────────────────────────────

/** Standard normal distribution (Abramowitz–Stegun 7.1.26). */
function normalCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

const wtpCache = new Map<string, number>();
/** Share of travellers who would pay `price` (relative to the class's fare) or more. */
export function willingToPay(segment: Segment, price: number): number {
  const key = `${segment === 'business' ? 'b' : 'l'}${price}`;
  let v = wtpCache.get(key);
  if (v === undefined) {
    const w = segment === 'business' ? WILLINGNESS.business : WILLINGNESS.leisure;
    v = 1 - normalCdf((Math.log(Math.max(1e-6, price)) - Math.log(w.median)) / w.spread);
    if (wtpCache.size < 10_000) wtpCache.set(key, v);
  }
  return v;
}

/** Share of a segment's bookings made when fewer than `days` days are left before departure. */
export function bookedWithin(segment: Segment, longHaul: boolean, days: number): number {
  const d = segment === 'business' ? BOOKING_DAYS.business : BOOKING_DAYS.leisure;
  return 1 - Math.exp(-Math.max(0, days) / (longHaul ? d.long : d.short));
}

// ─── What each flight can expect ────────────────────────────────────────────────

/** Per operation of a flight and class: local holidaymakers, business travellers and transfer passengers at the base fare. */
export interface FlightDemand {
  classes: Partial<Record<CabinClass, { leisure: number; business: number; transfer: number; fareUsd: number; transferYield: number }>>;
}

const forecastCache = new WeakMap<GameState, Map<string, { sig: string; data: Map<string, FlightDemand> }>>();

/** The market model's travellers per flight of a route this week (cached until the week, fares or timetable change). */
export function routeForecast(state: GameState, world: EngineWorld, route: Route): Map<string, FlightDemand> {
  const pairs = pairsOfRoute(state, route.id);
  const sig = `${startOfWeek(state.time)}|${route.fareFactor}|${JSON.stringify(route.classFares)}|${pairs.map((p) => `${p.id}/${p.dep}/${p.days}/${p.aircraftId}/${p.groundMin}`).join(',')}`;
  let cache = forecastCache.get(state);
  if (!cache) forecastCache.set(state, (cache = new Map()));
  const hit = cache.get(route.id);
  if (hit?.sig === sig) return hit.data;
  const data = new Map<string, FlightDemand>();
  const from = world.airportById.get(route.originId);
  const to = world.airportById.get(route.destinationId);
  const plan = from && to ? planFor(state, world, route, state.time, true) : null;
  if (plan && from && to) {
    const rep = state.reputation[route.airlineId];
    const ground = groundContext(state, world, route.airlineId);
    const week = routeWeek(world, from, to, { ...plan, rampUp: 1 }, toDate(state.time), {
      ai: state.ai,
      brand: rep ? { reputation: rep.score, awareness: rep.awareness } : undefined,
      checksSeparate: true,
      conditions: conditionsOf(state, world),
      transfer: routeTransfers(world, state, route),
      ...(ground ? { ground } : {}),
    });
    week.timetable.forEach((f, i) => {
      const r = week.byFlight[i];
      if (!f.key || !r || !r.flights) return;
      const classes: FlightDemand['classes'] = {};
      for (const [cls, c] of Object.entries(r.classes) as [CabinClass, FlightClass][]) {
        const local = c.demand - c.transfer;
        classes[cls] = { leisure: (local - c.business) / r.flights, business: c.business / r.flights, transfer: c.transfer / r.flights, fareUsd: c.fareUsd, transferYield: c.transferYield };
      }
      data.set(f.key, { classes });
    });
  }
  cache.set(route.id, { sig, data });
  return data;
}

// ─── Selling ────────────────────────────────────────────────────────────────────

/** Seats per class of an aircraft cabin, economy with the curtain's spare business rows (European business). */
function capacity(state: GameState, aircraftId: string, demand: FlightDemand): number[] {
  const cap = [0, 0, 0, 0];
  const a = state.aircraft[aircraftId];
  for (const s of a?.cabin ?? []) cap[CLASS_INDEX[s.cls]] = (cap[CLASS_INDEX[s.cls]] ?? 0) + s.seats;
  const euro = a?.cabin.find((s) => s.cls === 'J' && s.product === 'euro');
  if (euro && cap[3]! > 0) {
    const j = demand.classes.J;
    const expected = j ? j.leisure * willingToPay('leisure', 1) + j.business + j.transfer : 0;
    cap[3] = cap[3]! + Math.max(0, euro.seats - 1.1 * expected) * CURTAIN_ECONOMY_PER_SEAT;
  }
  return cap;
}

/** Travellers of one segment arriving for a class today buy the cheapest open bucket they accept (seats permitting). */
function sell(rec: BookingRecord, route: Route, airline: Airline | undefined, cls: CabinClass, segment: Segment, arrivals: number, daysLeft: number): void {
  if (arrivals <= 0) return;
  const cap = rec.cap[CLASS_INDEX[cls]] ?? 0;
  if (cap <= 0) return;
  const sold = (rec.sold[cls] ??= {});
  const buckets = bucketsOf(airline, cls).filter((b) => daysLeft >= b.closeDays);
  const groups: [number, (b: FareBucket) => number][] =
    segment === 'business'
      ? [
          [arrivals * BUSINESS_NEEDS_FLEX, (b) => b.factor * (b.flexible ? 1 : FIXED_TICKET_PENALTY)],
          [arrivals * (1 - BUSINESS_NEEDS_FLEX), (b) => b.factor],
        ]
      : [[arrivals, (b) => b.factor]];
  let total = Object.values(sold).reduce((n, x) => n + x, 0);
  for (const [mass, price] of groups) {
    if (total >= cap) return;
    const order = [...buckets].sort((x, y) => price(x) - price(y));
    if (!order.length) continue;
    let want = mass * willingToPay(segment, price(order[0]!));
    for (let j = 0; j < order.length && want > 1e-9; j++) {
      const b = order[j]!;
      const limit = limitOf(route, cls, b);
      const room = Math.max(0, Math.min(cap - total, limit === null ? Infinity : limit * cap - (sold[b.id] ?? 0)));
      const take = Math.min(want, room);
      if (take > 0) {
        sold[b.id] = (sold[b.id] ?? 0) + take;
        rec.value[cls] = (rec.value[cls] ?? 0) + take * b.factor;
        total += take;
        if (segment === 'transfer') rec.transfer[cls] = (rec.transfer[cls] ?? 0) + take;
      }
      // Those who found no seat at this price: the ones who would also pay the next bucket's price try that.
      const next = order[j + 1];
      const here = willingToPay(segment, price(b));
      want = next && here > 0 ? ((want - take) * willingToPay(segment, price(next))) / here : 0;
    }
  }
}

const totalSold = (rec: BookingRecord) => Object.values(rec.sold).reduce((n, c) => n + Object.values(c ?? {}).reduce((m, x) => m + x, 0), 0);

/** One day of sales for one flight: the travellers who decided since the last day processed. */
function processDay(state: GameState, world: EngineWorld, rec: BookingRecord, route: Route, demand: FlightDemand, today: SimTime): void {
  const airline = state.airlines[rec.airlineId];
  const daysLeft = Math.max(0, Math.round((rec.dep - today) / DAY));
  const before = rec.last ? Math.round((rec.dep - rec.last) / DAY) : Infinity;
  const long = route.distanceKm > 4000;
  const from = world.airportById.get(route.originId);
  const to = world.airportById.get(route.destinationId);
  // The market model's numbers are for this week: the flight's own season and the route's ramp-up scale them.
  const season = from && to ? seasonFactor(from, to, 0.25, toDate(rec.dep)) / Math.max(0.3, seasonFactor(from, to, 0.25, toDate(today))) : 1;
  const ramp = rampUp(route.openedAt, rec.dep);
  for (const [cls, d] of Object.entries(demand.classes) as [CabinClass, NonNullable<FlightDemand['classes'][CabinClass]>][]) {
    for (const segment of ['transfer', 'leisure', 'business'] as const) {
      const share = (before === Infinity ? 1 : bookedWithin(segment, long, before)) - bookedWithin(segment, long, daysLeft);
      // The model's travellers are those who buy at the class's fare; all who consider the flight are more.
      const atFare = segment === 'business' ? d.business : segment === 'transfer' ? d.transfer : d.leisure;
      const potential = atFare / Math.max(0.05, willingToPay(segment, 1));
      sell(rec, route, airline, cls, segment, potential * share * season * ramp, daysLeft);
    }
  }
  const total = totalSold(rec);
  for (const m of CURVE_MARKS) if (daysLeft <= m && rec.curve[m] === undefined) rec.curve[m] = Math.round(total * 10) / 10;
  rec.last = today;
}

/** Opens new flights for sale, sells today's bookings and forgets flights that have flown. */
export function bookingsDailyStep(state: GameState, world: EngineWorld): void {
  const today = startOfDay(state.time);
  const all = (state.bookings ??= {});
  for (const [id, rec] of Object.entries(all)) if (rec.dep < today - DAY) delete all[id];
  for (const route of Object.values(state.routes)) {
    const airline = state.airlines[route.airlineId];
    if (airline?.controller !== 'human') continue;
    const demand = routeForecast(state, world, route);
    const open = salesOpenDays(route.distanceKm);
    for (const pair of pairsOfRoute(state, route.id)) {
      const aircraft = state.aircraft[pair.aircraftId];
      if (!aircraft) continue;
      const { out } = pairBlocks(world, aircraft.typeId, route);
      for (let d = 0; d <= open; d++) {
        const outDep = pairDepartureUtc(world, route, pair, today + d * DAY);
        if (outDep === null) continue;
        for (const dir of [0, 1] as const) {
          const dep = dir === 0 ? outDep : outDep + out + pair.groundMin;
          if (dep < today || dep > today + open * DAY) continue;
          const key = `${pair.id}:${dir}`;
          const fd = demand.get(key);
          if (!fd) continue;
          const id = `${key}:${dep}`;
          const rec = (all[id] ??= { airlineId: airline.id, routeId: route.id, key, dep, cap: capacity(state, aircraft.id, fd), sold: {}, transfer: {}, value: {}, curve: {}, last: 0 });
          // Far from departure only every third day (the bookings in between are counted together).
          const far = dep - today > FAR_DAYS * DAY && rec.last > 0 && today - rec.last < 3 * DAY;
          if (rec.last !== today && !far) processDay(state, world, rec, route, fd, today);
        }
      }
    }
  }
}

/** A flight's bookings (null if it isn't on sale or has gone). */
export const bookingOf = (state: GameState, pairId: string, dir: 0 | 1, dep: SimTime): BookingRecord | undefined => state.bookings?.[`${pairId}:${dir}:${dep}`];

const indexCache = new WeakMap<GameState, { day: SimTime; map: Map<string, BookingRecord[]> }>();
/** Booking records by flight key (built once per booked day: no records change while a day is booked). */
function recordsByKey(state: GameState, all: Record<string, BookingRecord>, day: SimTime): Map<string, BookingRecord[]> {
  const hit = indexCache.get(state);
  if (hit && hit.day === day) return hit.map;
  const map = new Map<string, BookingRecord[]>();
  for (const r of Object.values(all)) (map.get(r.key) ?? map.set(r.key, []).get(r.key)!).push(r);
  indexCache.set(state, { day, map });
  return map;
}

/**
 * When a day is booked (operations.ts): each flight's real passengers and revenue from its bookings, replacing the
 * market model's estimate (costs that depend on passengers follow).
 */
export function applyBookings(state: GameState, world: EngineWorld, route: Route, week: RouteWeek, day: SimTime): void {
  const all = state.bookings;
  if (!all) return;
  const ends = [world.airportById.get(route.originId), world.airportById.get(route.destinationId)];
  week.timetable.forEach((f, i) => {
    const r = week.byFlight[i];
    const from = ends[f.dir];
    if (!r || !r.flights || !f.key || !from) return;
    const expected = startOfDay(day) + f.dep - utcOffsetMin(from.tz, day);
    const rec = recordsByKey(state, all, day).get(f.key)?.find((x) => Math.abs(x.dep - expected) < 6 * 60);
    if (!rec) return;
    let pax = 0;
    let revenue = 0;
    let transfer = 0;
    for (const cls of CLASSES) {
      const c = r.classes[cls];
      if (!c) continue;
      const sold = rec.sold[cls] ?? {};
      const n = Object.values(sold).reduce((a, b) => a + b, 0);
      const tr = Math.min(n, rec.transfer[cls] ?? 0);
      const trShare = n > 0 ? tr / n : 0;
      const money = (rec.value?.[cls] ?? 0) * c.fareUsd * (1 - trShare + trShare * c.transferYield);
      const wc = week.byClass[cls];
      if (wc) {
        wc.pax += n - c.pax;
        wc.revenue += money - c.revenue;
      }
      c.pax = n;
      c.revenue = money;
      pax += n;
      revenue += money;
      transfer += tr;
    }
    const scale = r.pax > 0 ? pax / r.pax : 1;
    week.costs.service += r.costs.service * (scale - 1);
    r.costs.service *= scale;
    week.pax += pax - r.pax;
    week.revenue += revenue - r.revenue;
    week.transferPax += transfer - r.transferPax;
    week.costs.distribution += 0.05 * (revenue - r.revenue);
    r.costs.distribution = 0.05 * revenue;
    r.pax = pax;
    r.revenue = revenue;
    r.transferPax = transfer;
    r.bookings = { sold: rec.sold, curve: rec.curve };
  });
  week.loadFactor = week.seats > 0 ? week.pax / week.seats : 0;
}

// ─── The airline's settings ─────────────────────────────────────────────────────

export type FareError = 'bucketsInvalid' | 'bucketsNeedOpen' | 'routeUnknown' | 'limitsInvalid';

/** New buckets for a class: 1–6 with sensible prices; at least one without limit that sells until departure. */
export function setFareBuckets(state: GameState, airlineId: string, cls: CabinClass, buckets: FareBucket[]): FareError | null {
  const airline = state.airlines[airlineId]!;
  const ids = new Set(buckets.map((b) => b.id));
  const ok =
    buckets.length >= 1 &&
    buckets.length <= MAX_BUCKETS &&
    ids.size === buckets.length &&
    buckets.every(
      (b) =>
        /^[a-z0-9-]{1,24}$/.test(b.id) &&
        b.name.trim().length >= 1 &&
        b.name.length <= 20 &&
        Number.isFinite(b.factor) &&
        b.factor >= 0.2 &&
        b.factor <= 4 &&
        Number.isInteger(b.closeDays) &&
        b.closeDays >= 0 &&
        b.closeDays <= 90 &&
        (b.share === null || (Number.isFinite(b.share) && b.share >= 0 && b.share <= 1)),
    );
  if (!ok) return 'bucketsInvalid';
  if (!buckets.some((b) => b.closeDays === 0 && b.share === null)) return 'bucketsNeedOpen';
  (airline.fares ??= {})[cls] = buckets.map((b) => ({ ...b, name: b.name.trim(), factor: Math.round(b.factor * 100) / 100 }));
  return null;
}

/** A route's own seat limits per bucket for a class (shares of the cabin; null = no limit; empty = the defaults). */
export function setBucketLimits(state: GameState, airlineId: string, routeId: string, cls: CabinClass, limits: Record<string, number | null>): FareError | null {
  const route = state.routes[routeId];
  if (!route || route.airlineId !== airlineId) return 'routeUnknown';
  const known = new Set(bucketsOf(state.airlines[airlineId], cls).map((b) => b.id));
  if (!Object.entries(limits).every(([id, v]) => known.has(id) && (v === null || (Number.isFinite(v) && v >= 0 && v <= 1)))) return 'limitsInvalid';
  if (!Object.keys(limits).length) {
    if (route.bucketLimits) delete route.bucketLimits[cls];
  } else (route.bucketLimits ??= {})[cls] = { ...limits };
  return null;
}

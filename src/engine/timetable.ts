// Detailed scheduling (Phase 2.2): how long a flight takes in each direction (wind), when passengers want to
// travel, and how they choose between the flights of a day. Used for the player's timetable and for the
// competitors' timetables, which the game generates (real departure times are only in sources we may not copy).
//
// The choice model is a simplified "decision window" model, as airlines' network planning tools use: every
// traveller has a wished departure time; flights within a window around it are all fine, further away they quickly
// lose appeal; a one-stop connection via another hub is always available but worse. Business travellers have narrow
// windows (early morning out, evening back), holidaymakers wide ones.
import type { Airport } from '../data/types';
import { bearing, intermediatePoint } from './geo';

/** Airways are not straight lines: real routings are ~6 % longer than the great circle. */
export const ROUTING_FACTOR = 1.06;
/** Taxi out/in, climb and descent add roughly this much to the cruise time (hours). */
export const BLOCK_OVERHEAD_H = 0.45;
/** Average wind along mid-latitude routes (westerlies, jet stream): eastbound flights are faster than westbound. */
const WESTERLY_KMH = 50;

const windCache = new Map<string, number>();

/** Average wind along the route in km/h: positive = tailwind (flying east at mid-latitudes). Kept per airport pair. */
export function windKmh(from: Airport, to: Airport): number {
  const key = `${from.id}|${to.id}`;
  let w = windCache.get(key);
  if (w === undefined) windCache.set(key, (w = computeWind(from, to)));
  return w;
}

function computeWind(from: Airport, to: Airport): number {
  const mid = intermediatePoint(from, to, 0.5);
  const course = bearing(mid, intermediatePoint(from, to, 0.52));
  const lat = Math.abs(mid.lat);
  // The westerlies are strongest between ~30° and 55° latitude and weak in the tropics.
  const strength = lat < 20 ? 0.15 : lat < 30 ? 0.15 + (0.85 * (lat - 20)) / 10 : lat <= 55 ? 1 : Math.max(0.3, 1 - (lat - 55) / 20);
  return WESTERLY_KMH * strength * Math.sin((course * Math.PI) / 180);
}

/** Scheduled block time in minutes in this direction, rounded up to 5 minutes like published timetables. */
export function blockMinutes(cruiseKmh: number, from: Airport, to: Airport, km: number): number {
  const speed = Math.max(cruiseKmh * 0.6, cruiseKmh + windKmh(from, to) * Math.min(1, cruiseKmh / 850));
  return Math.ceil(((BLOCK_OVERHEAD_H + (km * ROUTING_FACTOR) / speed) * 60) / 5) * 5;
}

/** Flights longer than this are long-haul for passengers' time wishes (overnight flights are normal). */
export const LONG_HAUL_MIN = 6 * 60;

// ─── When people want to fly ─────────────────────────────────────────────────────

export type Segment = 'business' | 'leisure';

/** Share of travellers wishing to depart in each local hour (0–23). Typical European short-haul patterns. */
const DEPARTURE_WISH: Record<Segment | 'long', number[]> = {
  // Out early (first wave 6–8), back in the late afternoon/evening; few at midday, almost none at night.
  business: [0, 0, 0, 0, 0.2, 1.5, 3.5, 4, 3, 2, 1.5, 1.2, 1.2, 1.3, 1.5, 2, 2.8, 3.2, 3, 2.2, 1.2, 0.6, 0.2, 0],
  // Holidaymakers: any time of the day, a little more late morning, rarely at night.
  leisure: [0, 0, 0, 0, 0.1, 0.5, 1.2, 1.8, 2.2, 2.4, 2.4, 2.3, 2.2, 2.2, 2.2, 2.1, 2, 1.9, 1.7, 1.4, 1, 0.6, 0.3, 0.1],
  // Long-haul: departures all day and into the late evening (overnight flights arrive in the morning).
  long: [0.2, 0.2, 0.1, 0.1, 0.1, 0.3, 0.8, 1, 1.2, 1.3, 1.4, 1.4, 1.4, 1.4, 1.4, 1.4, 1.4, 1.5, 1.6, 1.7, 1.8, 1.8, 1.5, 0.8],
};
const normalized = (xs: number[]) => {
  const sum = xs.reduce((s, x) => s + x, 0);
  return xs.map((x) => x / sum);
};
const WISH = { business: normalized(DEPARTURE_WISH.business), leisure: normalized(DEPARTURE_WISH.leisure), long: normalized(DEPARTURE_WISH.long) };

/** Decision window (hours either side of the wished time where any flight is fine) and how fast appeal fades beyond. */
const WINDOW_H: Record<Segment, { window: number; fade: number }> = {
  business: { window: 1, fade: 1.5 },
  leisure: { window: 3, fade: 3 },
};
/** Long-haul travellers plan their trip around the few flights there are (Phase 6.1): much wider windows. */
const WINDOW_LONG_H: Record<Segment, { window: number; fade: number }> = {
  business: { window: 3, fade: 4 },
  leisure: { window: 6, fade: 6 },
};
const windowOf = (segment: Segment, longHaul: boolean) => (longHaul ? WINDOW_LONG_H : WINDOW_H)[segment];

/** Demand by day of the week (Monday first): business peaks Monday/Thursday/Friday, leisure Friday–Sunday. */
const WEEKDAY: Record<Segment, number[]> = {
  business: normalized([1.15, 1.0, 1.0, 1.1, 1.1, 0.55, 0.9]).map((x) => x * 7),
  leisure: normalized([0.95, 0.85, 0.85, 1.0, 1.15, 1.1, 1.15]).map((x) => x * 7),
};
export const weekdayFactor = (segment: Segment, day: number) => WEEKDAY[segment][day]!;

/** Arrivals in the middle of the night are unpopular (no trains, hotels, sleep). */
function arrivalQuality(arrLocal: number, longHaul: boolean): number {
  const m = ((arrLocal % 1440) + 1440) % 1440;
  if (m >= 30 && m < 300) return longHaul ? 0.6 : 0.3;
  if (m >= 1380 || m < 30) return longHaul ? 0.85 : 0.7;
  return 1;
}

/** How appealing a departure `minutesAway` from the wished time is (1 inside the window). */
function displacement(segment: Segment, minutesAway: number, longHaul: boolean): number {
  const { window, fade } = windowOf(segment, longHaul);
  const h = minutesAway / 60;
  return h <= window ? 1 : Math.max(0.05, Math.exp(-(h - window) / fade));
}

/** One non-stop flight of a day from the passengers' point of view. */
export interface DayOption {
  /** Local departure, minutes after midnight (0…1439). */
  dep: number;
  /** Local arrival, minutes after the departure day's midnight at the arrival airport. */
  arr: number;
  /** Appeal from price and speed (1 = market fare, jet speed). */
  pull: number;
  /** Share of this weekday's flights that operate (1 = always; 0.4 for a flight on roughly 2 of 5 such days). */
  weight: number;
  /** Flights of the same airline count together for the frequency effect. */
  group: string;
}

/** Big frequencies attract more than proportionally ("S-curve"): flights × flights^0.3 in total. */
const FREQUENCY_BONUS = 0.3;

/**
 * Share of the day's travellers of one segment that each flight wins (in option order). The rest choose a one-stop
 * connection, worth `connectingPerDay` non-stop flights spread over the day (with `connectingPull` appeal).
 */
export function dayShares(options: readonly DayOption[], segment: Segment, longHaul: boolean, connectingPerDay: number, connectingPull: number): number[] {
  const wish = longHaul ? WISH.long : WISH[segment];
  const groups = new Map<string, number>();
  for (const o of options) groups.set(o.group, (groups.get(o.group) ?? 0) + o.weight);
  const base = options.map((o) => o.pull * o.weight * arrivalQuality(o.arr, longHaul) * Math.max(1, groups.get(o.group)!) ** FREQUENCY_BONUS);
  // A connection is available at any time but counts like a few flights spread evenly over the day.
  const { window, fade } = windowOf(segment, longHaul);
  const connecting = connectingPull * connectingPerDay ** (1 + FREQUENCY_BONUS) * ((2 * window + 2 * fade) / 24);
  const shares = options.map(() => 0);
  const u = options.map(() => 0);
  for (let h = 0; h < 24; h++) {
    const p = wish[h]!;
    if (p === 0) continue;
    const wished = h * 60 + 30;
    let sum = connecting;
    for (let i = 0; i < options.length; i++) {
      const d = Math.abs(options[i]!.dep - wished);
      u[i] = base[i]! * displacement(segment, Math.min(d, 1440 - d), longHaul);
      sum += u[i]!;
    }
    for (let i = 0; i < options.length; i++) shares[i]! += (p * u[i]!) / sum;
  }
  return shares;
}

// ─── Generated timetables (competitors, forecasts without a timetable) ────────────

/** Typical local departure times from an airline's home airport for `count` daily flights (minutes after midnight). */
export function homeDepartures(count: number, seed: number, longHaul: boolean, eastbound: boolean): number[] {
  const jitter = ((seed % 7) - 3) * 5;
  const round5 = (m: number) => Math.round(m / 5) * 5;
  if (longHaul) {
    // Europe → Asia leaves in the afternoon/evening (arrives next morning), westbound late morning.
    const first = eastbound ? 13 * 60 + 30 : 10 * 60 + 45;
    return Array.from({ length: count }, (_, i) => round5((first + i * 240 + jitter) % 1440));
  }
  if (count === 1) return [round5(7 * 60 + jitter)];
  if (count === 2) return [round5(7 * 60 + jitter), round5(17 * 60 + 30 + jitter)];
  const first = 6 * 60 + 30;
  const last = 20 * 60 + 30;
  return Array.from({ length: count }, (_, i) => round5(first + ((last - first) * i) / (count - 1) + jitter));
}

/** Splits weekly flights into daily ones: 10 a week = one every day plus a second on 3 of 7 days. */
export function dailyWeights(weekly: number): number[] {
  const perDay = Math.max(0, weekly) / 7;
  if (perDay <= 0) return [];
  const n = Math.ceil(perDay - 1e-9);
  return Array.from({ length: n }, (_, i) => (i < n - 1 ? 1 : perDay - (n - 1)));
}

/** True when the route heads east (longitude difference taken the short way round). */
export function isEastbound(from: Airport, to: Airport): boolean {
  const d = ((to.lon - from.lon + 540) % 360) - 180;
  return d > 0;
}

/** A stable small number from a text (for jitter in generated timetables). */
export function seedOf(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export const DAYS_ALL = 0b1111111;
export const dayBit = (day: number) => 1 << day;
export const hasDay = (days: number, day: number) => (days & (1 << day)) !== 0;
export const dayCount = (days: number) => [0, 1, 2, 3, 4, 5, 6].filter((d) => hasDay(days, d)).length;

/** Minutes into a day (0…1439) and the number of days it moved (−1, 0, +1 …). */
export function wrapDay(minutes: number): { min: number; shift: number } {
  const shift = Math.floor(minutes / 1440);
  return { min: minutes - shift * 1440, shift };
}

/** Moves a set of weekdays by `shift` days (a return flight after midnight operates on the following weekdays). */
export function shiftDays(days: number, shift: number): number {
  const s = ((shift % 7) + 7) % 7;
  return ((days << s) | (days >> (7 - s))) & DAYS_ALL;
}

/** `count` weekdays spread over the week (3 → Mon, Wed, Fri-ish). */
export function spreadDays(count: number): number {
  let days = 0;
  for (let i = 0; i < Math.min(7, count); i++) days |= dayBit(Math.floor((i * 7) / Math.min(7, count)));
  return days;
}

// Reputation (Phase 2): what passengers think of an airline. Every passenger rates the trip (seat compared with what
// the class normally offers, the aircraft's age, value for money, how crowded it was); these ratings move each class's
// score and the brand's score slowly, week by week, like reviews and word of mouth do. Awareness is how well known the
// airline is in its markets: it grows with the passengers it carries. Punctuality and service join in Phase 9.
import { CLASSES, START_AWARENESS, START_REPUTATION } from './cabins';
import type { CabinClass, ExperienceSums, Reputation } from './state';
import type { SimTime } from './time';

/** Share of the gap to last week's experience that a class rating closes each week (half-life ≈ 8 weeks). */
const CLASS_STEP = 0.08;
/** The brand moves more slowly (half-life ≈ 11 weeks). */
const BRAND_STEP = 0.06;
/** Awareness grows faster than it fades. */
const AWARENESS_UP = 0.05;
const AWARENESS_DOWN = 0.02;
/** Weekly passengers at which an airline is known by almost everybody in its markets. */
const WELL_KNOWN_PAX = 40_000;
const MAX_HISTORY = 104;

export const newReputation = (awareness = START_AWARENESS): Reputation => ({
  score: START_REPUTATION,
  classes: {},
  awareness,
  week: {},
  lastWeek: {},
  history: [],
});

const emptySums = (): ExperienceSums => ({ pax: 0, product: 0, age: 0, value: 0, crowd: 0 });

/** Adds passengers' experience (sums × passengers) into the running week. */
export function addExperience(rep: Reputation, experience: Partial<Record<CabinClass, ExperienceSums>>): void {
  for (const cls of CLASSES) {
    const e = experience[cls];
    if (!e || e.pax <= 0) continue;
    const w = (rep.week[cls] ??= emptySums());
    w.pax += e.pax;
    w.product += e.product;
    w.age += e.age;
    w.value += e.value;
    w.crowd += e.crowd;
    if (e.disruption) w.disruption = (w.disruption ?? 0) + e.disruption;
  }
}

/** Average rating (0–100) of a week's passengers in one class: 60 = as expected. */
export function ratingOf(e: ExperienceSums): number {
  if (e.pax <= 0) return START_REPUTATION;
  return Math.min(100, Math.max(0, START_REPUTATION + (e.product + e.age + e.value + e.crowd + (e.disruption ?? 0)) / e.pax));
}

/** Where awareness is heading with this many passengers a week (0.25 for a tiny airline, 1 for a big one). */
export const awarenessTarget = (weeklyPax: number): number => Math.min(1, 0.25 + Math.sqrt(Math.max(0, weeklyPax) / WELL_KNOWN_PAX));

/** Monday: last week's ratings move the scores; the week is filed for the screen. */
export function closeReputationWeek(rep: Reputation, weekStart: SimTime): void {
  let pax = 0;
  let weighted = 0;
  for (const cls of CLASSES) {
    const e = rep.week[cls];
    if (!e || e.pax <= 0) continue;
    const rating = ratingOf(e);
    const before = rep.classes[cls];
    rep.classes[cls] = before === undefined ? START_REPUTATION + (rating - START_REPUTATION) * 0.3 : before + CLASS_STEP * (rating - before);
    pax += e.pax;
    weighted += e.pax * rating;
  }
  if (pax > 0) rep.score += BRAND_STEP * (weighted / pax - rep.score);
  const target = awarenessTarget(pax);
  rep.awareness += (target > rep.awareness ? AWARENESS_UP : AWARENESS_DOWN) * (target - rep.awareness);
  rep.lastWeek = rep.week;
  rep.week = {};
  rep.history.push({ start: weekStart, score: rep.score, awareness: rep.awareness });
  if (rep.history.length > MAX_HISTORY) rep.history.splice(0, rep.history.length - MAX_HISTORY);
}

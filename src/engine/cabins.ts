// Cabins (Phase 2): classes, seat products and seat pitch; how much fits into an aircraft; what a refit costs; and
// how passengers rate a seat. Real airlines decide their layouts row by row, so we do too: each class has a seat
// product (e.g. full-flat business), a pitch in inches (the distance from one seat to the same point on the seat in
// front) and a number of seats. The aircraft's cabin length and its certified exit limit decide what fits.
//
// Geometry and seat counts follow manufacturers' typical layouts (Airport Planning documents); seat scores, prices and
// refit times are rough industry figures from trade-press reporting, marked "modelled" (docs/DATA_SOURCES.md).
import type { AircraftType } from '../data/aircraft';
import type { BusinessModel } from './realAirlines';
import type { CabinClass, CabinLayout, CabinSection, ClassFares, SeatProduct } from './state';

export type { CabinClass, CabinLayout, CabinSection, ClassFares, SeatProduct } from './state';

/** Front to back. */
export const CLASSES: readonly CabinClass[] = ['F', 'J', 'W', 'Y'];
const RANK: Record<CabinClass, number> = { Y: 0, W: 1, J: 2, F: 3 };

/** Every product with its class, pitch range (inches) and installed price per seat (USD, modelled). */
export const PRODUCTS: Record<SeatProduct, { cls: CabinClass; pitch: [number, number]; priceUsd: number }> = {
  economy: { cls: 'Y', pitch: [28, 34], priceUsd: 4_000 },
  premium: { cls: 'W', pitch: [34, 42], priceUsd: 18_000 },
  // European business: an economy seat with the middle seat kept free (movable divider, same seats).
  euro: { cls: 'J', pitch: [29, 34], priceUsd: 4_000 },
  recliner: { cls: 'J', pitch: [36, 62], priceUsd: 35_000 },
  angled: { cls: 'J', pitch: [55, 66], priceUsd: 120_000 },
  // Full-flat seats are staggered or in a herringbone, so they nest: their "pitch" is shorter than the bed.
  flat: { cls: 'J', pitch: [42, 80], priceUsd: 250_000 },
  suite: { cls: 'F', pitch: [78, 90], priceUsd: 600_000 },
};

export const PRODUCTS_OF: Record<CabinClass, SeatProduct[]> = {
  F: ['suite'],
  J: ['euro', 'recliner', 'angled', 'flat'],
  W: ['premium'],
  Y: ['economy'],
};

/** Galleys, closets and a divider between classes take some cabin length (inches). */
export const CLASS_DIVIDER_IN = 30;
/** Pitch at which an aircraft's maximum (exit-limit) seating is usually reached. */
const DENSE_PITCH_IN = 29;

const isWide = (type: AircraftType) => type.category === 'widebody';

/** Economy seats per row (e.g. 3-3 = 6 on an A320, 3-3-3 = 9 on a 787). */
export function economyAbreast(type: AircraftType): number {
  const id = type.id;
  if (isWide(type)) {
    if (/^B76/.test(id)) return 7;
    if (/^(A30|A31|A33|A34)/.test(id)) return 8;
    if (/^(B77|B74|A38)/.test(id)) return 10;
    return 9;
  }
  if (type.category === 'narrowbody') return /^(BCS|B712|MD8)/.test(id) ? 5 : 6;
  if (type.category === 'regional') {
    if (/^(E1|E35|E45)/.test(id)) return 3;
    if (/^(SU95|AJ27|F100|RJ1H)/.test(id)) return 5;
    return 4;
  }
  return type.seats.max <= 13 ? 2 : type.seats.max <= 40 ? 3 : 4;
}

/** Seats per row of a product on this aircraft; 0 = the product doesn't fit this aircraft. */
export function abreast(type: AircraftType, product: SeatProduct): number {
  const y = economyAbreast(type);
  const wide = isWide(type);
  switch (product) {
    case 'economy':
      return y;
    case 'premium':
      return wide ? (y >= 9 ? y - 2 : y - 1) : y;
    case 'euro':
      return wide || y < 3 ? 0 : y >= 5 ? 4 : y - 1;
    case 'recliner':
      return y < 3 ? 0 : wide ? (y >= 9 ? 7 : 6) : y >= 5 ? 4 : y - 1;
    case 'angled':
      return y < 5 ? 0 : wide ? (y >= 8 ? 6 : 5) : 4;
    case 'flat':
      return y < 5 ? 0 : wide ? (y >= 8 ? 4 : 3) : 4;
    case 'suite':
      return wide ? (y >= 9 ? 4 : 3) : 0;
  }
}

/** Usable cabin length in inches: the rows of the densest certified layout. */
export const cabinLengthIn = (type: AircraftType): number => Math.ceil(type.seats.max / economyAbreast(type)) * DENSE_PITCH_IN;

export const rowsOf = (type: AircraftType, s: Pick<CabinSection, 'product' | 'seats'>): number =>
  Math.ceil(s.seats / Math.max(1, abreast(type, s.product)));

/** A divider (bulkhead, galley or closet) behind a class; European business only has a movable curtain. */
const dividerIn = (s: Pick<CabinSection, 'product'>): number => (s.product === 'euro' ? 0 : CLASS_DIVIDER_IN);

/** Inches the layout takes (rows × pitch, plus dividers between classes). */
export function usedLengthIn(type: AircraftType, cabin: CabinLayout): number {
  const sections = cabin.filter((s) => s.seats > 0);
  return sections.reduce((sum, s, i) => sum + rowsOf(type, s) * s.pitch + (i < sections.length - 1 ? dividerIn(s) : 0), 0);
}

export const totalSeats = (cabin: CabinLayout): number => cabin.reduce((sum, s) => sum + s.seats, 0);
export const seatsOf = (cabin: CabinLayout, cls: CabinClass): number => cabin.find((s) => s.cls === cls)?.seats ?? 0;

export type CabinError = 'cabinEmpty' | 'cabinOrder' | 'productInvalid' | 'pitchInvalid' | 'seatsInvalid' | 'cabinTooLong' | 'exitLimit';

/** Checks a layout against the aircraft: products, pitch ranges, length and the exit limit. */
export function validateCabin(type: AircraftType, cabin: CabinLayout): CabinError | null {
  if (!cabin.length || totalSeats(cabin) <= 0) return 'cabinEmpty';
  for (let i = 0; i < cabin.length; i++) {
    const s = cabin[i]!;
    if (i > 0 && RANK[cabin[i - 1]!.cls] <= RANK[s.cls]) return 'cabinOrder';
    const p = PRODUCTS[s.product];
    if (!p || p.cls !== s.cls || abreast(type, s.product) === 0) return 'productInvalid';
    if (!Number.isInteger(s.pitch) || s.pitch < p.pitch[0] || s.pitch > p.pitch[1]) return 'pitchInvalid';
    if (!Number.isInteger(s.seats) || s.seats < 1) return 'seatsInvalid';
  }
  if (totalSeats(cabin) > type.seats.max) return 'exitLimit';
  if (usedLengthIn(type, cabin) > cabinLengthIn(type)) return 'cabinTooLong';
  return null;
}

// ─── Standard layouts ─────────────────────────────────────────────────────────────

export type CabinStyle = 'dense' | 'single' | 'twoShort' | 'twoLong' | 'threeLong' | 'fourLong';

/** The styles that make sense for this aircraft (presets in the cabin editor, lessors' layouts). */
export function stylesFor(type: AircraftType): CabinStyle[] {
  if (isWide(type)) return type.seats.max >= 400 ? ['dense', 'single', 'twoLong', 'threeLong', 'fourLong'] : ['dense', 'single', 'twoLong', 'threeLong'];
  const y = economyAbreast(type);
  if (y < 3) return ['single'];
  if (type.category === 'narrowbody' && type.rangeKm >= 7000) return ['dense', 'single', 'twoShort', 'twoLong'];
  return ['dense', 'single', 'twoShort'];
}

/** A typical layout of a given style, filling the rest of the cabin with economy. */
export function standardCabin(type: AircraftType, style: CabinStyle): CabinLayout {
  const wide = isWide(type);
  const front: CabinSection[] = [];
  const rows = (share: number, product: SeatProduct, min: number) => Math.max(min, Math.round((type.seats.typical * share) / abreast(type, product)));
  const add = (cls: CabinClass, product: SeatProduct, pitch: number, r: number) => front.push({ cls, product, pitch, seats: r * abreast(type, product) });
  let yPitch = wide ? 31 : 30;
  switch (style) {
    case 'dense':
      yPitch = wide ? 30 : 28;
      break;
    case 'single':
      break;
    case 'twoShort':
      add('J', 'euro', 31, rows(0.12, 'euro', 2));
      break;
    case 'twoLong':
      if (wide) add('J', 'flat', 46, rows(0.1, 'flat', 3));
      else add('J', 'flat', 46, rows(0.08, 'flat', 2));
      break;
    case 'threeLong':
      add('J', 'flat', 46, rows(0.095, 'flat', 3));
      add('W', 'premium', 38, rows(0.07, 'premium', 2));
      break;
    case 'fourLong':
      add('F', 'suite', 82, 2);
      add('J', 'flat', 46, rows(0.12, 'flat', 4));
      add('W', 'premium', 38, rows(0.07, 'premium', 2));
      break;
  }
  return fillEconomy(type, front, yPitch);
}

/** Adds as many economy rows at `pitch` as fit behind the premium cabins (within the exit limit). */
export function fillEconomy(type: AircraftType, front: CabinLayout, pitch: number): CabinLayout {
  const y = economyAbreast(type);
  const used = usedLengthIn(type, front) + (front.length ? dividerIn(front[front.length - 1]!) : 0);
  const byLength = Math.floor((cabinLengthIn(type) - used) / pitch) * y;
  const seats = Math.max(0, Math.min(byLength, type.seats.max - totalSeats(front)));
  return seats > 0 ? [...front, { cls: 'Y', product: 'economy', pitch, seats }] : front;
}

/**
 * Makes a layout fit the cabin, keeping the premium cabins: economy pitch down to 29", then economy rows dropped
 * (premium rows only when no economy is left). Real counts include seats blocked in European business, so the
 * sellable seats come out a little lower.
 */
export function fitCabin(type: AircraftType, cabin: CabinLayout): CabinLayout {
  const fits = (c: CabinLayout) => usedLengthIn(type, c) <= cabinLengthIn(type);
  if (fits(cabin)) return cabin;
  const c = cabin.map((s) => (s.cls === 'Y' ? { ...s, pitch: Math.min(s.pitch, 29) } : { ...s }));
  for (const s of [...c].reverse()) {
    const row = s.cls === 'Y' ? economyAbreast(type) : abreast(type, s.product);
    while (!fits(c) && s.seats > row) s.seats -= row;
  }
  return c;
}

/** An all-economy layout with exactly `seats` seats at the most generous pitch that fits (older saves, AI aircraft). */
export function economyCabin(type: AircraftType, seats: number): CabinLayout {
  const n = Math.max(1, Math.min(seats, type.seats.max));
  const rows = Math.ceil(n / economyAbreast(type));
  const pitch = Math.max(28, Math.min(34, Math.floor(cabinLengthIn(type) / rows)));
  return [{ cls: 'Y', product: 'economy', pitch, seats: n }];
}

/** The layout an airline of this type typically flies (competitors and AI airlines; modelled). */
export function modelCabin(type: AircraftType, model: BusinessModel, longHaul: boolean): CabinLayout {
  const styles = stylesFor(type);
  const pick = (...wanted: CabinStyle[]) => wanted.find((s) => styles.includes(s)) ?? 'single';
  switch (model) {
    case 'lowcost':
      return standardCabin(type, pick('dense'));
    case 'legacy':
      return standardCabin(type, longHaul ? pick('threeLong', 'twoLong', 'twoShort') : pick('twoShort'));
    case 'charter':
      return standardCabin(type, longHaul ? pick('single') : pick('dense'));
    case 'regional':
      return standardCabin(type, 'single');
  }
}

/** Short summary like "J20 Y150" (front to back). */
export const cabinCode = (cabin: CabinLayout): string => cabin.map((s) => `${s.cls}${s.seats}`).join(' ');

// ─── Refits ──────────────────────────────────────────────────────────────────────

export interface RefitQuote {
  /** USD. */
  costUsd: number;
  days: number;
  /** New seats installed (the rest are kept, maybe moved to another pitch). */
  newSeats: number;
}

/**
 * What changing the layout costs: new seats where a class gets a different product or more seats, moving seat
 * tracks otherwise, plus engineering and certification work. Wide-bodies take weeks, narrow-bodies days.
 */
export function refitQuote(type: AircraftType, from: CabinLayout, to: CabinLayout, level = 1): RefitQuote {
  const same = JSON.stringify(from) === JSON.stringify(to);
  if (same) return { costUsd: 0, days: 0, newSeats: 0 };
  const wide = isWide(type);
  let newSeats = 0;
  let cost = 0;
  // Old seats that can be reused (an economy seat is an economy seat, a euro-business seat too).
  const pool = new Map<string, number>();
  const kind = (p: SeatProduct) => (p === 'euro' ? 'economy' : p);
  for (const s of from) pool.set(kind(s.product), (pool.get(kind(s.product)) ?? 0) + s.seats);
  for (const s of to) {
    const k = kind(s.product);
    const reused = Math.min(s.seats, pool.get(k) ?? 0);
    pool.set(k, (pool.get(k) ?? 0) - reused);
    const fresh = s.seats - reused;
    newSeats += fresh;
    cost += fresh * PRODUCTS[s.product].priceUsd;
  }
  // Premium seats need new monuments (galleys, closets) and more certification work.
  const premiumWork = newSeats > 0 && to.some((s) => kind(s.product) !== 'economy');
  const moved = totalSeats(to) - newSeats;
  cost += moved * 150 + (wide ? 150_000 : 40_000);
  const days = newSeats === 0 ? (wide ? 4 : 2) : Math.min(45, Math.ceil((wide ? 10 : 4) + newSeats / (wide ? 25 : 40) + (premiumWork ? (wide ? 4 : 1) : 0)));
  // `level`: prices of the time in historical games (then-year dollars per today's dollar).
  return { costUsd: Math.round((cost * level) / 1000) * 1000, days, newSeats };
}

/** Refits are written off over this many years (or until the lease ends, if sooner). */
export const REFIT_DEPRECIATION_YEARS = 6;

// ─── Passengers and seats ────────────────────────────────────────────────────────

export type Segment = 'business' | 'leisure';

/** 0 on short routes (≤ 1,500 km), 1 on long-haul (≥ 5,000 km): products and fares move between the two. */
export const haul = (km: number): number => Math.min(1, Math.max(0, (km - 1500) / 3500));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Share of a segment's travellers who would buy each class at its market fare. */
export function classDemandShare(segment: Segment, cls: CabinClass, t: number): number {
  const premium =
    segment === 'business'
      ? { F: 0.03 * t, J: 0.15 + 0.25 * t, W: 0.05 + 0.15 * t }
      : { F: 0.002 * t, J: 0.02 + 0.03 * t, W: 0.03 + 0.08 * t };
  if (cls === 'Y') return 1 - premium.F - premium.J - premium.W;
  return premium[cls];
}

/**
 * Market fare of a class relative to the average market fare of the route. Economy pays a bit less than the average
 * on long-haul (the average includes the premium cabins); business costs ~2.5× economy in Europe and ~4.5× long-haul.
 */
export function classFareRatio(cls: CabinClass, t: number): number {
  const y = 1 - 0.2 * t;
  switch (cls) {
    case 'Y':
      return y;
    case 'W':
      return y * (1.4 + 0.4 * t);
    case 'J':
      return y * (2.6 + 1.9 * t);
    case 'F':
      return y * (4 + 4 * t);
  }
}

/**
 * How passengers rate a seat (0–100) on a route of this length. Short flights: almost any seat is fine; long-haul:
 * a bed matters a lot and economy pitch is felt.
 */
export function seatScore(product: SeatProduct, pitch: number, t: number): number {
  let short: number;
  let long: number;
  switch (product) {
    case 'economy':
      short = 62 + 3.5 * (pitch - 30);
      long = 54 + 6 * (pitch - 31);
      break;
    case 'premium':
      short = 72 + 2 * (pitch - 36);
      long = 72 + 3 * (pitch - 38);
      break;
    case 'euro':
      short = 70 + 2 * (pitch - 31);
      long = 45 + 2 * (pitch - 31);
      break;
    case 'recliner':
      short = 80 + 0.5 * (pitch - 38);
      long = 60 + 0.5 * (pitch - 50);
      break;
    case 'angled':
      short = 84;
      long = 75 + 0.5 * (pitch - 60);
      break;
    case 'flat':
      short = 86 + 0.1 * (pitch - 46);
      long = 84 + 0.3 * (pitch - 46);
      break;
    case 'suite':
      short = 90;
      long = 92 + 0.3 * (pitch - 82);
      break;
  }
  return clamp(lerp(short, long, t), 0, 100);
}

/** What passengers expect of a class today (a seat at this score is "as expected"). */
export function expectedScore(cls: CabinClass, t: number): number {
  return { Y: lerp(62, 54, t), W: 72, J: lerp(70, 84, t), F: 92 }[cls];
}

/** How strongly a better or worse seat changes the choice. */
const seatSensitivity = (segment: Segment, t: number) => (segment === 'business' ? 1 + t : 0.5 + 0.7 * t);

/** Appeal of a seat relative to what the class normally offers (1 = as expected). */
export function seatAppeal(segment: Segment, section: Pick<CabinSection, 'cls' | 'product' | 'pitch'>, t: number): number {
  const diff = seatScore(section.product, section.pitch, t) - expectedScore(section.cls, t);
  return clamp(1 + (seatSensitivity(segment, t) * diff) / 100, 0.5, 1.6);
}

/**
 * Appeal of class `got` for a traveller who wants class `wanted`. Flying one class lower is acceptable on a short
 * flight but not overnight; paying for a higher class is rare.
 */
export function classFit(wanted: CabinClass, got: CabinClass, t: number): number {
  const d = RANK[wanted] - RANK[got];
  if (d === 0) return 1;
  if (d < 0) return d === -1 ? 0.1 : 0.02;
  if (d === 1) return lerp(0.85, 0.6, t);
  if (d === 2) return lerp(0.65, 0.3, t);
  return 0.2;
}

/** Brand reputation of real airlines by type (0–100; modelled: no open ratings data exists). */
export const MODEL_REPUTATION: Record<BusinessModel, number> = { legacy: 64, lowcost: 56, regional: 60, charter: 56 };
/** A new airline starts neutral: nobody has flown it yet. */
export const START_REPUTATION = 60;
export const START_AWARENESS = 0.2;

/** Appeal from brand reputation and awareness (1 = a well-known airline with reputation 60). */
export function brandAppeal(segment: Segment, reputation: number, awareness: number): number {
  const k = segment === 'business' ? 0.8 : 0.5;
  return (1 + (k * (reputation - 60)) / 100) * (0.85 + 0.15 * clamp(awareness, 0, 1));
}

/** Fare factor of each class on a route (economy = the route's fare slider). */
export function fareFactorOf(cls: CabinClass, economy: number, fares: ClassFares | undefined): number {
  return cls === 'Y' ? economy : (fares?.[cls] ?? 1);
}

export const DEFAULT_CLASS_FARES: ClassFares = { W: 1, J: 1, F: 1 };

/** In-flight service (catering, amenities) and lounge access per passenger, USD (modelled). */
export function serviceCostUsd(cls: CabinClass, t: number): number {
  return { Y: 2 + 13 * t, W: 8 + 22 * t, J: 50 + 120 * t, F: 105 + 280 * t }[cls];
}

/** Extra cabin crew members per flight for premium service on wide-bodies. */
export function premiumCrew(type: AircraftType, cabin: CabinLayout): number {
  if (!isWide(type)) return 0;
  return Math.ceil(seatsOf(cabin, 'J') / 20) + Math.ceil(seatsOf(cabin, 'F') / 8);
}

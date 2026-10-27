// The aircraft lease market: lessors offer used aircraft that a startup can lease.
// Offers appear and expire every month. Rents depend on type and age, like in reality.
import { AIRCRAFT_TYPES, isFreighter, isInService, type AircraftType } from '../data/aircraft';
import { standardCabin, stylesFor, totalSeats, type CabinStyle } from './cabins';
import { nextId } from './core';
import { money } from './money';
import { pick, random, randomInt } from './rng';
import type { GameState, LeaseOffer } from './state';
import { startOfNextMonth, yearOf, type SimTime } from './time';

/** How many offers the market holds after each monthly refresh. */
export const MARKET_SIZE = 36;
/** Lessors rarely place aircraft older than this with a new airline. */
const MAX_AGE_YEARS = 20;

// The world's biggest aircraft lessors (public companies; names used as facts only).
const LESSORS = [
  'AerCap', 'SMBC Aviation Capital', 'Avolon', 'Air Lease', 'BOC Aviation', 'Aviation Capital Group',
  'CDB Aviation', 'Carlyle Aviation', 'ICBC Leasing', 'Jackson Square Aviation',
];
const LESSOR_WEIGHTS = [10, 7, 6, 6, 5, 3, 3, 3, 3, 2];

/** Lease value relative to a new aircraft: loses ~4 % of the new rent per year, floor 30 %. */
const ageFactor = (age: number) => Math.max(0.3, 1 - 0.04 * age);

/** Typical monthly rent in USD for an aircraft of this type and age. */
export function typicalRentUsd(type: AircraftType, age: number): number {
  return (type.lease.usdK * 1000 * ageFactor(age)) / ageFactor(type.lease.ageYears);
}

/** Build years a used aircraft of this type could have in `year` (at least one year old). */
function buildYears(type: AircraftType, year: number): [number, number] | null {
  const from = Math.max(type.built[0], year - MAX_AGE_YEARS);
  const to = Math.min(type.built[1] ?? year - 1, year - 1);
  return from <= to ? [from, to] : null;
}

function makeOffer(state: GameState, type: AircraftType, now: SimTime): LeaseOffer {
  const year = yearOf(now);
  const [from, to] = buildYears(type, year)!;
  const builtYear = randomInt(state, from, to);
  const age = year - builtYear;
  const rent = Math.round((typicalRentUsd(type, age) * (0.92 + random(state) * 0.16)) / 1000) * 1000;
  const wide = type.category === 'widebody';
  // Deposit: usually 2–3 months of rent, held by the lessor until the aircraft is returned.
  const depositMonths = wide ? 3 : 2;
  const termMonths = age < 5 ? randomInt(state, 8, 12) * 12 : randomInt(state, 3, 8) * 12;
  // Used aircraft need paperwork, a repaint and crew conversion before they fly for you.
  const deliveryDays = wide ? randomInt(state, 45, 110) : randomInt(state, 30, 80);
  // The layout of the previous operator (a low-cost airline, a network carrier …).
  const cabin = standardCabin(type, lessorStyle(state, type));
  let expiresAt = startOfNextMonth(now);
  for (let extra = randomInt(state, 0, 2); extra > 0; extra--) expiresAt = startOfNextMonth(expiresAt);
  return {
    id: nextId(state, 'L'),
    typeId: type.id,
    lessor: pick(state, LESSORS, LESSOR_WEIGHTS),
    builtYear,
    seats: totalSeats(cabin),
    cabin,
    monthlyRent: money(rent, 'USD'),
    deposit: money(rent * depositMonths, 'USD'),
    termMonths,
    deliveryDays,
    expiresAt,
  };
}

/** Which layout a used aircraft comes with: what its previous operators typically flew. */
function lessorStyle(state: GameState, type: AircraftType): CabinStyle {
  const styles = stylesFor(type);
  const weights = styles.map((s) => ({ dense: 2, single: 3, twoShort: 4, twoLong: 2, threeLong: 5, fourLong: 1 })[s]);
  return pick(state, styles, weights);
}

/** Removes expired offers and adds new ones until the market is full again. */
export function refreshMarket(state: GameState): void {
  const now = state.time;
  const year = yearOf(now);
  state.market.offers = state.market.offers.filter((o) => o.expiresAt > now);
  // Passenger aircraft only: cargo operations come in a later phase.
  const types = AIRCRAFT_TYPES.filter((t) => !isFreighter(t) && isInService(t, year) && buildYears(t, year));
  if (!types.length) return;
  // Common types show up more often, but rare ones still appear (square root of fleet size).
  const weights = types.map((t) => Math.sqrt(t.fleetWeight));
  while (state.market.offers.length < MARKET_SIZE) {
    state.market.offers.push(makeOffer(state, pick(state, types, weights), now));
  }
}

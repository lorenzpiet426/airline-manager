// The aircraft lease market: lessors offer used aircraft that a startup can lease.
// Offers appear and expire every month. Rents depend on type and age, like in reality.
import { AIRCRAFT_TYPES, isFreighter, isInService, PRICE_YEAR, type AircraftType } from '../data/aircraft';
import { usdInYear } from '../data/inflation';
import { priceLevel } from '../data/eras';
import { standardCabin, stylesFor, totalSeats, type CabinStyle } from './cabins';
import { nextId } from './core';
import { money } from './money';
import { pick, random, randomInt } from './rng';
import type { GameState, LeaseOffer, SaleOffer } from './state';
import { behindIronCurtain, marketValueUsd } from '../data/factory';
import { startOfNextMonth, yearOf, type SimTime } from './time';

/** How many offers the market holds after each monthly refresh. */
export const MARKET_SIZE = 36;
/** Used aircraft for sale (Phase 4.1). */
export const SALES_SIZE = 24;
/** Share of lease offers that are new aircraft from a lessor's own factory orders (arriving in months, not days). */
const NEW_LEASE_SHARE = 0.15;
/** Lessors rarely place aircraft older than this with a new airline. */
const MAX_AGE_YEARS = 20;

// The world's biggest aircraft lessors with the years they did business under that name (public companies; names
// used as facts only; years from their Wikipedia articles). Before the leasing companies of the 1970s, used aircraft
// came from other airlines.
const LESSOR_LIST: { name: string; weight: number; from: number; to?: number }[] = [
  { name: 'AerCap', weight: 10, from: 2005 },
  { name: 'SMBC Aviation Capital', weight: 7, from: 2012 },
  { name: 'Avolon', weight: 6, from: 2010 },
  { name: 'Air Lease', weight: 6, from: 2010 },
  { name: 'BOC Aviation', weight: 5, from: 1993 },
  { name: 'Aviation Capital Group', weight: 3, from: 1989 },
  { name: 'CDB Aviation', weight: 3, from: 2006 },
  { name: 'Carlyle Aviation', weight: 3, from: 2015 },
  { name: 'ICBC Leasing', weight: 3, from: 2007 },
  { name: 'Jackson Square Aviation', weight: 2, from: 2010 },
  { name: 'ILFC', weight: 10, from: 1973, to: 2014 },
  { name: 'GPA Group', weight: 8, from: 1975, to: 1993 },
  { name: 'Polaris Aircraft Leasing', weight: 4, from: 1974, to: 1997 },
  { name: 'GECAS', weight: 9, from: 1993, to: 2021 },
  { name: 'AWAS', weight: 4, from: 1985, to: 2017 },
  { name: 'Boullioun Aviation Services', weight: 2, from: 1984, to: 2005 },
  { name: 'debis AirFinance', weight: 3, from: 1990, to: 2005 },
  { name: 'Pegasus Aviation', weight: 2, from: 1988, to: 2011 },
  { name: 'Babcock & Brown Aircraft Management', weight: 2, from: 1990, to: 2009 },
  { name: 'RBS Aviation Capital', weight: 4, from: 2001, to: 2012 },
];
/** Before 1975 few leasing companies existed: other airlines sold or leased their used aircraft. */
export const AIRLINE_LESSOR = 'Airline (sublease)';
function lessorsIn(year: number): { names: string[]; weights: number[] } {
  const list = LESSOR_LIST.filter((l) => year >= l.from && year < (l.to ?? 9999));
  const names = [...list.map((l) => l.name), ...(year < 1990 ? [AIRLINE_LESSOR] : [])];
  const weights = [...list.map((l) => l.weight), ...(year < 1990 ? [year < 1975 ? 20 : 6] : [])];
  return { names, weights };
}

/** Lease value relative to a new aircraft: loses ~4 % of the new rent per year, floor 30 %. */
const ageFactor = (age: number) => Math.max(0.3, 1 - 0.04 * age);

/** Typical monthly rent in USD (of `year`, default today's dollars) for an aircraft of this type and age. */
export function typicalRentUsd(type: AircraftType, age: number, year = PRICE_YEAR): number {
  // Historical games: rent from the aircraft's value then (lease rate ≈ 0.8 % of the value a month, more for older
  // aircraft), since the lease data describes today's market (a 737-200 today is a 40-year-old aircraft).
  if (year < PRICE_YEAR) return marketValueUsd(type, age, year) * (0.008 + 0.0004 * age);
  // Historical types store their rate in the money of their time.
  const usd = usdInYear(type.lease.usdK * 1000, type.priceYear ?? PRICE_YEAR, PRICE_YEAR);
  return ((usd * ageFactor(age)) / ageFactor(type.lease.ageYears)) * priceLevel(year);
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
  // Lessors also place brand-new aircraft from their own factory orders: they arrive in 6–30 months.
  const fresh = type.built[1] === null && random(state) < NEW_LEASE_SHARE;
  const freshDays = fresh ? randomInt(state, 180, 900) : 0;
  const builtYear = fresh ? yearOf(now + freshDays * 1440) : randomInt(state, from, to);
  const age = Math.max(0, year - builtYear);
  const rent = Math.round((typicalRentUsd(type, age, year) * (0.92 + random(state) * 0.16)) / 1000) * 1000;
  const wide = type.category === 'widebody';
  // Deposit: usually 2–3 months of rent, held by the lessor until the aircraft is returned.
  const depositMonths = wide ? 3 : 2;
  const termMonths = age < 5 ? randomInt(state, 8, 12) * 12 : randomInt(state, 3, 8) * 12;
  // Used aircraft need paperwork, a repaint and crew conversion before they fly for you.
  const deliveryDays = fresh ? freshDays : wide ? randomInt(state, 45, 110) : randomInt(state, 30, 80);
  // The layout of the previous operator (a low-cost airline, a network carrier …).
  const cabin = standardCabin(type, lessorStyle(state, type));
  let expiresAt = startOfNextMonth(now);
  for (let extra = randomInt(state, 0, 2); extra > 0; extra--) expiresAt = startOfNextMonth(expiresAt);
  return {
    id: nextId(state, 'L'),
    typeId: type.id,
    lessor: pick(state, lessorsIn(year).names, lessorsIn(year).weights),
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

// Aircraft traders and lessors selling used aircraft (company names used as facts only).
const SELLERS = (year: number) => [...lessorsIn(year).names, ...(year >= 1996 ? ['GA Telesis'] : []), ...(year >= 2008 ? ['AerSale'] : []), ...(year >= 1985 ? ['Willis Lease'] : [])];

/** A used aircraft for sale: priced around its market value. */
function makeSale(state: GameState, type: AircraftType, now: SimTime): SaleOffer {
  const year = yearOf(now);
  const [from, to] = buildYears(type, year)!;
  const builtYear = randomInt(state, Math.max(from, year - 25), to);
  const value = marketValueUsd(type, year - builtYear, year);
  const cabin = standardCabin(type, lessorStyle(state, type));
  let expiresAt = startOfNextMonth(now);
  for (let extra = randomInt(state, 0, 2); extra > 0; extra--) expiresAt = startOfNextMonth(expiresAt);
  return {
    id: nextId(state, 'S'),
    typeId: type.id,
    seller: pick(state, SELLERS(year)),
    builtYear,
    seats: totalSeats(cabin),
    cabin,
    priceUsd: Math.round((value * (0.92 + random(state) * 0.16)) / 10_000) * 10_000,
    deliveryDays: type.category === 'widebody' ? randomInt(state, 30, 75) : randomInt(state, 20, 60),
    expiresAt,
  };
}

/** Removes expired offers and adds new ones until the market is full again. */
export function refreshMarket(state: GameState): void {
  const now = state.time;
  const year = yearOf(now);
  state.market.offers = state.market.offers.filter((o) => o.expiresAt > now);
  // Passenger aircraft only: cargo operations come in a later phase.
  const types = AIRCRAFT_TYPES.filter((t) => !isFreighter(t) && isInService(t, year) && buildYears(t, year) && !behindIronCurtain(t, year));
  if (!types.length) return;
  // Common types show up more often, but rare ones still appear (square root of fleet size).
  const weights = types.map((t) => Math.sqrt(t.fleetWeight));
  while (state.market.offers.length < MARKET_SIZE) {
    state.market.offers.push(makeOffer(state, pick(state, types, weights), now));
  }
  state.market.sales = (state.market.sales ?? []).filter((o) => o.expiresAt > now);
  while (state.market.sales.length < SALES_SIZE) {
    state.market.sales.push(makeSale(state, pick(state, types, weights), now));
  }
}

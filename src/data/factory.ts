// Buying aircraft (Phase 4.1): what an airline pays the manufacturer, how long the queue for new aircraft is, and which
// types a new European airline can order at all. All values are modelled from public news reporting (2025–2026):
// manufacturers' own order-and-delivery files may not be reused (docs/DATA_SOURCES.md), so nothing here is copied.
import type { AircraftCategory, AircraftType } from './aircraft';

/**
 * Years from ordering until the first free delivery slot, for orders placed in 2026. Airbus and Boeing narrow-bodies
 * are sold out far ahead (A320neo family backlog ≈ 7,000+ aircraft), wide-bodies a bit less, small types are quick.
 */
const BACKLOG_YEARS: Record<string, number> = {
  A19N: 6.5, A20N: 6.5, A21N: 6.5, 'A21N-XLR': 6.5,
  B37M: 5.5, B38M: 5.5, B39M: 5.5, B3XM: 5.5,
  BCS1: 4, BCS3: 4,
  A338: 3, A339: 3,
  A359: 4, A35K: 4,
  B788: 5, B789: 5, B78X: 5, B779: 5,
  E175: 2.5, E290: 2.5, E295: 2.5,
  AT46: 2, AT76: 2,
  DHC6: 1.5, L410: 1.5, C208: 1, PC12: 1, BE20: 1, C408: 1.5, D228: 1.5, BN2P: 1.5,
};

/** Types still built that a new European airline can't order (reason shown in the game). */
const NOT_FOR_YOU: Record<string, 'sanctions' | 'chinaOnly'> = {
  SU95: 'sanctions', MC21: 'sanctions', T204: 'sanctions',
  C919: 'chinaOnly', AJ27: 'chinaOnly', MA60: 'chinaOnly',
};

/** What airlines really pay compared with the list price (big orders get big discounts). */
const PRICE_SHARE: Record<AircraftCategory, number> = { narrowbody: 0.5, widebody: 0.48, regional: 0.55, turboprop: 0.7 };

/** New aircraft of one type a single airline gets per month at most. */
export const DELIVERIES_PER_MONTH: Record<AircraftCategory, number> = { narrowbody: 2, widebody: 1, regional: 2, turboprop: 2 };

export type OrderBlock = 'notBuilt' | 'freighter' | 'sanctions' | 'chinaOnly' | 'notInService';

/** Can a startup order this type new from the factory in `year`? */
export function orderBlock(type: AircraftType, year: number): OrderBlock | null {
  if (type.payloadT !== undefined) return 'freighter';
  if (type.built[1] !== null) return 'notBuilt';
  const reason = NOT_FOR_YOU[type.id];
  if (reason) return reason;
  if (!(type.id in BACKLOG_YEARS)) return 'notBuilt';
  if (type.eis > year + 6) return 'notInService';
  return null;
}

/** Years until the first free slot (a type that hasn't flown yet can't come before it enters service). */
export function backlogYears(type: AircraftType): number {
  return BACKLOG_YEARS[type.id] ?? 3;
}

/** Price of a new aircraft (USD): list price × typical discount, 1 % more per extra aircraft in the order, up to 8 %. */
export function newPriceUsd(type: AircraftType, count = 1): number {
  const bulk = Math.min(0.08, 0.01 * Math.max(0, count - 1));
  return Math.round(type.listPriceUsdM * 1e6 * PRICE_SHARE[type.category] * (1 - bulk) / 10_000) * 10_000;
}

/**
 * Market value of a used aircraft (USD): the new price falls ≈ 7 % a year; once the type is no longer built, values
 * fall faster (fewer operators, spare parts from scrapped aircraft). Never below what its parts are worth.
 */
export function marketValueUsd(type: AircraftType, ageYears: number, year: number): number {
  const out = type.built[1] !== null ? Math.max(0, year - type.built[1]) : 0;
  const value = newPriceUsd(type) * 0.93 ** Math.max(0, ageYears) * 0.96 ** out;
  return Math.round(Math.max(partsValueUsd(type), value) / 10_000) * 10_000;
}

/** What a scrapyard pays: mostly the engines and parts. */
export const partsValueUsd = (type: AircraftType): number => Math.round((newPriceUsd(type) * 0.06) / 10_000) * 10_000;

/** Owned aircraft are written off over this many years of life to a residual value (airline accounting practice). */
export const USEFUL_LIFE_YEARS = 25;
export const RESIDUAL_SHARE = 0.1;
/** Used aircraft bought old are still written off over at least this many years. */
export const MIN_DEPRECIATION_YEARS = 5;

/**
 * Payments to the manufacturer (shares of the price, by months before delivery): a deposit on signing, pre-delivery
 * payments in the two years before delivery (≈ 30 % in total), the rest on delivery.
 */
export const PAYMENT_PLAN: { monthsBefore: number | 'signing' | 'delivery'; share: number }[] = [
  { monthsBefore: 'signing', share: 0.01 },
  { monthsBefore: 24, share: 0.05 },
  { monthsBefore: 18, share: 0.05 },
  { monthsBefore: 12, share: 0.05 },
  { monthsBefore: 9, share: 0.05 },
  { monthsBefore: 6, share: 0.05 },
  { monthsBefore: 3, share: 0.05 },
  { monthsBefore: 'delivery', share: 0.69 },
];

/** Leaving a lease early: the lessor wants this share of the rent still owed (to find a new airline for it). */
export const EARLY_RETURN_SHARE = 0.6;
/** A lease can be extended from this many months before it ends. */
export const EXTEND_WINDOW_MONTHS = 24;

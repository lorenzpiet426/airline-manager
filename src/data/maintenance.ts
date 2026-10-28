// Maintenance (Phase 4.2): check intervals, how long checks take and what they cost, technical failures, own hangars,
// lessors' maintenance reserves and EU261 compensation. Values are modelled from manufacturers' published maintenance
// planning intervals, MRO industry reporting and the EU Regulation 261/2004 (docs/DATA_SOURCES.md). Modern practice:
// light A-checks overnight, C-checks every 2–3 years, a heavy ("D") structural check every 10–12 years. B-checks were
// merged into the A-checks by the manufacturers' maintenance programmes long ago.
import type { AircraftCategory, AircraftType } from './aircraft';

export type CheckKind = 'A' | 'C' | 'D';
export type HeavyCheck = 'C' | 'D';

export interface CheckProgramme {
  /** A-check: every this many flight hours, or after `aDays` days, whatever comes first. */
  aFh: number;
  aDays: number;
  /** Hours an A-check needs on the ground (done overnight at the hub when the aircraft has the time). */
  aHours: number;
  /** C-check: every this many months or flight hours. */
  cMonths: number;
  cFh: number;
  /** Heavy structural check ("D"), every this many years; it includes a C-check. */
  dYears: number;
  /** Days in the hangar for a mid-life aircraft. */
  cDays: number;
  dDays: number;
  /** MRO prices for a mid-life aircraft (USD). */
  aUsd: number;
  cUsd: number;
  dUsd: number;
}

export const PROGRAMME: Record<AircraftCategory, CheckProgramme> = {
  turboprop: { aFh: 500, aDays: 90, aHours: 6, cMonths: 24, cFh: 5000, dYears: 12, cDays: 6, dDays: 21, aUsd: 6_000, cUsd: 180_000, dUsd: 600_000 },
  regional: { aFh: 750, aDays: 120, aHours: 8, cMonths: 24, cFh: 7500, dYears: 10, cDays: 7, dDays: 25, aUsd: 10_000, cUsd: 280_000, dUsd: 900_000 },
  narrowbody: { aFh: 750, aDays: 120, aHours: 8, cMonths: 36, cFh: 7500, dYears: 12, cDays: 8, dDays: 30, aUsd: 18_000, cUsd: 400_000, dUsd: 1_600_000 },
  widebody: { aFh: 1000, aDays: 120, aHours: 12, cMonths: 36, cFh: 12000, dYears: 12, cDays: 14, dDays: 45, aUsd: 40_000, cUsd: 1_200_000, dUsd: 4_500_000 },
};

/** Maximum take-off weight (t) of the typical type each category's prices are for; bigger types cost more. */
const REFERENCE_MTOW_T: Record<AircraftCategory, number> = { turboprop: 23, regional: 50, narrowbody: 79, widebody: 280 };

/** Flight hours a year of a typical aircraft (for the lessors' reserve rates and the history of used aircraft). */
export const TYPICAL_FH_PER_YEAR: Record<AircraftCategory, number> = { turboprop: 2000, regional: 2600, narrowbody: 3000, widebody: 4500 };

/**
 * Share of the per-block-hour maintenance cost (BTS Form 41, see aircraft.ts) that is airframe checks. The player's
 * aircraft pay these checks one by one, so their hourly cost is lower by this share (engines, components and line
 * maintenance stay hourly). AI airlines keep the full hourly cost.
 */
export const CHECK_SHARE = 0.2;

/** Older aircraft need more work: price and hangar days grow per year of age. */
const AGE_COST = { A: 0.02, C: 0.025, D: 0.04 } as const;
const AGE_DAYS = 0.015;

/** MRO hangar slots are booked weeks ahead; a check moved closer than this costs extra. */
export const SHORT_NOTICE_DAYS = 30;
export const SHORT_NOTICE_PREMIUM = 0.25;
/** The game plans a heavy check this many days before it is due. */
export const PLAN_AHEAD_DAYS = 120;

export interface CheckQuote {
  usd: number;
  days: number;
}

const sizeFactor = (type: AircraftType) => (type.mtowKg / 1000 / REFERENCE_MTOW_T[type.category]) ** 0.6;

/** Price and hangar days of a check at an MRO (before reserves and the own-hangar discount). */
export function checkQuote(type: AircraftType, kind: CheckKind, ageYears: number): CheckQuote {
  const p = PROGRAMME[type.category];
  const base = kind === 'A' ? p.aUsd : kind === 'C' ? p.cUsd : p.dUsd;
  const usd = Math.round((base * sizeFactor(type) * (1 + AGE_COST[kind] * Math.max(0, ageYears))) / 1000) * 1000;
  const days = kind === 'A' ? 1 : Math.round((kind === 'C' ? p.cDays : p.dDays) * (1 + AGE_DAYS * Math.max(0, ageYears)));
  return { usd, days };
}

/**
 * Maintenance reserves for leased aircraft (USD per flight hour): what the lessor collects for the airframe checks,
 * the expected C- and D-check costs spread over a typical aircraft's flying. The lessor pays the checks from them.
 */
export function reserveRateUsd(type: AircraftType): number {
  const p = PROGRAMME[type.category];
  const fh = TYPICAL_FH_PER_YEAR[type.category];
  const c = checkQuote(type, 'C', 10).usd;
  const d = checkQuote(type, 'D', 10).usd;
  return Math.round(c / ((p.cMonths / 12) * fh) + d / (p.dYears * fh));
}

// ─── Own hangars ───────────────────────────────────────────────────────────────

export type HangarSize = 'narrow' | 'wide';

export interface HangarSpec {
  /** Building cost (USD), paid 30 % on signing and 70 % when ready. */
  usd: number;
  /** Aircraft that fit at the same time. */
  bays: number;
  /** Mechanics, tooling, energy per day (USD). */
  runningUsdPerDay: number;
}

export const HANGARS: Record<HangarSize, HangarSpec> = {
  narrow: { usd: 25_000_000, bays: 2, runningUsdPerDay: 6_000 },
  wide: { usd: 60_000_000, bays: 2, runningUsdPerDay: 11_000 },
};
export const HANGAR_BUILD_MONTHS = 18;
export const HANGAR_FIRST_PAYMENT = 0.3;
export const HANGAR_LIFE_YEARS = 30;
/** In its own hangar an airline pays its mechanics and the parts, not an MRO's margin and overheads. */
export const OWN_HANGAR_PRICE_SHARE = 0.55;

/** Which aircraft fit into a hangar. */
export const fitsHangar = (size: HangarSize, category: AircraftCategory) => size === 'wide' || category !== 'widebody';

// ─── Technical failures ────────────────────────────────────────────────────────

/**
 * Chance per departure that a technical problem grounds the aircraft for a mid-life aircraft with recent checks
 * (dispatch reliability ≈ 99.9 % for cancellations). Older aircraft, aircraft close to their next check and types that
 * entered service in the last three years fail more often.
 */
export const FAILURE_PER_DEPARTURE = 0.0008;

export function failureChance(ageYears: number, checkUsed: number, newType: boolean): number {
  const age = 1 + 0.05 * Math.max(0, ageYears - 8);
  const wear = 1 + 0.5 * Math.min(1.5, Math.max(0, checkUsed));
  return FAILURE_PER_DEPARTURE * age * wear * (newType ? 1.6 : 1);
}

/** Repair cost of a failure (USD) for one hour of grounding … grows with the time the parts take to come. */
export const REPAIR_USD: Record<AircraftCategory, number> = { turboprop: 6_000, regional: 10_000, narrowbody: 20_000, widebody: 50_000 };

/** How long a failure grounds the aircraft (hours): mostly hours, sometimes a day or two, rarely days (parts). */
export function failureHours(roll: number, roll2: number): number {
  if (roll < 0.65) return 3 + roll2 * 7;
  if (roll < 0.95) return 18 + roll2 * 22;
  return 72 + roll2 * 48;
}

// ─── Passenger rights (EU 261/2004, UK261) ─────────────────────────────────────

/**
 * Countries where EU 261/2004 (or the UK's copy of it) applies: EU, Iceland, Norway, Switzerland and the UK. It covers
 * every flight leaving these countries and flights into them by an airline from them. A technical problem is not an
 * "extraordinary circumstance" (CJEU C-549/07 Wallentin-Hermann, 2008), so passengers of cancelled flights are owed
 * compensation.
 */
export const EU261_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'RE', 'GP', 'MQ', 'GF', 'YT', 'MF', 'IS', 'NO', 'CH', 'LI', 'GB',
]);

/** Compensation per passenger (EUR) by flight distance (Art. 7). */
export const eu261Eur = (km: number): number => (km <= 1500 ? 250 : km <= 3500 ? 400 : 600);
/** Share of passengers who claim it (many don't, or get rebooked closely enough). */
export const CLAIM_SHARE = 0.5;
/** Meals, calls and hotels for stranded passengers (EUR per passenger): short or overnight disruption. */
export const careEur = (hours: number): number => (hours < 12 ? 40 : 120);

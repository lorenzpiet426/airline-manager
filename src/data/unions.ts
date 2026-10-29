// Unions, wage agreements and strikes (Phase 8.2). Pilots and cabin crew each have a collective agreement per country
// in which the airline employs them. It runs about two years with a peace obligation (no strikes while it runs); talks
// for the next one start a few weeks before it ends, and after that the union may strike. How often and how strikes
// happen differs a lot by country (read 2026-10-29):
//  - Germany: warning strikes after the peace obligation ends, full strikes after a ballot (Urabstimmung); Vereinigung
//    Cockpit and UFO strikes are usually announced 1–2 days ahead.
//  - France: 5 days' notice (préavis), strikers declare 48 h ahead (loi Diard 2012); frequent strikes.
//  - Italy: Law 146/1990 — 10 days' notice, guaranteed flights, no strikes in the summer and Christmas "franchise" periods.
//  - Spain, Portugal: 10 days' notice, minimum services set by the government.
//  - United Kingdom: a ballot first, then 14 days' notice (Trade Union Act 2016, from March 2017; 7 days before).
//  - Austria: social partnership, strikes rare; Austrian Airlines' cockpit and cabin crew (vida) struck in spring 2024,
//    the agreement then signed runs until the end of 2026 with a peace obligation (ORF, vienna.at, April–June 2024).
//  - Switzerland: absolute peace obligation in most agreements, strikes almost never.
//  - USA: Railway Labor Act — a strike only after mediation by the National Mediation Board and a 30-day cooling-off
//    period; very rare.
// EU 261: a strike by the airline's own staff is no "extraordinary circumstance" (CJEU C-28/20 Airhelp v SAS,
// 23 March 2021): passengers get compensation unless told at least 14 days ahead.
import { cpiOf } from './inflation';

export type UnionGroup = 'pilots' | 'cabin';

/** Real union names per country (pilots, cabin crew); other countries use a generic name. */
export const UNION_NAMES: Readonly<Record<string, readonly [string, string]>> = {
  AT: ['vida', 'vida'],
  DE: ['Vereinigung Cockpit', 'UFO'],
  FR: ['SNPL', 'SNPNC'],
  IT: ['ANPAC', 'ANPAV'],
  ES: ['SEPLA', 'USO'],
  PT: ['SPAC', 'SNPVAC'],
  GB: ['BALPA', 'Unite'],
  IE: ['IALPA (Fórsa)', 'Fórsa'],
  BE: ['BeCA', 'CNE'],
  NL: ['VNV', 'VNC'],
  CH: ['Aeropers', 'kapers'],
  SE: ['Svensk Pilotförening', 'Unionen'],
  DK: ['Dansk Pilotforening', 'CAU'],
  NO: ['Norsk Flygerforbund', 'Parat'],
  FI: ['SLL', 'IAU'],
  US: ['ALPA', 'AFA-CWA'],
  CA: ['ALPA', 'CUPE'],
};

export interface StrikeCulture {
  /** How readily unions strike (0 = almost never, 1 = like Germany, above 1 = more). */
  militancy: number;
  /** Days of notice before a strike. */
  noticeDays: number;
  /** Warning strikes (short, partial) allowed before a ballot. */
  warning: boolean;
  /** Share of flights still flown during a strike (guaranteed/minimum services). */
  minimumService: number;
}

const CULTURE: Readonly<Record<string, StrikeCulture>> = {
  AT: { militancy: 0.3, noticeDays: 2, warning: true, minimumService: 0 },
  DE: { militancy: 1.0, noticeDays: 1, warning: true, minimumService: 0 },
  FR: { militancy: 1.3, noticeDays: 5, warning: false, minimumService: 0 },
  IT: { militancy: 1.0, noticeDays: 10, warning: false, minimumService: 0.35 },
  ES: { militancy: 0.9, noticeDays: 10, warning: false, minimumService: 0.35 },
  PT: { militancy: 0.9, noticeDays: 10, warning: false, minimumService: 0.35 },
  GB: { militancy: 0.6, noticeDays: 14, warning: false, minimumService: 0 },
  IE: { militancy: 0.5, noticeDays: 7, warning: false, minimumService: 0 },
  BE: { militancy: 1.0, noticeDays: 7, warning: false, minimumService: 0 },
  NL: { militancy: 0.5, noticeDays: 2, warning: true, minimumService: 0 },
  CH: { militancy: 0.1, noticeDays: 7, warning: false, minimumService: 0 },
  SE: { militancy: 0.5, noticeDays: 7, warning: false, minimumService: 0 },
  DK: { militancy: 0.4, noticeDays: 7, warning: false, minimumService: 0 },
  NO: { militancy: 0.5, noticeDays: 4, warning: false, minimumService: 0 },
  FI: { militancy: 0.7, noticeDays: 14, warning: false, minimumService: 0 },
  GR: { militancy: 1.0, noticeDays: 4, warning: false, minimumService: 0.2 },
  US: { militancy: 0.05, noticeDays: 30, warning: false, minimumService: 0 },
  CA: { militancy: 0.4, noticeDays: 3, warning: false, minimumService: 0 },
};
const DEFAULT_CULTURE: StrikeCulture = { militancy: 0.5, noticeDays: 5, warning: false, minimumService: 0 };

/** The strike rules of a country in a year (UK notice 7 days before 2017). */
export function strikeCulture(country: string, year: number): StrikeCulture {
  const c = CULTURE[country] ?? DEFAULT_CULTURE;
  return country === 'GB' && year < 2017 ? { ...c, noticeDays: 7 } : c;
}

/** Italy's franchise periods without transport strikes (month-day ranges, inclusive). */
export const NO_STRIKE_PERIODS: Readonly<Record<string, readonly (readonly [string, string])[]>> = {
  IT: [['07-27', '09-05'], ['12-17', '12-31'], ['01-01', '01-07']],
};

/** An agreement runs this long; talks start this many weeks before it ends; offers every two weeks. */
export const AGREEMENT_YEARS = 2;
export const TALKS_WEEKS_BEFORE = 10;
export const ROUND_WEEKS = 2;
export const MEDIATION_WEEKS = 3;
/** Share of crew members who stop working in a strike (pilots nearly all; warning strikes last a few hours). */
export const STRIKE_PARTICIPATION: Readonly<Record<UnionGroup, number>> = { pilots: 0.9, cabin: 0.75 };
export const WARNING_SHARE = 0.4;
/** Inflation assumed after the last known year. */
export const FUTURE_INFLATION = 0.025;
/** EU 261 compensation for own-staff strikes from the SAS ruling on (before, airlines treated them as extraordinary). */
export const STRIKE_COMPENSATION_FROM = '2021-03-23';

/** Consumer price inflation in the year before `year` (US CPI; the assumed rate after the data ends). */
export function inflationBefore(year: number): number {
  const a = cpiOf(year - 1);
  const b = cpiOf(year - 2);
  return a === b ? FUTURE_INFLATION : a / b - 1;
}

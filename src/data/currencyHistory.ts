// The old national currencies that the euro replaced (Phase 5.2): the irrevocably fixed conversion rates (Council
// Regulations (EC) 2866/98 and later ones for each new member) and the day each country's money became the euro.
// From that day the old currency's exchange rate is simply the euro's rate × the fixed rate.

export interface LegacyCurrency {
  code: string;
  /** Countries that used it. */
  countries: string[];
  /** Units per 1 euro, fixed for ever. */
  perEur: number;
  /** The day the euro replaced it as the money of account (YYYY-MM-DD); notes and coins followed later. */
  euroFrom: string;
}

export const LEGACY_CURRENCIES: readonly LegacyCurrency[] = [
  { code: 'ATS', countries: ['AT'], perEur: 13.7603, euroFrom: '1999-01-01' },
  { code: 'BEF', countries: ['BE'], perEur: 40.3399, euroFrom: '1999-01-01' },
  { code: 'DEM', countries: ['DE'], perEur: 1.95583, euroFrom: '1999-01-01' },
  { code: 'ESP', countries: ['ES', 'AD'], perEur: 166.386, euroFrom: '1999-01-01' },
  { code: 'FIM', countries: ['FI', 'AX'], perEur: 5.94573, euroFrom: '1999-01-01' },
  { code: 'FRF', countries: ['FR', 'MC', 'RE', 'GP', 'MQ', 'GF', 'YT', 'PM', 'BL', 'MF'], perEur: 6.55957, euroFrom: '1999-01-01' },
  { code: 'IEP', countries: ['IE'], perEur: 0.787564, euroFrom: '1999-01-01' },
  { code: 'ITL', countries: ['IT', 'SM', 'VA'], perEur: 1936.27, euroFrom: '1999-01-01' },
  { code: 'LUF', countries: ['LU'], perEur: 40.3399, euroFrom: '1999-01-01' },
  { code: 'NLG', countries: ['NL'], perEur: 2.20371, euroFrom: '1999-01-01' },
  { code: 'PTE', countries: ['PT'], perEur: 200.482, euroFrom: '1999-01-01' },
  { code: 'GRD', countries: ['GR'], perEur: 340.75, euroFrom: '2001-01-01' },
  { code: 'SIT', countries: ['SI'], perEur: 239.64, euroFrom: '2007-01-01' },
  { code: 'CYP', countries: ['CY'], perEur: 0.585274, euroFrom: '2008-01-01' },
  { code: 'MTL', countries: ['MT'], perEur: 0.4293, euroFrom: '2008-01-01' },
  { code: 'SKK', countries: ['SK'], perEur: 30.126, euroFrom: '2009-01-01' },
  { code: 'EEK', countries: ['EE'], perEur: 15.6466, euroFrom: '2011-01-01' },
  { code: 'LVL', countries: ['LV'], perEur: 0.702804, euroFrom: '2014-01-01' },
  { code: 'LTL', countries: ['LT'], perEur: 3.4528, euroFrom: '2015-01-01' },
  { code: 'HRK', countries: ['HR'], perEur: 7.5345, euroFrom: '2023-01-01' },
  { code: 'BGN', countries: ['BG'], perEur: 1.95583, euroFrom: '2026-01-01' },
];

/** Before the euro existed, its exchange rate is calculated from the Deutsche Mark ("synthetic euro"). */
export const SYNTHETIC_EUR_FROM = 'DEM';

/**
 * Currencies that were re-based ("redenominated") since 1970: the exchange-rate history stores them in today's units,
 * so an old unit is worth `perNew` of them (e.g. 1 new Turkish lira = 1,000,000 old lira). Phase 5.3 keeps the books of
 * historical airlines in the old unit until the day of the change. Sources: the central banks' redenomination laws
 * (Wikipedia articles on each currency).
 */
export interface OldUnit {
  code: string;
  /** Today's currency code it was converted into. */
  next: string;
  countries: string[];
  /** Units of the old currency per unit of `next`. */
  perNew: number;
  /** First day of the new unit (YYYY-MM-DD). */
  until: string;
}

export const OLD_UNITS: readonly OldUnit[] = [
  // Israeli pound → (old) shekel 1980 (÷10) → new shekel 1985 (÷1,000).
  { code: 'ILP', next: 'ILS', countries: ['IL'], perNew: 10_000, until: '1980-02-24' },
  { code: 'ILR', next: 'ILS', countries: ['IL'], perNew: 1_000, until: '1985-09-04' },
  { code: 'ISJ', next: 'ISK', countries: ['IS'], perNew: 100, until: '1981-01-01' },
  { code: 'MXP', next: 'MXN', countries: ['MX'], perNew: 1_000, until: '1993-01-01' },
  { code: 'PLZ', next: 'PLN', countries: ['PL'], perNew: 10_000, until: '1995-01-01' },
  { code: 'BGL', next: 'BGN', countries: ['BG'], perNew: 1_000, until: '1999-07-05' },
  { code: 'TRL', next: 'TRY', countries: ['TR'], perNew: 1_000_000, until: '2005-01-01' },
  { code: 'ROL', next: 'RON', countries: ['RO'], perNew: 10_000, until: '2005-07-01' },
];

/**
 * Countries whose airlines can't have kept their books in a usable currency on a date: the planned economies'
 * currencies weren't convertible before 1990, the new states' currencies didn't exist yet, Brazil had several currencies
 * and hyperinflation until the real (July 1994). Airlines there accounted in US dollars for international business.
 */
export const DOLLAR_BOOKS_UNTIL: Readonly<Record<string, string>> = {
  PL: '1990-01-01', HU: '1990-01-01', RO: '1990-01-01', BG: '1990-01-01', CN: '1981-01-01',
  CZ: '1993-01-01', SK: '1993-01-01', SI: '1992-01-01', HR: '1994-06-01', EE: '1992-07-01',
  LV: '1993-03-05', LT: '1993-06-25', BR: '1994-07-01',
};

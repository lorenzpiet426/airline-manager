// Exchange rates since 1970 (Phase 5.2): units of each currency per US dollar per month (Federal Reserve H.10 and
// World Bank, see tools/build-history.ts). The euro before 1999 is the "synthetic euro" from the Deutsche Mark.
// Loaded lazily (≈ 200 kB): the History screen now, historical start years in Phase 5.3.
import { DOLLAR_BOOKS_UNTIL, LEGACY_CURRENCIES, OLD_UNITS } from './currencyHistory';
import { bookCurrencyFor } from './currencies';

export interface FxHistory {
  start: string;
  perUsd: Record<string, (number | null)[]>;
}

export const loadFxHistory = async (): Promise<FxHistory> => (await import('./generated/fx-history.json')).default as FxHistory;

/** Index of a month in the history (0 = its first month), clamped. */
export function monthOf(fx: FxHistory, date: Date): number {
  const i = (date.getUTCFullYear() - Number(fx.start.slice(0, 4))) * 12 + date.getUTCMonth() - (Number(fx.start.slice(5, 7)) - 1);
  return Math.max(0, Math.min((fx.perUsd.EUR?.length ?? 1) - 1, i));
}

/** Units of `currency` per US dollar in the month of `date` (null when unknown). Old units (e.g. the Turkish lira
 * before 2005) are today's unit × their conversion factor. */
export function perUsdAt(fx: FxHistory, currency: string, date: Date): number | null {
  if (currency === 'USD') return 1;
  const old = OLD_UNITS.find((u) => u.code === currency);
  if (old) {
    const today = fx.perUsd[old.next]?.[monthOf(fx, date)];
    return today ? today * old.perNew : null;
  }
  return fx.perUsd[currency]?.[monthOf(fx, date)] ?? null;
}

/** The currency codes the exchange-rate history knows (incl. the old units). */
export const historyCurrencies = (fx: FxHistory): string[] => [...Object.keys(fx.perUsd), ...OLD_UNITS.map((u) => u.code)];

/** Exchange rates in the game's format (units per euro; the "synthetic euro" before 1999) for the month of `date`. */
export function ratesPerEurAt(fx: FxHistory, date: Date): Record<string, number> {
  const eur = perUsdAt(fx, 'EUR', date)!;
  const rates: Record<string, number> = { EUR: 1, USD: 1 / eur };
  for (const c of historyCurrencies(fx)) {
    const perUsd = perUsdAt(fx, c, date);
    if (perUsd && c !== 'EUR') rates[c] = perUsd / eur;
  }
  return rates;
}

/**
 * The money a country's airline kept its books in on a date: an old unit before a currency was re-based, the old
 * national currency before the euro, US dollars where the local money wasn't usable (see DOLLAR_BOOKS_UNTIL).
 */
export function currencyAt(country: string, date: Date): string {
  const iso = date.toISOString().slice(0, 10);
  if (iso < (DOLLAR_BOOKS_UNTIL[country] ?? '')) return 'USD';
  const old = OLD_UNITS.filter((u) => u.countries.includes(country) && iso < u.until).sort((a, b) => a.until.localeCompare(b.until))[0];
  if (old) return old.code;
  const legacy = LEGACY_CURRENCIES.find((l) => l.countries.includes(country) && iso < l.euroFrom);
  return legacy?.code ?? bookCurrencyFor(country);
}

/** The next change of a book currency after `date`: the day, the new currency and units of the old per new. */
export function nextCurrencyChange(currency: string): { on: string; to: string; perNew: number } | null {
  const old = OLD_UNITS.find((u) => u.code === currency);
  if (old) {
    // A chain (Israeli pound → old shekel → new shekel): the next unit is the next one still in use.
    const after = OLD_UNITS.filter((u) => u.next === old.next && u.until > old.until).sort((a, b) => a.until.localeCompare(b.until))[0];
    return after ? { on: old.until, to: after.code, perNew: old.perNew / after.perNew } : { on: old.until, to: old.next, perNew: old.perNew };
  }
  const legacy = LEGACY_CURRENCIES.find((l) => l.code === currency);
  return legacy ? { on: legacy.euroFrom, to: 'EUR', perNew: legacy.perEur } : null;
}

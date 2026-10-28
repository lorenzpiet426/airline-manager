// Exchange rates since 1970 (Phase 5.2): units of each currency per US dollar per month (Federal Reserve H.10 and
// World Bank, see tools/build-history.ts). The euro before 1999 is the "synthetic euro" from the Deutsche Mark.
// Loaded lazily (≈ 200 kB): the History screen now, historical start years in Phase 5.3.
import { LEGACY_CURRENCIES } from './currencyHistory';
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

/** Units of `currency` per US dollar in the month of `date` (null when unknown). */
export function perUsdAt(fx: FxHistory, currency: string, date: Date): number | null {
  if (currency === 'USD') return 1;
  return fx.perUsd[currency]?.[monthOf(fx, date)] ?? null;
}

/** The money a country used on a date: its old currency before it joined the euro. */
export function currencyAt(country: string, date: Date): string {
  const iso = date.toISOString().slice(0, 10);
  const legacy = LEGACY_CURRENCIES.find((l) => l.countries.includes(country) && iso < l.euroFrom);
  return legacy?.code ?? bookCurrencyFor(country);
}

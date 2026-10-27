// Money always carries its currency, so euros and dollars can never be mixed up by accident.
// Amounts are whole currency units: airline accounts at this scale do not need cents.

export type Currency = string; // ISO 4217 code, e.g. EUR, USD

export interface Money {
  amount: number;
  currency: Currency;
}

/** Exchange rates as units of each currency per 1 euro (the ECB's format). */
export type FxRates = Readonly<Record<Currency, number>>;

export const money = (amount: number, currency: Currency): Money => ({ amount: Math.round(amount), currency });

export function convert(value: Money, to: Currency, rates: FxRates): Money {
  if (value.currency === to) return value;
  const from = rates[value.currency];
  const target = rates[to];
  if (!from || !target) throw new Error(`No exchange rate for ${value.currency} → ${to}`);
  return money((value.amount / from) * target, to);
}

/** Rounds to two significant digits, e.g. 83,910,000 → 84,000,000 (for "nice" headline amounts). */
export function roundNice(amount: number): number {
  if (amount === 0) return 0;
  const magnitude = 10 ** (Math.floor(Math.log10(Math.abs(amount))) - 1);
  return Math.round(amount / magnitude) * magnitude;
}

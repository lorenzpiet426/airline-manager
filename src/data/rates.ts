// Central bank policy rates (Phase 10.1): the base for what airlines pay on loans and earn on cash. Source: BIS central
// bank policy rates (data.bis.org, WS_CBPOL; free to use with the BIS cited as the source; end-of-month rates since 1970).
// Each currency uses its own central bank (the euro the ECB from 1999, its old currencies their national banks before);
// where the BIS has no series for a time, a nearby one stands in (Germany for European currencies, the US plus a premium
// for others). After the data ends the last rate is kept.
import policyJson from './generated/policy-rates.json';

const AREAS = policyJson.areas as Record<string, { start: string; rates: number[] }>;

/** Old European currencies → their central bank's series (before the euro). */
const LEGACY: Readonly<Record<string, string>> = {
  ATS: 'AT', DEM: 'DE', FRF: 'FR', ITL: 'IT', ESP: 'ES', PTE: 'PT', NLG: 'NL', BEF: 'BE', LUF: 'BE', GRD: 'GR',
  FIM: 'DE', IEP: 'GB', SIT: 'DE', SKK: 'DE', CYP: 'GB', MTL: 'GB', EEK: 'DE', LVL: 'DE', LTL: 'DE', HRK: 'HR',
};
/** Premium over the US rate for currencies without a series (emerging markets borrow dearer). */
const FALLBACK_PREMIUM = 2;

function rateOf(area: string, year: number, month: number): number | null {
  const s = AREAS[area];
  if (!s) return null;
  const [y0, m0] = s.start.split('-').map(Number) as [number, number];
  const i = (year - y0) * 12 + (month - m0);
  if (i < 0) return null;
  return s.rates[Math.min(i, s.rates.length - 1)] ?? null;
}

/** The central bank's policy rate for a currency in a month (per cent a year). */
export function policyRate(currency: string, date: Date): number {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const tries =
    currency === 'EUR'
      ? ['XM', 'DE']
      : LEGACY[currency]
        ? [LEGACY[currency]!, 'DE']
        : [currency.slice(0, 2)];
  for (const area of tries) {
    const r = rateOf(area, y, m);
    if (r !== null) return r;
  }
  return (rateOf('US', y, m) ?? 4) + FALLBACK_PREMIUM;
}

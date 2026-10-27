// Number, unit and time formatting that follows the chosen language:
// German (Austria) writes 3.600 m and 1,5 Mio., English writes 3,600 m and 1.5M.
import type { Language } from '../settings/settings';

export function localeFor(language: Language): string {
  return language === 'de' ? 'de-AT' : 'en-GB';
}

export function formatNumber(language: Language, value: number, maxDecimals = 0): string {
  return new Intl.NumberFormat(localeFor(language), { maximumFractionDigits: maxDecimals }).format(value);
}

/** Short big numbers: 5,030,759 → "5.0M" / "5,0 Mio." */
export function formatCompact(language: Language, value: number): string {
  return new Intl.NumberFormat(localeFor(language), {
    notation: 'compact',
    maximumFractionDigits: 1,
    minimumFractionDigits: value >= 1_000_000 ? 1 : 0,
  }).format(value);
}

export function formatUsd(language: Language, value: number): string {
  return new Intl.NumberFormat(localeFor(language), {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

/** Country name in the chosen language, e.g. "AT" → "Österreich". */
export function countryName(language: Language, code: string, fallback: string): string {
  try {
    return new Intl.DisplayNames([localeFor(language)], { type: 'region' }).of(code) ?? fallback;
  } catch {
    return fallback;
  }
}

/** Aviation-style coordinates: N48°06.6' E016°34.2' */
export function formatLatLon(lat: number, lon: number): string {
  const part = (value: number, pos: string, neg: string, degDigits: number) => {
    const abs = Math.abs(value);
    let deg = Math.floor(abs);
    let min = Math.round((abs - deg) * 600) / 10;
    if (min >= 60) {
      deg += 1;
      min = 0;
    }
    return `${value >= 0 ? pos : neg}${String(deg).padStart(degDigits, '0')}°${min.toFixed(1).padStart(4, '0')}'`;
  };
  return `${part(lat, 'N', 'S', 2)} ${part(lon, 'E', 'W', 3)}`;
}

/** Current local time at a place and its UTC offset, e.g. { time: "13:42", offset: "UTC+1" }. */
export function localTimeIn(language: Language, timeZone: string, date = new Date()): { time: string; offset: string } {
  const time = new Intl.DateTimeFormat(localeFor(language), { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  const offsetPart = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' })
    .formatToParts(date)
    .find((p) => p.type === 'timeZoneName')?.value;
  return { time, offset: (offsetPart ?? 'GMT').replace('GMT', 'UTC') };
}

export const M_PER_FT = 0.3048;

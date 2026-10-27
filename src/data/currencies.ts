// Money of the world: which currency each country uses, and exchange rates.
// Rates: European Central Bank euro reference rates of 2026-10-26 (units per 1 EUR).
// An airline keeps its books in its hub country's currency when the ECB publishes a rate for it;
// otherwise in US dollars, as many airlines in those countries do. Real rate history follows in Phase 5.

export const FX_DATE = '2026-10-26';

/** Units of each currency per 1 euro (ECB reference rates). */
export const ECB_RATES: Readonly<Record<string, number>> = {
  EUR: 1,
  USD: 1.1188, JPY: 176.15, CZK: 24.369, DKK: 7.4747, GBP: 0.8382, HUF: 367.45, PLN: 4.4038,
  RON: 5.3473, SEK: 11.1385, CHF: 0.9243, ISK: 136.4, NOK: 10.4545, TRY: 55.6746, AUD: 1.5927,
  BRL: 6.2523, CAD: 1.5695, CNY: 7.4603, HKD: 8.7768, IDR: 20320.32, ILS: 3.4458, INR: 106.4935,
  KRW: 1482.72, MXN: 20.8271, MYR: 4.5731, NZD: 1.9695, PHP: 71.54, SGD: 1.4327, THB: 37.821,
  ZAR: 18.6046,
};

const COUNTRIES_BY_CURRENCY: Record<string, string[]> = {
  // Euro area (Bulgaria since 2026), countries using the euro, and French overseas regions.
  EUR: [
    'AT', 'BE', 'BG', 'HR', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
    'PT', 'SK', 'SI', 'ES', 'AD', 'MC', 'SM', 'VA', 'ME', 'XK', 'RE', 'GP', 'MQ', 'GF', 'YT', 'PM', 'BL',
    'MF', 'AX',
  ],
  USD: ['US', 'PR', 'GU', 'VI', 'AS', 'MP', 'UM', 'EC', 'SV', 'PA', 'TL', 'FM', 'MH', 'PW', 'BQ', 'TC', 'VG', 'IO'],
  GBP: ['GB', 'JE', 'GG', 'IM'],
  CHF: ['CH', 'LI'],
  DKK: ['DK', 'FO', 'GL'],
  NOK: ['NO', 'SJ'],
  SEK: ['SE'], ISK: ['IS'], CZK: ['CZ'], HUF: ['HU'], PLN: ['PL'], RON: ['RO'], TRY: ['TR'],
  JPY: ['JP'], CNY: ['CN'], HKD: ['HK'], KRW: ['KR'], INR: ['IN'], IDR: ['ID'], MYR: ['MY'],
  PHP: ['PH'], SGD: ['SG'], THB: ['TH'], ILS: ['IL'], BRL: ['BR'], MXN: ['MX'], CAD: ['CA'],
  AUD: ['AU', 'CX', 'CC', 'NF', 'KI', 'NR', 'TV'],
  NZD: ['NZ', 'CK', 'NU'],
  ZAR: ['ZA'],
};

const CURRENCY_BY_COUNTRY = new Map(
  Object.entries(COUNTRIES_BY_CURRENCY).flatMap(([currency, countries]) => countries.map((c) => [c, currency] as const)),
);

/** The currency an airline based in this country keeps its books in. */
export function bookCurrencyFor(countryCode: string): string {
  return CURRENCY_BY_COUNTRY.get(countryCode) ?? 'USD';
}

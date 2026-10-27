// Downloads Eurostat air passenger route data (avia_par_<country>): flights, seats and passengers per airport
// pair and month, for every reporting country. Only months entirely inside one IATA season are used: summer 2024
// (S24, 31 Mar – 26 Oct 2024) → April to September 2024. Newer months were not published yet (2026-10-27).
// Licence: Eurostat reuse policy (source must be acknowledged). Output: tools/raw/eurostat/*.json (not in git).
// Run: node tools/download-eurostat-routes.ts
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const EUROSTAT_SEASON = { code: 'S24', from: '2024-04', to: '2024-09' };
/** Reporting countries with an avia_par table (EU, EFTA, candidate countries; UK only until 2020, so not used). */
export const EUROSTAT_COUNTRIES = [
  'at', 'be', 'bg', 'ch', 'cy', 'cz', 'de', 'dk', 'ee', 'el', 'es', 'fi', 'fr', 'hr', 'hu', 'ie', 'is', 'it', 'lt',
  'lu', 'lv', 'me', 'mk', 'mt', 'nl', 'no', 'pl', 'pt', 'ro', 'rs', 'se', 'si', 'sk', 'tr',
];
const MEASURES = ['CAF_PAS_DEP', 'CAF_PAS_ARR', 'ST_PAS_DEP', 'ST_PAS_ARR', 'PAS_CRD_DEP', 'PAS_CRD_ARR'];

const DIR = join(import.meta.dirname, 'raw', 'eurostat');
await mkdir(DIR, { recursive: true });

for (const country of EUROSTAT_COUNTRIES) {
  const params = new URLSearchParams({
    format: 'JSON',
    lang: 'EN',
    freq: 'M',
    sinceTimePeriod: EUROSTAT_SEASON.from,
    untilTimePeriod: EUROSTAT_SEASON.to,
  });
  for (const m of MEASURES) params.append('tra_meas', m);
  const url = `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/avia_par_${country}?${params}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.log(`${country}: HTTP ${res.status} (skipped)`);
    continue;
  }
  const text = await res.text();
  await writeFile(join(DIR, `avia_par_${country}.json`), text);
  console.log(`${country}: ${(text.length / 1e6).toFixed(1)} MB`);
}

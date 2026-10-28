// Downloads the open data for the real history since 1970 (Phase 5.2). All public domain or CC BY 4.0:
//  - US EIA petroleum prices (public domain), monthly history tables: jet fuel spot (US Gulf Coast, from 1990),
//    jet fuel wholesale/resale price by refiners (from 1975), crude oil first purchase price (from 1974; yearly before).
//  - US Federal Reserve H.10 historical exchange rates (public domain), daily since 1971, incl. the old European
//    currencies until they joined the euro.
//  - World Bank World Development Indicators (CC BY 4.0): official exchange rate (yearly, all countries), population,
//    GDP per person in constant dollars, and air passengers carried, 1960 onwards.
// Output: tools/raw/history/… (not in git). Run: node tools/download-history.ts, then node tools/build-history.ts
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIR = join(import.meta.dirname, 'raw', 'history');
await mkdir(join(DIR, 'eia'), { recursive: true });
await mkdir(join(DIR, 'fed'), { recursive: true });
await mkdir(join(DIR, 'worldbank'), { recursive: true });

async function get(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok && res.status !== 404) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}

// EIA: monthly and annual history pages (plain HTML tables).
for (const [series, freq] of [
  ['EER_EPJK_PF4_RGC_DPG', 'M'],
  ['EMA_EPJK_PWG_NUS_DPG', 'M'],
  ['F000000__3', 'M'],
  ['F000000__3', 'A'],
] as const) {
  const res = await get(`https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=${series}&f=${freq}`);
  await writeFile(join(DIR, 'eia', `${series}-${freq}.html`), await res.text());
  console.log(`EIA ${series} (${freq})`);
}

// Federal Reserve H.10: one page per country and period (1971–89, 1990–99, 2000–today). Missing pages are skipped
// (the old European currencies end in 1999–2001, the euro starts in 1999, some Asian currencies start later).
export const FED_PAGES = [
  'al', 'au', 'be', 'bz', 'ca', 'ch', 'dn', 'eu', 'fi', 'fr', 'ge', 'gr', 'hk', 'in', 'ir', 'it', 'ja', 'ko', 'ma', 'mx',
  'ne', 'nz', 'no', 'po', 'si', 'sf', 'sp', 'sl', 'sd', 'sz', 'ta', 'th', 'uk', 've',
];
for (const code of FED_PAGES) {
  for (const period of ['dat89', 'dat96', 'dat00']) {
    const res = await get(`https://www.federalreserve.gov/releases/h10/hist/${period}_${code}.htm`);
    if (res.status === 404) continue;
    await writeFile(join(DIR, 'fed', `${period}_${code}.htm`), await res.text());
  }
  console.log(`Fed H.10 ${code}`);
}

// World Bank: yearly indicators for every country.
for (const indicator of ['PA.NUS.FCRF', 'SP.POP.TOTL', 'NY.GDP.PCAP.KD', 'IS.AIR.PSGR']) {
  const res = await get(`https://api.worldbank.org/v2/country/all/indicator/${indicator}?format=json&per_page=20000&date=1960:2025`);
  const json = (await res.json()) as [{ pages: number; total: number }, unknown[]];
  if (json[0].pages !== 1) throw new Error(`${indicator}: ${json[0].pages} pages`);
  await writeFile(join(DIR, 'worldbank', `${indicator}.json`), JSON.stringify(json[1]));
  console.log(`World Bank ${indicator}: ${json[0].total} values`);
}

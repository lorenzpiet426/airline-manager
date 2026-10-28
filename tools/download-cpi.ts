// Downloads the US consumer price index (CPI-U, all items, US city average, not seasonally adjusted; series
// CUUR0000SA0) from the US Bureau of Labor Statistics public API v1 (no key; 10 years per request). Public domain
// (US government work). Used to turn historical aircraft prices into the money of any game year (Phase 4.4).
// Output: tools/raw/bls/cpi-<from>.json (not in git). Run: node tools/download-cpi.ts, then node tools/build-cpi.ts
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIR = join(import.meta.dirname, 'raw', 'bls');
await mkdir(DIR, { recursive: true });

for (let from = 1913; from <= new Date().getUTCFullYear(); from += 10) {
  const url = 'https://api.bls.gov/publicAPI/v1/timeseries/data/';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seriesid: ['CUUR0000SA0'], startyear: String(from), endyear: String(from + 9) }),
  });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const json = (await res.json()) as { status: string; message: string[] };
  if (json.status !== 'REQUEST_SUCCEEDED') throw new Error(`${url}: ${json.status} ${json.message.join(' ')}`);
  await writeFile(join(DIR, `cpi-${from}.json`), JSON.stringify(json));
  console.log(`CPI ${from}–${from + 9} downloaded`);
}

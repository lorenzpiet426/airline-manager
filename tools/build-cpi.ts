// Builds src/data/generated/cpi.json from the BLS downloads (tools/download-cpi.ts): the annual average of the monthly
// CPI-U values per year (1982–84 = 100). The running year is the average of its published months, marked as partial.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const RAW = join(import.meta.dirname, 'raw', 'bls');
const OUT = join(import.meta.dirname, '..', 'src', 'data', 'generated', 'cpi.json');

interface Point { year: string; period: string; value: string }
const months = new Map<number, number[]>();
const seen = new Set<string>();
for (const file of (await readdir(RAW)).filter((f) => /^cpi-\d+\.json$/.test(f))) {
  const json = JSON.parse(await readFile(join(RAW, file), 'utf8')) as { Results: { series: { data: Point[] }[] } };
  for (const p of json.Results.series[0]!.data) {
    // Months BLS never published (October 2025, US government shutdown) are shown as "-".
    if (!/^M(0[1-9]|1[0-2])$/.test(p.period) || seen.has(p.year + p.period) || !Number.isFinite(Number(p.value))) continue;
    seen.add(p.year + p.period);
    const list = months.get(Number(p.year)) ?? [];
    list.push(Number(p.value));
    months.set(Number(p.year), list);
  }
}
const years = [...months.keys()].sort((a, b) => a - b);
const annual: Record<string, number> = {};
let partial: number | null = null;
for (const y of years) {
  const v = months.get(y)!;
  annual[y] = Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 1000) / 1000;
  if (v.length < 12 && y === years.at(-1)) partial = y;
}
await writeFile(
  OUT,
  `${JSON.stringify({ source: 'US BLS CPI-U CUUR0000SA0 (public domain)', base: '1982-84=100', downloaded: new Date().toISOString().slice(0, 10), partialYear: partial, annual }, null, 1)}\n`,
);
console.log(`CPI ${years[0]}–${years.at(-1)} written (${partial ? `${partial} partial` : 'all full years'})`);

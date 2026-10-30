// Builds src/data/generated/policy-rates.json from the BIS central bank policy rates (tools/download-policy-rates.ts):
// end-of-month policy rates per country (BIS reference area, "XM" = euro area) from January 1970, in per cent.
import { createReadStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const FILE = join(import.meta.dirname, 'raw', 'bis', 'extracted', 'WS_CBPOL_csv_flat.csv');
const OUT = join(import.meta.dirname, '..', 'src', 'data', 'generated', 'policy-rates.json');
const FIRST = 1970;

/** Splits one CSV line (quoted fields may hold commas). */
function fields(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

const series = new Map<string, Map<string, number>>();
let header = true;
for await (const line of createInterface({ input: createReadStream(FILE) })) {
  if (header) {
    header = false;
    continue;
  }
  const f = fields(line);
  if (!f[3]?.startsWith('M')) continue;
  const area = f[4]!.split(':')[0]!;
  const month = f[5]!;
  const value = Number(f[6]);
  if (!/^\d{4}-\d{2}$/.test(month) || Number(month.slice(0, 4)) < FIRST || !Number.isFinite(value)) continue;
  (series.get(area) ?? series.set(area, new Map()).get(area)!).set(month, value);
}

const areas: Record<string, { start: string; rates: number[] }> = {};
for (const [area, months] of [...series].sort(([a], [b]) => a.localeCompare(b))) {
  const keys = [...months.keys()].sort();
  const start = keys[0]!;
  const end = keys.at(-1)!;
  const rates: number[] = [];
  let [y, m] = start.split('-').map(Number) as [number, number];
  let last = months.get(start)!;
  // Months without a value keep the last rate (policy rates change rarely).
  while (`${y}-${String(m).padStart(2, '0')}` <= end) {
    const v = months.get(`${y}-${String(m).padStart(2, '0')}`);
    if (v !== undefined) last = v;
    rates.push(Math.round(last * 100) / 100);
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  areas[area] = { start, rates };
}
await writeFile(OUT, JSON.stringify({ source: 'BIS central bank policy rates (data.bis.org, WS_CBPOL), end of month, per cent', areas }) + '\n');
console.log(`policy-rates.json: ${Object.keys(areas).length} areas`);

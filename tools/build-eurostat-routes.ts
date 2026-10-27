// Turns the Eurostat downloads into weekly flights, seats and passengers per direction and airport pair
// (all airlines together; Eurostat has no airline breakdown). Season S24 (April–September 2024).
// A route between two reporting countries appears twice (once from each side): the larger value is kept,
// so the same flights are never counted twice. Output: src/data/generated/routes-eurostat.json
// Run: node tools/build-eurostat-routes.ts
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const DIR = join(import.meta.dirname, 'raw', 'eurostat');
const OUT = join(ROOT, 'src/data/generated');
const SEASON = 'S24';
const MONTHS = 6; // April–September
const WEEKS = (30 + 31 + 30 + 31 + 31 + 30) / 7;

interface JsonStat {
  id: string[];
  size: number[];
  value: Record<string, number>;
  dimension: Record<string, { category: { index: Record<string, number> } }>;
}

const airports = JSON.parse(await readFile(join(OUT, 'airports.json'), 'utf8')) as { id: string }[];
const known = new Set(airports.map((a) => a.id));

/** "A>B" → totals over the season for flights, seats, passengers (directed: A departs, B arrives). */
const routes = new Map<string, { flights: number; seats: number; pax: number }>();
const put = (from: string, to: string, kind: 'flights' | 'seats' | 'pax', value: number) => {
  const key = `${from}>${to}`;
  const r = routes.get(key) ?? { flights: 0, seats: 0, pax: 0 };
  r[kind] = Math.max(r[kind], value); // the other country may already have reported it
  routes.set(key, r);
};

for (const file of (await readdir(DIR)).filter((f) => f.endsWith('.json'))) {
  const d = JSON.parse(await readFile(join(DIR, file), 'utf8')) as JsonStat;
  const dims = d.id.map((name) => Object.entries(d.dimension[name]!.category.index).sort((a, b) => a[1] - b[1]).map(([k]) => k));
  // Sum over months: totals[pair|measure]
  const totals = new Map<string, number>();
  for (const [k, value] of Object.entries(d.value)) {
    let rest = Number(k);
    const coords: Record<string, string> = {};
    for (let i = d.id.length - 1; i >= 0; i--) {
      coords[d.id[i]!] = dims[i]![rest % d.size[i]!]!;
      rest = Math.floor(rest / d.size[i]!);
    }
    const key = `${coords.airp_pr}|${coords.tra_meas}`;
    totals.set(key, (totals.get(key) ?? 0) + value);
  }
  for (const [key, total] of totals) {
    const [pair, measure] = key.split('|') as [string, string];
    // airp_pr looks like "AT_LOWW_UK_EGLL": reporting airport first, partner second.
    const [, reporting, , partner] = pair.split('_');
    if (!reporting || !partner || !known.has(reporting) || !known.has(partner)) continue;
    const kind = measure.startsWith('CAF') ? 'flights' : measure.startsWith('ST') ? 'seats' : 'pax';
    if (measure.endsWith('_DEP')) put(reporting, partner, kind, total);
    else put(partner, reporting, kind, total);
  }
}

const rows = [...routes.entries()]
  .map(([key, r]) => {
    const [from, to] = key.split('>') as [string, string];
    return {
      from,
      to,
      weeklyFlights: Math.round((r.flights / WEEKS) * 10) / 10,
      weeklySeats: Math.round(r.seats / WEEKS),
      weeklyPax: Math.round(r.pax / WEEKS),
    };
  })
  .filter((r) => r.weeklyFlights >= 0.5) // at least one flight every two weeks
  .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));

await writeFile(
  join(OUT, 'routes-eurostat.json'),
  `{"source":"Eurostat avia_par_* (${MONTHS} months, April–September 2024)","season":"${SEASON}","routes":[\n${rows.map((r) => JSON.stringify(r)).join(',\n')}\n]}\n`,
);
console.log(`Eurostat ${SEASON}: ${rows.length} directed routes, ${Math.round(rows.reduce((s, r) => s + r.weeklyFlights, 0))} flights per week`);

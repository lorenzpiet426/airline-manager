// One route network per real airline: who flies where (Wikipedia airport tables) plus weekly flights where an
// official total exists (Eurostat, summer 2024), split between the airlines serving the route:
// hub airline at either end 3×, airline with a base there 2×, others 1×; seasonal ½; charter ⅓.
// Routes without an official total get weekly = null: the game fills them with its demand model ("modelled").
// Output: src/data/generated/networks.json. Run: node tools/build-networks.ts
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const OUT = join(import.meta.dirname, '..', 'src/data/generated');
const read = async (f: string) => JSON.parse(await readFile(join(OUT, f), 'utf8'));

const airlines = (await read('airlines.json')).airlines as { id: string; hubs: string[] }[];
const details = new Map(((await read('airline-details.json')).airlines as { id: string; hubs: string[]; bases: string[] }[]).map((d) => [d.id, d]));
const wiki = JSON.parse(await readFile(join(import.meta.dirname, 'raw', 'routes-wikipedia.json'), 'utf8')).routes as { airline: string; a: string; b: string; seasonal: boolean; charter: boolean; both: boolean }[];
const eurostat = await read('routes-eurostat.json');
const totals = new Map((eurostat.routes as { from: string; to: string; weeklyFlights: number }[]).map((r) => [`${r.from}>${r.to}`, r.weeklyFlights]));

// Hubs (Wikidata + Wikipedia infobox) and bases (infobox, or any airport with ≥ 8 of the airline's routes).
const routeCount = new Map<string, number>();
for (const r of wiki) for (const ap of [r.a, r.b]) routeCount.set(`${r.airline}|${ap}`, (routeCount.get(`${r.airline}|${ap}`) ?? 0) + 1);
const hubsOf = new Map<string, Set<string>>();
const basesOf = new Map<string, Set<string>>();
for (const a of airlines) {
  const d = details.get(a.id);
  hubsOf.set(a.id, new Set([...a.hubs, ...(d?.hubs ?? [])]));
  basesOf.set(a.id, new Set(d?.bases ?? []));
}
for (const [key, n] of routeCount) {
  if (n < 8) continue;
  const [airline, ap] = key.split('|') as [string, string];
  if (!hubsOf.get(airline)?.has(ap)) (basesOf.get(airline) ?? basesOf.set(airline, new Set()).get(airline)!).add(ap);
}

const weight = (r: (typeof wiki)[number]) => {
  const hubs = hubsOf.get(r.airline) ?? new Set();
  const bases = basesOf.get(r.airline) ?? new Set();
  let w = hubs.has(r.a) || hubs.has(r.b) ? 3 : bases.has(r.a) || bases.has(r.b) ? 2 : 1;
  if (r.seasonal) w /= 2;
  if (r.charter) w /= 3;
  return w;
};

// Group the airlines on each airport pair, then split each direction's official total by weight.
const byPair = new Map<string, (typeof wiki)[number][]>();
for (const r of wiki) byPair.set(`${r.a}|${r.b}`, [...(byPair.get(`${r.a}|${r.b}`) ?? []), r]);

interface NetRoute { a: string; b: string; seasonal: boolean; charter: boolean; both: boolean; weeklyAB: number | null; weeklyBA: number | null }
const networks = new Map<string, NetRoute[]>();
let withTotals = 0;
for (const [pair, list] of byPair) {
  const [a, b] = pair.split('|') as [string, string];
  const ab = totals.get(`${a}>${b}`) ?? null;
  const ba = totals.get(`${b}>${a}`) ?? null;
  const sum = list.reduce((s, r) => s + weight(r), 0);
  for (const r of list) {
    const share = weight(r) / sum;
    const round = (t: number | null) => (t === null ? null : Math.max(0.5, Math.round(t * share * 2) / 2));
    if (ab !== null || ba !== null) withTotals++;
    const route: NetRoute = { a, b, seasonal: r.seasonal, charter: r.charter, both: r.both, weeklyAB: round(ab), weeklyBA: round(ba) };
    networks.set(r.airline, [...(networks.get(r.airline) ?? []), route]);
  }
}

const out = [...networks.entries()]
  .sort(([x], [y]) => x.localeCompare(y))
  .map(([id, routes]) => ({
    id,
    hubs: [...(hubsOf.get(id) ?? [])].sort(),
    bases: [...(basesOf.get(id) ?? [])].sort(),
    routes: routes.sort((x, y) => x.a.localeCompare(y.a) || x.b.localeCompare(y.b)),
  }));
await writeFile(
  join(OUT, 'networks.json'),
  `{"source":"Routes: English Wikipedia airport articles (CC BY-SA 4.0). Weekly flights: Eurostat ${eurostat.season} route totals split between the airlines on each route (estimate); null = filled in by the game's demand model.",` +
    `"season":"${eurostat.season}","airlines":[\n${out.map((n) => JSON.stringify(n)).join(',\n')}\n]}\n`,
);
console.log(`Networks: ${out.length} airlines, ${wiki.length} routes, ${withTotals} with an official weekly total (${eurostat.season})`);

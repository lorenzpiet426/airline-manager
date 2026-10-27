// Business model, hubs/bases and fleet per airline from their English Wikipedia articles (CC BY-SA 4.0).
// Fleet tables are read row by row: aircraft type (mapped onto the game's types), aircraft in service,
// orders and total seats. Only the current fleet (not "Former fleet"). Output: src/data/generated/airline-details.json
// Run after download-airline-articles.ts: node tools/build-airline-details.ts
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mapType } from './aircraft-names.ts';
import { cleanWikitext, linkTargets, resolveTitles } from './wikipedia.ts';

const RAW = join(import.meta.dirname, 'raw');
const OUT = join(import.meta.dirname, '..', 'src/data/generated');

const { downloaded, airlines: articles } = JSON.parse(await readFile(join(RAW, 'wikipedia-airlines.json'), 'utf8')) as {
  downloaded: string;
  airlines: Record<string, { title: string; revid: number; infobox: string; fleet: string; categories: string[] }>;
};
const wikidata = new Map(
  (JSON.parse(await readFile(join(OUT, 'airlines.json'), 'utf8')).airlines as { id: string; model: string; alliance: string | null }[]).map((a) => [a.id, a]),
);
const airportTitles = JSON.parse(await readFile(join(RAW, 'wikidata-airport-titles.json'), 'utf8')) as Record<string, string>;

const num = (cell: string): number | null => {
  const v = cell.replace(/<[^>]+>|\{\{[^}]*\}\}|'''|''/g, '').replace(/&mdash;|—|–|-/g, ' ').trim();
  const m = v.match(/^(\d{1,3})(?:\s|$)/);
  return m ? Number(m[1]) : null;
};
/** Cell text without attributes such as rowspan="2" | … */
const cellText = (c: string) => c.replace(/^[^|[\]{}]*?=[^|[\]{}]*\|/, '').trim();

interface FleetEntry { type: string; inService: number; orders: number; seats: number | null }

function parseFleet(section: string): { fleet: FleetEntry[]; unmapped: string[] } {
  const text = cleanWikitext(section);
  // Current fleet only: stop at a former/historical fleet heading.
  const cut = text.search(/\n==+\s*(Former|Historic(al)?|Retired|Past)[^=]*==+/i);
  const current = cut >= 0 ? text.slice(0, cut) : text;
  const fleet = new Map<string, FleetEntry>();
  const unmapped: string[] = [];
  let lastType: string | null = null;
  // Only the current-fleet table: the first one with an "In service" / "In fleet" column (fleet articles also have
  // tables of yearly deliveries and orders that must not be added up).
  const tables = [...current.matchAll(/\{\|[\s\S]*?\n\|\}/g)].map((m) => m[0]);
  const fleetTable = tables.find((t) => /In\s*(service|fleet)|Active/i.test(t.slice(0, 1500))) ?? tables[0];
  for (const table of fleetTable ? [[fleetTable]] : []) {
    for (const row of table[0].split(/\n\|-[^\n]*/).slice(1)) {
      if (/^\s*!/.test(row) || /Total/i.test(row.split('\n').find((l) => l.trim()) ?? '')) continue;
      const cells = row.split(/\n\||\|\|/).map((c) => c.trim()).filter((c, i) => i > 0 || c).map(cellText);
      if (cells.length < 2) continue;
      const first = cells[0]!;
      const name = [...linkTargets(first), first.replace(/\[\[[^\]]*\|/g, '').replace(/[[\]]/g, '')].join(' ');
      const type = mapType(name);
      const numbers = cells.slice(1).map(num);
      if (type === undefined) {
        // Rows without an aircraft name continue the previous type (another cabin version, or extra orders): their
        // numbers are seat counts as often as aircraft counts, so they are skipped rather than guessed.
        if (lastType && !/\[\[/.test(first)) continue;
        if (/\d/.test(first) || /\[\[/.test(first)) unmapped.push(first.replace(/\[\[([^\]|]*\|)?|\]\]/g, '').slice(0, 60));
        continue;
      }
      if (type === null) continue;
      lastType = type;
      const inService = numbers[0] ?? 0;
      const orders = numbers[1] ?? 0;
      const seatCandidates = numbers.slice(2).filter((n): n is number => n !== null && n >= 9 && n <= 900);
      const e = fleet.get(type) ?? { type, inService: 0, orders: 0, seats: null };
      e.inService += inService;
      e.orders += orders;
      if (seatCandidates.length && e.seats === null) e.seats = Math.max(...seatCandidates);
      fleet.set(type, e);
    }
  }
  return { fleet: [...fleet.values()].filter((e) => e.inService + e.orders > 0), unmapped };
}

/** Value of an infobox field (e.g. hubs, focus_cities). */
const field = (infobox: string, name: string) => {
  const m = cleanWikitext(infobox).match(new RegExp(`\\|\\s*${name}\\s*=([\\s\\S]*?)(?=\\n\\s*\\|\\s*\\w+\\s*=|\\n\\}\\})`, 'i'));
  return m ? m[1]! : '';
};

function businessModel(id: string, categories: string[]): 'lowcost' | 'charter' | 'regional' | 'legacy' {
  const cats = categories.join(' | ');
  if (/Low-cost carriers/i.test(cats)) return 'lowcost';
  if (/Charter airlines/i.test(cats)) return 'charter';
  if (/Regional airlines/i.test(cats)) return 'regional';
  const wd = wikidata.get(id);
  if (wd?.model === 'lowcost' || wd?.model === 'charter' || wd?.model === 'regional') return wd.model;
  // Everything else: a full-service ("legacy" / network) airline.
  return 'legacy';
}

// Resolve all airport links in the infoboxes at once.
const baseFields = ['hubs', 'secondary_hubs', 'focus_cities', 'operating_bases', 'bases'];
const allLinks = Object.values(articles).flatMap((a) => baseFields.flatMap((f) => linkTargets(field(a.infobox, f))));
const resolved = await resolveTitles(allLinks);
const airportOf = (t: string) => airportTitles[t] ?? airportTitles[resolved.get(t) ?? ''] ?? null;

const details = Object.entries(articles)
  .map(([id, a]) => {
    const hubs = [...new Set(linkTargets(field(a.infobox, 'hubs') + field(a.infobox, 'secondary_hubs')).map(airportOf).filter((x): x is string => !!x))];
    const bases = [
      ...new Set(linkTargets(field(a.infobox, 'focus_cities') + field(a.infobox, 'operating_bases') + field(a.infobox, 'bases')).map(airportOf).filter((x): x is string => !!x)),
    ].filter((b) => !hubs.includes(b));
    const fleetSize = num(cellText(field(a.infobox, 'fleet_size')));
    const { fleet, unmapped } = parseFleet(a.fleet);
    return { id, model: businessModel(id, a.categories), hubs, bases, fleetSize, fleet, unmapped, revid: a.revid };
  })
  .sort((x, y) => x.id.localeCompare(y.id));

await writeFile(
  join(OUT, 'airline-details.json'),
  `{"source":"English Wikipedia airline articles: infobox, categories, fleet tables (CC BY-SA 4.0), downloaded ${downloaded.slice(0, 10)}",` +
    `"airlines":[\n${details.map((d) => JSON.stringify(d)).join(',\n')}\n]}\n`,
);
const unmappedCount = new Map<string, number>();
for (const d of details) for (const u of d.unmapped) unmappedCount.set(u, (unmappedCount.get(u) ?? 0) + 1);
await writeFile(join(RAW, 'fleet-unmapped.json'), JSON.stringify([...unmappedCount.entries()].sort((a, b) => b[1] - a[1]), null, 1));
const models = details.reduce<Record<string, number>>((m, d) => ((m[d.model] = (m[d.model] ?? 0) + 1), m), {});
console.log(
  `Airline details: ${details.length}; models ${JSON.stringify(models)}; with hubs ${details.filter((d) => d.hubs.length).length}; ` +
    `with fleet ${details.filter((d) => d.fleet.length).length} (${details.reduce((s, d) => s + d.fleet.reduce((t, f) => t + f.inService, 0), 0)} aircraft); ` +
    `unmapped type names: ${unmappedCount.size}`,
);

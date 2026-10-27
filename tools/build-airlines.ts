// Builds src/data/generated/airlines.json from the Wikidata download (CC0).
// One airline per ICAO code (when several Wikidata items share a code, the one with the most Wikipedia language
// versions is the real airline), passenger airlines only, hubs limited to the game's airports.
// Run: node tools/build-airlines.ts
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const RAW = join(import.meta.dirname, 'raw');
const OUT = join(ROOT, 'src/data/generated');

type Row = Record<string, string | undefined>;
const { downloaded, rows } = JSON.parse(await readFile(join(RAW, 'wikidata-airlines.json'), 'utf8')) as { downloaded: string; rows: Row[] };
const airports = JSON.parse(await readFile(join(OUT, 'airports.json'), 'utf8')) as { id: string; iata: string | null }[];
const airportIds = new Set(airports.map((a) => a.id));

/** Wikidata "instance of" values that are not passenger airlines. */
const EXCLUDED_TYPES = new Set([
  'cargo airline', 'helicopter airline', 'air force', 'virtual airline', 'fixed-base operator', 'flight school',
  'air ambulance', 'aerial firefighting', 'government organization', 'logistics company', 'military unit',
]);

interface Item {
  qid: string;
  name: string;
  icao: string;
  iata: string | null;
  country: string | null;
  hubs: Set<string>;
  types: Set<string>;
  alliance: string | null;
  parent: string | null;
  founded: number | null;
  callsign: string | null;
  article: string | null;
  sitelinks: number;
}

const items = new Map<string, Item>();
for (const r of rows) {
  const qid = r.a!.replace('http://www.wikidata.org/entity/', '');
  const item =
    items.get(qid) ??
    ({
      qid,
      name: r.label ?? qid,
      icao: r.icao!,
      iata: r.iata ?? null,
      country: r.countryCode ?? null,
      hubs: new Set(),
      types: new Set(),
      alliance: r.allianceLabel ?? null,
      parent: r.parentLabel ?? null,
      founded: r.inception ? Number(r.inception.slice(0, 4)) || null : null,
      callsign: r.callsign ?? null,
      article: r.article ? decodeURIComponent(r.article.replace('https://en.wikipedia.org/wiki/', '')).replace(/_/g, ' ') : null,
      sitelinks: Number(r.sitelinks ?? 0),
    } satisfies Item);
  if (r.hubIcao && airportIds.has(r.hubIcao)) item.hubs.add(r.hubIcao);
  if (r.typeLabel) item.types.add(r.typeLabel);
  items.set(qid, item);
}

/** Airline business model as far as Wikidata knows it; Wikipedia fills in the rest later ("unknown"). */
function model(types: Set<string>): 'legacy' | 'lowcost' | 'regional' | 'charter' | 'unknown' {
  if (types.has('low-cost airline')) return 'lowcost';
  if (types.has('charter airline') || types.has('tour operator')) return 'charter';
  if (types.has('regional airline')) return 'regional';
  if (types.has('flag carrier')) return 'legacy';
  return 'unknown';
}

const byIcao = new Map<string, Item>();
let excluded = 0;
for (const item of items.values()) {
  if ([...item.types].some((t) => EXCLUDED_TYPES.has(t))) {
    excluded++;
    continue;
  }
  const other = byIcao.get(item.icao);
  if (!other || item.sitelinks > other.sitelinks) byIcao.set(item.icao, item);
}

const airlines = [...byIcao.values()]
  .sort((a, b) => a.icao.localeCompare(b.icao))
  .map((i) => ({
    id: i.icao,
    name: i.name,
    iata: i.iata,
    icao: i.icao,
    callsign: i.callsign,
    country: i.country,
    hubs: [...i.hubs].sort(),
    model: model(i.types),
    alliance: i.alliance,
    parent: i.parent,
    founded: i.founded,
    wikidata: i.qid,
    wikipedia: i.article,
    /** Wikipedia language versions: a rough measure of how well known the airline is. */
    fame: i.sitelinks,
    source: 'wikipedia' as const,
  }));

await writeFile(
  join(OUT, 'airlines.json'),
  `{"source":"Wikidata (CC0), downloaded ${downloaded.slice(0, 10)}","airlines":[\n${airlines.map((a) => JSON.stringify(a)).join(',\n')}\n]}\n`,
);
console.log(
  `Airlines: ${airlines.length} (excluded ${excluded} cargo/helicopter/military/other items, ` +
    `${items.size - excluded - airlines.length} duplicate codes); with hub: ${airlines.filter((a) => a.hubs.length).length}; ` +
    `with IATA: ${airlines.filter((a) => a.iata).length}; with Wikipedia article: ${airlines.filter((a) => a.wikipedia).length}`,
);

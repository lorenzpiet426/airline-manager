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

// Brands and subsidiaries found via Wikipedia's airport tables (second Wikidata pass): United Express, QantasLink, AJet…
// They keep their own ICAO code if they have one that is still free, otherwise they get their Wikidata id.
interface Extra { item: Item; parentIcao: string | null }
const extras: Extra[] = [];
try {
  const extra = JSON.parse(await readFile(join(RAW, 'wikidata-airlines-extra.json'), 'utf8')) as { rows: Row[] };
  const byQid = new Map<string, Extra>();
  for (const r of extra.rows) {
    const qid = r.a!.replace('http://www.wikidata.org/entity/', '');
    if (items.has(qid) && byIcao.get(items.get(qid)!.icao)?.qid === qid) continue; // already in the list
    const e =
      byQid.get(qid) ??
      ({
        item: {
          qid, name: r.label ?? qid, icao: r.icao ?? '', iata: r.iata ?? null, country: r.countryCode ?? null,
          hubs: new Set(), types: new Set(), alliance: null, parent: r.parentLabel ?? null, founded: null, callsign: null,
          article: r.article ? decodeURIComponent(r.article.replace('https://en.wikipedia.org/wiki/', '')).replace(/_/g, ' ') : null,
          sitelinks: Number(r.sitelinks ?? 0),
        },
        parentIcao: r.parentIcao ?? null,
      } satisfies Extra);
    if (r.hubIcao && airportIds.has(r.hubIcao)) e.item.hubs.add(r.hubIcao);
    byQid.set(qid, e);
  }
  extras.push(...byQid.values());
} catch {
  // second pass not run yet
}

const toRow = (i: Item, id: string, extra: Partial<{ brand: boolean; parentIcao: string | null }> = {}) => ({
  id,
  name: i.name,
  iata: i.iata,
  // A brand whose code is already taken by the main airline gets no code of its own.
  icao: extra.brand ? null : i.icao || null,
  callsign: i.callsign,
  country: i.country,
  hubs: [...i.hubs].sort(),
  model: model(i.types),
  alliance: i.alliance,
  parent: i.parent,
  ...(extra.parentIcao ? { parentIcao: extra.parentIcao } : {}),
  ...(extra.brand ? { brand: true } : {}),
  founded: i.founded,
  wikidata: i.qid,
  wikipedia: i.article,
  /** Wikipedia language versions: a rough measure of how well known the airline is. */
  fame: i.sitelinks,
  source: 'wikipedia' as const,
});

const airlines = [
  ...[...byIcao.values()].map((i) => toRow(i, i.icao)),
  ...extras.map(({ item, parentIcao }) => {
    const ownCode = item.icao && !byIcao.has(item.icao);
    if (ownCode) byIcao.set(item.icao, item);
    // No (free) ICAO code: a brand flown for another airline, identified by its Wikidata id.
    return toRow(item, ownCode ? item.icao : item.qid, { brand: !ownCode, parentIcao });
  }),
].sort((a, b) => a.id.localeCompare(b.id));

await writeFile(
  join(OUT, 'airlines.json'),
  `{"source":"Wikidata (CC0), downloaded ${downloaded.slice(0, 10)}","airlines":[\n${airlines.map((a) => JSON.stringify(a)).join(',\n')}\n]}\n`,
);
console.log(
  `Airlines: ${airlines.length} incl. ${extras.length} brands/subsidiaries (excluded ${excluded} cargo/helicopter/` +
    `military/other items); with hub: ${airlines.filter((a) => a.hubs.length).length}; ` +
    `with IATA: ${airlines.filter((a) => a.iata).length}; with Wikipedia article: ${airlines.filter((a) => a.wikipedia).length}`,
);

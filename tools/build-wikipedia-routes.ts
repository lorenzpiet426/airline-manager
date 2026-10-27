// Who flies where, from Wikipedia's "Airlines and destinations" tables of 3,400+ airport articles (CC BY-SA 4.0).
// Every listed airline and destination is matched to the game's airlines (ICAO code) and airports.
// A route is an airline + airport pair; it is kept if either end lists it (usually both do).
// Output: src/data/generated/routes-wikipedia.json (+ a list of unmatched names in tools/raw for checking).
// Run: node tools/build-wikipedia-routes.ts
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseAirportDestinations, resolveTitles } from './wikipedia.ts';

const ROOT = join(import.meta.dirname, '..');
const RAW = join(import.meta.dirname, 'raw');
const OUT = join(ROOT, 'src/data/generated');

const { downloaded, airports: articles } = JSON.parse(await readFile(join(RAW, 'wikipedia-airports.json'), 'utf8')) as {
  downloaded: string;
  airports: Record<string, { title: string; revid: number; section: string | null }>;
};
const airportTitles = JSON.parse(await readFile(join(RAW, 'wikidata-airport-titles.json'), 'utf8')) as Record<string, string>;
const gameAirports = new Set((JSON.parse(await readFile(join(OUT, 'airports.json'), 'utf8')) as { id: string }[]).map((a) => a.id));
const airlines = JSON.parse(await readFile(join(OUT, 'airlines.json'), 'utf8')).airlines as { icao: string; wikipedia: string | null }[];

// 1. Read every table.
const tables = Object.entries(articles)
  .filter(([, a]) => a.section)
  .map(([icao, a]) => ({ icao, entries: parseAirportDestinations(a.section!) }));

// 2. Resolve redirects of all linked airline and airport articles in one go (50 per request, cached).
const airlineTitles = new Set<string>();
const destTitles = new Set<string>();
for (const t of tables) for (const e of t.entries) {
  airlineTitles.add(e.airline);
  for (const d of e.destinations) destTitles.add(d.airport);
}
const airlineArticles = airlines.filter((a) => a.wikipedia).map((a) => a.wikipedia!);
// Wikidata sometimes still has an airport's old article title (e.g. Bucharest), so resolve those too.
const resolved = await resolveTitles([...airlineTitles, ...destTitles, ...airlineArticles, ...Object.keys(airportTitles)]);
const canonical = (t: string) => resolved.get(t) ?? t;

const airlineByArticle = new Map<string, string>();
for (const a of airlines) if (a.wikipedia) airlineByArticle.set(canonical(a.wikipedia), a.icao);
const airportByArticle = new Map<string, string>();
for (const [title, icao] of Object.entries(airportTitles)) {
  airportByArticle.set(title, icao);
  if (!airportByArticle.has(canonical(title))) airportByArticle.set(canonical(title), icao);
}
const airportOf = (t: string) => airportByArticle.get(t) ?? airportByArticle.get(canonical(t)) ?? null;

// 3. Collect routes: key = airline|A|B with A < B, flags merged from both ends.
interface Route { airline: string; a: string; b: string; seasonal: boolean; charter: boolean; listedAtA: boolean; listedAtB: boolean }
const routes = new Map<string, Route>();
const unmatchedAirlines = new Map<string, number>();
const unmatchedAirports = new Map<string, number>();
for (const t of tables) {
  for (const e of t.entries) {
    const airline = airlineByArticle.get(canonical(e.airline));
    if (!airline) {
      unmatchedAirlines.set(e.airline, (unmatchedAirlines.get(e.airline) ?? 0) + e.destinations.length);
      continue;
    }
    for (const d of e.destinations) {
      const dest = airportOf(d.airport);
      if (!dest || !gameAirports.has(dest) || dest === t.icao) {
        if (!dest) unmatchedAirports.set(d.airport, (unmatchedAirports.get(d.airport) ?? 0) + 1);
        continue;
      }
      const [a, b] = t.icao < dest ? [t.icao, dest] : [dest, t.icao];
      const key = `${airline}|${a}|${b}`;
      const r = routes.get(key);
      if (!r) {
        routes.set(key, { airline, a, b, seasonal: d.seasonal, charter: d.charter, listedAtA: t.icao === a, listedAtB: t.icao === b });
      } else {
        // Year-round if either end says so; charter only if both agree.
        r.seasonal &&= d.seasonal;
        r.charter &&= d.charter;
        if (t.icao === a) r.listedAtA = true;
        else r.listedAtB = true;
      }
    }
  }
}

const list = [...routes.values()].sort((x, y) => x.airline.localeCompare(y.airline) || x.a.localeCompare(y.a) || x.b.localeCompare(y.b));
await writeFile(
  join(OUT, 'routes-wikipedia.json'),
  `{"source":"English Wikipedia, 'Airlines and destinations' sections of airport articles (CC BY-SA 4.0), downloaded ${downloaded.slice(0, 10)}",` +
    `"routes":[\n${list.map((r) => JSON.stringify({ airline: r.airline, a: r.a, b: r.b, seasonal: r.seasonal, charter: r.charter, both: r.listedAtA && r.listedAtB })).join(',\n')}\n]}\n`,
);
const top = (m: Map<string, number>) => [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 40);
await writeFile(
  join(RAW, 'wikipedia-unmatched.json'),
  JSON.stringify({
    airlines: top(unmatchedAirlines),
    airports: top(unmatchedAirports),
    // Input for tools/download-airlines-extra.ts: airline articles with at least 3 routes but no airline entry yet.
    airlineArticlesToLookUp: [...unmatchedAirlines.entries()].filter(([, n]) => n >= 3).map(([name]) => canonical(name)),
  }, null, 1),
);
const perAirline = new Map<string, number>();
for (const r of list) perAirline.set(r.airline, (perAirline.get(r.airline) ?? 0) + 1);
console.log(
  `Wikipedia routes: ${list.length} airline routes, ${perAirline.size} airlines, ` +
    `${list.filter((r) => r.listedAtA && r.listedAtB).length} confirmed by both ends, ${list.filter((r) => r.seasonal).length} seasonal, ` +
    `${list.filter((r) => r.charter).length} charter. Unmatched: ${unmatchedAirlines.size} airline names, ${unmatchedAirports.size} airport links.`,
);

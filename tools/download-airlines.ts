// Downloads real airline facts from Wikidata (CC0): names, IATA/ICAO codes, country, hubs, airline type,
// alliance, parent company, start year, the English Wikipedia article (for destination and fleet lists later) and
// the number of Wikipedia language versions (to pick the real airline when several items share a code).
// Output: tools/raw/wikidata-airlines.json (not in git). Run: node tools/download-airlines.ts
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const RAW = join(import.meta.dirname, 'raw');
// Wikimedia asks every script to say who it is and how to reach the project.
const USER_AGENT = 'AirlineManagerGame/0.1 (https://github.com/lorenzpiet426/airline-manager; hobby game data pipeline)';

const QUERY = `
SELECT ?a ?label ?icao ?iata ?countryCode ?hubIcao ?hubIata ?type ?typeLabel ?allianceLabel ?parentLabel ?inception ?callsign ?article ?sitelinks WHERE {
  ?a wdt:P230 ?icao ; wikibase:sitelinks ?sitelinks .
  FILTER NOT EXISTS { ?a wdt:P576 ?dissolved }
  OPTIONAL { ?a wdt:P229 ?iata }
  OPTIONAL { ?a wdt:P17 ?country . ?country wdt:P297 ?countryCode }
  OPTIONAL { ?a wdt:P113 ?hub . OPTIONAL { ?hub wdt:P239 ?hubIcao } OPTIONAL { ?hub wdt:P238 ?hubIata } }
  OPTIONAL { ?a wdt:P31 ?type }
  OPTIONAL { ?a wdt:P114 ?alliance }
  OPTIONAL { ?a wdt:P749 ?parent }
  OPTIONAL { ?a wdt:P571 ?inception }
  OPTIONAL { ?a wdt:P432 ?callsign }
  OPTIONAL { ?article schema:about ?a ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". ?a rdfs:label ?label . ?type rdfs:label ?typeLabel .
    ?alliance rdfs:label ?allianceLabel . ?parent rdfs:label ?parentLabel . }
}`;

const res = await fetch(`https://query.wikidata.org/sparql?query=${encodeURIComponent(QUERY)}`, {
  headers: { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT },
});
if (!res.ok) throw new Error(`Wikidata query failed: HTTP ${res.status}`);
const json = (await res.json()) as { results: { bindings: Record<string, { value: string }>[] } };
await mkdir(RAW, { recursive: true });
await writeFile(
  join(RAW, 'wikidata-airlines.json'),
  JSON.stringify({ downloaded: new Date().toISOString(), rows: json.results.bindings.map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value]))) }),
);
console.log(`Wikidata: ${json.results.bindings.length} rows saved.`);

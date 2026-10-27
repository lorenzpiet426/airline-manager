// Second Wikidata pass: airlines that Wikipedia's airport tables list (with ≥ 3 routes) but that are not in the
// first download — mostly brands and subsidiaries without their own ICAO code (United Express, QantasLink, AJet…).
// Looked up by their English Wikipedia article. Output: tools/raw/wikidata-airlines-extra.json
// Run after build-wikipedia-routes.ts: node tools/download-airlines-extra.ts
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { USER_AGENT } from './wikipedia.ts';

const RAW = join(import.meta.dirname, 'raw');
const { airlineArticlesToLookUp } = JSON.parse(await readFile(join(RAW, 'wikipedia-unmatched.json'), 'utf8')) as { airlineArticlesToLookUp: string[] };
const iri = (t: string) => `<https://en.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, '_')).replace(/%2F/g, '/').replace(/%3A/g, ':')}>`;

// Cumulative: keep earlier finds and only look up articles not seen before.
const file = join(RAW, 'wikidata-airlines-extra.json');
let rows: Record<string, string>[] = [];
let looked: string[] = [];
try {
  const prev = JSON.parse(await readFile(file, 'utf8'));
  rows = prev.rows ?? [];
  looked = prev.looked ?? [];
} catch {
  // first run
}
const todo = airlineArticlesToLookUp.filter((t) => !looked.includes(t));
for (let i = 0; i < todo.length; i += 100) {
  const batch = todo.slice(i, i + 100);
  const query = `
SELECT ?a ?label ?icao ?iata ?countryCode ?hubIcao ?parentLabel ?parentIcao ?article ?sitelinks WHERE {
  VALUES ?article { ${batch.map(iri).join(' ')} }
  ?article schema:about ?a . ?a wikibase:sitelinks ?sitelinks .
  OPTIONAL { ?a wdt:P230 ?icao } OPTIONAL { ?a wdt:P229 ?iata }
  OPTIONAL { ?a wdt:P17 ?country . ?country wdt:P297 ?countryCode }
  OPTIONAL { ?a wdt:P113 ?hub . ?hub wdt:P239 ?hubIcao }
  OPTIONAL { ?a wdt:P749 ?parent . OPTIONAL { ?parent wdt:P230 ?parentIcao } }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". ?a rdfs:label ?label . ?parent rdfs:label ?parentLabel . }
}`;
  const res = await fetch(`https://query.wikidata.org/sparql`, {
    method: 'POST',
    headers: { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ query }),
  });
  if (!res.ok) throw new Error(`Wikidata query failed: HTTP ${res.status}`);
  const json = (await res.json()) as { results: { bindings: Record<string, { value: string }>[] } };
  for (const b of json.results.bindings) rows.push(Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])));
  await new Promise((r) => setTimeout(r, 1000));
}
await writeFile(file, JSON.stringify({ downloaded: new Date().toISOString(), rows, looked: [...looked, ...todo] }));
console.log(`Wikidata extra airlines: ${new Set(rows.map((r) => r.a)).size} found in total (${todo.length} new articles looked up)`);

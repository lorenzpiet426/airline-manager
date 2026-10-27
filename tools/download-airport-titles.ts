// Downloads which English Wikipedia article belongs to which airport (ICAO code), from Wikidata (CC0).
// Needed to read Wikipedia's "Airlines and destinations" tables, which link to airport articles.
// Output: tools/raw/wikidata-airport-titles.json. Run: node tools/download-airport-titles.ts
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const USER_AGENT = 'AirlineManagerGame/0.1 (https://github.com/lorenzpiet426/airline-manager; hobby game data pipeline)';
const QUERY = `
SELECT ?icao ?article WHERE {
  ?airport wdt:P239 ?icao .
  ?article schema:about ?airport ; schema:isPartOf <https://en.wikipedia.org/> .
}`;
const res = await fetch(`https://query.wikidata.org/sparql?query=${encodeURIComponent(QUERY)}`, {
  headers: { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT },
});
if (!res.ok) throw new Error(`Wikidata query failed: HTTP ${res.status}`);
const json = (await res.json()) as { results: { bindings: { icao: { value: string }; article: { value: string } }[] } };
const titles: Record<string, string> = {};
for (const b of json.results.bindings) {
  const title = decodeURIComponent(b.article.value.replace('https://en.wikipedia.org/wiki/', '')).replace(/_/g, ' ');
  titles[title] = b.icao.value;
}
await writeFile(join(import.meta.dirname, 'raw', 'wikidata-airport-titles.json'), JSON.stringify(titles));
console.log(`Airport articles: ${Object.keys(titles).length}`);

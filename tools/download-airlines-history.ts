// Phase 6.3: airlines of past years. Downloads from Wikidata (CC0) the passenger airlines that have closed since 1970
// (names, codes, country, hubs, airline type, alliance, founding and closing day, successor) and the exact founding
// days of today's airlines, then the English Wikipedia articles (CC BY-SA 4.0) of the closed ones: infobox, "Fleet"
// section (incl. historical fleet tables) and categories. Today's airlines' articles come from
// download-airline-articles.ts. Output: tools/raw/wikidata-airlines-history.json, tools/raw/wikipedia-airlines-history.json
// (not in git). Run: node tools/download-airlines-history.ts
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { relevantParts, USER_AGENT } from './wikipedia.ts';

const RAW = join(import.meta.dirname, 'raw');

async function sparql(query: string): Promise<Record<string, string>[]> {
  const res = await fetch(`https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}`, {
    headers: { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`Wikidata query failed: HTTP ${res.status}`);
  const json = (await res.json()) as { results: { bindings: Record<string, { value: string }>[] } };
  return json.results.bindings.map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])));
}

// Closed airlines with an ICAO or IATA code that still flew in 1970 or later, with at least a few Wikipedia language
// versions (tiny air-taxi firms have none). Dates come with their precision (11 = day, 10 = month, 9 = year).
const DEFUNCT = `
SELECT ?a ?label ?icao ?iata ?countryCode ?hubIcao ?typeLabel ?allianceLabel ?parentLabel ?inception ?inceptionPrec
       ?dissolved ?dissolvedPrec ?successor ?successorLabel ?callsign ?article ?sitelinks WHERE {
  ?a p:P576/psv:P576 [ wikibase:timeValue ?dissolved ; wikibase:timePrecision ?dissolvedPrec ] ;
     wikibase:sitelinks ?sitelinks .
  FILTER(?dissolved >= "1970-01-01"^^xsd:dateTime && ?sitelinks >= 3)
  { ?a wdt:P230 ?icao } UNION { ?a wdt:P229 ?iata ; wdt:P31/wdt:P279* wd:Q46970 }
  OPTIONAL { ?a wdt:P229 ?iata }
  OPTIONAL { ?a wdt:P17 ?country . ?country wdt:P297 ?countryCode }
  OPTIONAL { ?a wdt:P113 ?hub . ?hub wdt:P239 ?hubIcao }
  OPTIONAL { ?a wdt:P31 ?type }
  OPTIONAL { ?a wdt:P114 ?alliance }
  OPTIONAL { ?a wdt:P749 ?parent }
  OPTIONAL { ?a p:P571/psv:P571 [ wikibase:timeValue ?inception ; wikibase:timePrecision ?inceptionPrec ] }
  OPTIONAL { ?a wdt:P1366|wdt:P156|wdt:P7888 ?successor }
  OPTIONAL { ?a wdt:P432 ?callsign }
  OPTIONAL { ?article schema:about ?a ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". ?a rdfs:label ?label . ?type rdfs:label ?typeLabel .
    ?alliance rdfs:label ?allianceLabel . ?parent rdfs:label ?parentLabel . ?successor rdfs:label ?successorLabel . }
}`;

// Founding days of today's airlines (the first download keeps only the year).
const FOUNDED = `
SELECT ?a ?icao ?inception ?inceptionPrec WHERE {
  ?a wdt:P230 ?icao ; p:P571/psv:P571 [ wikibase:timeValue ?inception ; wikibase:timePrecision ?inceptionPrec ] .
  FILTER NOT EXISTS { ?a wdt:P576 ?dissolved }
  FILTER(?inception >= "1960-01-01"^^xsd:dateTime)
}`;

const defunct = await sparql(DEFUNCT);
const founded = await sparql(FOUNDED);
await writeFile(join(RAW, 'wikidata-airlines-history.json'), JSON.stringify({ downloaded: new Date().toISOString(), defunct, founded }));
console.log(`Wikidata: ${defunct.length} rows of closed airlines, ${founded.length} founding days.`);

// Wikipedia articles of the closed airlines (50 per request).
const titles = [...new Set(defunct.map((r) => r.article).filter((x): x is string => !!x))].map((u) =>
  decodeURIComponent(u.replace('https://en.wikipedia.org/wiki/', '')).replace(/_/g, ' '),
);
let previous: Record<string, unknown> = {};
try {
  previous = JSON.parse(await readFile(join(RAW, 'wikipedia-airlines-history.json'), 'utf8')).articles;
} catch {
  // first run
}
const out: Record<string, { title: string; revid: number; infobox: string; fleet: string; categories: string[] }> = {};
const todo = titles.filter((t) => !previous[t]);
for (const t of titles) if (previous[t]) out[t] = previous[t] as (typeof out)[string];
for (let i = 0; i < todo.length; i += 50) {
  const batch = todo.slice(i, i + 50);
  const params = new URLSearchParams({
    action: 'query', prop: 'revisions|categories', rvprop: 'content|ids', rvslots: 'main', cllimit: 'max', clshow: '!hidden',
    titles: batch.join('|'), redirects: '1', format: 'json', formatversion: '2',
  });
  const res = await fetch('https://en.wikipedia.org/w/api.php', { method: 'POST', body: params, headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Wikipedia: HTTP ${res.status}`);
  const json = await res.json();
  if (!json.query) throw new Error(`Wikipedia error: ${JSON.stringify(json).slice(0, 300)}`);
  const back = new Map<string, string>();
  for (const n of [...(json.query.normalized ?? []), ...(json.query.redirects ?? [])]) back.set(n.to, back.get(n.from) ?? n.from);
  for (const page of json.query.pages ?? []) {
    const rev = page.revisions?.[0];
    if (!rev) continue;
    const asked = back.get(page.title) ?? page.title;
    out[asked] = {
      title: page.title,
      revid: rev.revid,
      ...relevantParts(rev.slots.main.content),
      categories: (page.categories ?? []).map((c: { title: string }) => c.title.replace(/^Category:/, '')),
    };
  }
  process.stdout.write(`\r${Math.min(i + 50, todo.length)} / ${todo.length}`);
  await new Promise((r) => setTimeout(r, 1000));
}
await writeFile(join(RAW, 'wikipedia-airlines-history.json'), JSON.stringify({ downloaded: new Date().toISOString(), articles: out }));
console.log(`\nArticles of closed airlines: ${Object.keys(out).length}; with a fleet section: ${Object.values(out).filter((a) => a.fleet).length}`);

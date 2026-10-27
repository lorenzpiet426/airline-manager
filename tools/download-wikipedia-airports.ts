// Downloads the "Airlines and destinations" section of every airport article on English Wikipedia (CC BY-SA 4.0)
// for the game's airports: 50 articles per request, one request at a time. Only that section is kept.
// Output: tools/raw/wikipedia-airports.json (not in git). Run: node tools/download-wikipedia-airports.ts
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { USER_AGENT } from './wikipedia.ts';

const RAW = join(import.meta.dirname, 'raw');
const ROOT = join(import.meta.dirname, '..');

const titles = JSON.parse(await readFile(join(RAW, 'wikidata-airport-titles.json'), 'utf8')) as Record<string, string>;
const airports = JSON.parse(await readFile(join(ROOT, 'src/data/generated/airports.json'), 'utf8')) as { id: string }[];
const titleOf = new Map<string, string>();
for (const [title, icao] of Object.entries(titles)) if (!titleOf.has(icao)) titleOf.set(icao, title);
const wanted = airports.map((a) => a.id).filter((id) => titleOf.has(id));

/** The "Airlines and destinations" section (up to the next level-2 heading). */
function destinationSection(wikitext: string): string | null {
  const start = wikitext.search(/==\s*Airlines and destinations\s*==/i);
  if (start < 0) return null;
  const rest = wikitext.slice(start + 10);
  const end = rest.search(/\n==[^=]/);
  return wikitext.slice(start, end < 0 ? undefined : start + 10 + end);
}

const out: Record<string, { title: string; revid: number; section: string | null }> = {};
for (let i = 0; i < wanted.length; i += 50) {
  const batch = wanted.slice(i, i + 50);
  const byTitle = new Map(batch.map((id) => [titleOf.get(id)!, id]));
  const params = new URLSearchParams({
    action: 'query',
    prop: 'revisions',
    rvprop: 'content|ids',
    rvslots: 'main',
    titles: [...byTitle.keys()].join('|'),
    redirects: '1',
    format: 'json',
    formatversion: '2',
  });
  const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Wikipedia: HTTP ${res.status}`);
  const q = (await res.json()).query ?? {};
  // Follow normalisations/redirects back to our ICAO codes.
  const back = new Map<string, string>();
  for (const n of [...(q.normalized ?? []), ...(q.redirects ?? [])]) back.set(n.to, back.get(n.from) ?? byTitle.get(n.from) ?? n.from);
  for (const page of q.pages ?? []) {
    const icao = byTitle.get(page.title) ?? byTitle.get(back.get(page.title) ?? '') ?? null;
    const rev = page.revisions?.[0];
    if (!icao || !rev) continue;
    out[icao] = { title: page.title, revid: rev.revid, section: destinationSection(rev.slots.main.content) };
  }
  process.stdout.write(`\r${Math.min(i + 50, wanted.length)} / ${wanted.length}`);
  await new Promise((r) => setTimeout(r, 1000));
}
await writeFile(join(RAW, 'wikipedia-airports.json'), JSON.stringify({ downloaded: new Date().toISOString(), airports: out }));
const withSection = Object.values(out).filter((a) => a.section).length;
console.log(`\nAirport articles: ${Object.keys(out).length}, with "Airlines and destinations": ${withSection}`);

// Downloads the English Wikipedia articles (CC BY-SA 4.0) of every airline that has routes in routes-wikipedia.json:
// infobox (hubs, focus cities, bases), the "Fleet" section and the article's categories (e.g. "Low-cost carriers").
// 50 articles per request, one request at a time. Output: tools/raw/wikipedia-airlines.json (not in git).
// Run after build-wikipedia-routes.ts: node tools/download-airline-articles.ts
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { USER_AGENT } from './wikipedia.ts';

const RAW = join(import.meta.dirname, 'raw');
const OUT = join(import.meta.dirname, '..', 'src/data/generated');
const airlines = JSON.parse(await readFile(join(OUT, 'airlines.json'), 'utf8')).airlines as { id: string; wikipedia: string | null }[];
const routes = JSON.parse(await readFile(join(RAW, 'routes-wikipedia.json'), 'utf8')).routes as { airline: string }[];
const withRoutes = new Set(routes.map((r) => r.airline));
const wanted = airlines.filter((a) => a.wikipedia && withRoutes.has(a.id));

/** Keep only what the pipeline reads: the infobox and the "Fleet" section. */
function relevantParts(wikitext: string): { infobox: string; fleet: string } {
  const ib = wikitext.search(/\{\{\s*Infobox airline/i);
  let infobox = '';
  if (ib >= 0) {
    let depth = 0;
    for (let i = ib; i < wikitext.length - 1; i++) {
      if (wikitext.startsWith('{{', i)) depth++, i++;
      else if (wikitext.startsWith('}}', i)) {
        depth--, i++;
        if (depth === 0) {
          infobox = wikitext.slice(ib, i + 1);
          break;
        }
      }
    }
  }
  const fs = wikitext.search(/\n==\s*Fleet\s*==/i);
  let fleet = '';
  if (fs >= 0) {
    const rest = wikitext.slice(fs + 5);
    const end = rest.search(/\n==[^=]/);
    fleet = wikitext.slice(fs, end < 0 ? undefined : fs + 5 + end);
  }
  return { infobox, fleet };
}

const out: Record<string, { title: string; revid: number; infobox: string; fleet: string; categories: string[] }> = {};
for (let i = 0; i < wanted.length; i += 50) {
  const batch = wanted.slice(i, i + 50);
  const byTitle = new Map(batch.map((a) => [a.wikipedia!, a.id]));
  const params = new URLSearchParams({
    action: 'query',
    prop: 'revisions|categories',
    rvprop: 'content|ids',
    rvslots: 'main',
    cllimit: 'max',
    clshow: '!hidden',
    titles: [...byTitle.keys()].join('|'),
    redirects: '1',
    format: 'json',
    formatversion: '2',
  });
  const res = await fetch('https://en.wikipedia.org/w/api.php', { method: 'POST', body: params, headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Wikipedia: HTTP ${res.status}`);
  const json = await res.json();
  if (!json.query) throw new Error(`Wikipedia error: ${JSON.stringify(json).slice(0, 300)}`);
  const back = new Map<string, string>();
  for (const n of [...(json.query.normalized ?? []), ...(json.query.redirects ?? [])]) back.set(n.to, back.get(n.from) ?? n.from);
  for (const page of json.query.pages ?? []) {
    const id = byTitle.get(page.title) ?? byTitle.get(back.get(page.title) ?? '');
    const rev = page.revisions?.[0];
    if (!id || !rev) continue;
    out[id] = {
      title: page.title,
      revid: rev.revid,
      ...relevantParts(rev.slots.main.content),
      categories: (page.categories ?? []).map((c: { title: string }) => c.title.replace(/^Category:/, '')),
    };
  }
  process.stdout.write(`\r${Math.min(i + 50, wanted.length)} / ${wanted.length}`);
  await new Promise((r) => setTimeout(r, 1000));
}
// Big airlines keep their fleet in a separate article ("{{Main|Lufthansa fleet}}", "{{Excerpt|Delta Air Lines fleet}}"):
// fetch those too and use them as
// the fleet section (the parser stops at "Former fleet" headings).
const mains = new Map<string, string>();
for (const [id, a] of Object.entries(out)) {
  const m = a.fleet.match(/\{\{\s*(?:Main|Main article|Further|Excerpt)\s*\|\s*([^}|]*fleet[^}|]*)/i);
  if (m) mains.set(m[1]!.trim(), id);
}
const mainTitles = [...mains.keys()];
for (let i = 0; i < mainTitles.length; i += 50) {
  const params = new URLSearchParams({
    action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main',
    titles: mainTitles.slice(i, i + 50).join('|'), redirects: '1', format: 'json', formatversion: '2',
  });
  const res = await fetch('https://en.wikipedia.org/w/api.php', { method: 'POST', body: params, headers: { 'User-Agent': USER_AGENT } });
  const json = await res.json();
  const back = new Map<string, string>();
  for (const n of [...(json.query?.normalized ?? []), ...(json.query?.redirects ?? [])]) back.set(n.to, back.get(n.from) ?? n.from);
  for (const page of json.query?.pages ?? []) {
    const id = mains.get(page.title) ?? mains.get(back.get(page.title) ?? '');
    const content = page.revisions?.[0]?.slots.main.content as string | undefined;
    if (id && content) out[id]!.fleet = `== Fleet ==\n(from [[${page.title}]])\n${content}`;
  }
  await new Promise((r) => setTimeout(r, 1000));
}
console.log(`\nSeparate fleet articles: ${mains.size}`);

await writeFile(join(RAW, 'wikipedia-airlines.json'), JSON.stringify({ downloaded: new Date().toISOString(), airlines: out }));
console.log(`\nAirline articles: ${Object.keys(out).length}; with fleet section: ${Object.values(out).filter((a) => a.fleet).length}`);

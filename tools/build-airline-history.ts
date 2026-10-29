// Phase 6.3: builds src/data/generated/airline-history.json — the airlines of past years:
//  - closed airlines (Wikidata, CC0): names, codes, country, hubs (Wikidata + Wikipedia infobox), business model,
//    founding and closing day, successor;
//  - founding days of today's airlines (Wikidata);
//  - historical fleets (English Wikipedia fleet tables, CC BY-SA 4.0): which types an airline flew from which year to
//    which year, and how many where the table says so.
// Run after download-airlines-history.ts and download-airline-articles.ts: node tools/build-airline-history.ts
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mapHistoricalType } from './aircraft-names.ts';
import { cleanWikitext, linkTargets, resolveTitles } from './wikipedia.ts';

const RAW = join(import.meta.dirname, 'raw');
const OUT = join(import.meta.dirname, '..', 'src/data/generated');

type Row = Record<string, string | undefined>;
type ArticleParts = { title: string; revid: number; infobox: string; fleet: string; categories: string[] };
const wd = JSON.parse(await readFile(join(RAW, 'wikidata-airlines-history.json'), 'utf8')) as { downloaded: string; defunct: Row[]; founded: Row[] };
const defunctArticles = JSON.parse(await readFile(join(RAW, 'wikipedia-airlines-history.json'), 'utf8')).articles as Record<string, ArticleParts>;
const todayArticles = JSON.parse(await readFile(join(RAW, 'wikipedia-airlines.json'), 'utf8')).airlines as Record<string, ArticleParts>;
const today = JSON.parse(await readFile(join(OUT, 'airlines.json'), 'utf8')).airlines as { id: string; icao: string | null; wikidata: string; founded: number | null }[];
const airports = JSON.parse(await readFile(join(OUT, 'airports.json'), 'utf8')) as { id: string }[];
const airportIds = new Set(airports.map((a) => a.id));
const airportTitles = JSON.parse(await readFile(join(RAW, 'wikidata-airport-titles.json'), 'utf8')) as Record<string, string>;
const todayByQid = new Map(today.map((a) => [a.wikidata, a.id]));

/** Corrections where Wikidata's dates are not when flights stopped (source: the airline's Wikipedia article). */
const FIXES: Record<string, { ceased?: string; founded?: string; hubs?: string[] }> = {
  Q208372: { ceased: '2012-02-03' }, // Malév stopped flying on 3 Feb 2012 (the company was wound up in 2018)
  // Interflug flew from Schönefeld (closed 2020; in the game's airport history as DE-0440), not today's BER.
  Q573915: { hubs: ['DE-0440'] },
};

const qidOf = (url: string) => url.replace('http://www.wikidata.org/entity/', '');
const titleOf = (url: string) => decodeURIComponent(url.replace('https://en.wikipedia.org/wiki/', '')).replace(/_/g, ' ');

/** A Wikidata date as a day: day precision as it is; month precision → the 15th; year precision → 1 Jan (founding)
 * or 1 Jul (closing, the middle of the year). */
function day(value: string | undefined, precision: string | undefined, kind: 'start' | 'end'): string | null {
  if (!value) return null;
  const m = value.match(/^(-?\d{4})-(\d\d)-(\d\d)/);
  if (!m || m[1]!.startsWith('-')) return null;
  const p = Number(precision ?? 11);
  if (p >= 11) return `${m[1]}-${m[2]}-${m[3]}`;
  if (p === 10) return `${m[1]}-${m[2]}-15`;
  return kind === 'start' ? `${m[1]}-01-01` : `${m[1]}-07-01`;
}

// ─── Fleet tables ────────────────────────────────────────────────────────────────

/** [type, first year, last year (null = still flying when the table was written / at closure), aircraft (or null)]. */
type FleetSpan = [string, number | null, number | null, number | null];

const yearIn = (text: string): number | null => {
  const m = text.match(/\b(19[2-9]\d|20[0-2]\d)\b/);
  return m ? Number(m[1]) : null;
};
const countIn = (text: string): number | null => {
  const v = text.replace(/<[^>]+>|\{\{[^}]*\}\}|'''|''/g, '').trim();
  const m = v.match(/^(\d{1,3})(?:\s|$|\D)/);
  return m && !/^(19|20)\d\d/.test(v) ? Number(m[1]) : null;
};
const attrs = /^([^|[\]{}]*?=[^|[\]{}]*)\|(?!\|)/;
const plain = (cell: string) => cell.replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2').replace(/\{\{[^}]*\}\}/g, '').replace(/'''?/g, '').trim();

/** Every wikitable of a section as a grid of cell texts (rowspans copied down), with its header row. */
function tables(section: string): { header: string[]; rows: string[][] }[] {
  const text = cleanWikitext(section);
  const out: { header: string[]; rows: string[][] }[] = [];
  for (const m of text.matchAll(/\{\|[\s\S]*?\n\|\}/g)) {
    const header: string[] = [];
    const rows: string[][] = [];
    const pending: { value: string; left: number }[] = [];
    // The first chunk is the table start ("{| class=…"), maybe followed by the header without a "|-" before it.
    for (const raw of m[0].split(/\n\|-[^\n]*/)) {
      const lines = raw.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('{|') && !l.startsWith('|+') && !l.startsWith('|}'));
      if (!lines.length) continue;
      if (lines.every((l) => l.startsWith('!'))) {
        if (!header.length) for (const l of lines) for (const c of l.slice(1).split('!!')) header.push(plain(c.replace(attrs, '')).toLowerCase());
        continue;
      }
      // Cells: lines starting with "|" or "!" (row headers), split at "||"; text lines continue the previous cell.
      const cells: { text: string; rowspan: number }[] = [];
      for (const l of lines) {
        if (l.startsWith('|') || l.startsWith('!')) {
          for (const c of l.slice(1).split(/\|\||!!/)) {
            const a = c.match(attrs);
            const span = a ? Number(a[1]!.match(/rowspan\s*=\s*"?(\d+)/i)?.[1] ?? 1) : 1;
            cells.push({ text: a ? c.slice(a[0].length) : c, rowspan: span });
          }
        } else if (cells.length) cells[cells.length - 1]!.text += `\n${l}`;
      }
      const grid: string[] = [];
      let k = 0;
      for (let col = 0; k < cells.length || pending.slice(col).some((p) => p && p.left > 0); col++) {
        const p = pending[col];
        if (p && p.left > 0) {
          grid.push(p.value);
          p.left--;
          continue;
        }
        const c = cells[k++];
        if (!c) break;
        grid.push(c.text);
        if (c.rowspan > 1) pending[col] = { value: c.text, left: c.rowspan - 1 };
      }
      rows.push(grid);
    }
    out.push({ header, rows });
  }
  return out;
}

function fleetSpans(section: string, closingYear: number | null): FleetSpan[] {
  const spans: FleetSpan[] = [];
  const all = tables(section);
  const col = (header: string[], re: RegExp) => header.findIndex((h) => re.test(h));
  const history = all.filter((t) => col(t.header, /introduc|deliver|entered|first|^from|start|joined|acquired|years|period/) >= 0 || col(t.header, /retir|withdrawn|last|until|left|exit|phased/) >= 0);
  // A closed airline without a history table: its fleet when it closed (the first table with a type column).
  const use = history.length ? history : closingYear !== null ? all.slice(0, 1) : [];
  for (const t of use) {
    const typeCol = Math.max(0, col(t.header, /aircraft|type|model/));
    const totalCol = col(t.header, /total|number|quantity|^fleet|in service|^no\.?$|operated/);
    const introCol = col(t.header, /introduc|deliver|entered|first|^from|start|joined|acquired|years|period/);
    const retCol = col(t.header, /retir|withdrawn|last|until|left|exit|phased/);
    let lastType: string | null = null;
    for (const r of t.rows) {
      const name = r[typeCol] ?? '';
      const typed = mapHistoricalType([...linkTargets(name), plain(name)].join(' '));
      if (typed === null) continue;
      const type = typed ?? (plain(name) === '' ? lastType : undefined);
      if (!type) continue;
      lastType = type;
      let from = introCol >= 0 ? yearIn(r[introCol] ?? '') : null;
      let to = retCol >= 0 ? yearIn(r[retCol] ?? '') : null;
      // "1975–1990" in one column.
      if (introCol >= 0 && retCol < 0) {
        const years = [...(r[introCol] ?? '').matchAll(/\b(19[2-9]\d|20[0-2]\d)\b/g)].map((x) => Number(x[1]));
        if (years.length >= 2) [from, to] = [years[0]!, years[years.length - 1]!];
      }
      // A history table row without any year (an order never delivered, a note) says nothing about when it flew.
      if (history.length && from === null && to === null) continue;
      // No last year: for a closed airline's fleet at closure, it flew until the end; otherwise left open (the game
      // assumes at most 30 years, until the closing day).
      if (to === null && from === null && closingYear !== null) to = closingYear;
      if (from !== null && to !== null && to < from) continue;
      spans.push([type, from, to, totalCol >= 0 ? countIn(r[totalCol] ?? '') : null]);
    }
  }
  // One span per type: the widest years, the counts added up.
  const byType = new Map<string, FleetSpan>();
  for (const s of spans) {
    const e = byType.get(s[0]);
    if (!e) byType.set(s[0], [...s]);
    else {
      e[1] = e[1] === null || s[1] === null ? (e[1] ?? s[1]) : Math.min(e[1], s[1]);
      e[2] = e[2] === null || s[2] === null ? null : Math.max(e[2], s[2]);
      e[3] = e[3] === null && s[3] === null ? null : (e[3] ?? 0) + (s[3] ?? 0);
    }
  }
  return [...byType.values()];
}

// ─── Closed airlines ─────────────────────────────────────────────────────────────

const EXCLUDED_TYPES = /cargo airline|helicopter|air force|virtual airline|flight school|air ambulance|aerial firefighting|government|military|logistics/i;

interface Defunct {
  qid: string; name: string; iata: string | null; icao: string | null; country: string | null; hubs: Set<string>;
  types: Set<string>; alliance: string | null; parent: string | null; founded: string | null; ceased: string;
  successor: string | null; successorQid: string | null; article: string | null; sitelinks: number;
}
const items = new Map<string, Defunct>();
for (const r of wd.defunct) {
  const qid = qidOf(r.a!);
  const ceased = day(r.dissolved, r.dissolvedPrec, 'end');
  if (!ceased) continue;
  const item = items.get(qid) ?? {
    qid, name: r.label ?? qid, iata: r.iata ?? null, icao: r.icao ?? null, country: r.countryCode ?? null, hubs: new Set<string>(),
    types: new Set<string>(), alliance: r.allianceLabel ?? null, parent: r.parentLabel ?? null,
    founded: day(r.inception, r.inceptionPrec, 'start'), ceased, successor: r.successorLabel ?? null,
    successorQid: r.successor ? qidOf(r.successor) : null, article: r.article ? titleOf(r.article) : null, sitelinks: Number(r.sitelinks ?? 0),
  };
  // Several values (two closing dates, two successors): the earliest closing day (flights stop before the company is
  // wound up, e.g. Malév 2012 / 2018) and the first successor.
  if (ceased < item.ceased) item.ceased = ceased;
  if (r.hubIcao && airportIds.has(r.hubIcao)) item.hubs.add(r.hubIcao);
  if (r.typeLabel) item.types.add(r.typeLabel);
  items.set(qid, item);
}

const field = (infobox: string, name: string) => {
  const m = cleanWikitext(infobox).match(new RegExp(`\\|\\s*${name}\\s*=([\\s\\S]*?)(?=\\n\\s*\\|\\s*\\w+\\s*=|\\n\\}\\})`, 'i'));
  return m ? m[1]! : '';
};
const baseFields = ['hubs', 'secondary_hubs', 'focus_cities', 'operating_bases', 'bases'];
const allLinks = Object.values(defunctArticles).flatMap((a) => baseFields.flatMap((f) => linkTargets(field(a.infobox, f))));
const resolved = await resolveTitles(allLinks);
const airportOf = (t: string) => airportTitles[t] ?? airportTitles[resolved.get(t) ?? ''] ?? null;

function model(types: Set<string>, categories: string[]): 'legacy' | 'lowcost' | 'regional' | 'charter' {
  const cats = categories.join(' | ');
  if (types.has('low-cost airline') || /Low-cost carriers|low-cost airlines/i.test(cats)) return 'lowcost';
  if (types.has('charter airline') || types.has('tour operator') || /Charter airlines/i.test(cats)) return 'charter';
  if (types.has('regional airline') || /Regional airlines/i.test(cats)) return 'regional';
  return 'legacy';
}

const defunct = [];
const fleets: Record<string, FleetSpan[]> = {};
let skipped = { type: 0, noHub: 0, early: 0 };
for (const i of items.values()) {
  const article = i.article ? defunctArticles[i.article] : undefined;
  const categories = article?.categories ?? [];
  const { hubs: fixedHubs, ...fixedDates } = FIXES[i.qid] ?? {};
  Object.assign(i, fixedDates);
  if ([...i.types].some((t) => EXCLUDED_TYPES.test(t)) || (categories.some((c) => /cargo airlines/i.test(c)) && !categories.some((c) => /^Defunct airlines of/i.test(c)))) {
    skipped.type++;
    continue;
  }
  if (i.ceased < '1970-01-01' || (i.founded && i.founded >= i.ceased)) {
    skipped.early++;
    continue;
  }
  const hubs = new Set(i.hubs);
  const bases = new Set<string>();
  if (article) {
    for (const t of linkTargets(field(article.infobox, 'hubs') + field(article.infobox, 'secondary_hubs'))) {
      const id = airportOf(t);
      if (id && airportIds.has(id)) hubs.add(id);
    }
    for (const t of linkTargets(field(article.infobox, 'focus_cities') + field(article.infobox, 'operating_bases') + field(article.infobox, 'bases'))) {
      const id = airportOf(t);
      if (id && airportIds.has(id) && !hubs.has(id)) bases.add(id);
    }
  }
  if (fixedHubs) {
    hubs.clear();
    for (const h of fixedHubs) hubs.add(h);
  }
  if (!hubs.size && !bases.size) {
    skipped.noHub++;
    continue;
  }
  // A Wikidata hub list without order: the infobox order would be better, but Wikidata has no rank; keep sorted.
  defunct.push({
    id: i.qid, name: /^Q\d+$/.test(i.name) && i.article ? i.article.replace(/\s*\((airline|company|airlines)\)$/i, '') : i.name,
    iata: i.iata, icao: i.icao, country: i.country, model: model(i.types, categories), hubs: [...hubs].sort(), bases: [...bases].sort(),
    alliance: i.alliance, parent: i.parent, founded: i.founded, ceased: i.ceased, successor: i.successor,
    successorId: i.successorQid ? (todayByQid.get(i.successorQid) ?? (items.has(i.successorQid) ? i.successorQid : null)) : null,
    wikipedia: i.article, fame: i.sitelinks,
  });
  if (article?.fleet) {
    const spans = fleetSpans(article.fleet, Number(i.ceased.slice(0, 4)));
    if (spans.length) fleets[i.qid] = spans;
  }
}
defunct.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));

// Today's airlines: historical fleet tables and founding days.
const todayIds = new Set(today.map((a) => a.id));
for (const [id, a] of Object.entries(todayArticles)) {
  if (!todayIds.has(id) || !a.fleet) continue;
  const cut = cleanWikitext(a.fleet).search(/\n==+\s*(Former|Historic(al)?|Retired|Past|Previous)[^=]*==+/i);
  const spans = cut >= 0 ? fleetSpans(cleanWikitext(a.fleet).slice(cut), null) : fleetSpans(a.fleet, null).filter((s) => s[1] !== null || s[2] !== null);
  if (spans.length) fleets[id] = spans;
}
const founded: Record<string, string> = {};
const byQid = new Map(today.map((a) => [a.wikidata, a]));
for (const r of wd.founded) {
  const a = byQid.get(qidOf(r.a!));
  const d = day(r.inception, r.inceptionPrec, 'start');
  if (a && d && (!founded[a.id] || d < founded[a.id]!)) founded[a.id] = d;
}

await writeFile(
  join(OUT, 'airline-history.json'),
  `{"source":"Wikidata (CC0) and English Wikipedia fleet tables (CC BY-SA 4.0), downloaded ${wd.downloaded.slice(0, 10)}",\n` +
    `"defunct":[\n${defunct.map((d) => JSON.stringify(d)).join(',\n')}\n],\n` +
    `"founded":${JSON.stringify(founded)},\n` +
    `"fleets":{\n${Object.entries(fleets).map(([id, f]) => `${JSON.stringify(id)}:${JSON.stringify(f)}`).join(',\n')}\n}}\n`,
);
console.log(
  `Closed airlines: ${defunct.length} (skipped ${skipped.type} cargo/other, ${skipped.noHub} without a hub in the game, ${skipped.early} closed before 1970); ` +
    `founding days: ${Object.keys(founded).length}; historical fleets: ${Object.keys(fleets).length} airlines ` +
    `(${defunct.filter((d) => fleets[d.id]).length} closed ones)`,
);

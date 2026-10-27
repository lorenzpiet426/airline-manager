// Helpers for reading English Wikipedia (CC BY-SA 4.0) in the data pipeline: fetching an article's wikitext
// politely (descriptive User-Agent, one request at a time, local cache) and reading the "Airlines and destinations"
// tables of airport articles ({{Airport-dest-list}}), which say which airline flies where from that airport.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const USER_AGENT = 'AirlineManagerGame/0.1 (https://github.com/lorenzpiet426/airline-manager; hobby game data pipeline)';
const CACHE = join(import.meta.dirname, 'raw', 'wikipedia');

export interface Article {
  title: string;
  revid: number;
  wikitext: string;
}

/** The current wikitext of an article (follows redirects); cached in tools/raw/wikipedia. */
export async function fetchArticle(title: string): Promise<Article> {
  const file = join(CACHE, `${title.replace(/[ /]/g, '_')}.json`);
  try {
    const cached = JSON.parse(await readFile(file, 'utf8'));
    if (cached.parse) return { title: cached.parse.title, revid: cached.parse.revid, wikitext: cached.parse.wikitext };
  } catch {
    // not cached yet
  }
  const params = new URLSearchParams({ action: 'parse', page: title, prop: 'wikitext|revid', redirects: '1', format: 'json', formatversion: '2' });
  const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Wikipedia: HTTP ${res.status} for ${title}`);
  const text = await res.text();
  await mkdir(CACHE, { recursive: true });
  await writeFile(file, text);
  const json = JSON.parse(text);
  if (!json.parse) throw new Error(`Wikipedia: no article ${title}`);
  await new Promise((r) => setTimeout(r, 500)); // be gentle: at most ~2 requests per second
  return { title: json.parse.title, revid: json.parse.revid, wikitext: json.parse.wikitext };
}

/** Removes references, comments and line breaks that only matter for display. */
export function cleanWikitext(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/<br\s*\/?>/gi, '\n');
}

/** Splits at top-level "|" (not inside [[links]] or {{templates}}). */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depthLink = 0;
  let depthTpl = 0;
  let current = '';
  for (let i = 0; i < text.length; i++) {
    const two = text.slice(i, i + 2);
    if (two === '[[') { depthLink++; current += two; i++; continue; }
    if (two === ']]') { depthLink--; current += two; i++; continue; }
    if (two === '{{') { depthTpl++; current += two; i++; continue; }
    if (two === '}}') { depthTpl--; current += two; i++; continue; }
    if (text[i] === '|' && depthLink === 0 && depthTpl === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += text[i];
  }
  parts.push(current);
  return parts;
}

/** Link targets in order: [[Target|Label]] → Target. */
export const linkTargets = (text: string): string[] =>
  [...text.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)].map((m) => m[1]!.trim());

export interface DestinationEntry {
  /** Wikipedia article of the destination airport. */
  airport: string;
  seasonal: boolean;
  charter: boolean;
}

export interface AirlineDestinations {
  /** Wikipedia article of the airline (or its name if not linked). */
  airline: string;
  destinations: DestinationEntry[];
}

/**
 * Reads every {{Airport-dest-list}} in an airport article. Destinations after "Seasonal:" are seasonal,
 * after "Charter:" or "Seasonal charter:" charter flights.
 */
export function parseAirportDestinations(wikitext: string, section = 'Passenger'): AirlineDestinations[] {
  const text = cleanWikitext(wikitext);
  // Only the passenger part: from "=== Passenger ===" (if present) up to the cargo table or the next section.
  const start = text.search(new RegExp(`===\\s*${section}\\s*===`));
  let scope = start >= 0 ? text.slice(start) : text;
  const end = scope.slice(5).search(/\n===?\s*(Cargo|Statistics|Traffic)/i);
  if (end >= 0) scope = scope.slice(0, end + 5);
  const result: AirlineDestinations[] = [];
  for (const block of scope.matchAll(/\{\{\s*Airport-dest-list([\s\S]*?)\n\}\}/gi)) {
    const cells = splitTopLevel(block[1]!).slice(1); // [0] is the text before the first "|"
    for (let i = 0; i + 1 < cells.length; i += 2) {
      const airlineCell = cells[i]!;
      const airline = linkTargets(airlineCell)[0] ?? airlineCell.replace(/'''|''/g, '').trim();
      if (!airline || /^\d+$/.test(airline)) continue;
      const destinations: DestinationEntry[] = [];
      let seasonal = false;
      let charter = false;
      // Walk through the cell: markers like '''Seasonal:''' switch the mode for the links after them.
      for (const piece of cells[i + 1]!.split(/('''[^']+''')/)) {
        const marker = piece.match(/^'''([^']+)'''$/);
        if (marker) {
          const m = marker[1]!.toLowerCase();
          seasonal = m.includes('seasonal');
          charter = m.includes('charter');
          continue;
        }
        for (const airport of linkTargets(piece)) destinations.push({ airport, seasonal, charter });
      }
      result.push({ airline, destinations });
    }
  }
  return result;
}

/**
 * Where article titles point to after Wikipedia's redirects and spelling normalisation
 * (e.g. "Charles de Gaulle Airport" → "Paris Charles de Gaulle Airport"). 50 titles per request, cached.
 */
export async function resolveTitles(titles: string[]): Promise<Map<string, string>> {
  const file = join(CACHE, '_redirects.json');
  let cache: Record<string, string> = {};
  try {
    cache = JSON.parse(await readFile(file, 'utf8'));
  } catch {
    // no cache yet
  }
  const todo = [...new Set(titles)].filter((t) => !(t in cache));
  for (let i = 0; i < todo.length; i += 50) {
    const batch = todo.slice(i, i + 50);
    const params = new URLSearchParams({ action: 'query', titles: batch.join('|'), redirects: '1', format: 'json', formatversion: '2' });
    const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`Wikipedia: HTTP ${res.status} resolving titles`);
    const q = (await res.json()).query ?? {};
    const step = new Map<string, string>();
    for (const n of q.normalized ?? []) step.set(n.from, n.to);
    for (const r of q.redirects ?? []) step.set(r.from, r.to);
    for (const t of batch) {
      let target = t;
      for (let hops = 0; hops < 3 && step.has(target); hops++) target = step.get(target)!;
      cache[t] = target;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  await mkdir(CACHE, { recursive: true });
  await writeFile(file, JSON.stringify(cache));
  return new Map(titles.map((t) => [t, cache[t] ?? t]));
}

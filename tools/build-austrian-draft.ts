// Draft of Austrian Airlines' network and fleet for the owner to check (data-hand/austrian/).
// Routes: Vienna Airport's Wikipedia "Airlines and destinations" table (CC BY-SA 4.0); weekly flights = Eurostat route
// total (all airlines, summer 2024) split between the airlines serving it (estimate, tagged "modelled").
// Fleet: Austrian's Wikipedia fleet table (counts, seats) + Austro Control register (registrations, Sept 2026).
// Nothing here is "hand-checked" until the owner confirms it. Run: node tools/build-austrian-draft.ts
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fetchArticle, parseAirportDestinations, resolveTitles } from './wikipedia.ts';

const ROOT = join(import.meta.dirname, '..');
const OUT = join(ROOT, 'data-hand', 'austrian');
const HUB = 'LOWW';
const AIRLINE = 'Austrian Airlines';

const titles = JSON.parse(await readFile(join(import.meta.dirname, 'raw', 'wikidata-airport-titles.json'), 'utf8')) as Record<string, string>;
const airports = JSON.parse(await readFile(join(ROOT, 'src/data/generated/airports.json'), 'utf8')) as { id: string; iata: string | null; city: string; name: string }[];
const airportById = new Map(airports.map((a) => [a.id, a]));
const eurostat = JSON.parse(await readFile(join(ROOT, 'src/data/generated/routes-eurostat.json'), 'utf8')) as {
  routes: { from: string; to: string; weeklyFlights: number }[];
};
const airlines = JSON.parse(await readFile(join(ROOT, 'src/data/generated/airlines.json'), 'utf8')).airlines as { name: string; wikipedia: string | null; hubs: string[] }[];
const hubsByArticle = new Map(airlines.filter((a) => a.wikipedia).map((a) => [a.wikipedia!, a.hubs]));

// ─── Routes ────────────────────────────────────────────────────────────────────
const vie = await fetchArticle('Vienna Airport');
const table = parseAirportDestinations(vie.wikitext);
const os = table.find((t) => t.airline === AIRLINE);
if (!os) throw new Error('Austrian Airlines not found in the Vienna Airport table');

// Destination links may use old names or redirects: follow them to the airport article Wikidata knows.
const resolved = await resolveTitles(table.flatMap((t) => t.destinations.map((d) => d.airport)));
const icaoOf = (title: string) => titles[title] ?? titles[resolved.get(title) ?? ''] ?? null;
const totalFrom = (to: string) => eurostat.routes.find((r) => r.from === HUB && r.to === to)?.weeklyFlights ?? null;

/** Airlines flying from VIE to `icao`, with their weight for splitting the route total. */
function weights(icao: string): { airline: string; weight: number }[] {
  const list: { airline: string; weight: number }[] = [];
  for (const entry of table) {
    for (const d of entry.destinations) {
      if (icaoOf(d.airport) !== icao) continue;
      // The home carrier at VIE flies most often; the destination's own airline second; seasonal routes half.
      let w = entry.airline === AIRLINE ? 3 : (hubsByArticle.get(entry.airline) ?? []).includes(icao) ? 2 : 1;
      if (d.seasonal) w /= 2;
      list.push({ airline: entry.airline, weight: w });
    }
  }
  return list;
}

const routeRows: string[] = ['destination_iata,destination_icao,destination,season,weekly_flights,others_on_route,source,checked_on,notes'];
const unresolved: string[] = [];
const readable: string[] = [];
for (const d of os.destinations) {
  const icao = icaoOf(d.airport);
  const ap = icao ? airportById.get(icao) : undefined;
  if (!icao || !ap) {
    unresolved.push(d.airport);
    continue;
  }
  const total = totalFrom(icao);
  const w = weights(icao);
  const mine = w.find((x) => x.airline === AIRLINE)?.weight ?? 0;
  const sum = w.reduce((s, x) => s + x.weight, 0);
  const estimate = total === null ? null : Math.max(1, Math.round((total * mine) / sum));
  const others = w.filter((x) => x.airline !== AIRLINE).map((x) => x.airline);
  const season = d.seasonal ? 'seasonal' : 'year-round';
  const source = total === null ? 'wikipedia (no Eurostat 2024 total: new route?)' : 'modelled (Eurostat S24 total split between airlines)';
  routeRows.push(
    [ap.iata ?? '', icao, `"${ap.name}"`, season, estimate ?? '', `"${others.join('; ')}"`, `"${source}"`, '', total === null ? '' : `"all airlines: ${total}/week"`].join(','),
  );
  readable.push(
    `| ${ap.iata ?? icao} | ${ap.name} | ${season === 'seasonal' ? 'seasonal' : ''} | ${estimate ?? '?'} | ${total ?? '—'} | ${others.length ? others.join(', ') : '—'} |`,
  );
}
await writeFile(join(OUT, 'routes.csv'), routeRows.join('\n') + '\n');

// ─── Fleet ─────────────────────────────────────────────────────────────────────
// From Austrian's Wikipedia fleet table (as of July 2026) and the Austro Control register (30 Sept 2026).
// The register's operator column is empty, so registrations are matched by Austrian's usual series and type.
const FLEET: { type: string; wikipediaCount: number; orders: number; seats: string; registrations: string[]; note: string }[] = [
  {
    type: 'A320ceo', wikipediaCount: 29, orders: 0, seats: '0/0/174',
    registrations: ['OE-LBI', 'OE-LBJ', 'OE-LBK', 'OE-LBL', 'OE-LBM', 'OE-LBN', 'OE-LBO', 'OE-LBP', 'OE-LBQ', 'OE-LBR', 'OE-LBS', 'OE-LBT', 'OE-LBU', 'OE-LBV', 'OE-LBW', 'OE-LBX', 'OE-LBY', 'OE-LBZ', 'OE-LXA', 'OE-LXB', 'OE-LXC', 'OE-LXD', 'OE-LXE', 'OE-LZA', 'OE-LZB', 'OE-LZC', 'OE-LZD', 'OE-LZE', 'OE-LZF'],
    note: '29 = Wikipedia count. 11 older ones to be retired by 2028 (Wikipedia).',
  },
  {
    type: 'A320neo', wikipediaCount: 5, orders: 11, seats: '0/0/180',
    registrations: ['OE-LZN', 'OE-LZO', 'OE-LZP', 'OE-LZQ', 'OE-LZR', 'OE-LXF?', 'OE-LXG?'],
    note: 'OE-LZN–LZR (PW engines, A320-271N) match the 5 on Wikipedia. OE-LXF and OE-LXG are new LEAP-engined A320neo (A320-251N) — probably the first of the 11 ordered. To be checked.',
  },
  {
    type: 'A321ceo', wikipediaCount: 6, orders: 0, seats: 'variable (200)',
    registrations: ['OE-LBA', 'OE-LBB', 'OE-LBC', 'OE-LBD', 'OE-LBE', 'OE-LBF'],
    note: 'OE-LBA–LBC are A321-100, OE-LBD–LBF A321-200.',
  },
  { type: 'A321neo', wikipediaCount: 0, orders: 6, seats: 'TBA', registrations: [], note: 'On order (LEAP engines).' },
  {
    type: '767-300ER', wikipediaCount: 3, orders: 0, seats: '24/30/157',
    registrations: ['OE-LAE', 'OE-LAY', 'OE-LAZ'],
    note: 'To be retired by 2027. (OE-LYA–LYD are also 767-300s in the register but not in Austrian\'s series.)',
  },
  {
    type: '777-200ER', wikipediaCount: 6, orders: 0, seats: '32/40/258',
    registrations: ['OE-LPA', 'OE-LPB', 'OE-LPC', 'OE-LPD', 'OE-LPE', 'OE-LPF'],
    note: 'To be replaced by 787-9 by 2028.',
  },
  {
    type: '787-9', wikipediaCount: 3, orders: 14, seats: '26/21/247',
    registrations: ['OE-LPG', 'OE-LPI', 'OE-LPL', 'OE-LPM'],
    note: 'Register has 4, Wikipedia (July 2026) 3: the 4th is probably a recent delivery. Orders: 4 more + 10 from the Lufthansa Group order.',
  },
  {
    type: 'E195', wikipediaCount: 13, orders: 0, seats: '0/0/120',
    registrations: ['OE-LWA', 'OE-LWB', 'OE-LWC', 'OE-LWD', 'OE-LWE', 'OE-LWF', 'OE-LWG', 'OE-LWH', 'OE-LWI', 'OE-LWJ', 'OE-LWN', 'OE-LWO', 'OE-LWP'],
    note: '11 to go to Air Dolomiti by 2028, 4 to be sold (Wikipedia).',
  },
];
const fleetRows = ['registration,type,seats_business,seats_premium_economy,seats_economy,year_built,status,source,checked_on,notes'];
for (const f of FLEET) {
  const [c, w, y] = f.seats.includes('/') ? f.seats.split('/') : ['', '', ''];
  for (const reg of f.registrations) {
    const uncertain = reg.endsWith('?');
    fleetRows.push([reg.replace('?', ''), f.type, c, w, y, '', 'active', `"official register (Austro Control 30.09.2026) + wikipedia"`, '', uncertain ? '"uncertain: may not be Austrian"' : ''].join(','));
  }
  for (let i = 0; i < f.orders; i++) fleetRows.push(['', f.type, '', '', '', '', 'on order', '"wikipedia"', '', ''].join(','));
}
await writeFile(join(OUT, 'fleet.csv'), fleetRows.join('\n') + '\n');

// ─── Readable summary for the owner ────────────────────────────────────────────
const md = [
  '# Austrian Airlines — DRAFT to check (not hand-checked yet)',
  '',
  `Generated ${new Date().toISOString().slice(0, 10)} from Wikipedia (Vienna Airport article rev. ${vie.revid}; Austrian Airlines article),`,
  'Eurostat (summer 2024 route totals) and the Austro Control register (30 Sept 2026). Weekly flights are **estimates**:',
  'the Eurostat total for all airlines on the route, split between the airlines Wikipedia lists for it',
  '(Austrian counts 3×, the destination\'s home airline 2×, others 1×, seasonal half).',
  '',
  `## Routes from VIE (${readable.length})`,
  '',
  '| Code | Airport | Seasonal | Austrian flights/week (estimate) | All airlines/week (Eurostat S24) | Other airlines on the route |',
  '|---|---|---|---|---|---|',
  ...readable,
  '',
  unresolved.length ? `Not matched to an airport (please check): ${unresolved.join('; ')}` : 'All destinations matched to an airport.',
  '',
  '## Fleet',
  '',
  '| Type | Wikipedia count | Registrations found | On order | Seats C/W/Y | Notes |',
  '|---|---|---|---|---|---|',
  ...FLEET.map((f) => `| ${f.type} | ${f.wikipediaCount} | ${f.registrations.length ? f.registrations.join(', ') : '—'} | ${f.orders || '—'} | ${f.seats} | ${f.note} |`),
  '',
];
await writeFile(join(OUT, 'DRAFT.md'), md.join('\n'));
console.log(`Austrian draft: ${readable.length} routes (${unresolved.length} unmatched), ${FLEET.reduce((s, f) => s + f.registrations.length, 0)} aircraft + ${FLEET.reduce((s, f) => s + f.orders, 0)} on order`);

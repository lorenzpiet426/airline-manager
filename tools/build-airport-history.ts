// Which airports existed in which year (Phase 5.3), for historical start years:
//  - REPLACED: big airports that closed and handed their role (usually their IATA code) to today's airport. Before the
//    change, today's airport is shown as the old one (location, name, runways from OurAirports' closed airports, public
//    domain); routes simply continue at the new airport on the day it opens. Dates: the airports' Wikipedia articles.
//  - CLOSED: old airports that ran next to today's one and then closed (Berlin Tempelhof, Schönefeld); routes move.
//  - Opening dates of today's airports (Wikidata official opening P1619, else inception P571; CC0, plus hand-checked
//    dates below). An airport opened after 1970 is only hidden before its opening when another airport within
//    SUBSTITUTE_KM in the same country was there instead — many "opening dates" are relocations of an airport with the
//    same code, which must not leave a city without flights.
// Input: tools/raw/airports.csv, runways.csv, history/wikidata/airport-dates.json, src/data/generated/airports.json
// Output: src/data/generated/airport-history.json. Run: node tools/build-airport-history.ts
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Airport, Runway } from '../src/data/types.ts';

const RAW = join(import.meta.dirname, 'raw');
const OUT = join(import.meta.dirname, '..', 'src', 'data', 'generated');
const SUBSTITUTE_KM = 60;
const FIRST_YEAR = '1970-01-01';

/** Today's airport ← the airport it replaced (OurAirports ident), until the move. */
const REPLACED: { id: string; old: string; until: string; iata: string; icao: string | null; wikipedia: string; reopens?: string }[] = [
  { id: 'VHHH', old: 'HK-0099', until: '1998-07-06', iata: 'HKG', icao: 'VHHX', wikipedia: 'Kai Tak Airport' },
  { id: 'EDDM', old: 'DE-0901', until: '1992-05-17', iata: 'MUC', icao: 'EDDM', wikipedia: 'Munich-Riem Airport' },
  { id: 'LGAV', old: 'GR-0098', until: '2001-03-28', iata: 'ATH', icao: 'LGAT', wikipedia: 'Ellinikon International Airport' },
  { id: 'ENGM', old: 'NO-0099', until: '1998-10-08', iata: 'FBU', icao: 'ENFB', wikipedia: 'Oslo Airport, Fornebu' },
  { id: 'KDEN', old: 'US-12484', until: '1995-02-28', iata: 'DEN', icao: 'KDEN', wikipedia: 'Stapleton International Airport' },
  { id: 'LTFM', old: 'LTBA', until: '2019-04-06', iata: 'IST', icao: 'LTBA', wikipedia: 'Istanbul Atatürk Airport' },
  { id: 'EDDB', old: 'DE-0876', until: '2020-11-08', iata: 'TXL', icao: 'EDDT', wikipedia: 'Berlin Tegel Airport' },
  { id: 'VOBL', old: 'VOBG', until: '2008-05-24', iata: 'BLR', icao: 'VOBG', wikipedia: 'HAL Airport' },
  { id: 'VOHS', old: 'VOHY', until: '2008-03-23', iata: 'HYD', icao: 'VOHY', wikipedia: 'Begumpet Airport' },
  { id: 'WSSS', old: 'WSAP', until: '1981-07-01', iata: 'SIN', icao: 'WSAP', wikipedia: 'Paya Lebar Air Base' },
  { id: 'OERK', old: 'OERY', until: '1983-12-05', iata: 'RUH', icao: 'OERY', wikipedia: 'Riyadh Air Base' },
  // Nicosia closed after the fighting in July 1974; Larnaca opened as Cyprus's airport in February 1975.
  { id: 'LCLK', old: 'CY-0087', until: '1974-07-20', reopens: '1975-02-08', iata: 'NIC', icao: 'LCNC', wikipedia: 'Nicosia International Airport' },
];

/** Old airports next to today's one that closed; their flights moved to `movedTo`. */
const CLOSED: { old: string; until: string; movedTo: string; iata: string; icao: string | null; wikipedia: string }[] = [
  { old: 'DE-0440', until: '2020-10-25', movedTo: 'EDDB', iata: 'SXF', icao: null, wikipedia: 'Berlin Schönefeld Airport' },
  { old: 'DE-0456', until: '2008-10-30', movedTo: 'EDDB', iata: 'THF', icao: 'EDDI', wikipedia: 'Berlin Tempelhof Airport' },
];

/** Opening dates checked by hand (Wikipedia articles of the airports); they win over Wikidata. */
const OPENED: Record<string, string> = {
  RJAA: '1978-05-20', RJBB: '1994-09-04', RKSI: '2001-03-29', VTBS: '2006-09-28', WMKK: '1998-06-30', ZSPD: '1999-10-01',
  ZBAD: '2019-09-25', KDFW: '1974-01-13', LFPG: '1974-03-08', RJGG: '2005-02-17', OIIE: '2004-05-08', SBGR: '1985-01-20',
  WIII: '1985-06-01', CYMX: '1975-10-04', OMDW: '2010-06-27', LTFJ: '2001-01-08', ZUTF: '2021-06-27', VMMC: '1995-11-09',
  EGLC: '1987-10-26', GCTS: '1978-11-06', OTHH: '2014-05-27',
};

/** Opening dates that are really relocations (the old airport had the same code and isn't in today's data). */
const RELOCATED = new Set(['RJCC', 'ZGGG', 'ZSHC', 'RKPK', 'KMCO', 'KAUS', 'UNKL']);
/** Substitutes checked by hand (the nearest airport isn't the one that had the flights). */
const SUBSTITUTE: Record<string, string> = { RJAA: 'RJTT' };

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  const [header, ...body] = rows;
  return body.filter((r) => r.length === header!.length).map((r) => Object.fromEntries(header!.map((h, i) => [h, r[i]!])));
}

function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

const game = JSON.parse(await readFile(join(OUT, 'airports.json'), 'utf8')) as Airport[];
const byId = new Map(game.map((a) => [a.id, a]));
const rows = parseCsv(await readFile(join(RAW, 'airports.csv'), 'utf8'));
const rowByIdent = new Map(rows.map((r) => [r.ident!, r]));
const runways = new Map<string, Runway[]>();
for (const r of parseCsv(await readFile(join(RAW, 'runways.csv'), 'utf8'))) {
  const ft = Number(r.length_ft);
  if (!ft || ft < 2000 || /^H\d*$/.test(r.le_ident ?? '')) continue;
  const list = runways.get(r.airport_ident!) ?? [];
  list.push({
    ends: [r.le_ident, r.he_ident].filter(Boolean).join('/'),
    lengthM: Math.round(ft * 0.3048),
    widthM: r.width_ft ? Math.round(Number(r.width_ft) * 0.3048) : null,
    // Old airline airports all had paved runways (OurAirports often lists closed ones without a surface).
    surface: 'hard',
  });
  runways.set(r.airport_ident!, list);
}

/** Runways of closed airports OurAirports lists without them (their Wikipedia articles). */
const RUNWAYS_BY_HAND: Record<string, Runway[]> = {
  'NO-0099': [
    { ends: '06/24', lengthM: 2200, widthM: 45, surface: 'hard' },
    { ends: '01/19', lengthM: 1800, widthM: 45, surface: 'hard' },
  ],
  'US-12484': [
    { ends: '17L/35R', lengthM: 3505, widthM: 46, surface: 'hard' },
    { ends: '08L/26R', lengthM: 3200, widthM: 46, surface: 'hard' },
  ],
};

/** The old airport as the game shows it, standing in for (or next to) today's airport `heir`. */
function oldAirport(ident: string, heir: Airport, iata: string, icao: string | null, id: string): Airport {
  const row = rowByIdent.get(ident);
  if (!row) throw new Error(`OurAirports has no ${ident}`);
  const rw = (runways.get(ident) ?? RUNWAYS_BY_HAND[ident] ?? []).sort((x, y) => y.lengthM - x.lengthM);
  if (!rw.length) throw new Error(`no runways for ${ident}`);
  return {
    ...heir,
    id,
    iata,
    icao,
    name: row.name!.replace(/^Flughafen /, ''),
    lat: Math.round(Number(row.latitude_deg) * 1e4) / 1e4,
    lon: Math.round(Number(row.longitude_deg) * 1e4) / 1e4,
    elevationFt: row.elevation_ft ? Number(row.elevation_ft) : heir.elevationFt,
    runways: rw,
    longestRunwayM: rw[0]!.lengthM,
  };
}

const replaced = REPLACED.map((r) => {
  const heir = byId.get(r.id);
  if (!heir) throw new Error(`no game airport ${r.id}`);
  if (byId.has(r.old)) throw new Error(`${r.old} is still a game airport: use OPENED instead`);
  return { id: r.id, until: r.until, ...(r.reopens ? { reopens: r.reopens } : {}), wikipedia: r.wikipedia, airport: oldAirport(r.old, heir, r.iata, r.icao, r.id) };
});
const closed = CLOSED.map((c) => {
  const heir = byId.get(c.movedTo)!;
  return { until: c.until, movedTo: c.movedTo, wikipedia: c.wikipedia, airport: { ...oldAirport(c.old, heir, c.iata, c.icao, c.old), marketPop: Math.round(heir.marketPop * 0.3) } };
});

// Opening dates: hand-checked first, then Wikidata (earliest official opening, else earliest inception).
const wd = JSON.parse(await readFile(join(RAW, 'history', 'wikidata', 'airport-dates.json'), 'utf8')) as {
  results: { bindings: Record<string, { value: string }>[] };
};
const dates = new Map<string, { opened?: string; inception?: string }>();
for (const b of wd.results.bindings) {
  const id = b.icao!.value;
  if (!byId.has(id)) continue;
  const e = dates.get(id) ?? {};
  for (const k of ['opened', 'inception'] as const) {
    const v = b[k]?.value.slice(0, 10);
    if (v && /^\d{4}-/.test(v) && (!e[k] || v < e[k]!)) e[k] = v;
  }
  dates.set(id, e);
}
const openedAt = (id: string): string | null => OPENED[id] ?? dates.get(id)?.opened ?? dates.get(id)?.inception ?? null;
const replacedIds = new Set(REPLACED.map((r) => r.id));

const opened: Record<string, [string, string]> = {};
const skipped: string[] = [];
for (const a of game) {
  if (replacedIds.has(a.id)) continue;
  const date = openedAt(a.id);
  if (!date || date <= FIRST_YEAR || RELOCATED.has(a.id)) continue;
  if (SUBSTITUTE[a.id]) {
    opened[a.id] = [date, SUBSTITUTE[a.id]!];
    continue;
  }
  // The nearest airport in the same country that already existed on that date takes the flights before.
  const near = game
    .filter((b) => b.id !== a.id && b.country === a.country && b.iata && (replacedIds.has(b.id) || (openedAt(b.id) ?? FIRST_YEAR) <= FIRST_YEAR) && b.size !== 'small')
    .map((b) => ({ b, d: distanceKm(a, b) }))
    .filter((x) => x.d <= SUBSTITUTE_KM)
    .sort((x, y) => x.d - y.d)[0];
  if (near) opened[a.id] = [date, near.b.id];
  else if (a.size !== 'small') skipped.push(`${a.iata ?? a.id} ${date}`);
}

await writeFile(
  join(OUT, 'airport-history.json'),
  JSON.stringify({ generated: new Date().toISOString().slice(0, 10), replaced, closed, opened }),
);
console.log(`Replaced airports: ${replaced.length}, closed: ${closed.length}, opened later (hidden before): ${Object.keys(opened).length}`);
console.log(`Opening dates ignored (no other airport nearby, probably a relocation): ${skipped.length}`);
console.log(Object.entries(opened).filter(([id]) => byId.get(id)!.size === 'large').map(([id, [d, s]]) => `${byId.get(id)!.iata} ${d} → ${byId.get(s)!.iata}`).join(', '));

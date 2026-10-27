// Turns the raw open datasets (tools/raw/) into the compact world database the game loads:
//   src/data/generated/airports.json   — every airport with scheduled passenger service
//   src/data/generated/countries.json  — country names, wealth and tourism figures
// Run with: npm run data:build   (download first with npm run data:download)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Airport, AirportSize, Country, Runway, RunwaySurface } from '../src/data/types.ts';

const RAW = join(import.meta.dirname, 'raw');
const OUT = join(import.meta.dirname, '..', 'src', 'data', 'generated');
const CATCHMENT_KM = 100;
/** Cities this close to an airport can fly from it (for splitting people between airports). */
const MARKET_KM = 150;
/** How strongly travellers prefer big airports (more flights) over small ones close by. */
const MARKET_SIZE_WEIGHT: Record<AirportSize, number> = { large: 1, medium: 0.25, small: 0.06 };
/** Distance decay of airport choice (km): an airport 50 km further away is ~2.7× less attractive. */
const MARKET_DECAY_KM = 50;

// ---------- Small helpers ----------

/** Parses CSV text (with "quoted, fields") into objects keyed by the header row. */
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
  if (field || row.length) rows.push([...row, field]);
  const [header, ...body] = rows;
  return body
    .filter((r) => r.length === header!.length)
    .map((r) => Object.fromEntries(header!.map((h, i) => [h, r[i]!])));
}

/** Great-circle distance in km. */
function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

const round = (n: number, decimals: number) => Math.round(n * 10 ** decimals) / 10 ** decimals;
const num = (s: string | undefined) => (s === undefined || s === '' ? null : Number(s));

function surfaceOf(code: string): RunwaySurface {
  const s = code.toUpperCase();
  if (/^(ASP|ASPH|BIT|CON|CONC|PEM|TAR|MAC|BRI|COP|PAV|PAVED|SEALED|TARMAC|ASFALT|ASFALTO|CEMENT)/.test(s)) return 'hard';
  if (/^(GRS|GRASS|GRE|GRV|GVL|GRAVEL|DIRT|TURF|SAN|SAND|CLA|CLAY|LAT|SOIL|COR|CORAL|EARTH|SNOW|ICE|UNPAVED|WATER)/.test(s)) return 'soft';
  return 'unknown';
}

// ---------- Cities (GeoNames): population + time zone ----------

interface City {
  name: string;
  lat: number;
  lon: number;
  pop: number;
  tz: string;
}

const cities: City[] = (await readFile(join(RAW, 'cities15000.txt'), 'utf8'))
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const f = line.split('\t');
    return { name: f[1]!, lat: Number(f[4]), lon: Number(f[5]), pop: Number(f[14]), tz: f[17]! };
  })
  .sort((a, b) => a.lat - b.lat);

/** All cities within `km` of a point (uses the latitude-sorted list to skip far-away cities). */
function citiesNear(lat: number, lon: number, km: number): { city: City; d: number }[] {
  const band = km / 111 + 0.01;
  let lo = 0;
  let hi = cities.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cities[mid]!.lat < lat - band) lo = mid + 1;
    else hi = mid;
  }
  const out: { city: City; d: number }[] = [];
  for (let i = lo; i < cities.length && cities[i]!.lat <= lat + band; i++) {
    const city = cities[i]!;
    const d = distanceKm(lat, lon, city.lat, city.lon);
    if (d <= km) out.push({ city, d });
  }
  return out;
}

function nearestCity(lat: number, lon: number): City {
  for (const km of [50, 200, 800, 3000, 20000]) {
    const near = citiesNear(lat, lon, km);
    if (near.length) return near.reduce((a, b) => (b.d < a.d ? b : a)).city;
  }
  throw new Error('no city found');
}

// ---------- Runways (OurAirports) ----------

const runwaysByAirport = new Map<string, Runway[]>();
for (const r of parseCsv(await readFile(join(RAW, 'runways.csv'), 'utf8'))) {
  const lengthFt = num(r.length_ft);
  if (r.closed === '1' || !lengthFt || lengthFt < 300) continue;
  if (/^H\d*$/.test(r.le_ident ?? '')) continue; // helipads
  const widthFt = num(r.width_ft);
  const runway: Runway = {
    ends: [r.le_ident, r.he_ident].filter(Boolean).join('/'),
    lengthM: Math.round(lengthFt * 0.3048),
    widthM: widthFt ? Math.round(widthFt * 0.3048) : null,
    surface: surfaceOf(r.surface ?? ''),
  };
  const list = runwaysByAirport.get(r.airport_ref!) ?? [];
  list.push(runway);
  runwaysByAirport.set(r.airport_ref!, list);
}

// ---------- Airports (OurAirports) ----------

const SIZES: Record<string, AirportSize> = {
  large_airport: 'large',
  medium_airport: 'medium',
  small_airport: 'small',
};

const airports: Airport[] = [];
for (const a of parseCsv(await readFile(join(RAW, 'airports.csv'), 'utf8'))) {
  const size = SIZES[a.type!];
  if (a.scheduled_service !== 'yes' || !size) continue;
  const lat = Number(a.latitude_deg);
  const lon = Number(a.longitude_deg);
  const runways = (runwaysByAirport.get(a.id!) ?? []).sort((x, y) => y.lengthM - x.lengthM);
  const nearest = nearestCity(lat, lon);
  const catchmentPop = citiesNear(lat, lon, CATCHMENT_KM).reduce((sum, { city }) => sum + city.pop, 0);
  airports.push({
    id: a.ident!,
    iata: a.iata_code || null,
    icao: a.icao_code || null,
    name: a.name!,
    city: a.municipality || nearest.name,
    country: a.iso_country!,
    lat: round(lat, 4),
    lon: round(lon, 4),
    elevationFt: num(a.elevation_ft),
    size,
    tz: nearest.tz,
    runways,
    longestRunwayM: runways[0]?.lengthM ?? 0,
    catchmentPop,
    marketPop: 0,
  });
}
airports.sort((x, y) => x.id.localeCompare(y.id));

// Market population: every city's people are shared among the airports within reach,
// weighted by airport size and distance (a "Huff" choice model). Unlike the catchment, nobody is
// counted twice: London's millions are split between Heathrow, Gatwick, Stansted, Luton and City.
{
  const byLat = [...airports].sort((a, b) => a.lat - b.lat);
  const band = MARKET_KM / 111 + 0.01;
  for (const city of cities) {
    let lo = 0;
    let hi = byLat.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (byLat[mid]!.lat < city.lat - band) lo = mid + 1;
      else hi = mid;
    }
    const near: { airport: Airport; w: number }[] = [];
    for (let i = lo; i < byLat.length && byLat[i]!.lat <= city.lat + band; i++) {
      const airport = byLat[i]!;
      const d = distanceKm(city.lat, city.lon, airport.lat, airport.lon);
      if (d <= MARKET_KM) near.push({ airport, w: MARKET_SIZE_WEIGHT[airport.size] * Math.exp(-d / MARKET_DECAY_KM) });
    }
    const total = near.reduce((sum, n) => sum + n.w, 0);
    for (const n of near) n.airport.marketPop += (city.pop * n.w) / total;
  }
  for (const a of airports) a.marketPop = Math.round(a.marketPop);
}

// ---------- Countries (OurAirports + World Bank) ----------

/**
 * Latest non-empty value per country from a World Bank API response.
 * `preferYear`: use that year when available (tourism 2020–2022 is distorted by COVID).
 */
async function latestWorldBank(
  file: string,
  preferYear?: number,
): Promise<Map<string, { value: number; year: number }>> {
  const [, records] = JSON.parse(await readFile(join(RAW, file), 'utf8')) as [
    unknown,
    { country: { id: string }; date: string; value: number | null }[],
  ];
  const out = new Map<string, { value: number; year: number }>();
  for (const r of records) {
    if (r.value === null) continue;
    const year = Number(r.date);
    const prev = out.get(r.country.id);
    if (preferYear !== undefined && prev?.year === preferYear) continue;
    if (!prev || year === preferYear || year > prev.year) out.set(r.country.id, { value: r.value, year });
  }
  return out;
}

const gdp = await latestWorldBank('gdp.json');
const tourism = await latestWorldBank('tourism.json', 2019);

// Fill gaps the World Bank does not cover (Taiwan, French overseas regions, small territories).
const supplement = JSON.parse(
  await readFile(join(import.meta.dirname, 'supplements', 'gdp-supplement.json'), 'utf8'),
) as { values: Record<string, { usd: number; year: number }>; parent: Record<string, string> };
for (const [code, v] of Object.entries(supplement.values)) {
  if (!gdp.has(code)) gdp.set(code, { value: v.usd, year: v.year });
}
for (const [code, parent] of Object.entries(supplement.parent)) {
  const p = gdp.get(parent);
  if (!gdp.has(code) && p) gdp.set(code, p);
}
const usedCountries = new Set(airports.map((a) => a.country));
const countries: Record<string, Country> = {};
for (const c of parseCsv(await readFile(join(RAW, 'countries.csv'), 'utf8'))) {
  if (!usedCountries.has(c.code!)) continue;
  const g = gdp.get(c.code!);
  const t = tourism.get(c.code!);
  countries[c.code!] = {
    code: c.code!,
    name: c.name!,
    continent: c.continent!,
    gdpPerCapitaUsd: g ? Math.round(g.value) : null,
    gdpYear: g?.year ?? null,
    tourismArrivals: t ? Math.round(t.value) : null,
    tourismYear: t?.year ?? null,
  };
}

// ---------- Write ----------

await mkdir(OUT, { recursive: true });
// One airport per line keeps the file readable and git diffs small.
await writeFile(join(OUT, 'airports.json'), `[\n${airports.map((a) => JSON.stringify(a)).join(',\n')}\n]\n`);
await writeFile(join(OUT, 'countries.json'), `${JSON.stringify(countries, null, 1)}\n`);

const bySize = (s: AirportSize) => airports.filter((a) => a.size === s).length;
console.log(
  `Airports: ${airports.length} (large ${bySize('large')}, medium ${bySize('medium')}, small ${bySize('small')}) · ` +
    `countries: ${Object.keys(countries).length} · without GDP: ${Object.values(countries).filter((c) => c.gdpPerCapitaUsd === null).length}`,
);

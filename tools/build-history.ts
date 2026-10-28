// Builds the real history since 1970 (Phase 5.2) from the downloads of tools/download-history.ts:
//  - src/data/generated/fuel-history.json: jet fuel price per month (USD per gallon, money of that time).
//    1990-04 on: EIA US Gulf Coast spot. 1975-07 to 1990-03: EIA refiner wholesale/resale price, scaled to the spot level
//    by their 1990–94 overlap. Before: EIA crude oil first purchase price (monthly from 1974, yearly before) × the
//    jet fuel/crude ratio of 1975–76 (marked as modelled).
//  - src/data/generated/fx-history.json: units of each currency per US dollar per month. Federal Reserve H.10 monthly
//    averages of the daily rates where it publishes the currency, otherwise the World Bank's yearly average, interpolated.
//    Old euro currencies after their changeover = euro × fixed rate.
//  - src/data/generated/economy-history.json: population, GDP per person and a modelled air travel index per country and
//    year, calibrated against the World Bank's air passengers carried (world total).
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LEGACY_CURRENCIES } from '../src/data/currencyHistory.ts';

const RAW = join(import.meta.dirname, 'raw', 'history');
const OUT = join(import.meta.dirname, '..', 'src', 'data', 'generated');
const FIRST_YEAR = 1970;
const LAST_YEAR = 2025;
const MONTHS = (LAST_YEAR - FIRST_YEAR + 1) * 12;
const monthIndex = (year: number, month: number) => (year - FIRST_YEAR) * 12 + (month - 1);
const round = (v: number, digits = 5) => (v === 0 ? 0 : Number(v.toPrecision(digits)));
const today = new Date().toISOString().slice(0, 10);

// ─── Jet fuel ──────────────────────────────────────────────────────────────────

/** An EIA history page: year rows with 12 monthly cells (empty before the series starts). */
async function eiaMonthly(file: string): Promise<(number | null)[]> {
  const html = await readFile(join(RAW, 'eia', file), 'utf8');
  const out: (number | null)[] = new Array(MONTHS).fill(null);
  for (const row of html.matchAll(/<tr>\s*<td class='B4'>(?:&nbsp;)*(\d{4})<\/td>((?:\s*<td class='B3'>[^<]*<\/td>){1,12})/g)) {
    const year = Number(row[1]);
    const cells = [...row[2]!.matchAll(/<td class='B3'>([^<]*)<\/td>/g)].map((c) => c[1]!.trim());
    cells.forEach((v, m) => {
      const i = monthIndex(year, m + 1);
      if (v && i >= 0 && i < MONTHS) out[i] = Number(v.replace(/,/g, ''));
    });
  }
  return out;
}

async function eiaAnnual(file: string): Promise<Map<number, number>> {
  const html = await readFile(join(RAW, 'eia', file), 'utf8');
  const out = new Map<number, number>();
  // Annual pages list decades: a row "1970's" followed by ten yearly cells.
  for (const row of html.matchAll(/<td class='B4'>(?:&nbsp;)*(\d{4})'s<\/td>((?:\s*<td class='B3'>[^<]*<\/td>){1,10})/g)) {
    const decade = Number(row[1]);
    [...row[2]!.matchAll(/<td class='B3'>([^<]*)<\/td>/g)].forEach((c, k) => {
      if (c[1]!.trim()) out.set(decade + k, Number(c[1]!.trim()));
    });
  }
  return out;
}

const spot = await eiaMonthly('EER_EPJK_PF4_RGC_DPG-M.html');
const resale = await eiaMonthly('EMA_EPJK_PWG_NUS_DPG-M.html');
const crude = await eiaMonthly('F000000__3-M.html');
const crudeYear = await eiaAnnual('F000000__3-A.html');

const ratio = (a: (number | null)[], b: (number | null)[], from: number, to: number) => {
  let s = 0;
  let n = 0;
  for (let i = from; i <= to; i++) if (a[i] && b[i]) (s += a[i]! / b[i]!), n++;
  if (!n) throw new Error('no overlap');
  return s / n;
};
const spotPerResale = ratio(spot, resale, monthIndex(1990, 4), monthIndex(1994, 12));
const resaleScaled = resale.map((v) => (v === null ? null : v * spotPerResale));
const jetPerCrude = ratio(resaleScaled, crude, monthIndex(1975, 7), monthIndex(1976, 6));

const fuel: number[] = [];
let modelledUntil = '';
for (let i = 0; i < MONTHS; i++) {
  const year = FIRST_YEAR + Math.floor(i / 12);
  let v = spot[i] ?? resaleScaled[i] ?? (crude[i] !== null ? crude[i]! * jetPerCrude : null);
  if (v === null && year < 1974) {
    // Yearly crude price, interpolated between the middles of the years (and towards January 1974).
    const m = (i % 12) + 0.5;
    const here = crudeYear.get(year)!;
    const next = year === 1973 ? crude[monthIndex(1974, 1)]! : crudeYear.get(year + 1)!;
    v = (m < 6 ? here : here + ((next - here) * (m - 6)) / 12) * jetPerCrude;
  }
  if (v === null) {
    // Months after the last published one (at most a few): hold the last value.
    v = fuel[i - 1]!;
  }
  if (spot[i] === null && resale[i] === null) modelledUntil = `${year}-${String((i % 12) + 1).padStart(2, '0')}`;
  fuel.push(round(v, 4));
}
await writeFile(
  join(OUT, 'fuel-history.json'),
  `${JSON.stringify({
    source: 'US EIA (public domain): EER_EPJK_PF4_RGC_DPG spot from 1990-04, EMA_EPJK_PWG_NUS_DPG refiner resale from 1975-07 (scaled to spot), F000000__3 crude first purchase before (× jet/crude ratio)',
    downloaded: today,
    start: `${FIRST_YEAR}-01`,
    modelledUntil,
    spotPerResale: round(spotPerResale, 4),
    jetPerCrudeBarrel: round(jetPerCrude, 4),
    usdPerGallon: fuel,
  })}\n`,
);
console.log(`Fuel ${FIRST_YEAR}-01…${LAST_YEAR}-12: modelled until ${modelledUntil}, spot/resale ${spotPerResale.toFixed(3)}, jet/crude ${jetPerCrude.toFixed(4)}`);
console.log(`  1970-01 $${fuel[0]} · 1974-06 $${fuel[monthIndex(1974, 6)]} · 1980-06 $${fuel[monthIndex(1980, 6)]} · 1990-10 $${fuel[monthIndex(1990, 10)]} · 2008-07 $${fuel[monthIndex(2008, 7)]} · 2020-04 $${fuel[monthIndex(2020, 4)]}`);

// ─── Exchange rates ────────────────────────────────────────────────────────────

/** Federal Reserve H.10 page code → currency; the starred ones are quoted as US dollars per unit. */
const FED: Record<string, string> = {
  al: 'AUD*', au: 'ATS', be: 'BEF', bz: 'BRL', ca: 'CAD', ch: 'CNY', dn: 'DKK', eu: 'EUR*', fr: 'FRF', ge: 'DEM', gr: 'GRD',
  hk: 'HKD', in: 'INR', ir: 'IEP*', it: 'ITL', ja: 'JPY', ko: 'KRW', ma: 'MYR', mx: 'MXN', ne: 'NLG', no: 'NOK', nz: 'NZD*',
  po: 'PTE', sd: 'SEK', sf: 'ZAR', si: 'SGD', sp: 'ESP', sz: 'CHF', ta: 'TWD', th: 'THB', uk: 'GBP*',
};
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const fed = new Map<string, (number | null)[]>();
for (const file of (await readdir(join(RAW, 'fed'))).sort()) {
  const code = file.slice(6, 8);
  const def = FED[code];
  if (!def) continue;
  const currency = def.replace('*', '');
  const html = await readFile(join(RAW, 'fed', file), 'utf8');
  const sums = fed.get(currency) ?? new Array(MONTHS).fill(null);
  const counts = new Map<number, number>();
  const totals = new Map<number, number>();
  // Two page layouts: older ones "4-<ABBR title="January">Jan-</ABBR>71", newer ones " 3-JAN-00" + a plain cell.
  const rows = [
    ...[...html.matchAll(/(\d{1,2})-<ABBR title="(\w+)">\w+-<\/ABBR>(\d{2})(?:&nbsp;)*<\/th><td[^>]*>([^<]*)</g)].map((m) => [MONTH_NAMES.indexOf(m[2]!) + 1, m[3]!, m[4]!] as const),
    ...[...html.matchAll(/<th id="r\d+"[^>]*>\s*\d{1,2}-([A-Z]{3})-(\d{2})\s*<\/th>\s*<td[^>]*>([^<]*)/g)].map(
      (m) => [MONTH_NAMES.findIndex((n) => n.slice(0, 3).toUpperCase() === m[1]) + 1, m[2]!, m[3]!] as const,
    ),
  ];
  for (const [month, yy2, cell] of rows) {
    const yy = Number(yy2);
    const year = yy >= 50 ? 1900 + yy : 2000 + yy;
    const value = Number(cell.replace(/&nbsp;/g, '').trim());
    const i = monthIndex(year, month);
    if (!Number.isFinite(value) || value <= 0 || i < 0 || i >= MONTHS) continue;
    totals.set(i, (totals.get(i) ?? 0) + (def.endsWith('*') ? 1 / value : value));
    counts.set(i, (counts.get(i) ?? 0) + 1);
  }
  for (const [i, total] of totals) sums[i] = total / counts.get(i)!;
  fed.set(currency, sums);
}

interface WbPoint { country: { id: string }; countryiso3code: string; date: string; value: number | null }
async function worldBank(indicator: string): Promise<Map<string, Map<number, number>>> {
  const points = JSON.parse(await readFile(join(RAW, 'worldbank', `${indicator}.json`), 'utf8')) as WbPoint[];
  const out = new Map<string, Map<number, number>>();
  for (const p of points) {
    if (p.value === null) continue;
    const key = p.countryiso3code === 'WLD' ? 'WLD' : p.country.id;
    const m = out.get(key) ?? new Map<number, number>();
    m.set(Number(p.date), p.value);
    out.set(key, m);
  }
  return out;
}
const wbFx = await worldBank('PA.NUS.FCRF');

/** The country whose World Bank exchange rate stands for a currency (and the last year it used it). */
const WB_COUNTRY: Record<string, [string, number?]> = {
  USD: ['US'], JPY: ['JP'], CZK: ['CZ'], DKK: ['DK'], GBP: ['GB'], HUF: ['HU'], PLN: ['PL'], RON: ['RO'], SEK: ['SE'],
  CHF: ['CH'], ISK: ['IS'], NOK: ['NO'], TRY: ['TR'], AUD: ['AU'], BRL: ['BR'], CAD: ['CA'], CNY: ['CN'], HKD: ['HK'],
  IDR: ['ID'], ILS: ['IL'], INR: ['IN'], KRW: ['KR'], MXN: ['MX'], MYR: ['MY'], NZD: ['NZ'], PHP: ['PH'], SGD: ['SG'],
  THB: ['TH'], ZAR: ['ZA'],
  ...Object.fromEntries(LEGACY_CURRENCIES.map((l) => [l.code, [l.countries[0]!, Number(l.euroFrom.slice(0, 4)) - 1] as [string, number]])),
};

/** Yearly values placed in the middle of each year, interpolated per month, held flat at the ends. */
function monthlyFromYearly(years: Map<number, number>, lastYear = LAST_YEAR): (number | null)[] {
  const pts = [...years].filter(([y]) => y <= lastYear).sort((a, b) => a[0] - b[0]);
  return Array.from({ length: MONTHS }, (_, i) => {
    if (!pts.length) return null;
    const t = FIRST_YEAR + (i + 0.5) / 12;
    if (FIRST_YEAR + Math.floor(i / 12) > lastYear) return null;
    const after = pts.findIndex(([y]) => y + 0.5 >= t);
    if (after <= 0) return after === 0 ? pts[0]![1] : pts.at(-1)![1];
    const [y0, v0] = pts[after - 1]!;
    const [y1, v1] = pts[after]!;
    return v0 + ((v1 - v0) * (t - (y0 + 0.5))) / (y1 - y0);
  });
}

const perUsd: Record<string, (number | null)[]> = {};
const sourceOf: Record<string, string> = {};
for (const [currency, [country, lastYear]] of Object.entries(WB_COUNTRY)) {
  if (currency === 'USD') continue;
  const f = fed.get(currency);
  const wb = monthlyFromYearly(wbFx.get(country) ?? new Map(), lastYear);
  perUsd[currency] = Array.from({ length: MONTHS }, (_, i) => f?.[i] ?? wb[i] ?? null);
  sourceOf[currency] = f ? 'fed+worldbank' : 'worldbank';
  // Where both exist, report how well the World Bank year fits the Fed months (unit changes show up as huge ratios).
  if (f) {
    const both = f.map((v, i) => (v && wb[i] ? wb[i]! / v : null)).filter((x): x is number => x !== null);
    const worst = both.reduce((m, x) => Math.max(m, Math.abs(Math.log(x))), 0);
    if (worst > 0.15) console.log(`  ${currency}: World Bank vs Fed differ up to ×${Math.exp(worst).toFixed(2)}`);
    const firstFed = f.findIndex((v) => v !== null);
    if (firstFed > 0 && wb[firstFed - 1] && f[firstFed]) {
      const jump = wb[firstFed - 1]! / f[firstFed]!;
      if (Math.abs(Math.log(jump)) > 0.1) console.log(`  ${currency}: jump ×${jump.toFixed(3)} where the Fed series starts (${FIRST_YEAR + Math.floor(firstFed / 12)})`);
    }
  }
}
perUsd.EUR = fed.get('EUR')!.map((v, i) => v ?? (i < monthIndex(1999, 1) && perUsd.DEM![i] ? perUsd.DEM![i]! / 1.95583 : null));
// Months without any published day (rare): the average of the neighbouring months.
for (const s of Object.values(perUsd))
  for (let i = 1; i < MONTHS - 1; i++) if (s[i] === null && s[i - 1] && s[i + 1]) s[i] = (s[i - 1]! + s[i + 1]!) / 2;
// Old euro currencies after the changeover: fixed rate × euro.
for (const l of LEGACY_CURRENCIES) {
  const from = monthIndex(Number(l.euroFrom.slice(0, 4)), Number(l.euroFrom.slice(5, 7)));
  for (let i = Math.max(0, from); i < MONTHS; i++) perUsd[l.code]![i] = perUsd.EUR[i]! * l.perEur;
}
// LUF was tied 1:1 to the Belgian franc.
perUsd.LUF = perUsd.LUF!.map((v, i) => v ?? perUsd.BEF![i] ?? null);
const missing = Object.entries(perUsd).filter(([, s]) => s.some((v) => v === null)).map(([c, s]) => `${c} from ${FIRST_YEAR + Math.floor(s.findIndex((v) => v !== null) / 12)}`);
console.log(`Exchange rates: ${Object.keys(perUsd).length} currencies; starting later: ${missing.join(', ')}`);
await writeFile(
  join(OUT, 'fx-history.json'),
  `${JSON.stringify({
    source: 'US Federal Reserve H.10 (public domain), monthly averages of daily rates; World Bank PA.NUS.FCRF (CC BY 4.0) yearly averages, interpolated; euro before 1999 = DEM ÷ 1.95583',
    downloaded: today,
    start: `${FIRST_YEAR}-01`,
    sources: sourceOf,
    perUsd: Object.fromEntries(Object.entries(perUsd).sort().map(([c, s]) => [c, s.map((v) => (v === null ? null : round(v)))])),
  })}\n`,
);
const at = (c: string, y: number, m: number) => perUsd[c]![monthIndex(y, m)]?.toFixed(3);
console.log(`  ATS/USD 1970-06 ${at('ATS', 1970, 6)} · 1985-02 ${at('ATS', 1985, 2)} · 1995-04 ${at('ATS', 1995, 4)} · EUR/USD 2000-10 ${at('EUR', 2000, 10)} · 2008-07 ${at('EUR', 2008, 7)}`);

// ─── Economy and air travel ────────────────────────────────────────────────────

const pop = await worldBank('SP.POP.TOTL');
const gdp = await worldBank('NY.GDP.PCAP.KD');
const pax = await worldBank('IS.AIR.PSGR');
const countries = JSON.parse(await readFile(join(OUT, 'countries.json'), 'utf8')) as Record<string, { continent: string }>;
const YEARS = Array.from({ length: 2024 - FIRST_YEAR + 1 }, (_, k) => FIRST_YEAR + k);
const BASE = 2019;

/** A yearly series 1970–2024 with gaps filled: missing early years follow the world's change, other gaps interpolated. */
function filled(series: Map<number, number> | undefined, world: Map<number, number>): number[] | null {
  if (!series || ![...series.keys()].some((y) => y >= 2015)) return null;
  const known = YEARS.filter((y) => series.has(y));
  return YEARS.map((y) => {
    if (series.has(y)) return series.get(y)!;
    const before = known.filter((k) => k < y).at(-1);
    const after = known.find((k) => k > y);
    if (before !== undefined && after !== undefined) return series.get(before)! + ((series.get(after)! - series.get(before)!) * (y - before)) / (after - before);
    const anchor = (before ?? after)!;
    return series.get(anchor)! * (world.get(y)! / world.get(anchor)!);
  });
}

const worldPop = pop.get('WLD')!;
const worldGdp = gdp.get('WLD')!;
const series = new Map<string, { pop: number[]; gdp: number[]; pax: Map<number, number> }>();
for (const code of Object.keys(countries)) {
  const p = filled(pop.get(code), worldPop);
  const g = filled(gdp.get(code), worldGdp);
  if (p && g) series.set(code, { pop: p, gdp: g, pax: pax.get(code) ?? new Map() });
}
const yi = (y: number) => y - FIRST_YEAR;

// Years whose traffic fell for reasons the event timeline models (oil crises, recessions, wars, 9/11, SARS, 2008, COVID).
const CRISIS = new Set([1974, 1975, 1980, 1981, 1982, 1991, 2001, 2002, 2003, 2008, 2009, 2020, 2021, 2022, 2023, 2024]);

/** Fits the income elasticity and a smooth "air travel propensity" (cheaper fares, liberalisation) per year. */
function fit(elasticity: number) {
  // log(pax_c(y) / pax_c(base)) = log popRatio + ε log gdpRatio + p(y): p(y) = traffic-weighted mean residual.
  const p = new Map<number, number>();
  let err = 0;
  for (const y of YEARS) {
    let s = 0;
    let w = 0;
    const rows: [number, number][] = [];
    for (const [, c] of series) {
      const now = c.pax.get(y);
      const base = c.pax.get(BASE);
      if (!now || !base || base < 3e6 || now < 1e5) continue;
      const r = Math.log(now / base) - Math.log(c.pop[yi(y)]! / c.pop[yi(BASE)]!) - elasticity * Math.log(c.gdp[yi(y)]! / c.gdp[yi(BASE)]!);
      const weight = Math.sqrt(base);
      rows.push([r, weight]);
      s += r * weight;
      w += weight;
    }
    if (!w) continue;
    const mean = s / w;
    p.set(y, mean);
    if (!CRISIS.has(y)) err += rows.reduce((e, [r, wt]) => e + wt * (r - mean) ** 2, 0);
  }
  return { p, err };
}
let best = { elasticity: 1, err: Infinity, p: new Map<number, number>() };
for (let e = 0.5; e <= 2.01; e += 0.05) {
  const f = fit(e);
  if (f.err < best.err) best = { elasticity: e, err: f.err, p: f.p };
}
// The propensity ("cheaper fares, liberalisation, habits") is set so that the modelled world traffic matches the real
// world total in normal years, then smoothed; crisis years are bridged, so their dips come from the event timeline only.
const weights = [...series].map(([code, c]) => [code, c.pax.get(BASE) ?? 0] as const).filter(([, w]) => w > 0);
const totalW = weights.reduce((s, [, w]) => s + w, 0);
const econ = (c: { pop: number[]; gdp: number[] }, y: number) => (c.pop[yi(y)]! / c.pop[yi(BASE)]!) * (c.gdp[yi(y)]! / c.gdp[yi(BASE)]!) ** best.elasticity;
const realWorld = pax.get('WLD')!;
const realBase = realWorld.get(BASE)!;
const gap = new Map<number, number>();
for (const y of YEARS) {
  const model = weights.reduce((s, [code, w]) => s + w * econ(series.get(code)!, y), 0) / totalW;
  if (realWorld.has(y) && !CRISIS.has(y)) gap.set(y, Math.log(realWorld.get(y)! / realBase / model));
}
const normal = [...gap.keys()];
const smooth = YEARS.map((y) => {
  // Local straight line through the normal years within ±4 years (at least 4 points).
  const pts = normal.slice().sort((a, b) => Math.abs(a - y) - Math.abs(b - y)).filter((n, k) => k < 4 || Math.abs(n - y) <= 4);
  const mx = pts.reduce((s, n) => s + n, 0) / pts.length;
  const my = pts.reduce((s, n) => s + gap.get(n)!, 0) / pts.length;
  const sxx = pts.reduce((s, n) => s + (n - mx) ** 2, 0);
  const slope = sxx ? pts.reduce((s, n) => s + (n - mx) * (gap.get(n)! - my), 0) / sxx : 0;
  return my + slope * (y - mx);
});
// From 2019 on the propensity stays where it was (the timeline's COVID event makes the dip).
const p2019 = smooth[yi(2019)]!;
for (const y of YEARS.filter((x) => x > 2019)) smooth[yi(y)] = p2019;

/** Demand index of a country in a year, relative to 2024 (the year of the game's real traffic data) = 1. */
const index = (c: { pop: number[]; gdp: number[] }, y: number) =>
  (c.pop[yi(y)]! / c.pop[yi(2024)]!) * (c.gdp[yi(y)]! / c.gdp[yi(2024)]!) ** best.elasticity * Math.exp(smooth[yi(y)]! - smooth[yi(2024)]!);

const demandIndex: Record<string, number[]> = {};
for (const [code, c] of series) demandIndex[code] = YEARS.map((y) => round(index(c, y), 3));

// Check: the modelled world traffic (countries weighted by their 2019 passengers) against the real world total.
const modelWorld = YEARS.map((y) => weights.reduce((s, [code, w]) => s + w * index(series.get(code)!, y), 0) / totalW);
console.log(`Economy: ${series.size} countries, income elasticity ${best.elasticity.toFixed(2)}`);
console.log(
  '  world traffic model/real (2019 = 1): ' +
    [1970, 1975, 1980, 1985, 1990, 1995, 2000, 2005, 2010, 2015, 2019]
      .map((y) => `${y} ${(modelWorld[yi(y)]! / modelWorld[yi(BASE)]!).toFixed(2)}/${((realWorld.get(y) ?? NaN) / realBase).toFixed(2)}`)
      .join(' · '),
);

await writeFile(
  join(OUT, 'economy-history.json'),
  `${JSON.stringify({
    source: 'World Bank WDI (CC BY 4.0): SP.POP.TOTL, NY.GDP.PCAP.KD (constant 2015 USD), IS.AIR.PSGR; demand index modelled',
    downloaded: today,
    years: [YEARS[0], YEARS.at(-1)],
    incomeElasticity: round(best.elasticity, 3),
    world: {
      population: YEARS.map((y) => worldPop.get(y) ?? null),
      gdpPerCapita: YEARS.map((y) => (worldGdp.get(y) ? Math.round(worldGdp.get(y)!) : null)),
      passengers: YEARS.map((y) => (realWorld.get(y) ? Math.round(realWorld.get(y)! / 1e5) / 10 : null)),
      modelIndex: YEARS.map((y) => round(modelWorld[yi(y)]! / modelWorld[yi(2024)]!, 3)),
    },
    demandIndex,
  })}\n`,
);

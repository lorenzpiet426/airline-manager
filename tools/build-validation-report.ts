// Validation report for selected airlines: our reconstructed network, frequencies and fleet next to independent
// sources — the airline's own Wikipedia destination list, official aircraft registers (Austria, Ireland) and
// Eurostat route totals — listing every difference for the owner to spot-check by hand.
// Output: docs/validation/real-airlines.md. Run after build-networks.ts: node tools/build-validation-report.ts
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mapType } from './aircraft-names.ts';
import { cleanWikitext, fetchArticle, linkTargets, resolveTitles } from './wikipedia.ts';
import { readSheet } from './xlsx.ts';

const ROOT = join(import.meta.dirname, '..');
const RAW = join(import.meta.dirname, 'raw');
const GEN = join(ROOT, 'src/data/generated');
const read = async (f: string) => JSON.parse(await readFile(join(GEN, f), 'utf8'));

const airports = new Map(((await read('airports.json')) as { id: string; iata: string | null; name: string }[]).map((a) => [a.id, a]));
const code = (icao: string) => airports.get(icao)?.iata ?? icao;
const airlines = new Map(((await read('airlines.json')).airlines as { id: string; name: string }[]).map((a) => [a.id, a]));
const details = new Map(((await read('airline-details.json')).airlines as { id: string; fleetSize: number | null; fleet: { type: string; inService: number; orders: number }[] }[]).map((d) => [d.id, d]));
const networks = await read('networks.json');
const nets = new Map((networks.airlines as { id: string; hubs: string[]; bases: string[]; routes: { a: string; b: string; seasonal: boolean; weeklyAB: number | null; weeklyBA: number | null }[] }[]).map((n) => [n.id, n]));
const eurostat = new Map(((await read('routes-eurostat.json')).routes as { from: string; to: string; weeklyFlights: number }[]).map((r) => [`${r.from}>${r.to}`, r.weeklyFlights]));
const airportTitles = JSON.parse(await readFile(join(RAW, 'wikidata-airport-titles.json'), 'utf8')) as Record<string, string>;

const CHECKS: { id: string; list: string; register: { file: string; label: string; match: RegExp } | null; note?: string }[] = [
  {
    id: 'AUA', list: 'List of Austrian Airlines destinations',
    register: { file: 'austria-2026-09.xlsx', label: 'Austro Control register, 30 Sept 2026', match: /Austrian Airlines AG/ },
    note: 'The register is two months newer than the Wikipedia table (July 2026): recent deliveries appear there first.',
  },
  { id: 'DLH', list: 'List of Lufthansa destinations', register: null },
  {
    id: 'RYR', list: 'List of Ryanair destinations',
    register: { file: 'ireland-2025-09.xlsx', label: 'Irish Aviation Authority register, 30 Sept 2025', match: /RYANAIR/ },
    note: 'Wikipedia counts the whole Ryanair group; the Irish register only holds Ryanair DAC (EI-). Buzz (SP-), Malta Air and Lauda Europe (9H-) and Ryanair UK (G-) are registered in other countries, so the register is expected to show fewer aircraft.',
  },
  { id: 'WZZ', list: 'List of Wizz Air destinations', register: null },
];

/** Active and ended destinations from a "List of … destinations" article (Country | City | Airport | Notes). */
async function destinationList(title: string) {
  const article = await fetchArticle(title);
  const rows = cleanWikitext(article.wikitext).split(/\n\|-/).slice(1);
  const entries = rows.map((row) => ({ links: linkTargets(row), terminated: /\{\{\s*(Terminated|Suspended)|Ended/i.test(row), future: /\{\{\s*(Future|Begins)|Begins/i.test(row) }));
  const resolved = await resolveTitles(entries.flatMap((e) => e.links));
  const active = new Set<string>();
  const ended = new Set<string>();
  for (const e of entries) {
    const icao = e.links.map((l) => airportTitles[l] ?? airportTitles[resolved.get(l) ?? '']).find(Boolean);
    if (!icao) continue;
    (e.terminated ? ended : active).add(icao);
  }
  return { revid: article.revid, active, ended };
}

/** Aircraft of one operator in a register spreadsheet, counted by game type. */
function registerFleet(file: string, match: RegExp) {
  const path = join(RAW, 'registers', file);
  const counts = new Map<string, string[]>();
  for (let sheet = 1; sheet <= 13; sheet++) {
    for (const row of readSheet(path, sheet)) {
      if (!row.some((c) => match.test(c))) continue;
      const model = row.slice(1, 4).join(' ');
      const type = mapType(model) ?? `? ${row[2] ?? ''} ${row[3] ?? ''}`.trim();
      const reg = /^[A-Z]{3}$/.test(row[0] ?? '') ? `OE-${row[0]}` : (row[0] ?? '');
      counts.set(type, [...(counts.get(type) ?? []), reg]);
    }
  }
  return counts;
}

const lines: string[] = [
  '# Validation report: real airlines',
  '',
  `Generated ${new Date().toISOString().slice(0, 10)} by \`tools/build-validation-report.ts\`. Our data: routes from Wikipedia airport`,
  `articles, fleets from airline articles (CC BY-SA 4.0); weekly flights = Eurostat ${networks.season} route totals split between`,
  'airlines (estimate). Compared with independent sources; **every difference is listed** so you can spot-check by hand',
  '(e.g. Planespotters, FlightConnections). Nothing here is copied from those sites.',
  '',
];

for (const check of CHECKS) {
  const name = airlines.get(check.id)?.name ?? check.id;
  const net = nets.get(check.id)!;
  const ours = new Set(net.routes.flatMap((r) => [r.a, r.b]).filter((ap) => !net.hubs.includes(ap)));
  const list = await destinationList(check.list);
  const listActive = new Set([...list.active].filter((ap) => !net.hubs.includes(ap)));
  const missing = [...listActive].filter((ap) => !ours.has(ap));
  const extra = [...ours].filter((ap) => !listActive.has(ap));
  const extraEnded = extra.filter((ap) => list.ended.has(ap));
  const extraUnknown = extra.filter((ap) => !list.ended.has(ap));
  const fmt = (aps: string[]) => (aps.length ? aps.map(code).sort().join(', ') : '—');

  lines.push(`## ${name} (${check.id})`, '');
  lines.push(`Hubs: ${net.hubs.map(code).join(', ') || '—'} · Bases: ${net.bases.length} · Routes in our network: ${net.routes.length}`, '');
  lines.push('### Destinations', '');
  lines.push(`Our network serves **${ours.size}** airports (besides the hubs); Wikipedia's "${check.list}" (rev. ${list.revid}) lists **${listActive.size}** active.`, '');
  lines.push(`- In the destination list, **missing in our network** (${missing.length}): ${fmt(missing)}`);
  lines.push(`- In our network, but **ended** according to the list (${extraEnded.length}): ${fmt(extraEnded)}`);
  lines.push(`- In our network, **not in the list at all** (${extraUnknown.length}): ${fmt(extraUnknown)}`, '');

  // Frequencies: the hub's busiest routes with our estimate and the official all-airline total.
  const hub = net.hubs[0];
  if (hub) {
    const fromHub = net.routes
      .filter((r) => r.a === hub || r.b === hub)
      .map((r) => {
        const other = r.a === hub ? r.b : r.a;
        return { other, ours: r.a === hub ? r.weeklyAB : r.weeklyBA, total: eurostat.get(`${hub}>${other}`) ?? null, seasonal: r.seasonal };
      })
      .sort((x, y) => (y.ours ?? -1) - (x.ours ?? -1));
    lines.push(`### Weekly flights from ${code(hub)} (estimate vs. all airlines, Eurostat ${networks.season})`, '');
    lines.push('| Route | Ours (estimate) | All airlines (official) | Note |', '|---|---|---|---|');
    for (const r of fromHub.slice(0, 20)) {
      const note = r.total !== null && r.ours !== null && r.ours >= r.total * 0.95 ? 'no other airline known on this route' : r.seasonal ? 'seasonal' : '';
      lines.push(`| ${code(hub)}–${code(r.other)} | ${r.ours ?? 'model'} | ${r.total ?? '—'} | ${note} |`);
    }
    const total = fromHub.reduce((s, r) => s + (r.ours ?? 0), 0);
    lines.push('', `Sum of estimated weekly departures from ${code(hub)}: **${Math.round(total)}** (${fromHub.filter((r) => r.ours === null).length} routes without an official total).`, '');
  }

  // Fleet: Wikipedia fleet table vs. official register.
  const d = details.get(check.id);
  const wikiFleet = new Map((d?.fleet ?? []).map((f) => [f.type, f]));
  lines.push('### Fleet', '');
  if (check.register) {
    const reg = registerFleet(check.register.file, check.register.match);
    const types = [...new Set([...wikiFleet.keys(), ...reg.keys()])].sort();
    lines.push(`| Type | Wikipedia (in service) | ${check.register.label} | Difference |`, '|---|---|---|---|');
    for (const t of types) {
      const w = wikiFleet.get(t)?.inService ?? 0;
      const r = reg.get(t)?.length ?? 0;
      lines.push(`| ${t} | ${w} | ${r} | ${w === r ? '✓' : `**${r - w > 0 ? '+' : ''}${r - w}**`} |`);
    }
    const totalW = [...wikiFleet.values()].reduce((s, f) => s + f.inService, 0);
    const totalR = [...reg.values()].reduce((s, l) => s + l.length, 0);
    lines.push(`| **Total** | ${totalW} | ${totalR} | ${totalW === totalR ? '✓' : totalR - totalW} |`, '');
    if (check.note) lines.push(`> ${check.note}`, '');
    lines.push('Registrations in the register:', '');
    for (const [t, regs] of [...reg.entries()].sort()) lines.push(`- ${t}: ${regs.sort().join(', ')}`);
    lines.push('');
  } else {
    lines.push('No downloadable register with operators for this airline (Germany, Hungary/Malta/UK: not available or not licensed) — Wikipedia only:', '');
    lines.push('| Type | In service | On order |', '|---|---|---|');
    for (const f of d?.fleet ?? []) lines.push(`| ${f.type} | ${f.inService} | ${f.orders} |`);
    lines.push('', `Infobox fleet size: ${d?.fleetSize ?? '—'} · Sum of fleet table: ${(d?.fleet ?? []).reduce((s, f) => s + f.inService, 0)}`, '');
  }
}

await mkdir(join(ROOT, 'docs/validation'), { recursive: true });
await writeFile(join(ROOT, 'docs/validation/real-airlines.md'), lines.join('\n') + '\n');
console.log('Validation report written: docs/validation/real-airlines.md');

// Individual aircraft from official registers, matched to the game's real airlines by the registered owner/operator:
// USA (FAA, public domain), Canada (Transport Canada CCAR, non-commercial reuse with attribution), Austria (Austro
// Control, operator column) and Ireland (IAA, Sept 2025). Leased aircraft registered to trust banks or lessors cannot
// be matched to an airline and are left out. Output: src/data/generated/registers.json
// Inputs (tools/raw/registers/): faa/ (ReleasableAircraft.zip unzipped; downloaded by hand from registry.faa.gov),
// canada/ (ccarcsdb.zip unzipped), austria-YYYY-MM.xlsx, ireland-YYYY-MM.xlsx. Run: node tools/build-registers.ts
import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mapType } from './aircraft-names.ts';
import { readSheet } from './xlsx.ts';

const RAW = join(import.meta.dirname, 'raw', 'registers');
const OUT = join(import.meta.dirname, '..', 'src/data/generated');
const airlines = JSON.parse(await readFile(join(OUT, 'airlines.json'), 'utf8')).airlines as { id: string; name: string; country: string | null }[];
const networks = new Set((JSON.parse(await readFile(join(OUT, 'networks.json'), 'utf8')).airlines as { id: string }[]).map((n) => n.id));

/** Company name without legal form and generic airline words: "DELTA AIR LINES INC" → "DELTA". */
const key = (name: string) =>
  name
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)|[.,&'’-]/g, ' ')
    .replace(/\b(INC|CO|CORP|CORPORATION|COMPANY|LLC|LP|LTD|LIMITED|DAC|DESIGNATED ACTIVITY|AG|GMBH|SA|PLC|THE|DBA|ULC)\b/g, ' ')
    .replace(/\b(AIR LINES|AIRLINES|AIRLINE|AIRWAYS|AIR|AVIATION|INDUSTRIES|FLUGDIENST|LUFTFAHRT)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Airlines of one country by name key. Airlines with a network win a name clash; airlines without one are included
 * too (regional operators like SkyWest fly under partners' brands, e.g. United Express).
 */
function airlinesOf(country: string) {
  const map = new Map<string, string>();
  const sorted = airlines.filter((a) => a.country === country && key(a.name)).sort((a, b) => Number(networks.has(a.id)) - Number(networks.has(b.id)));
  for (const a of sorted) map.set(key(a.name), a.id);
  return map;
}

type Aircraft = [registration: string, type: string, year: number | null];
const result: Record<string, Aircraft[]> = {};
const unknownModels = new Map<string, number>();
function add(airline: string, reg: string, model: string, year: number | null) {
  const type = mapType(model);
  if (type === null) return; // business jets etc.
  if (type === undefined) {
    unknownModels.set(model, (unknownModels.get(model) ?? 0) + 1);
    return;
  }
  (result[airline] ??= []).push([reg, type, year && year > 1940 ? year : null]);
}
const csvLine = (line: string) => line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.replace(/^"|"$/g, '').trim());

// USA — FAA: registrant name = owner; airlines own most of their fleets (leases are under trust banks).
{
  const us = airlinesOf('US');
  const models = new Map<string, string>();
  for (const line of readFileSync(join(RAW, 'faa', 'ACFTREF.txt'), 'utf8').split('\n')) {
    const c = line.split(',');
    if (c.length > 9) models.set(c[0]!.replace(/^﻿/, '').trim(), `${c[1]!.trim()} ${c[2]!.trim()}`);
  }
  for (const line of readFileSync(join(RAW, 'faa', 'MASTER.txt'), 'utf8').split('\n')) {
    const c = line.split(',');
    if (c.length < 10 || c[0]!.includes('N-NUMBER')) continue;
    const airline = us.get(key(c[6]!));
    if (!airline) continue;
    add(airline, `N${c[0]!.trim()}`, models.get(c[2]!.trim()) ?? c[2]!.trim(), Number(c[4]) || null);
  }
}

// Canada — Transport Canada: registered owner (the company with custody and control, usually the airline).
{
  const ca = airlinesOf('CA');
  const clean = (f: string) => readFileSync(join(RAW, 'canada', f)).toString('latin1').replace(/\0/g, '');
  const ownerOf = new Map<string, string>();
  for (const line of clean('carsownr.txt').split('\n')) {
    const c = csvLine(line);
    if (c.length > 2) ownerOf.set(c[0]!, c[1]!);
  }
  for (const line of clean('carscurr.txt').split('\n')) {
    const c = csvLine(line);
    if (c.length < 33) continue;
    const airline = ca.get(key(ownerOf.get(c[0]!) ?? ''));
    if (!airline) continue;
    add(airline, `C-${c[0]!.trim()}`, `${c[3]} ${c[4]}`, Number(c[32]!.slice(0, 4)) || null);
  }
}

// Austria — Austro Control: the operator column.
{
  const at = airlinesOf('AT');
  const file = join(RAW, 'austria-2026-09.xlsx');
  for (let sheet = 5; sheet <= 7; sheet++) {
    for (const row of readSheet(file, sheet)) {
      if (!/^[A-Z]{3}$/.test(row[0] ?? '')) continue;
      const operator = (row[6] ?? '').split('\n')[0]!;
      const airline = at.get(key(operator));
      if (airline) add(airline, `OE-${row[0]}`, `${row[2]} ${row[3]}`, null);
    }
  }
}

// Ireland — IAA (Sept 2025): registered owner.
{
  const ie = airlinesOf('IE');
  for (const row of readSheet(join(RAW, 'ireland-2025-09.xlsx'))) {
    const airline = ie.get(key(row[11] ?? ''));
    if (airline && /^EI-/.test(row[0] ?? '')) add(airline, row[0]!, `${row[1]} ${row[2]}`, Number(row[6]) || null);
  }
}

for (const list of Object.values(result)) list.sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));
await writeFile(
  join(OUT, 'registers.json'),
  JSON.stringify(
    {
      sources: {
        US: 'FAA Aircraft Registration Database (public domain), downloaded 2026-10-27',
        CA: 'Transport Canada Canadian Civil Aircraft Register (CCAR), downloaded 2026-10-27',
        AT: 'Austro Control Luftfahrzeugregister, as of 30 Sept 2026',
        IE: 'Irish Aviation Authority aircraft register, as of 30 Sept 2025',
      },
      note: 'Registered owner/operator matched to airlines by name; leased aircraft registered to trust banks or lessors are not included.',
      aircraft: result,
    },
  ) + '\n',
);
const total = Object.values(result).reduce((s, l) => s + l.length, 0);
console.log(`Registers: ${total} aircraft at ${Object.keys(result).length} airlines`);
console.log(Object.entries(result).sort((a, b) => b[1].length - a[1].length).slice(0, 20).map(([id, l]) => `${id}:${l.length}`).join(' '));
console.log('Unknown models (top):', [...unknownModels.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15));

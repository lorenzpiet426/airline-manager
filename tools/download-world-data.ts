// Downloads the raw open datasets into tools/raw/ (not stored in git).
// Run with: npm run data:download   — then: npm run data:build
// Sources and licenses: docs/DATA_SOURCES.md
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const RAW = join(import.meta.dirname, 'raw');

const FILES: Record<string, string> = {
  'airports.csv': 'https://davidmegginson.github.io/ourairports-data/airports.csv',
  'runways.csv': 'https://davidmegginson.github.io/ourairports-data/runways.csv',
  'countries.csv': 'https://davidmegginson.github.io/ourairports-data/countries.csv',
  'cities15000.zip': 'https://download.geonames.org/export/dump/cities15000.zip',
  'gdp.json':
    'https://api.worldbank.org/v2/country/all/indicator/NY.GDP.PCAP.CD?format=json&per_page=20000&date=2015:2025',
  'ne_50m_land.geojson':
    'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson',
  'ne_50m_admin_0_boundary_lines_land.geojson':
    'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_boundary_lines_land.geojson',
  'tourism.json':
    'https://api.worldbank.org/v2/country/all/indicator/ST.INT.ARVL?format=json&per_page=20000&date=2010:2025',
};

await mkdir(RAW, { recursive: true });
for (const [name, url] of Object.entries(FILES)) {
  process.stdout.write(`Downloading ${name} … `);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`);
  await writeFile(join(RAW, name), Buffer.from(await response.arrayBuffer()));
  console.log('ok');
}
execFileSync('unzip', ['-oq', 'cities15000.zip'], { cwd: RAW });
console.log(`Done. Raw files are in ${RAW}`);

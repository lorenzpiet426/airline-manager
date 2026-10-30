// Downloads the BIS central bank policy rates (monthly, all countries; data.bis.org bulk download, free to use with the
// BIS cited as the source — see docs/DATA_SOURCES.md) into tools/raw/bis/ and unpacks it there.
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const RAW = join(import.meta.dirname, 'raw', 'bis');
const URL = 'https://data.bis.org/static/bulk/WS_CBPOL_csv_flat.zip';
await mkdir(join(RAW, 'extracted'), { recursive: true });
const res = await fetch(URL);
if (!res.ok) throw new Error(`BIS download failed: ${res.status}`);
await writeFile(join(RAW, 'cbpol.zip'), Buffer.from(await res.arrayBuffer()));
execFileSync('unzip', ['-o', '-q', join(RAW, 'cbpol.zip'), '-d', join(RAW, 'extracted')]);
console.log('BIS policy rates downloaded.');

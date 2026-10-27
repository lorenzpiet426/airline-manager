// Builds the offline base map (coastlines + land borders) from Natural Earth 1:50m (public domain):
//   src/data/generated/basemap.json  →  { land: FeatureCollection, borders: FeatureCollection }
// Natural Earth's GeoJSON is already cut at the 180° meridian, so it draws cleanly on a flat map.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Feature, FeatureCollection, Geometry, Position } from 'geojson';

const RAW = join(import.meta.dirname, 'raw');
const OUT = join(import.meta.dirname, '..', 'src', 'data', 'generated');
const DECIMALS = 2; // ≈ 1 km — the 1:50m source is not more precise than that

const round = (n: number) => Math.round(n * 10 ** DECIMALS) / 10 ** DECIMALS;

/** Rounds coordinates and drops points that became identical to their neighbour. */
function simplifyLine(line: Position[]): Position[] {
  const out: Position[] = [];
  for (const [lon, lat] of line) {
    const p = [round(lon!), round(lat!)];
    const prev = out[out.length - 1];
    if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) out.push(p);
  }
  return out;
}

function simplifyGeometry(g: Geometry): Geometry | null {
  switch (g.type) {
    case 'Polygon': {
      const rings = g.coordinates.map(simplifyLine).filter((r) => r.length >= 4);
      return rings.length ? { type: 'Polygon', coordinates: rings } : null;
    }
    case 'MultiPolygon': {
      const polys = g.coordinates.map((p) => p.map(simplifyLine).filter((r) => r.length >= 4)).filter((p) => p.length);
      return polys.length ? { type: 'MultiPolygon', coordinates: polys } : null;
    }
    case 'LineString': {
      const line = simplifyLine(g.coordinates);
      return line.length >= 2 ? { type: 'LineString', coordinates: line } : null;
    }
    case 'MultiLineString': {
      const lines = g.coordinates.map(simplifyLine).filter((l) => l.length >= 2);
      return lines.length ? { type: 'MultiLineString', coordinates: lines } : null;
    }
    default:
      return g;
  }
}

async function load(file: string): Promise<FeatureCollection> {
  const fc = JSON.parse(await readFile(join(RAW, file), 'utf8')) as FeatureCollection;
  const features: Feature[] = [];
  for (const f of fc.features) {
    const geometry = f.geometry && simplifyGeometry(f.geometry);
    if (geometry) features.push({ type: 'Feature', properties: {}, geometry });
  }
  return { type: 'FeatureCollection', features };
}

const basemap = {
  land: await load('ne_50m_land.geojson'),
  borders: await load('ne_50m_admin_0_boundary_lines_land.geojson'),
};

await mkdir(OUT, { recursive: true });
const json = JSON.stringify(basemap);
await writeFile(join(OUT, 'basemap.json'), json);
console.log(
  `Basemap: ${basemap.land.features.length} land shapes, ${basemap.borders.features.length} border lines, ${(json.length / 1024).toFixed(0)} KB`,
);

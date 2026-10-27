// Loads the static world database on demand (~4 MB, ~0.6 MB compressed), so it is not part of the first page load.
import { useEffect, useState } from 'react';
import type { FeatureCollection } from 'geojson';
import type { Airport, Country } from './types';

/** Coastlines and land borders for the map (Natural Earth, built by tools/build-basemap.ts). */
export interface Basemap {
  land: FeatureCollection;
  borders: FeatureCollection;
}

export interface World {
  airports: Airport[];
  airportById: Map<string, Airport>;
  countries: Record<string, Country>;
  basemap: Basemap;
}

let worldPromise: Promise<World> | null = null;

export function loadWorld(): Promise<World> {
  // The three files download in parallel.
  worldPromise ??= Promise.all([
    import('./generated/airports.json'),
    import('./generated/countries.json'),
    import('./generated/basemap.json'),
  ]).then(([airports, countries, basemap]) => {
    const list = airports.default as Airport[];
    return {
      airports: list,
      airportById: new Map(list.map((a) => [a.id, a])),
      countries: countries.default as Record<string, Country>,
      basemap: basemap.default as unknown as Basemap,
    };
  });
  return worldPromise;
}

/** React hook: the world data, or null while it is still loading. */
export function useWorld(): World | null {
  const [world, setWorld] = useState<World | null>(null);
  useEffect(() => {
    let alive = true;
    void loadWorld().then((w) => alive && setWorld(w));
    return () => {
      alive = false;
    };
  }, []);
  return world;
}

/** Finds airports by code, name or city. Exact codes first, then names/cities that start with the text. */
export function searchAirports(world: World, query: string, limit = 8): Airport[] {
  const q = normalize(query.trim());
  if (q.length < 2) return [];
  const scored: { airport: Airport; score: number }[] = [];
  for (const a of world.airports) {
    let score = 0;
    if (a.iata && normalize(a.iata) === q) score = 100;
    else if (a.icao && normalize(a.icao) === q) score = 95;
    else if (normalize(a.city).startsWith(q)) score = 60;
    else if (normalize(a.name).startsWith(q)) score = 50;
    else if (normalize(a.city).includes(q) || normalize(a.name).includes(q)) score = 20;
    if (score) scored.push({ airport: a, score: score + sizeBonus[a.size] });
  }
  return scored
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map((s) => s.airport);
}

const sizeBonus = { large: 3, medium: 2, small: 1 } as const;

/** Lower case without accents, so "zurich" finds "Zürich". */
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

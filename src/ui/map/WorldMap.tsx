// The world map. MapLibre draws it on the graphics card (WebGL), so it stays smooth
// with thousands of airports now and thousands of moving aircraft later.
// Coastlines and borders come from Natural Earth (public domain) and are bundled with
// the game, so the map works offline. Only label fonts are fetched from OpenFreeMap (then cached).
import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { FeatureCollection, Point } from 'geojson';
import type { Airport } from '../../data/types';
import type { Basemap } from '../../data/world';
import type { MapProjection } from '../../settings/settings';
import type { ResolvedTheme } from '../hooks/useApplyTheme';

export interface MapFocus {
  lon: number;
  lat: number;
  /** Change this number to fly to the same place again. */
  seq: number;
}

interface Props {
  airports: Airport[];
  basemap: Basemap;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  focus: MapFocus | null;
  projection: MapProjection;
  theme: ResolvedTheme;
  initialZoom: number;
}

// MapLibre does its heavy lifting in a background worker shipped as a separate file.
maplibregl.setWorkerUrl(maplibreWorkerUrl);

const VIE: [number, number] = [16.5697, 48.1103];
const LABEL_FONT = ['Noto Sans Regular'];

/** Reads a colour token from tokens.css (so the map follows the dark/light theme). */
const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function graticule(stepDeg: number): FeatureCollection {
  const features: FeatureCollection['features'] = [];
  for (let lon = -180; lon <= 180; lon += stepDeg) {
    features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[lon, -85], [lon, 0], [lon, 85]] } });
  }
  for (let lat = -75; lat <= 75; lat += stepDeg) {
    const coordinates: [number, number][] = [];
    for (let lon = -180; lon <= 180; lon += 5) coordinates.push([lon, lat]);
    features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } });
  }
  return { type: 'FeatureCollection', features };
}

function airportsGeoJson(airports: Airport[]): FeatureCollection<Point> {
  const rank = { large: 3, medium: 2, small: 1 } as const;
  return {
    type: 'FeatureCollection',
    features: airports.map((a) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
      properties: { id: a.id, code: a.iata ?? a.icao ?? a.id, size: a.size, rank: rank[a.size] },
    })),
  };
}

/** A value that depends on the airport size (large / medium / small). */
const sizeValue = (large: number | string, medium: number | string, small: number | string) =>
  ['match', ['get', 'size'], 'large', large, 'medium', medium, small] as ExpressionSpecification;

/** The complete map style, with all data included from the start (no waiting for a "loaded" event). */
function baseStyle(basemap: Basemap, airports: Airport[]): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      graticule: { type: 'geojson', data: graticule(15) },
      land: { type: 'geojson', data: basemap.land },
      borders: { type: 'geojson', data: basemap.borders },
      airports: { type: 'geojson', data: airportsGeoJson(airports) },
    },
    layers: [
      { id: 'ocean', type: 'background', paint: { 'background-color': token('--map-ocean') } },
      { id: 'graticule', type: 'line', source: 'graticule', paint: { 'line-color': token('--map-grid'), 'line-width': 0.6 } },
      { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': token('--map-land') } },
      { id: 'borders', type: 'line', source: 'borders', paint: { 'line-color': token('--map-border'), 'line-width': 0.6 } },
      {
        id: 'airports',
        type: 'circle',
        source: 'airports',
        layout: { 'circle-sort-key': ['get', 'rank'] },
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            1,
            sizeValue(2, 1.1, 0.7),
            5,
            sizeValue(4, 2.5, 1.6),
            9,
            sizeValue(7, 5, 3.5),
          ],
          'circle-color': sizeValue(token('--map-airport-large'), token('--map-airport'), token('--map-airport')),
          'circle-opacity': sizeValue(0.95, 0.85, 0.7),
        },
      } as LayerSpecification,
      {
        id: 'airport-selected',
        type: 'circle',
        source: 'airports',
        filter: ['==', ['get', 'id'], ''],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 7, 9, 13],
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-color': token('--cyan'),
          'circle-stroke-width': 2,
        },
      },
      // Invisible, larger circles so small airports are easy to tap with a finger.
      {
        id: 'airport-hit',
        type: 'circle',
        source: 'airports',
        paint: { 'circle-radius': 12, 'circle-opacity': 0 },
      },
      ...(['large', 'medium', 'small'] as const).map(
        (size, i): LayerSpecification => ({
          id: `labels-${size}`,
          type: 'symbol',
          source: 'airports',
          minzoom: [2.5, 5, 7][i],
          filter: ['==', ['get', 'size'], size],
          layout: {
            'text-field': ['get', 'code'],
            'text-font': LABEL_FONT,
            'text-size': [12, 11, 10][i]!,
            'text-anchor': 'top',
            'text-offset': [0, 0.5],
            'text-padding': 3,
          },
          paint: {
            'text-color': token('--map-label'),
            'text-halo-color': token('--map-label-halo'),
            'text-halo-width': 1.4,
          },
        }),
      ),
    ],
  };
}

/** Re-applies theme colours to an existing map (no reload needed). */
function applyThemeColors(map: maplibregl.Map) {
  map.setPaintProperty('ocean', 'background-color', token('--map-ocean'));
  map.setPaintProperty('graticule', 'line-color', token('--map-grid'));
  map.setPaintProperty('land', 'fill-color', token('--map-land'));
  map.setPaintProperty('borders', 'line-color', token('--map-border'));
  map.setPaintProperty('airports', 'circle-color', sizeValue(token('--map-airport-large'), token('--map-airport'), token('--map-airport')));
  map.setPaintProperty('airport-selected', 'circle-stroke-color', token('--cyan'));
  for (const size of ['large', 'medium', 'small']) {
    map.setPaintProperty(`labels-${size}`, 'text-color', token('--map-label'));
    map.setPaintProperty(`labels-${size}`, 'text-halo-color', token('--map-label-halo'));
  }
}

export function WorldMap({ airports, basemap, selectedId, onSelect, focus, projection, theme, initialZoom }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loadedRef = useRef(false);
  /** Actions waiting for the map to finish loading. */
  const pendingRef = useRef<((map: maplibregl.Map) => void)[]>([]);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Create the map once.
  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current!,
      style: baseStyle(basemap, airports),
      center: VIE,
      zoom: initialZoom,
      minZoom: 0.5,
      maxZoom: 12,
      renderWorldCopies: true,
      attributionControl: { compact: true, customAttribution: 'Natural Earth · OurAirports · GeoNames · World Bank' },
    });
    mapRef.current = map;
    if (import.meta.env.DEV) (window as unknown as { __map: maplibregl.Map }).__map = map; // for debugging
    map.touchPitch.disable();
    map.dragRotate.disable();
    map.keyboard.disableRotation();

    // "style.load" = layers exist and can be changed; it does not wait for anything to be drawn.
    map.on('style.load', () => {
      // Start with the data credits folded into the small ⓘ button (MapLibre opens it once on start).
      const foldCredits = () =>
        map.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
      foldCredits();
      map.once('idle', foldCredits);
      loadedRef.current = true;
      pendingRef.current.splice(0).forEach((fn) => fn(map));
    });

    map.on('click', (e) => {
      const hits = map.queryRenderedFeatures(e.point, { layers: ['airport-hit'] });
      if (!hits.length) return onSelectRef.current(null);
      // Several airports under the finger: prefer the biggest, then the closest.
      const best = hits
        .map((f) => ({ f, d: map.project((f.geometry as Point).coordinates as [number, number]).dist(e.point) }))
        .sort((a, b) => (b.f.properties.rank as number) - (a.f.properties.rank as number) || a.d - b.d)[0]!;
      onSelectRef.current(best.f.properties.id as string);
    });
    map.on('mouseenter', 'airport-hit', () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', 'airport-hit', () => (map.getCanvas().style.cursor = ''));

    // Keep the map sized to its box (e.g. when the sidebar collapses).
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(containerRef.current!);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
      pendingRef.current = [];
    };
  }, []); // created only once; later changes go through the effects below

  /** Runs `fn` now if the map is ready, otherwise as soon as it is. */
  const whenReady = (fn: (map: maplibregl.Map) => void) => {
    const map = mapRef.current;
    if (!map) return;
    if (loadedRef.current) fn(map);
    else pendingRef.current.push(fn);
  };

  useEffect(
    () => whenReady((map) => map.setFilter('airport-selected', ['==', ['get', 'id'], selectedId ?? ''])),
    [selectedId],
  );

  useEffect(() => whenReady((map) => applyThemeColors(map)), [theme]);

  useEffect(() => whenReady((map) => map.setProjection({ type: projection })), [projection]);

  useEffect(() => {
    if (!focus) return;
    whenReady((map) => {
      // Keep the airport visible next to the detail panel (right side) or above the phone's bottom sheet.
      const { clientWidth, clientHeight } = map.getContainer();
      const padding = clientWidth >= 768 ? { right: 384, top: 0, bottom: 0, left: 0 } : { bottom: clientHeight * 0.6, top: 0, left: 0, right: 0 };
      map.flyTo({ center: [focus.lon, focus.lat], zoom: Math.max(map.getZoom(), 6), speed: 1.4, padding });
    });
  }, [focus]);

  return <div ref={containerRef} className="worldmap" />;
}

// The map's look: data sources and drawing layers (coastlines, borders, airports, your routes and aircraft).
// Colours come from the theme tokens in tokens.css.
import type { ExpressionSpecification, LayerSpecification, Map as MapLibreMap, StyleSpecification } from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';
import type { Airport } from '../../data/types';
import type { Basemap } from '../../data/world';

export const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };
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
export const sizeValue = (large: number | string, medium: number | string, small: number | string) =>
  ['match', ['get', 'size'], 'large', large, 'medium', medium, small] as ExpressionSpecification;

/** The complete map style, with all data included from the start (no waiting for a "loaded" event). */
export function baseStyle(basemap: Basemap, airports: Airport[]): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      graticule: { type: 'geojson', data: graticule(15) },
      land: { type: 'geojson', data: basemap.land },
      borders: { type: 'geojson', data: basemap.borders },
      airports: { type: 'geojson', data: airportsGeoJson(airports) },
      routes: { type: 'geojson', data: EMPTY },
      'other-routes': { type: 'geojson', data: EMPTY },
      planes: { type: 'geojson', data: EMPTY },
    },
    layers: [
      { id: 'ocean', type: 'background', paint: { 'background-color': token('--map-ocean') } },
      { id: 'graticule', type: 'line', source: 'graticule', paint: { 'line-color': token('--map-grid'), 'line-width': 0.6 } },
      { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': token('--map-land') } },
      { id: 'borders', type: 'line', source: 'borders', paint: { 'line-color': token('--map-border'), 'line-width': 0.6 } },
      {
        // Another airline's network (Airlines screen → "Show on map"), in its own colour.
        id: 'other-routes',
        type: 'line',
        source: 'other-routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.6, 6, 1.6], 'line-opacity': 0.55 },
      },
      {
        id: 'routes',
        type: 'line',
        source: 'routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': token('--cyan'), 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 1, 6, 2.5], 'line-opacity': 0.75 },
      },
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
      {
        id: 'planes',
        type: 'symbol',
        source: 'planes',
        layout: {
          'icon-image': 'plane',
          'icon-size': ['interpolate', ['linear'], ['zoom'], 1, 0.7, 6, 1.2],
          'icon-rotate': ['get', 'heading'],
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
        paint: {
          'icon-color': '#ffffff',
          'icon-halo-color': token('--map-label-halo'),
          'icon-halo-width': 2,
        },
      },
      {
        // Flight number and registration next to each aircraft once you zoom in.
        id: 'plane-labels',
        type: 'symbol',
        source: 'planes',
        minzoom: 4.5,
        layout: {
          'text-field': ['get', 'label'],
          'text-font': LABEL_FONT,
          'text-size': 10,
          'text-offset': [0, 1.4],
          'text-anchor': 'top',
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': token('--cyan'),
          'text-halo-color': token('--map-label-halo'),
          'text-halo-width': 1.4,
        },
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
export function applyThemeColors(map: MapLibreMap) {
  map.setPaintProperty('ocean', 'background-color', token('--map-ocean'));
  map.setPaintProperty('graticule', 'line-color', token('--map-grid'));
  map.setPaintProperty('land', 'fill-color', token('--map-land'));
  map.setPaintProperty('borders', 'line-color', token('--map-border'));
  map.setPaintProperty('airports', 'circle-color', sizeValue(token('--map-airport-large'), token('--map-airport'), token('--map-airport')));
  map.setPaintProperty('airport-selected', 'circle-stroke-color', token('--cyan'));
  map.setPaintProperty('routes', 'line-color', token('--cyan'));
  map.setPaintProperty('planes', 'icon-halo-color', token('--map-label-halo'));
  map.setPaintProperty('plane-labels', 'text-color', token('--cyan'));
  map.setPaintProperty('plane-labels', 'text-halo-color', token('--map-label-halo'));
  for (const size of ['large', 'medium', 'small']) {
    map.setPaintProperty(`labels-${size}`, 'text-color', token('--map-label'));
    map.setPaintProperty(`labels-${size}`, 'text-halo-color', token('--map-label-halo'));
  }
}


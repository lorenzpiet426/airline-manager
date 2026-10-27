import { describe, expect, it, vi } from 'vitest';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import airportsJson from '../../data/generated/airports.json';
import type { Airport } from '../../data/types';
import type { Basemap } from '../../data/world';

// The style reads its colours from CSS; outside a browser every colour token is a fixed grey.
vi.stubGlobal('document', { documentElement: {} });
vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '#8b9bb6' }));

describe('map style', () => {
  it('is a valid MapLibre style (an invalid style leaves the map blank)', async () => {
    const { baseStyle } = await import('./mapStyle');
    const basemap: Basemap = { land: { type: 'FeatureCollection', features: [] }, borders: { type: 'FeatureCollection', features: [] } };
    const style = baseStyle(basemap, (airportsJson as Airport[]).slice(0, 10));
    expect(validateStyleMin(style).map((e) => e.message)).toEqual([]);
    expect(style.layers.map((l) => l.id)).toContain('planes');
  });
});

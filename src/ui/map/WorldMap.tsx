// The world map. MapLibre draws it on the graphics card (WebGL), so it stays smooth
// with thousands of airports now and thousands of moving aircraft later.
// Coastlines and borders come from Natural Earth (public domain) and are bundled with
// the game, so the map works offline. Only label fonts are fetched from OpenFreeMap (then cached).
import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { FeatureCollection, LineString, Point } from 'geojson';
import { applyThemeColors, baseStyle, EMPTY } from './mapStyle';
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

/** Your network on the map: route lines and the aircraft currently in the air. */
export interface MapOverlay {
  routes: FeatureCollection<LineString>;
  planes: FeatureCollection<Point>;
  /** Livery main colour for the aircraft symbols. */
  color: string;
}


interface Props {
  overlay: MapOverlay | null;
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

/** The aircraft symbol (same shape as the Fleet icon), drawn as a tintable "SDF" image. */
function planeImage(): ImageData {
  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(size / 24, size / 24);
  ctx.fillStyle = '#000';
  ctx.fill(
    new Path2D(
      'M12 2.5c.9 0 1.5 1 1.5 2.3v5l7.5 4.4v2l-7.5-2.3v4.5l2.3 1.7v1.4L12 20.6l-3.8.9v-1.4l2.3-1.7v-4.5L3 16.2v-2l7.5-4.4v-5c0-1.3.6-2.3 1.5-2.3z',
    ),
  );
  return ctx.getImageData(0, 0, size, size);
}

export function WorldMap({ overlay, airports, basemap, selectedId, onSelect, focus, projection, theme, initialZoom }: Props) {
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
      if (!map.hasImage('plane')) map.addImage('plane', planeImage(), { sdf: true, pixelRatio: 2 });
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

  useEffect(
    () =>
      whenReady((map) => {
        (map.getSource('routes') as GeoJSONSource | undefined)?.setData(overlay?.routes ?? EMPTY);
        (map.getSource('planes') as GeoJSONSource | undefined)?.setData(overlay?.planes ?? EMPTY);
        if (overlay) map.setPaintProperty('planes', 'icon-color', overlay.color);
      }),
    [overlay],
  );

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

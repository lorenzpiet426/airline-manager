import { useMemo, useState } from 'react';
import type { Feature, FeatureCollection, LineString } from 'geojson';
import { greatCirclePoints } from '../../engine/geo';
import { hrefFor, useRouteParam } from '../navigation';
import { useRealAirlines } from '../game/useEngineWorld';
import { unwrap } from '../map/useNetworkOverlay';
import { useTranslation } from 'react-i18next';
import { useWorld } from '../../data/world';
import { updateSettings, useSettings } from '../../settings/settings';
import { useResolvedTheme } from '../hooks/useApplyTheme';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { WorldMap, type MapFocus } from '../map/WorldMap';
import { AirportPanel } from '../map/AirportPanel';
import { AirportSearch } from '../map/AirportSearch';
import { formatNumber } from '../../i18n/format';
import { useGame } from '../../game/store';
import { useEngineWorld } from '../game/useEngineWorld';
import { useNetworkOverlay } from '../map/useNetworkOverlay';

const EMPTY_LINES: FeatureCollection<LineString> = { type: 'FeatureCollection', features: [] };
const EMPTY_POINTS: FeatureCollection<import('geojson').Point> = { type: 'FeatureCollection', features: [] };

export default function MapScreen() {
  const { t } = useTranslation();
  const world = useWorld();
  const settings = useSettings();
  const theme = useResolvedTheme();
  const isWide = useMediaQuery('(min-width: 768px)');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const game = useGame();
  const ownOverlay = useNetworkOverlay(game, useEngineWorld());
  // "Show network on the map" from an airline page: #/map?airline=AUA
  const shownId = useRouteParam('airline');
  const real = useRealAirlines();
  const shown = shownId ? real?.byId.get(shownId) : undefined;
  const otherRoutes = useMemo((): FeatureCollection<LineString> | undefined => {
    if (!shown || !real || !world) return undefined;
    const features: Feature<LineString>[] = real.routesOf(shown.id).flatMap((r) => {
      const a = world.airportById.get(r.a);
      const b = world.airportById.get(r.b);
      return a && b
        ? [{ type: 'Feature', properties: { color: shown.colors.primary }, geometry: { type: 'LineString', coordinates: unwrap(greatCirclePoints(a, b, 150)) } }]
        : [];
    });
    return { type: 'FeatureCollection', features };
  }, [shown, real, world]);
  const overlay = useMemo(
    () =>
      otherRoutes
        ? { routes: ownOverlay?.routes ?? EMPTY_LINES, planes: ownOverlay?.planes ?? EMPTY_POINTS, color: ownOverlay?.color ?? '#ffffff', otherRoutes }
        : ownOverlay,
    [ownOverlay, otherRoutes],
  );

  const selected = selectedId && world ? world.airportById.get(selectedId) : undefined;

  return (
    <div className="screen screen--map">
      <div className="mapview">
        {world ? (
          <WorldMap
            overlay={overlay}
            airports={world.airports}
            basemap={world.basemap}
            selectedId={selectedId}
            onSelect={setSelectedId}
            focus={focus}
            projection={settings.mapProjection}
            theme={theme}
            initialZoom={isWide ? 3.2 : 2.6}
          />
        ) : (
          <div className="mapview__loading">{t('map.loading')}</div>
        )}

        {world && (
          <div className="mapview__toolbar">
            <AirportSearch
              world={world}
              onPick={(a) => {
                setSelectedId(a.id);
                setFocus((f) => ({ lon: a.lon, lat: a.lat, seq: (f?.seq ?? 0) + 1 }));
              }}
            />
            <button
              type="button"
              className="map-button"
              onClick={() => updateSettings({ mapProjection: settings.mapProjection === 'globe' ? 'mercator' : 'globe' })}
              aria-pressed={settings.mapProjection === 'globe'}
              title={t('map.globe')}
            >
              {t('map.globe')}
            </button>
          </div>
        )}

        {shown && (
          <div className="mapview__shown">
            <span className="mapview__swatch" style={{ background: shown.colors.primary }} />
            <span>{t('map.showing', { name: shown.name, count: real?.routesOf(shown.id).length ?? 0 })}</span>
            <a href={hrefFor('map')} className="muted small">
              {t('common.close')}
            </a>
          </div>
        )}

        {world && !selected && (
          <div className="mapview__legend">
            <span className="mono">{formatNumber(settings.language, world.airports.length)}</span> {t('map.airportsCount')}
            {overlay && overlay.routes.features.length > 0 && (
              <>
                {' · '}
                <span className="mono text--info">{overlay.routes.features.length}</span> {t('map.legendRoutes')} ·{' '}
                <span className="mono text--info">{overlay.planes.features.length}</span> {t('map.legendAirborne')}
              </>
            )}
          </div>
        )}

        {selected && <AirportPanel airport={selected} country={world?.countries[selected.country]} onClose={() => setSelectedId(null)} />}
      </div>
    </div>
  );
}

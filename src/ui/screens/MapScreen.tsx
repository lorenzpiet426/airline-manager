import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorld } from '../../data/world';
import { updateSettings, useSettings } from '../../settings/settings';
import { useResolvedTheme } from '../hooks/useApplyTheme';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { WorldMap, type MapFocus } from '../map/WorldMap';
import { AirportPanel } from '../map/AirportPanel';
import { AirportSearch } from '../map/AirportSearch';
import { formatNumber } from '../../i18n/format';

export default function MapScreen() {
  const { t } = useTranslation();
  const world = useWorld();
  const settings = useSettings();
  const theme = useResolvedTheme();
  const isWide = useMediaQuery('(min-width: 768px)');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);

  const selected = selectedId && world ? world.airportById.get(selectedId) : undefined;

  return (
    <div className="screen screen--map">
      <div className="mapview">
        {world ? (
          <WorldMap
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

        {world && !selected && (
          <div className="mapview__legend">
            <span className="mono">{formatNumber(settings.language, world.airports.length)}</span> {t('map.airportsCount')}
          </div>
        )}

        {selected && <AirportPanel airport={selected} country={world?.countries[selected.country]} onClose={() => setSelectedId(null)} />}
      </div>
    </div>
  );
}

import { useTranslation } from 'react-i18next';

// Placeholder until the real map (MapLibre + Natural Earth) arrives in Phase 1.2:
// a latitude/longitude grid with Vienna marked at its real position.
const VIE = { lon: 16.5697, lat: 48.1103 };
const x = (lon: number) => lon + 180; // 360 units wide
const y = (lat: number) => 90 - lat; // 180 units high

export function MapScreen() {
  const { t } = useTranslation();
  const meridians = Array.from({ length: 13 }, (_, i) => -180 + i * 30);
  const parallels = Array.from({ length: 7 }, (_, i) => -90 + i * 30);

  return (
    <div className="screen screen--map">
      <div className="mapstub">
        <svg viewBox="0 0 360 180" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          {meridians.map((lon) => (
            <line key={`m${lon}`} x1={x(lon)} y1={0} x2={x(lon)} y2={180} className="mapstub__grid" />
          ))}
          {parallels.map((lat) => (
            <line
              key={`p${lat}`}
              x1={0}
              y1={y(lat)}
              x2={360}
              y2={y(lat)}
              className={lat === 0 ? 'mapstub__equator' : 'mapstub__grid'}
            />
          ))}
          <circle cx={x(VIE.lon)} cy={y(VIE.lat)} r={6} className="mapstub__pulse" />
          <circle cx={x(VIE.lon)} cy={y(VIE.lat)} r={1.8} className="mapstub__hub" />
          <text x={x(VIE.lon) + 4} y={y(VIE.lat) - 3} className="mapstub__label">
            VIE
          </text>
        </svg>
        <div className="mapstub__note">
          <span className="tag tag--magenta">{t('comingSoon.title', { phase: '1.2' })}</span>
          <p>{t('comingSoon.map')}</p>
        </div>
      </div>
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import type { Airport, Country } from '../../data/types';
import { useSettings } from '../../settings/settings';
import {
  M_PER_FT,
  countryName,
  formatCompact,
  formatLatLon,
  formatNumber,
  formatUsd,
  localTimeIn,
} from '../../i18n/format';

/** Everything we know about one airport. Docked on the right (computer) or a bottom sheet (phone). */
export function AirportPanel({ airport, country, onClose }: { airport: Airport; country: Country | undefined; onClose: () => void }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const n = (value: number) => formatNumber(language, value);
  const local = localTimeIn(language, airport.tz);

  return (
    <aside className="airport-panel" aria-label={airport.name}>
      <header className="airport-panel__header">
        <div className="airport-panel__codes">
          <span className="airport-panel__iata">{airport.iata ?? airport.icao ?? airport.id}</span>
          {airport.icao && airport.iata && <span className="airport-panel__icao">{airport.icao}</span>}
          <span className={`tag airport-panel__size airport-panel__size--${airport.size}`}>{t(`airport.size.${airport.size}`)}</span>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label={t('common.close')}>
          ×
        </button>
      </header>
      <h2 className="airport-panel__name">{airport.name}</h2>
      <p className="muted">
        {airport.city} · {countryName(language, airport.country, country?.name ?? airport.country)}
      </p>

      <section className="airport-panel__section">
        <h3>{t('airport.section.position')}</h3>
        <dl className="facts">
          <dt>{t('airport.coordinates')}</dt>
          <dd className="mono">{formatLatLon(airport.lat, airport.lon)}</dd>
          <dt>{t('airport.elevation')}</dt>
          <dd className="mono">
            {airport.elevationFt === null
              ? '—'
              : `${n(airport.elevationFt)} ft (${n(Math.round(airport.elevationFt * M_PER_FT))} m)`}
          </dd>
          <dt>{t('airport.localTime')}</dt>
          <dd className="mono">
            {local.time} · {local.offset}
          </dd>
          <dt>{t('airport.timeZone')}</dt>
          <dd className="mono small">{airport.tz}</dd>
        </dl>
      </section>

      <section className="airport-panel__section">
        <h3>{t('airport.section.runways')}</h3>
        {airport.runways.length === 0 ? (
          <p className="muted">{t('airport.noRunwayData')}</p>
        ) : (
          <ul className="runways">
            {airport.runways.map((r) => (
              <li key={r.ends + r.lengthM} className="runway">
                <span className="runway__ends mono">{r.ends || '—'}</span>
                <span className="runway__bar" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, (r.lengthM / 4500) * 100)}%` }} />
                </span>
                <span className="runway__dims mono">
                  {n(r.lengthM)}
                  {r.widthM ? ` × ${n(r.widthM)}` : ''} m
                </span>
                <span className={`runway__surface runway__surface--${r.surface}`}>{t(`airport.surface.${r.surface}`)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="airport-panel__section">
        <h3>{t('airport.section.market')}</h3>
        <dl className="facts">
          <dt>{t('airport.catchment')}</dt>
          <dd className="mono">{formatCompact(language, airport.catchmentPop)}</dd>
          <dt>{t('airport.gdpPerCapita')}</dt>
          <dd className="mono">
            {country?.gdpPerCapitaUsd ? `${formatUsd(language, country.gdpPerCapitaUsd)} (${country.gdpYear})` : '—'}
          </dd>
          <dt>{t('airport.tourists')}</dt>
          <dd className="mono">
            {country?.tourismArrivals ? `${formatCompact(language, country.tourismArrivals)} (${country.tourismYear})` : '—'}
          </dd>
        </dl>
        <p className="muted small">{t('airport.marketNote')}</p>
      </section>
    </aside>
  );
}

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel } from '../components/Panel';
import { SourceTag } from '../components/SourceTag';
import { TailFin } from '../components/TailFin';
import { useRealAirlines } from '../game/useEngineWorld';
import { hrefFor, useRouteParam } from '../navigation';
import { aircraftTypeById } from '../../data/aircraft';
import { useWorld } from '../../data/world';
import type { RealAirline, RealAirlines } from '../../engine/realAirlines';
import { countryName, formatNumber } from '../../i18n/format';
import { useSettings } from '../../settings/settings';

const fleetSize = (a: RealAirline) => a.fleet.reduce((s, f) => s + f.inService, 0);
const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** The real airlines of the world: a searchable list and one page per airline. */
export function AirlinesScreen() {
  const { t } = useTranslation();
  const real = useRealAirlines();
  const id = useRouteParam('id');

  return (
    <div className="screen">
      <h1 className="screen__title">{t('airlines.title')}</h1>
      {!real ? (
        <p className="muted">{t('airlines.loading')}</p>
      ) : id && real.byId.has(id) ? (
        <AirlineDetail real={real} airline={real.byId.get(id)!} />
      ) : (
        <AirlineList real={real} />
      )}
    </div>
  );
}

function AirlineList({ real }: { real: RealAirlines }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const world = useWorld();
  const [query, setQuery] = useState('');
  const all = useMemo(() => [...real.byId.values()].sort((a, b) => fleetSize(b) - fleetSize(a) || real.routesOf(b.id).length - real.routesOf(a.id).length), [real]);
  const q = normalize(query.trim());
  const shown = (q
    ? all.filter((a) => normalize(a.name).includes(q) || a.iata?.toLowerCase() === q || a.icao?.toLowerCase() === q || a.hubs.some((h) => world?.airportById.get(h)?.iata?.toLowerCase() === q))
    : all
  ).slice(0, 100);

  return (
    <>
      <p className="muted">{t('airlines.intro', { count: all.length })}</p>
      <input
        type="search"
        className="input"
        placeholder={t('airlines.search')}
        aria-label={t('airlines.search')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ul className="airline-list">
        {shown.map((a) => (
          <li key={a.id}>
            <a href={hrefFor('airlines', { id: a.id })} className="airline-row">
              <TailFin primary={a.colors.primary} secondary={a.colors.secondary} size={32} />
              <span className="airline-row__name">
                {a.name}
                <span className="muted small">
                  {' '}
                  · {[a.iata, a.icao].filter(Boolean).join(' / ')} · {a.country ? countryName(language, a.country, a.country) : ''}
                </span>
              </span>
              <span className="airline-row__facts mono small">
                {a.hubs.slice(0, 2).map((h) => world?.airportById.get(h)?.iata ?? h).join(' ')}
              </span>
              <span className="airline-row__facts mono small">{t('airlines.aircraftShort', { count: fleetSize(a) })}</span>
              <span className="airline-row__facts mono small">{t('airlines.routesShort', { count: real.routesOf(a.id).length })}</span>
            </a>
          </li>
        ))}
      </ul>
      {!shown.length && <p className="muted">{t('airlines.none')}</p>}
    </>
  );
}

function AirlineDetail({ real, airline: a }: { real: RealAirlines; airline: RealAirline }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const world = useWorld();
  const [showRegs, setShowRegs] = useState(false);
  const code = (icao: string) => world?.airportById.get(icao)?.iata ?? icao;
  const routes = real.routesOf(a.id);
  const registeredBy = new Map<string, number>();
  for (const [, type] of a.registered) registeredBy.set(type, (registeredBy.get(type) ?? 0) + 1);
  const fleetTypes = [...new Set([...a.fleet.map((f) => f.type), ...registeredBy.keys()])];
  // Busiest routes first (official numbers before modelled ones).
  const fromBase = routes
    .map((r) => {
      const home = [...a.hubs, ...a.bases].includes(r.a) ? r.a : r.b;
      const other = home === r.a ? r.b : r.a;
      // Official only when the airline is alone on the route (otherwise the official total was split: an estimate).
      const alone = real.on(r.a, r.b).length === 1;
      return { home, other, weekly: home === r.a ? r.weeklyAB : r.weeklyBA, seasonal: r.seasonal, alone };
    })
    .sort((x, y) => (y.weekly ?? -1) - (x.weekly ?? -1));

  return (
    <>
      <a href={hrefFor('airlines')} className="muted small">
        ← {t('airlines.back')}
      </a>
      <div className="grid">
        <Panel title={a.name} code={[a.iata, a.icao].filter(Boolean).join(' / ')}>
          <div className="airline-card">
            <TailFin primary={a.colors.primary} secondary={a.colors.secondary} code={a.iata ?? undefined} size={72} />
            <div className="airline-card__text">
              <span className="airline-card__name">{a.name}</span>
              <span className="muted">
                {t(`airlines.model.${a.model}`)}
                {a.country ? ` · ${countryName(language, a.country, a.country)}` : ''}
              </span>
            </div>
          </div>
          <dl className="facts">
            <dt>{t('airlines.hubs')}</dt>
            <dd className="mono">{a.hubs.map(code).join(', ') || '—'}</dd>
            <dt>{t('airlines.bases')}</dt>
            <dd className="mono">{a.bases.length ? `${a.bases.slice(0, 12).map(code).join(', ')}${a.bases.length > 12 ? ` +${a.bases.length - 12}` : ''}` : '—'}</dd>
            {a.alliance && (
              <>
                <dt>{t('airlines.alliance')}</dt>
                <dd>{a.alliance}</dd>
              </>
            )}
            {a.parent && (
              <>
                <dt>{t('airlines.parent')}</dt>
                <dd>{a.parent}</dd>
              </>
            )}
            <dt>{t('airlines.colors')}</dt>
            <dd className="small muted">{t(`airlines.colorSource.${a.colors.source}`)}</dd>
          </dl>
          <a href={hrefFor('map', { airline: a.id })} className="button button--primary">
            {t('airlines.showOnMap')}
          </a>
        </Panel>

        <Panel title={t('airlines.fleet')} code={t('airlines.aircraftShort', { count: fleetSize(a) })}>
          {fleetTypes.length ? (
            <table className="table">
              <thead>
                <tr>
                  <th>{t('airlines.type')}</th>
                  <th className="num">
                    {t('airlines.inService')} <SourceTag tag="wikipedia" />
                  </th>
                  {a.registered.length > 0 && (
                    <th className="num">
                      {t('airlines.registered')} <SourceTag tag="official" />
                    </th>
                  )}
                  <th className="num">{t('airlines.orders')}</th>
                  <th className="num">{t('fleet.seats')}</th>
                </tr>
              </thead>
              <tbody>
                {fleetTypes.map((type) => {
                  const f = a.fleet.find((x) => x.type === type);
                  return (
                    <tr key={type}>
                      <td>{aircraftTypeById.get(type)?.name ?? type}</td>
                      <td className="num mono">{f?.inService ?? '—'}</td>
                      {a.registered.length > 0 && <td className="num mono">{registeredBy.get(type) ?? '—'}</td>}
                      <td className="num mono">{f?.orders || '—'}</td>
                      <td className="num mono">{f?.seats ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="muted">{t('airlines.noFleet')}</p>
          )}
          {a.registered.length > 0 && (
            <>
              <button type="button" className="button" onClick={() => setShowRegs((v) => !v)}>
                {showRegs ? t('airlines.hideRegs') : t('airlines.showRegs', { count: a.registered.length })}
              </button>
              {showRegs && (
                <p className="mono small regs">
                  {a.registered.map(([reg, type, year]) => `${reg} (${aircraftTypeById.get(type)?.name ?? type}${year ? `, ${year}` : ''})`).join(' · ')}
                </p>
              )}
            </>
          )}
        </Panel>
      </div>

      <Panel title={t('airlines.network')} code={t('airlines.routesShort', { count: routes.length })}>
        <p className="muted small">{t('airlines.networkNote', { season: real.season })}</p>
        <table className="table">
          <thead>
            <tr>
              <th>{t('finance.route')}</th>
              <th className="num">{t('airlines.weekly')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {fromBase.slice(0, 150).map((r) => (
              <tr key={`${r.home}-${r.other}`}>
                <td className="mono">
                  {code(r.home)}–{code(r.other)} <span className="muted small">{world?.airportById.get(r.other)?.city}</span>
                  {r.seasonal && <span className="muted small"> · {t('airlines.seasonal')}</span>}
                </td>
                <td className="num mono">{r.weekly !== null ? formatNumber(language, r.weekly, 1) : '—'}</td>
                <td>
                  <SourceTag tag={r.weekly !== null && r.alone ? 'official' : 'modelled'} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {fromBase.length > 150 && <p className="muted small">{t('airlines.moreRoutes', { count: fromBase.length - 150 })}</p>}
      </Panel>
    </>
  );
}

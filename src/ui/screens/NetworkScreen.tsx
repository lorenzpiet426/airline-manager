import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel } from '../components/Panel';
import { AirportSearch } from '../map/AirportSearch';
import { usePlayer } from '../game/usePlayer';
import { useEngineWorld } from '../game/useEngineWorld';
import { getAircraftType } from '../../data/aircraft';
import { useWorld } from '../../data/world';
import {
  aircraftHours,
  FARE_FACTOR_RANGE,
  MAX_FREQUENCY,
  validateRoute,
  type CommandError,
} from '../../engine/commands';
import {
  crewCostPerDayUsd,
  market,
  marketFareUsd,
  roundTripHours,
  routeWeek,
  totalCosts,
  WEEKLY_AVAILABLE_HOURS,
} from '../../engine/economics';
import { distanceKm } from '../../engine/geo';
import { convert, money } from '../../engine/money';
import type { Airline, GameState, Route } from '../../engine/state';
import { toDate, yearOf } from '../../engine/time';
import { sendCommand } from '../../game/store';
import { formatMoney, formatNumber } from '../../i18n/format';
import { useSettings } from '../../settings/settings';
import { hrefFor } from '../navigation';

/** Load factor colours (ECAM logic): green good, amber weak, red poor. */
export const lfClass = (lf: number) => (lf >= 0.75 ? 'text--normal' : lf >= 0.55 ? 'text--caution' : 'text--warning');

/** Fare factor as a signed percentage: 0.85 → "−15", 1.1 → "+10". */
const signed = (factor: number) => {
  const pct = Math.round((factor - 1) * 100);
  return pct > 0 ? `+${pct}` : pct < 0 ? `−${-pct}` : '±0';
};

type Editing = { mode: 'new' } | { mode: 'edit'; routeId: string } | null;

export function NetworkScreen() {
  const { t } = useTranslation();
  const { game, airline } = usePlayer();
  const [editing, setEditing] = useState<Editing>(null);

  if (!game || !airline) {
    return (
      <div className="screen">
        <h1 className="screen__title">{t('network.title')}</h1>
        <Panel title={t('network.title')}>
          <p className="muted">{t('fleet.noGame')}</p>
          <a href={hrefFor('new')} className="button button--primary">
            {t('ops.newGame')}
          </a>
        </Panel>
      </div>
    );
  }

  const routes = Object.values(game.routes)
    .filter((r) => r.airlineId === airline.id)
    .sort((a, b) => a.flightNumber - b.flightNumber);
  const hasAircraft = Object.values(game.aircraft).some((a) => a.airlineId === airline.id);

  return (
    <div className="screen">
      <h1 className="screen__title">{t('network.title')}</h1>
      {editing ? (
        <RoutePlanner
          key={editing.mode === 'edit' ? editing.routeId : 'new'}
          game={game}
          airline={airline}
          route={editing.mode === 'edit' ? game.routes[editing.routeId] : undefined}
          onDone={() => setEditing(null)}
        />
      ) : (
        <>
          <div className="toolbar-row">
            <p className="muted">{t('network.intro')}</p>
            {hasAircraft ? (
              <button type="button" className="button button--primary" onClick={() => setEditing({ mode: 'new' })}>
                {t('network.open')}
              </button>
            ) : (
              <a href={hrefFor('fleet')} className="button button--primary">
                {t('ops.leaseFirst')}
              </a>
            )}
          </div>
          {routes.length === 0 ? (
            <Panel title={t('network.routes')}>
              <p className="muted">{t('network.empty')}</p>
            </Panel>
          ) : (
            <ul className="cards">
              {routes.map((route) => (
                <RouteCard key={route.id} game={game} airline={airline} route={route} onEdit={() => setEditing({ mode: 'edit', routeId: route.id })} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function RouteCard({ game, airline, route, onEdit }: { game: GameState; airline: Airline; route: Route; onEdit: () => void }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const world = useWorld();
  const to = world?.airportById.get(route.destinationId);
  const from = world?.airportById.get(route.originId);
  const aircraft = game.aircraft[route.aircraftId];
  const history = game.finance[airline.id]?.history ?? [];
  const stats = history[history.length - 1]?.routes[route.id];
  const result = stats ? stats.revenue - stats.directCosts : null;

  return (
    <li className="card">
      <div className="card__head">
        <div className="card__title">
          <span className="card__reg mono">
            {from?.iata ?? route.originId} ⇄ {to?.iata ?? route.destinationId}
          </span>
          <span className="muted">
            <span className="mono">
              {airline.iata} {route.flightNumber}/{route.flightNumber + 1}
            </span>{' '}
            · {to?.city ?? ''}
          </span>
        </div>
        <span className="chip chip--normal">{t('network.perWeek', { count: route.frequency })}</span>
      </div>
      <dl className="facts facts--compact">
        <dt>{t('network.aircraft')}</dt>
        <dd className="mono">
          {aircraft?.registration} · {aircraft && getAircraftType(aircraft.typeId).name}
          {aircraft?.status === 'delivering' && <span className="text--caution"> · {t('network.waitingDelivery')}</span>}
        </dd>
        <dt>{t('network.distance')}</dt>
        <dd className="mono">{formatNumber(language, route.distanceKm)} km</dd>
        <dt>{t('network.fare')}</dt>
        <dd className="mono">{t('network.farePercent', { value: signed(route.fareFactor) })}</dd>
        {stats ? (
          <>
            <dt>{t('network.lastWeekPax')}</dt>
            <dd className="mono">
              {formatNumber(language, Math.round(stats.pax))} ·{' '}
              <span className={lfClass(stats.pax / Math.max(1, stats.seats))}>
                {formatNumber(language, (stats.pax / Math.max(1, stats.seats)) * 100)} % {t('network.lfShort')}
              </span>
            </dd>
            <dt>{t('network.lastWeekResult')}</dt>
            <dd className={`mono ${result! >= 0 ? 'text--normal' : 'text--warning'}`}>
              {formatMoney(language, { amount: result!, currency: airline.currency })}
            </dd>
          </>
        ) : (
          <>
            <dt>{t('network.lastWeekPax')}</dt>
            <dd className="muted">{t('network.noDataYet')}</dd>
          </>
        )}
      </dl>
      <button type="button" className="button" onClick={onEdit}>
        {t('network.edit')}
      </button>
    </li>
  );
}

function RoutePlanner({ game, airline, route, onDone }: { game: GameState; airline: Airline; route?: Route; onDone: () => void }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const world = useWorld();
  const engineWorld = useEngineWorld();
  const fleet = Object.values(game.aircraft).filter((a) => a.airlineId === airline.id);

  const [destinationId, setDestinationId] = useState<string | null>(route?.destinationId ?? null);
  const [aircraftId, setAircraftId] = useState(route?.aircraftId ?? fleet[0]?.id ?? '');
  const [frequency, setFrequency] = useState(route?.frequency ?? 7);
  const [fareFactor, setFareFactor] = useState(route?.fareFactor ?? 1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CommandError | null>(null);

  const hub = world?.airportById.get(airline.hubId);
  const dest = destinationId ? world?.airportById.get(destinationId) : undefined;
  const aircraft = game.aircraft[aircraftId];
  const settings = { aircraftId, frequency, fareFactor };
  const problem =
    engineWorld && destinationId ? validateRoute(game, engineWorld, airline.id, destinationId, settings, route?.id) : null;
  const duplicate = !route && destinationId && Object.values(game.routes).some((r) => r.airlineId === airline.id && r.destinationId === destinationId);

  const book = (usd: number) => convert(money(usd, 'USD'), airline.currency, game.fx);
  const fmt = (usd: number) => formatMoney(language, book(usd), false);

  const forecast = useMemo(() => {
    if (!engineWorld || !hub || !dest || !aircraft) return null;
    const type = getAircraftType(aircraft.typeId);
    const date = toDate(game.time);
    const plan = { type, seats: aircraft.seats, frequency, fareFactor, ageYears: yearOf(game.time) - aircraft.builtYear, rampUp: 1 };
    return {
      market: market(engineWorld, hub, dest),
      marketFare: marketFareUsd(engineWorld, hub, dest, date),
      week: routeWeek(engineWorld, hub, dest, plan, date),
      aircraftWeekUsd:
        crewCostPerDayUsd(engineWorld, type, aircraft.seats, hub.country) * 7 +
        convert(aircraft.lease.monthlyRent, 'USD', game.fx).amount * (12 / 52),
      roundTrip: roundTripHours(type, distanceKm(hub, dest)),
      available: WEEKLY_AVAILABLE_HOURS[type.category] - aircraftHours(game, aircraft.id, route?.id),
      capacity: WEEKLY_AVAILABLE_HOURS[type.category],
    };
  }, [engineWorld, hub, dest, aircraft, frequency, fareFactor, game, route?.id]);

  const maxFrequency = forecast ? Math.max(0, Math.min(MAX_FREQUENCY, Math.floor(forecast.available / forecast.roundTrip))) : MAX_FREQUENCY;

  const submit = async () => {
    if (!destinationId) return;
    setBusy(true);
    const result = await sendCommand(
      route
        ? { type: 'UpdateRoute', airlineId: airline.id, payload: { routeId: route.id, ...settings } }
        : { type: 'OpenRoute', airlineId: airline.id, payload: { destinationId, ...settings } },
    );
    setBusy(false);
    if (result.ok) onDone();
    else setError(result.error);
  };

  const close = async () => {
    if (!route || !window.confirm(t('network.closeConfirm'))) return;
    await sendCommand({ type: 'CloseRoute', airlineId: airline.id, payload: { routeId: route.id } });
    onDone();
  };

  const w = forecast?.week;
  const contribution = w ? w.revenue - totalCosts(w.costs) : 0;
  const shown = problem ?? (duplicate ? 'routeExists' : null) ?? error;

  return (
    <div className="planner">
      <Panel title={route ? t('network.editTitle') : t('network.openTitle')} code={`${hub?.iata ?? ''} ⇄ ${dest?.iata ?? '···'}`}>
        <span className="field__label">{t('network.destination')}</span>
        {dest ? (
          <div className="hubcard">
            <span className="hubcard__code mono">{dest.iata ?? dest.id}</span>
            <span className="hubcard__text">
              <span>{dest.name}</span>
              <span className="muted small">
                {dest.city} · {formatNumber(language, forecast?.market.distanceKm ?? 0)} km
              </span>
            </span>
            {!route && (
              <button type="button" className="button" onClick={() => setDestinationId(null)}>
                {t('network.change')}
              </button>
            )}
          </div>
        ) : (
          world && <AirportSearch world={world} onPick={(a) => setDestinationId(a.id)} />
        )}

        <span className="field__label">{t('network.aircraft')}</span>
        <div className="choices choices--list" role="radiogroup" aria-label={t('network.aircraft')}>
          {fleet.map((a) => {
            const type = getAircraftType(a.typeId);
            const used = aircraftHours(game, a.id, route?.id);
            return (
              <button key={a.id} type="button" role="radio" aria-checked={a.id === aircraftId} className="choice" onClick={() => setAircraftId(a.id)}>
                <span className="choice__title mono">
                  {a.registration} · {type.name}
                </span>
                <span className="muted small">
                  {t('network.hoursUsed', { used: Math.round(used), max: WEEKLY_AVAILABLE_HOURS[type.category] })} ·{' '}
                  {t('network.rangeKm', { km: formatNumber(language, type.rangeKm) })}
                  {a.status === 'delivering' && ` · ${t('network.waitingDelivery')}`}
                </span>
              </button>
            );
          })}
        </div>

        <div className="field-row">
          <div className="field">
            <span className="field__label">{t('network.frequency')}</span>
            <div className="stepper">
              <button type="button" className="button" aria-label="−" onClick={() => setFrequency((f) => Math.max(1, f - 1))}>
                −
              </button>
              <span className="stepper__value mono">{t('network.perWeek', { count: frequency })}</span>
              <button type="button" className="button" aria-label="+" onClick={() => setFrequency((f) => Math.min(MAX_FREQUENCY, f + 1))}>
                +
              </button>
            </div>
            <span className="muted small">{t('network.maxFrequency', { count: maxFrequency })}</span>
          </div>
          <label className="field">
            <span className="field__label">
              {t('network.fare')}: {t('network.farePercent', { value: signed(fareFactor) })}
            </span>
            <input
              type="range"
              className="slider"
              min={FARE_FACTOR_RANGE[0] * 100}
              max={FARE_FACTOR_RANGE[1] * 100}
              step={5}
              value={Math.round(fareFactor * 100)}
              onChange={(e) => setFareFactor(Number(e.target.value) / 100)}
            />
            {forecast && (
              <span className="muted small">
                {t('network.fareValue', { fare: fmt(forecast.marketFare * fareFactor), market: fmt(forecast.marketFare) })}
              </span>
            )}
          </label>
        </div>

        {shown && <p className="notice notice--error">{t(`errors.${shown}`)}</p>}
      </Panel>

      {forecast && w && (
        <Panel title={t('network.forecast')} code={t('network.perWeekShort')}>
          <dl className="facts">
            <dt>{t('network.market')}</dt>
            <dd className="mono">
              {t('network.marketValue', { pax: formatNumber(language, Math.round(forecast.market.annualPax / 1000) * 1000) })}
            </dd>
            <dt>{t('network.competition')}</dt>
            <dd>
              {forecast.market.incumbentFlights > 0
                ? t('network.competitionValue', { count: forecast.market.incumbentFlights })
                : t('network.noCompetition')}
            </dd>
            <dt>{t('network.season')}</dt>
            <dd className={`mono ${w.season >= 1.05 ? 'text--normal' : w.season <= 0.95 ? 'text--caution' : ''}`}>
              {t('network.seasonValue', { value: signed(w.season) })}
            </dd>
            <dt>{t('network.passengers')}</dt>
            <dd className="mono">
              {formatNumber(language, Math.round(w.pax))} / {formatNumber(language, Math.round(w.seats))} ·{' '}
              <span className={lfClass(w.loadFactor)}>
                {formatNumber(language, w.loadFactor * 100)} % {t('network.lfShort')}
              </span>
            </dd>
            <dt>{t('network.revenue')}</dt>
            <dd className="mono">{fmt(w.revenue)}</dd>
            {(Object.keys(w.costs) as (keyof typeof w.costs)[]).map((k) => (
              <FactRow key={k} label={t(`finance.line.${k}`)} value={`− ${fmt(w.costs[k])}`} />
            ))}
            <dt>
              <strong>{t('network.contribution')}</strong>
            </dt>
            <dd className={`mono ${contribution >= 0 ? 'text--normal' : 'text--warning'}`}>
              <strong>{fmt(contribution)}</strong>
            </dd>
          </dl>
          <p className="muted small">
            {t('network.fixedNote', {
              cost: fmt(forecast.aircraftWeekUsd),
              registration: aircraft?.registration ?? '',
              hours: Math.round(w.blockHours),
            })}
          </p>
          <p className="muted small">{t('network.forecastNote')}</p>
        </Panel>
      )}

      <div className="newgame__actions">
        {route && (
          <button type="button" className="button button--danger" onClick={() => void close()}>
            {t('network.close')}
          </button>
        )}
        <button type="button" className="button" onClick={onDone}>
          {t('common.cancel')}
        </button>
        <button type="button" className="button button--primary" disabled={busy || !dest || !!problem || !!duplicate} onClick={() => void submit()}>
          {route ? t('network.save') : t('network.open')}
        </button>
      </div>
    </div>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className="mono muted">{value}</dd>
    </>
  );
}

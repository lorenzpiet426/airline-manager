import { useMemo, useState } from 'react';
import { Segmented } from '../components/Segmented';
import { DeparturesBoard } from '../network/DeparturesBoard';
import { nextSpec, TimetableEditor } from '../network/TimetableEditor';
import { daysText, hhmmText } from '../game/timetableText';
import { useTranslation } from 'react-i18next';
import { Panel } from '../components/Panel';
import { SourceTag } from '../components/SourceTag';
import { TailFin } from '../components/TailFin';
import { AirportSearch } from '../map/AirportSearch';
import { usePlayer } from '../game/usePlayer';
import { useEngineWorld } from '../game/useEngineWorld';
import { getAircraftType } from '../../data/aircraft';
import { useWorld } from '../../data/world';
import {
  aircraftHours,
  applyCommand,
  draftRoute,
  FARE_FACTOR_RANGE,
  MAX_FREQUENCY,
  validateRoute,
  type Command,
  type CommandError,
  type FlightSpec,
} from '../../engine/commands';
import { planFor } from '../../engine/operations';
import { dailyDepreciation } from '../../engine/fleet';
import { pairsOfRoute, validateSpecs } from '../../engine/schedule';
import { dayCount } from '../../engine/timetable';
import {
  competitorCabin,
  competitorDepartures,
  competitorsOn,
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
import type { Airline, CabinClass, ClassFares, GameState, Route } from '../../engine/state';
import { CLASSES, classFareRatio, DEFAULT_CLASS_FARES, haul } from '../../engine/cabins';
import { fromDate, toDate } from '../../engine/time';
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
  const world = useWorld();
  const engineWorld = useEngineWorld();
  const [editing, setEditing] = useState<Editing>(null);
  const [tab, setTab] = useState<'routes' | 'timetable'>('routes');

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
  const code = (id: string) => world?.airportById.get(id)?.iata ?? id;
  const detailed = game.options.scheduling === 'detailed';
  const switchToDetailed = async () => {
    if (!window.confirm(t('timetable.switchConfirm'))) return;
    await sendCommand({ type: 'SetScheduling', airlineId: airline.id, payload: { scheduling: 'detailed' } });
  };

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
            <p className="muted">{t(detailed ? 'network.introDetailed' : 'network.intro')}</p>
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
          <div className="toolbar-row">
            <Segmented
              label={t('network.title')}
              value={tab}
              options={[
                { value: 'routes', label: t('network.routes') },
                { value: 'timetable', label: t('timetable.board') },
              ]}
              onChange={setTab}
            />
            <span className="muted small">
              {t(`timetable.mode.${game.options.scheduling}`)}
              {!detailed && (
                <>
                  {' '}
                  <button type="button" className="button button--small" onClick={() => void switchToDetailed()}>
                    {t('timetable.switch')}
                  </button>
                </>
              )}
            </span>
          </div>
          {tab === 'timetable' && engineWorld ? (
            <Panel title={t('timetable.board')} code="FIDS">
              <DeparturesBoard game={game} world={engineWorld} airline={airline} code={code} />
            </Panel>
          ) : routes.length === 0 ? (
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
  const pairs = pairsOfRoute(game, route.id);
  const fleet = [...new Set(pairs.map((p) => p.aircraftId))].map((id) => game.aircraft[id]).filter((a) => a !== undefined);
  const departures = [...new Set(pairs.map((p) => p.dep))].sort((a, b) => a - b);
  const numbers = [...new Set(pairs.map((p) => p.flightNumber))].sort((a, b) => a - b);
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
              {airline.iata} {numbers.length > 1 ? numbers.join(', ') : `${route.flightNumber}/${route.flightNumber + 1}`}
            </span>{' '}
            · {to?.city ?? ''}
          </span>
        </div>
        <span className="chip chip--normal">{t('network.perWeek', { count: route.frequency })}</span>
      </div>
      <dl className="facts facts--compact">
        <dt>{t('network.aircraft')}</dt>
        <dd className="mono">
          {fleet.map((aircraft) => (
            <span key={aircraft.id} className="block">
              {aircraft.registration} · {getAircraftType(aircraft.typeId).name}
              {aircraft.status === 'delivering' && <span className="text--caution"> · {t('network.waitingDelivery')}</span>}
            </span>
          ))}
        </dd>
        <dt>{t('timetable.departuresFrom', { airport: from?.iata ?? route.originId })}</dt>
        <dd className="mono">{departures.map(hhmmText).join(' · ') || '—'}</dd>
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
            {stats.classes && Object.keys(stats.classes).length > 1 && (
              <>
                <dt>{t('network.classLf')}</dt>
                <dd className="mono">
                  {CLASSES.filter((cls) => stats.classes?.[cls])
                    .map((cls) => {
                      const c = stats.classes![cls]!;
                      return `${cls} ${formatNumber(language, (c.pax / Math.max(1, c.seats)) * 100)} %`;
                    })
                    .join(' · ')}
                </dd>
              </>
            )}
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
  const detailed = game.options.scheduling === 'detailed';
  const code = (id: string) => world?.airportById.get(id)?.iata ?? id;

  const [destinationId, setDestinationId] = useState<string | null>(route?.destinationId ?? null);
  const [aircraftId, setAircraftId] = useState(route?.aircraftId ?? fleet[0]?.id ?? '');
  const [frequency, setFrequency] = useState(route?.frequency ?? 7);
  const [fareFactor, setFareFactor] = useState(route?.fareFactor ?? 1);
  const [classFares, setClassFares] = useState<ClassFares>(route?.classFares ?? DEFAULT_CLASS_FARES);
  const [specs, setSpecs] = useState<FlightSpec[]>(() =>
    route ? pairsOfRoute(game, route.id).map((p) => ({ id: p.id, aircraftId: p.aircraftId, dep: p.dep, days: p.days, groundMin: p.groundMin })) : [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CommandError | null>(null);

  const hub = world?.airportById.get(airline.hubId);
  const dest = destinationId ? world?.airportById.get(destinationId) : undefined;
  const aircraft = game.aircraft[aircraftId];
  const draft = useMemo(() => (hub && dest ? (route ?? draftRoute(airline.id, hub, dest)) : null), [hub, dest, route, airline.id]);
  const settings = detailed
    ? { aircraftId: specs[0]?.aircraftId ?? '', frequency: 0, fareFactor, classFares, flights: specs }
    : { aircraftId, frequency, fareFactor, classFares };
  // The classes the route's aircraft offer (fares can be set for each of them).
  const offered = CLASSES.filter((cls) =>
    (detailed ? specs.map((x) => x.aircraftId) : [aircraftId]).some((id) => game.aircraft[id]?.cabin.some((s) => s.cls === cls)),
  );
  const problem =
    engineWorld && destinationId ? validateRoute(game, engineWorld, airline.id, destinationId, settings, route?.id) : null;
  const specProblem = detailed && engineWorld && draft ? validateSpecs(game, engineWorld, draft, specs) : null;
  const duplicate = !route && destinationId && Object.values(game.routes).some((r) => r.airlineId === airline.id && r.destinationId === destinationId);

  const book = (usd: number) => convert(money(usd, 'USD'), airline.currency, game.fx);
  const fmt = (usd: number) => formatMoney(language, book(usd), false);

  const pickDestination = (id: string) => {
    setDestinationId(id);
    const to = world?.airportById.get(id);
    if (detailed && !specs.length && engineWorld && hub && to) setSpecs([nextSpec(game, engineWorld, draftRoute(airline.id, hub, to), [], fleet.map((a) => a.id))]);
  };

  // The forecast runs the command on a copy of the game: same timetable the engine will fly (Simple: the game's own
  // times for this aircraft; Detailed: the player's flights).
  const forecast = useMemo(() => {
    if (!engineWorld || !hub || !dest || problem || duplicate) return null;
    const sim = structuredClone(game);
    const command: Command = route
      ? { type: 'UpdateRoute', airlineId: airline.id, payload: { routeId: route.id, ...settings } }
      : { type: 'OpenRoute', airlineId: airline.id, payload: { destinationId: dest.id, ...settings } };
    const result = applyCommand(sim, engineWorld, command);
    const simRoute = result.ok && result.id ? sim.routes[result.id] : undefined;
    const plan = simRoute ? planFor(sim, engineWorld, simRoute, game.time, true) : null;
    if (!simRoute || !plan) return null;
    const date = toDate(game.time);
    const rep = game.reputation[airline.id];
    const week = routeWeek(engineWorld, hub, dest, { ...plan, rampUp: 1 }, date, {
      ai: game.ai,
      brand: rep ? { reputation: rep.score, awareness: rep.awareness } : undefined,
    });
    const pairs = pairsOfRoute(sim, simRoute.id).filter((p) => sim.aircraft[p.aircraftId]);
    const used = [...new Set(pairs.map((p) => p.aircraftId))].map((id) => game.aircraft[id]!).filter(Boolean);
    const type = aircraft ? getAircraftType(aircraft.typeId) : null;
    return {
      market: market(engineWorld, hub, dest),
      competitors: competitorsOn(engineWorld, hub, dest, undefined, game.ai),
      marketFare: marketFareUsd(engineWorld, hub, dest, date),
      week,
      flightNumbers: week.timetable.map((f, i) => pairs[i >> 1]!.flightNumber + f.dir),
      aircraftWeekUsd: used.reduce(
        (sum, a) =>
          sum +
          crewCostPerDayUsd(engineWorld, getAircraftType(a.typeId), a.seats, hub.country, a.cabin) * 7 +
          (a.lease
            ? convert(a.lease.monthlyRent, 'USD', game.fx).amount * (12 / 52)
            : a.owned
              ? convert(money(dailyDepreciation(a.owned, game.time) * 7, airline.currency), 'USD', game.fx).amount
              : 0),
        0,
      ),
      registrations: used.map((a) => a.registration).join(', '),
      roundTrip: type ? roundTripHours(type, distanceKm(hub, dest)) : 1,
      available: type && aircraft ? WEEKLY_AVAILABLE_HOURS[type.category] - aircraftHours(game, aircraft.id, route?.id) : 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineWorld, hub, dest, aircraftId, frequency, fareFactor, classFares, specs, game, route?.id, problem, duplicate]);
  const classMarketFare = (cls: CabinClass) =>
    forecast ? (forecast.week.byClass[cls]?.marketFareUsd ?? forecast.marketFare * classFareRatio(cls, haul(forecast.market.distanceKm))) : 0;

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
  const numbers = new Map(route ? pairsOfRoute(game, route.id).map((p) => [p.id, p.flightNumber] as const) : []);
  const time = fromDate(toDate(game.time));

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
                {dest.city} · {formatNumber(language, forecast?.market.distanceKm ?? (hub ? distanceKm(hub, dest) : 0))} km
              </span>
            </span>
            {!route && (
              <button type="button" className="button" onClick={() => setDestinationId(null)}>
                {t('network.change')}
              </button>
            )}
          </div>
        ) : (
          world && <AirportSearch world={world} onPick={(a) => pickDestination(a.id)} />
        )}

        {!detailed && (
          <>
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
          </>
        )}

        <div className="field-row">
          {!detailed && (
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
          )}
          {(offered.length ? offered : (['Y'] as CabinClass[])).map((cls) => {
            const value = cls === 'Y' ? fareFactor : classFares[cls];
            const set = (v: number) => (cls === 'Y' ? setFareFactor(v) : setClassFares((f) => ({ ...f, [cls]: v })));
            return (
              <label key={cls} className="field">
                <span className="field__label">
                  {offered.length > 1 ? t('network.classFare', { cls: t(`cabin.class.${cls}`) }) : t('network.fare')}:{' '}
                  {t('network.farePercent', { value: signed(value) })}
                </span>
                <input
                  type="range"
                  className="slider"
                  min={FARE_FACTOR_RANGE[0] * 100}
                  max={FARE_FACTOR_RANGE[1] * 100}
                  step={5}
                  value={Math.round(value * 100)}
                  onChange={(e) => set(Number(e.target.value) / 100)}
                />
                {forecast && (
                  <span className="muted small">{t('network.fareValue', { fare: fmt(classMarketFare(cls) * value), market: fmt(classMarketFare(cls)) })}</span>
                )}
              </label>
            );
          })}
        </div>

        {shown && <p className="notice notice--error">{t(`errors.${shown}`)}</p>}
      </Panel>

      {detailed && draft && engineWorld && (
        <Panel title={t('timetable.title')} code={t('network.perWeek', { count: specs.reduce((sum, x) => sum + dayCount(x.days), 0) })}>
          <TimetableEditor
            game={game}
            world={engineWorld}
            route={draft}
            specs={specs}
            numbers={numbers}
            errorIndex={specProblem?.index ?? null}
            onChange={(next) => {
              setSpecs(next);
              setError(null);
            }}
            code={code}
          />
        </Panel>
      )}

      {forecast && w && (
        <Panel title={t('network.forecast')} code={t('network.perWeekShort')}>
          <dl className="facts">
            <dt>{t('network.market')}</dt>
            <dd className="mono">
              {t('network.marketValue', { pax: formatNumber(language, Math.round(forecast.market.annualPax / 1000) * 1000) })}{' '}
              <SourceTag tag={forecast.market.observed ? 'official' : 'modelled'} />
            </dd>
            <dt>{t('network.competition')}</dt>
            <dd>
              {forecast.competitors && forecast.competitors.length > 0 ? (
                <ul className="competitors">
                  {forecast.competitors.map((c) => {
                    const other = engineWorld?.realAirlines?.byId.get(c.airlineId);
                    const deps = engineWorld && hub && dest ? competitorDepartures(engineWorld, c.airlineId, hub, dest, c.weekly, time) : [];
                    return (
                      <li key={c.airlineId} className="competitor">
                        {other && <TailFin primary={other.colors.primary} secondary={other.colors.secondary} size={22} />}
                        <a href={hrefFor('airlines', { id: c.airlineId })} className="competitor__name">
                          {c.name}
                        </a>
                        <span className="mono">{t('network.perWeek', { count: c.weekly })}</span>
                        <span className="muted small">
                          {t(`airlines.model.${c.model}`)} · {competitorCabin(c.model, forecast.market.distanceKm > 3250).map((x) => t(`cabin.productName.${x.product}`)).join(' + ')}
                        </span>
                        <span className={`small mono ${c.fareFactor < 0.95 ? 'text--caution' : 'muted'}`}>
                          {t('network.fareLevel', { value: signed(c.fareFactor) })}
                        </span>
                        {c.changed && <span className="chip chip--planned">{t('network.reacted')}</span>}
                        <SourceTag tag={c.source} />
                        {deps.length > 0 && (
                          <span className="competitor__times mono small muted">
                            {t('timetable.departuresFrom', { airport: hub?.iata ?? '' })}: {deps.map((d) => hhmmText(d.dep) + (d.weight < 0.99 ? '*' : '')).join(' · ')}{' '}
                            <SourceTag tag="modelled" />
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                t('network.noCompetition')
              )}
              <span className="muted small">{t('network.plusConnections')}</span>
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
            {Object.keys(w.byClass).length > 1 &&
              CLASSES.filter((cls) => w.byClass[cls]).map((cls) => {
                const c = w.byClass[cls]!;
                const lf = c.seats ? c.pax / c.seats : 0;
                return (
                  <FactRow
                    key={cls}
                    label={`· ${t(`cabin.class.${cls}`)}`}
                    value={`${formatNumber(language, Math.round(c.pax))} / ${formatNumber(language, c.seats)} · ${formatNumber(language, lf * 100)} % · ${fmt(c.revenue)}`}
                  />
                );
              })}
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

          <span className="field__label">{t('timetable.perFlight')}</span>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('timetable.flight')}</th>
                  <th>{t('timetable.from')}</th>
                  <th className="num">{t('timetable.dep')}</th>
                  <th className="num">{t('timetable.arr')}</th>
                  <th>{t('timetable.days')}</th>
                  <th className="num">{t('timetable.paxPerFlight')}</th>
                  <th className="num">{t('network.lfShort')}</th>
                </tr>
              </thead>
              <tbody>
                {w.timetable
                  .map((f, i) => ({ f, r: w.byFlight[i]!, n: forecast.flightNumbers[i]! }))
                  .sort((x, y) => x.f.dir - y.f.dir || x.f.dep - y.f.dep)
                  .map(({ f, r, n }, i) => {
                    const lf = r.seats ? r.pax / r.seats : 0;
                    return (
                      <tr key={i}>
                        <td className="mono">
                          {airline.iata} {n}
                        </td>
                        <td className="mono">{f.dir === 0 ? hub?.iata : dest?.iata}</td>
                        <td className="num mono">{hhmmText(f.dep)}</td>
                        <td className="num mono">{hhmmText(r.arr)}</td>
                        <td className="mono">{daysText(f.days)}</td>
                        <td className="num mono">{formatNumber(language, r.flights ? r.pax / r.flights : 0)}</td>
                        <td className={`num mono ${lfClass(lf)}`}>{formatNumber(language, lf * 100)} %</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <p className="muted small">{t('timetable.timesNote')}</p>
          <p className="muted small">
            {t(detailed ? 'network.fixedNoteDetailed' : 'network.fixedNote', {
              cost: fmt(forecast.aircraftWeekUsd),
              registration: forecast.registrations,
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

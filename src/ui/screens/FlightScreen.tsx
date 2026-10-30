import { useTranslation } from 'react-i18next';
import { getAircraftType } from '../../data/aircraft';
import { ON_TIME_MIN } from '../../data/delays';
import { CLASSES } from '../../engine/cabins';
import { findFlight, flightId, flightResult, knownFlights } from '../../engine/delays';
import { bookingOf, bucketsOf, limitOf } from '../../engine/bookings';
import { pairBlocks } from '../../engine/schedule';
import type { Airline, GameState, OpsFlight } from '../../engine/state';
import { MINUTES_PER_DAY, startOfDay, toDate, utcOffsetMin } from '../../engine/time';
import type { EngineWorld } from '../../engine/world';
import { formatGameDate, formatMoney, formatNumber } from '../../i18n/format';
import { useSettings } from '../../settings/settings';
import { Panel } from '../components/Panel';
import { useEngineWorld } from '../game/useEngineWorld';
import { usePlayer } from '../game/usePlayer';
import { hhmmText } from '../game/timetableText';
import { hrefFor, useRouteParam } from '../navigation';
import { lfClass } from './NetworkScreen';

/** Delays are known this long before departure (as on the departures board). */
const KNOWN_BEFORE_MIN = 120;

/** Formatting shared by the flight screens. */
function useFlightText(world: EngineWorld, airline: Airline) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const code = (id: string) => world.airportById.get(id)?.iata ?? id;
  const localMin = (airportId: string, time: number) => {
    const a = world.airportById.get(airportId);
    return time - startOfDay(time) + (a ? utcOffsetMin(a.tz, time) : 0);
  };
  return {
    code,
    name: (id: string) => world.airportById.get(id)?.city ?? id,
    time: (airportId: string, time: number) => hhmmText(localMin(airportId, time)),
    date: (airportId: string, time: number) => {
      const a = world.airportById.get(airportId);
      return formatGameDate(language, toDate(time + (a ? utcOffsetMin(a.tz, time) : 0)));
    },
    money: (amount: number) => formatMoney(language, { amount, currency: airline.currency }),
    number: (n: number, digits = 0) => formatNumber(language, n, digits),
    flightNo: (f: OpsFlight) => `${airline.iata} ${f.flightNumber}`,
    status: (f: OpsFlight, now: number) => {
      if (f.status === 'cancelled') return { cls: 'chip--warning', text: t('board.cancelled', { reason: t(`board.reason.${f.reason ?? 'other'}`) }) };
      if (now < f.dep - KNOWN_BEFORE_MIN) return { cls: 'chip--normal', text: t('board.scheduled') };
      if (f.status === 'diverted' && now >= f.dep + f.depDelay) return { cls: 'chip--warning', text: t('board.diverted', { airport: code(f.divertedTo ?? '') }) };
      const late = Math.max(f.depDelay, f.arrDelay) > ON_TIME_MIN;
      return { cls: late ? 'chip--caution' : 'chip--normal', text: late ? t('flight.late', { count: Math.max(0, f.arrDelay) }) : t('board.onTime') };
    },
  };
}

/** A flight further ahead than today, from its bookings (Phase 9.3): scheduled, no delay known yet. */
function upcomingFlight(game: GameState, world: EngineWorld, id: string): OpsFlight | undefined {
  const [pairId, dirText, depText] = id.split('|');
  const dir = Number(dirText) as 0 | 1;
  const dep = Number(depText);
  const pair = pairId ? game.flights[pairId] : undefined;
  const route = pair ? game.routes[pair.routeId] : undefined;
  const aircraft = pair ? game.aircraft[pair.aircraftId] : undefined;
  if (!pair || !route || !aircraft || !bookingOf(game, pair.id, dir, dep)) return undefined;
  const blocks = pairBlocks(world, aircraft.typeId, route);
  return {
    airlineId: route.airlineId,
    routeId: route.id,
    pairId: pair.id,
    dir,
    aircraftId: aircraft.id,
    flightNumber: pair.flightNumber + dir,
    fromId: dir === 0 ? route.originId : route.destinationId,
    toId: dir === 0 ? route.destinationId : route.originId,
    dep,
    arr: dep + (dir === 0 ? blocks.out : blocks.back),
    depDelay: 0,
    arrDelay: 0,
    cause: null,
    status: 'ok',
    pax: 0,
    transfer: 0,
  };
}

/** One flight in full (Phase 9.2): times, delay and its cause, weather, passengers per class, revenue, costs, result. */
export function FlightScreen() {
  const { t } = useTranslation();
  const { game, airline } = usePlayer();
  const world = useEngineWorld();
  const id = useRouteParam('id');
  if (!game || !airline || !world) return null;
  const f = id ? (findFlight(game, id) ?? upcomingFlight(game, world, id)) : undefined;
  if (!f) {
    return (
      <div className="screen">
        <h1 className="screen__title">{t('flight.title')}</h1>
        <Panel title={t('flight.title')}>
          <p className="muted">{t('flight.notFound')}</p>
          <a href={hrefFor('ops')} className="button">
            {t('flight.toBoard')}
          </a>
        </Panel>
      </div>
    );
  }
  return <FlightView game={game} world={world} airline={airline} f={f} />;
}

function FlightView({ game, world, airline, f }: { game: GameState; world: EngineWorld; airline: Airline; f: OpsFlight }) {
  const { t } = useTranslation();
  const x = useFlightText(world, airline);
  const now = game.time;
  const aircraft = game.aircraft[f.aircraftId];
  const type = aircraft ? getAircraftType(aircraft.typeId) : null;
  const known = now >= f.dep - KNOWN_BEFORE_MIN;
  const departed = f.status !== 'cancelled' && now >= f.dep + f.depDelay;
  const landed = departed && now >= f.arr + f.arrDelay;
  const s = x.status(f, now);
  const e = f.econ;
  const result = flightResult(f);
  const wx = (v: number | undefined) => t(`flight.weather.${v === undefined ? 'unknown' : v > 0.85 ? 'severe' : v > 0 ? 'poor' : 'fine'}`);
  // The aircraft's other flights that day: how a delay came in and went on.
  const rotation = knownFlights(game).filter((g) => g.aircraftId === f.aircraftId && startOfDay(g.dep) === startOfDay(f.dep));
  const costLines = e ? (Object.entries(e.costs) as [string, number][]).filter(([, v]) => Math.abs(v) >= 1) : [];

  return (
    <div className="screen">
      <div className="screen__head">
        <h1 className="screen__title">
          {x.flightNo(f)} · {x.code(f.fromId)}–{x.code(f.toId)}
        </h1>
        <span className={`chip ${s.cls}`}>{s.text}</span>
      </div>
      <div className="grid">
        <Panel title={t('flight.title')} code="FLT">
          <dl className="facts">
            <dt>{t('flight.route')}</dt>
            <dd>
              {x.name(f.fromId)} ({x.code(f.fromId)}) → {x.name(f.toId)} ({x.code(f.toId)})
            </dd>
            <dt>{t('flight.date')}</dt>
            <dd>{x.date(f.fromId, f.dep)}</dd>
            <dt>{t('flight.aircraft')}</dt>
            <dd>
              {aircraft ? (
                <a href={hrefFor('flights', { aircraft: aircraft.id })}>
                  {aircraft.registration} · {type?.name}
                </a>
              ) : (
                '—'
              )}
            </dd>
            <dt>{t('flight.scheduled')}</dt>
            <dd className="mono">
              {x.time(f.fromId, f.dep)} → {x.time(f.toId, f.arr)}
            </dd>
            {known && f.status !== 'cancelled' && (
              <>
                <dt>{departed ? t('flight.actual') : t('flight.expected')}</dt>
                <dd className="mono">
                  {x.time(f.fromId, f.dep + f.depDelay)} → {x.time(f.status === 'diverted' ? f.divertedTo ?? f.toId : f.toId, f.arr + f.arrDelay)}
                  {!landed && departed && ` (${t('flight.estimated')})`}
                </dd>
                <dt>{t('flight.delay')}</dt>
                <dd className={Math.max(f.depDelay, f.arrDelay) > ON_TIME_MIN ? 'text--caution' : 'text--normal'}>
                  {t('flight.delayValue', { dep: Math.max(0, f.depDelay), arr: f.arrDelay })}
                  {f.cause && f.depDelay > 0 && ` · ${t(`board.cause.${f.cause}`)}`}
                </dd>
              </>
            )}
            <dt>{t('flight.weatherTitle')}</dt>
            <dd>
              {x.code(f.fromId)}: {wx(f.weather?.[0])} · {x.code(f.toId)}: {wx(f.weather?.[1])}
            </dd>
          </dl>
          {known && <p className="small muted">{t(`flight.causeNote.${f.cause && f.depDelay > 0 ? f.cause : 'none'}`)}</p>}
        </Panel>

        <Panel title={t('flight.passengers')} code="PAX">
          {e ? (
            <>
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('flight.class')}</th>
                      <th className="num">{t('flight.seats')}</th>
                      <th className="num">{t('flight.pax')}</th>
                      <th className="num">{t('flight.lf')}</th>
                      <th className="num">{t('flight.revenue')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CLASSES.filter((c) => e.classes[c]).map((c) => {
                      const k = e.classes[c]!;
                      const lf = k.seats ? k.pax / k.seats : 0;
                      return (
                        <tr key={c}>
                          <td>{t(`cabin.class.${c}`)}</td>
                          <td className="num mono">{x.number(k.seats)}</td>
                          <td className="num mono">{x.number(k.pax)}</td>
                          <td className={`num mono ${lfClass(lf)}`}>{x.number(lf * 100)} %</td>
                          <td className="num mono">{x.money(k.revenue)}</td>
                        </tr>
                      );
                    })}
                    <tr>
                      <td>
                        <strong>{t('flight.total')}</strong>
                      </td>
                      <td className="num mono">{x.number(e.seats)}</td>
                      <td className="num mono">{x.number(e.pax)}</td>
                      <td className={`num mono ${lfClass(e.seats ? e.pax / e.seats : 0)}`}>{x.number(e.seats ? (e.pax / e.seats) * 100 : 0)} %</td>
                      <td className="num mono">{x.money(e.revenue)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="small">{t('flight.transfer', { count: Math.round(e.transfer), share: x.number(e.pax ? (e.transfer / e.pax) * 100 : 0) })}</p>
            </>
          ) : (
            <p className="muted small">{f.status === 'cancelled' ? t('flight.noPaxCancelled') : t('flight.paxLater', { count: Math.round(f.pax) })}</p>
          )}
        </Panel>

        <BookingsPanel game={game} airline={airline} f={f} />

        <Panel title={t('flight.money')} code="P&L">
          {e ? (
            <>
              <dl className="facts">
                <dt>{t('finance.line.revenue')}</dt>
                <dd className="mono">{x.money(e.revenue)}</dd>
                {costLines.map(([k, v]) => (
                  <FactCost key={k} label={t(`finance.line.${k}`)} value={x.money(-v)} />
                ))}
                {(f.disruption ?? 0) > 0 && <FactCost label={t('flight.disruption')} value={x.money(-(f.disruption ?? 0))} />}
                <dt>
                  <strong>{t('flight.result')}</strong>
                </dt>
                <dd className={`mono ${result !== null && result < 0 ? 'text--warning' : 'text--normal'}`}>
                  <strong>{result !== null ? x.money(result) : '—'}</strong>
                </dd>
              </dl>
              <p className="small muted">{t('flight.resultNote')}</p>
            </>
          ) : (
            <p className="muted small">{t('flight.moneyLater')}</p>
          )}
        </Panel>

        <Panel title={t('flight.rotation', { registration: aircraft?.registration ?? '' })} code="ROT" className="panel--wide">
          <FlightTable game={game} world={world} airline={airline} flights={rotation} current={flightId(f)} />
          <p className="small">
            <a href={hrefFor('flights', { route: f.routeId })}>{t('flight.routeFlights')}</a>
            {aircraft && (
              <>
                {' · '}
                <a href={hrefFor('flights', { aircraft: aircraft.id })}>{t('flight.aircraftFlights')}</a>
              </>
            )}
          </p>
        </Panel>
      </div>
    </div>
  );
}

/** Seats sold per fare bucket (so far, or in the end) and the booking curve (Phase 9.3). */
function BookingsPanel({ game, airline, f }: { game: GameState; airline: Airline; f: OpsFlight }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const rec = bookingOf(game, f.pairId, f.dir, f.dep);
  const sold = rec?.sold ?? f.econ?.buckets;
  const curve = rec?.curve ?? f.econ?.curve;
  if (!sold || f.status === 'cancelled') return null;
  const daysLeft = Math.max(0, Math.round((f.dep - game.time) / MINUTES_PER_DAY));
  const route = game.routes[f.routeId];
  const marks = Object.entries(curve ?? {})
    .map(([d, n]) => [Number(d), n] as const)
    .sort((a, b) => b[0] - a[0]);
  const maxSeats = rec ? rec.cap.reduce((a, b) => a + b, 0) : (f.econ?.seats ?? 0);
  return (
    <Panel title={rec && game.time < f.dep ? t('flight.bookingsSoFar', { count: daysLeft }) : t('flight.bookings')} code="RM">
      {CLASSES.filter((c) => sold[c]).map((c) => {
        const cap = rec ? (rec.cap[CLASSES.indexOf(c)] ?? 0) : (f.econ?.classes[c]?.seats ?? 0);
        const total = Object.values(sold[c] ?? {}).reduce((a, b) => a + b, 0);
        return (
          <div key={c}>
            <span className="field__label">
              {t(`cabin.class.${c}`)} · {formatNumber(language, total)} / {formatNumber(language, cap)}
            </span>
            <ul className="plain-list small">
              {bucketsOf(airline, c).map((b) => {
                const n = sold[c]?.[b.id] ?? 0;
                const limit = route ? limitOf(route, c, b) : null;
                const closedByDate = rec && daysLeft < b.closeDays;
                const full = limit !== null && n >= limit * cap - 0.5;
                const open = rec && game.time < f.dep && !closedByDate && !full && total < cap - 0.5;
                return (
                  <li key={b.id}>
                    <span className="mono">{formatNumber(language, n)}</span> × {b.name} ({Math.round(b.factor * 100)} %){' '}
                    {rec && game.time < f.dep && (
                      <span className={`chip ${open ? 'chip--normal' : 'chip--caution'}`}>
                        {open ? t('flight.bucketOpen') : closedByDate ? t('flight.bucketClosedDate') : t('flight.bucketFull')}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {marks.length > 1 && maxSeats > 0 && (
        <figure className="booking-curve">
          <svg viewBox="0 0 300 90" role="img" aria-label={t('flight.curve')}>
            <line x1="0" y1="80" x2="300" y2="80" className="booking-curve__axis" />
            <polyline
              className="booking-curve__line"
              points={marks.map(([d, n]) => `${300 - (Math.min(d, 120) / 120) * 300},${80 - (n / maxSeats) * 75}`).join(' ')}
            />
            {marks.map(([d, n]) => (
              <circle key={d} cx={300 - (Math.min(d, 120) / 120) * 300} cy={80 - (n / maxSeats) * 75} r="2.5" className="booking-curve__dot">
                <title>{t('flight.curvePoint', { days: d, seats: formatNumber(language, n) })}</title>
              </circle>
            ))}
          </svg>
          <figcaption className="small muted">{t('flight.curveNote')}</figcaption>
        </figure>
      )}
    </Panel>
  );
}

function FactCost({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="muted">{label}</dt>
      <dd className="mono muted">{value}</dd>
    </>
  );
}

/** A table of flights with links (rotation, a route's or an aircraft's last days). */
function FlightTable({ game, world, airline, flights, current, showDate }: { game: GameState; world: EngineWorld; airline: Airline; flights: OpsFlight[]; current?: string; showDate?: boolean }) {
  const { t } = useTranslation();
  const x = useFlightText(world, airline);
  if (!flights.length) return <p className="muted small">{t('flight.none')}</p>;
  return (
    <div className="table-scroll">
      <table className="table flight-table">
        <thead>
          <tr>
            {showDate && <th>{t('flight.date')}</th>}
            <th>{t('board.flight')}</th>
            <th>{t('board.route')}</th>
            <th className="num">{t('board.std')}</th>
            <th>{t('board.status')}</th>
            <th className="num">{t('flight.lf')}</th>
            <th className="num">{t('flight.result')}</th>
          </tr>
        </thead>
        <tbody>
          {flights.map((f) => {
            const s = x.status(f, game.time);
            const r = flightResult(f);
            const id = flightId(f);
            return (
              <tr key={id} className={id === current ? 'is-current' : undefined}>
                {showDate && <td className="small">{x.date(f.fromId, f.dep)}</td>}
                <td className="mono">
                  <a href={hrefFor('flight', { id })}>{x.flightNo(f)}</a>
                </td>
                <td className="mono">
                  {x.code(f.fromId)}–{x.code(f.toId)}
                </td>
                <td className="num mono">{x.time(f.fromId, f.dep)}</td>
                <td>
                  <span className={`chip ${s.cls}`}>{s.text}</span>
                </td>
                <td className="num mono">{f.econ && f.econ.seats ? `${x.number((f.econ.pax / f.econ.seats) * 100)} %` : '—'}</td>
                <td className={`num mono ${r !== null && r < 0 ? 'text--warning' : ''}`}>{r !== null ? x.money(r) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The last seven days' flights of a route or an aircraft (Phase 9.2). */
export function FlightsScreen() {
  const { t } = useTranslation();
  const { game, airline } = usePlayer();
  const world = useEngineWorld();
  const routeId = useRouteParam('route');
  const aircraftId = useRouteParam('aircraft');
  if (!game || !airline || !world) return null;
  const route = routeId ? game.routes[routeId] : undefined;
  const aircraft = aircraftId ? game.aircraft[aircraftId] : undefined;
  const code = (id: string) => world.airportById.get(id)?.iata ?? id;
  const flights = knownFlights(game)
    .filter((f) => f.airlineId === airline.id && (routeId ? f.routeId === routeId : aircraftId ? f.aircraftId === aircraftId : true))
    .reverse();
  const title = route ? t('flight.routeTitle', { route: `${code(route.originId)}–${code(route.destinationId)}` }) : aircraft ? t('flight.aircraftTitle', { registration: aircraft.registration }) : t('flight.allTitle');
  return (
    <div className="screen">
      <h1 className="screen__title">{title}</h1>
      <Panel title={title} code="LOG">
        <p className="muted small">{t('flight.listNote')}</p>
        <FlightTable game={game} world={world} airline={airline} flights={flights} showDate />
      </Panel>
    </div>
  );
}

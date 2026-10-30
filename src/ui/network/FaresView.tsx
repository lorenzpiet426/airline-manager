import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FLIGHT_FARE_RANGE, MAX_BUCKETS, type FareBucket } from '../../data/fares';
import { bucketsOf, limitOf } from '../../engine/bookings';
import { CLASSES } from '../../engine/cabins';
import { fareRange, type CommandError } from '../../engine/commands';
import { flightId } from '../../engine/delays';
import { pairsOfRoute, specFlights } from '../../engine/schedule';
import type { Airline, CabinClass, FlightPair, GameState, Route } from '../../engine/state';
import { MINUTES_PER_DAY, startOfDay, toDate, utcOffsetMin } from '../../engine/time';
import type { EngineWorld } from '../../engine/world';
import { sendCommand } from '../../game/store';
import { formatGameDate, formatNumber } from '../../i18n/format';
import { useSettings } from '../../settings/settings';
import { Panel } from '../components/Panel';
import { Segmented } from '../components/Segmented';
import { daysText, hhmmText } from '../game/timetableText';
import { hrefFor } from '../navigation';

/** The cabin classes the airline's aircraft have (economy at least). */
function classesOf(game: GameState, airline: Airline): CabinClass[] {
  const have = new Set<CabinClass>(['Y']);
  for (const a of Object.values(game.aircraft)) if (a.airlineId === airline.id) for (const s of a.cabin) if (s.seats > 0) have.add(s.cls);
  return CLASSES.filter((c) => have.has(c));
}

/**
 * Fares (Phase 9.3): the airline's fare buckets per cabin class, each route's seat limits per bucket, and how its next
 * flights are selling.
 */
export function FaresView({ game, world, airline, code }: { game: GameState; world: EngineWorld; airline: Airline; code: (id: string) => string }) {
  const { t } = useTranslation();
  const classes = classesOf(game, airline);
  const [cls, setCls] = useState<CabinClass>('Y');
  const routes = Object.values(game.routes).filter((r) => r.airlineId === airline.id);
  const [routeId, setRouteId] = useState<string>(routes[0]?.id ?? '');
  const route = game.routes[routeId] ?? routes[0];
  return (
    <>
      <Panel title={t('fares.title')} code="RM">
        <p className="muted small">{t('fares.intro')}</p>
        {classes.length > 1 && (
          <Segmented label={t('fares.class')} value={cls} options={classes.map((c) => ({ value: c, label: t(`cabin.class.${c}`) }))} onChange={setCls} />
        )}
        <BucketEditor key={`${cls}|${JSON.stringify(airline.fares?.[cls] ?? null)}`} airline={airline} cls={cls} />
      </Panel>
      {route && (
        <Panel title={t('fares.routeTitle')} code="SEATS">
          <label className="field">
            <span className="field__label">{t('fares.route')}</span>
            <select className="input" value={route.id} onChange={(e) => setRouteId(e.target.value)}>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {code(r.originId)}–{code(r.destinationId)}
                </option>
              ))}
            </select>
          </label>
          <RouteLimits key={`${route.id}|${cls}|${JSON.stringify(route.bucketLimits?.[cls] ?? null)}|${JSON.stringify(airline.fares?.[cls] ?? null)}`} game={game} airline={airline} route={route} cls={cls} />
          <SalesTable game={game} world={world} airline={airline} route={route} cls={cls} code={code} />
        </Panel>
      )}
      {route && (
        <Panel title={t('fares.flightTitle')} code="FLT">
          <FlightFares key={`${route.id}|${pairsOfRoute(game, route.id).map((p) => `${p.id}${p.fares ?? ''}`).join(',')}`} game={game} world={world} airline={airline} route={route} code={code} />
        </Panel>
      )}
    </>
  );
}

function BucketEditor({ airline, cls }: { airline: Airline; cls: CabinClass }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<FareBucket[]>(() => bucketsOf(airline, cls).map((b) => ({ ...b })));
  const [error, setError] = useState<CommandError | null>(null);
  const [saved, setSaved] = useState(false);
  const update = (i: number, change: Partial<FareBucket>) => {
    setSaved(false);
    setRows(rows.map((r, j) => (j === i ? { ...r, ...change } : r)));
  };
  const add = () => {
    let n = rows.length + 1;
    while (rows.some((r) => r.id === `b${n}`)) n++;
    setRows([...rows, { id: `b${n}`, name: t('fares.newBucket'), factor: 1.2, flexible: false, closeDays: 0, share: null }]);
  };
  const save = async () => {
    const r = await sendCommand({ type: 'SetFareBuckets', airlineId: airline.id, payload: { cls, buckets: rows } });
    setError(r.ok ? null : r.error);
    setSaved(r.ok);
  };
  return (
    <>
      <div className="table-scroll">
        <table className="table fares-table">
          <thead>
            <tr>
              <th>{t('fares.name')}</th>
              <th className="num">{t('fares.price')}</th>
              <th>{t('fares.flexible')}</th>
              <th className="num">{t('fares.closes')}</th>
              <th className="num">{t('fares.share')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((b, i) => (
              <tr key={b.id}>
                <td>
                  <input className="input" value={b.name} maxLength={20} aria-label={t('fares.name')} onChange={(e) => update(i, { name: e.target.value })} />
                </td>
                <td className="num">
                  <input
                    className="input mono"
                    type="number"
                    min={20}
                    max={400}
                    step={5}
                    value={Math.round(b.factor * 100)}
                    aria-label={t('fares.price')}
                    onChange={(e) => update(i, { factor: Number(e.target.value) / 100 })}
                  />
                </td>
                <td>
                  <input type="checkbox" checked={b.flexible} aria-label={t('fares.flexible')} onChange={(e) => update(i, { flexible: e.target.checked })} />
                </td>
                <td className="num">
                  <input className="input mono" type="number" min={0} max={90} value={b.closeDays} aria-label={t('fares.closes')} onChange={(e) => update(i, { closeDays: Math.max(0, Math.round(Number(e.target.value))) })} />
                </td>
                <td className="num">
                  <input
                    className="input mono"
                    type="number"
                    min={0}
                    max={100}
                    placeholder={t('fares.noLimit')}
                    value={b.share === null ? '' : Math.round(b.share * 100)}
                    aria-label={t('fares.share')}
                    onChange={(e) => update(i, { share: e.target.value === '' ? null : Math.min(1, Math.max(0, Number(e.target.value) / 100)) })}
                  />
                </td>
                <td>
                  {rows.length > 1 && (
                    <button type="button" className="button button--small" aria-label={t('fares.remove')} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">{t('fares.columnsNote')}</p>
      <div className="toolbar-row">
        {rows.length < MAX_BUCKETS && (
          <button type="button" className="button" onClick={add}>
            {t('fares.add')}
          </button>
        )}
        <button type="button" className="button button--primary" onClick={() => void save()}>
          {t('fares.save')}
        </button>
        {saved && <span className="small text--normal">{t('fares.saved')}</span>}
      </div>
      {error && <p className="notice notice--error">{t(`errors.${error}`)}</p>}
    </>
  );
}

/** Seats of the class on the route's aircraft (the largest, if several). */
function seatsOn(game: GameState, route: Route, cls: CabinClass): number {
  const ids = new Set(Object.values(game.flights).filter((p) => p.routeId === route.id).map((p) => p.aircraftId));
  return Math.max(0, ...[...ids].map((id) => (game.aircraft[id]?.cabin ?? []).filter((s) => s.cls === cls).reduce((n, s) => n + s.seats, 0)));
}

function RouteLimits({ game, airline, route, cls }: { game: GameState; airline: Airline; route: Route; cls: CabinClass }) {
  const { t } = useTranslation();
  const buckets = bucketsOf(airline, cls);
  const seats = seatsOn(game, route, cls);
  const [values, setValues] = useState<Record<string, number | null>>(() => Object.fromEntries(buckets.map((b) => [b.id, limitOf(route, cls, b)])));
  const [error, setError] = useState<CommandError | null>(null);
  useEffect(() => setError(null), [route.id, cls]);
  const own = !!route.bucketLimits?.[cls];
  const run = async (limits: Record<string, number | null>) => {
    const r = await sendCommand({ type: 'SetBucketLimits', airlineId: airline.id, payload: { routeId: route.id, cls, limits } });
    setError(r.ok ? null : r.error);
  };
  return (
    <>
      <p className="small muted">{t(own ? 'fares.limitsOwn' : 'fares.limitsDefault', { seats })}</p>
      <div className="field-row fares-limits">
        {buckets.map((b) => {
          const v = values[b.id] ?? null;
          return (
            <label key={b.id} className="field">
              <span className="field__label">
                {b.name} ({Math.round(b.factor * 100)} %)
              </span>
              <input
                className="input mono"
                type="number"
                min={0}
                max={seats}
                placeholder={t('fares.noLimit')}
                value={v === null ? '' : Math.round(v * seats)}
                onChange={(e) => setValues({ ...values, [b.id]: e.target.value === '' ? null : seats > 0 ? Math.min(1, Math.max(0, Number(e.target.value) / seats)) : 0 })}
              />
            </label>
          );
        })}
      </div>
      <div className="toolbar-row">
        <button type="button" className="button button--primary" onClick={() => void run(values)}>
          {t('fares.saveLimits')}
        </button>
        {own && (
          <button type="button" className="button" onClick={() => void run({})}>
            {t('fares.useDefaults')}
          </button>
        )}
      </div>
      {error && <p className="notice notice--error">{t(`errors.${error}`)}</p>}
    </>
  );
}

/** The route's next two weeks of flights: seats sold so far by bucket. */
function SalesTable({ game, world, airline, route, cls, code }: { game: GameState; world: EngineWorld; airline: Airline; route: Route; cls: CabinClass; code: (id: string) => string }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const buckets = bucketsOf(airline, cls);
  const upcoming = Object.values(game.bookings ?? {})
    .filter((r) => r.routeId === route.id && r.dep >= game.time && r.dep < game.time + 14 * MINUTES_PER_DAY)
    .sort((a, b) => a.dep - b.dep);
  if (!upcoming.length) return <p className="muted small">{t('fares.noSales')}</p>;
  const local = (airportId: string, time: number) => {
    const a = world.airportById.get(airportId);
    return hhmmText(time - startOfDay(time) + (a ? utcOffsetMin(a.tz, time) : 0));
  };
  return (
    <>
      <span className="field__label">{t('fares.salesTitle')}</span>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>{t('flight.date')}</th>
              <th>{t('board.flight')}</th>
              {buckets.map((b) => (
                <th key={b.id} className="num">
                  {b.name}
                </th>
              ))}
              <th className="num">{t('fares.booked')}</th>
            </tr>
          </thead>
          <tbody>
            {upcoming.map((r) => {
              const [pairId, dir] = r.key.split(':') as [string, string];
              const pair = game.flights[pairId];
              const from = dir === '0' ? route.originId : route.destinationId;
              const to = dir === '0' ? route.destinationId : route.originId;
              const sold = r.sold[cls] ?? {};
              const total = Object.values(sold).reduce((a, b) => a + b, 0);
              const cap = r.cap[CLASSES.indexOf(cls)] ?? 0;
              return (
                <tr key={`${r.key}:${r.dep}`}>
                  <td className="small">
                    {formatGameDate(language, toDate(r.dep), true)} {local(from, r.dep)}
                  </td>
                  <td className="mono">
                    <a href={hrefFor('flight', { id: flightId({ pairId, dir: Number(dir) as 0 | 1, dep: r.dep }) })}>
                      {airline.iata} {pair ? pair.flightNumber + Number(dir) : ''}
                    </a>{' '}
                    <span className="muted small">
                      {code(from)}–{code(to)}
                    </span>
                  </td>
                  {buckets.map((b) => (
                    <td key={b.id} className="num mono">
                      {formatNumber(language, sold[b.id] ?? 0)}
                    </td>
                  ))}
                  <td className="num mono">
                    {formatNumber(language, total)} / {formatNumber(language, cap)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Each flight's fare above or below the route's (time-of-day pricing), with its load factor over the last 7 days. */
function FlightFares({ game, world, airline, route, code }: { game: GameState; world: EngineWorld; airline: Airline; route: Route; code: (id: string) => string }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const pairs = pairsOfRoute(game, route.id).sort((a, b) => a.dep - b.dep || a.flightNumber - b.flightNumber);
  const [values, setValues] = useState<Record<string, [number, number]>>(() => Object.fromEntries(pairs.map((p) => [p.id, p.fares ?? [1, 1]])));
  const [error, setError] = useState<CommandError | null>(null);
  const [saved, setSaved] = useState(false);
  const from = world.airportById.get(route.originId);
  const to = world.airportById.get(route.destinationId);
  if (!pairs.length || !from || !to) return <p className="muted small">{t('fares.noFlights')}</p>;
  const [low, high] = fareRange(game, from, to);
  const min = Math.round((Math.max(FLIGHT_FARE_RANGE[0], low) - 1) * 100);
  const max = Math.round((Math.min(FLIGHT_FARE_RANGE[1], high) - 1) * 100);
  // Load factor per flight over the flights flown in the last 7 days.
  const lf = new Map<string, { pax: number; seats: number }>();
  for (const f of game.ops?.history ?? []) {
    if (f.routeId !== route.id || !f.econ) continue;
    const k = `${f.pairId}:${f.dir}`;
    const x = lf.get(k) ?? { pax: 0, seats: 0 };
    x.pax += f.econ.pax;
    x.seats += f.econ.seats;
    lf.set(k, x);
  }
  const lfText = (pairId: string, dir: 0 | 1) => {
    const x = lf.get(`${pairId}:${dir}`);
    return x && x.seats > 0 ? `${formatNumber(language, (x.pax / x.seats) * 100, 0)} %` : '—';
  };
  const deps = (p: FlightPair) => {
    const aircraft = game.aircraft[p.aircraftId];
    return aircraft ? specFlights(world, route, aircraft, 0, p, game.time).map((f) => f.dep) : [p.dep, p.dep];
  };
  const set = (id: string, dir: 0 | 1, pct: number) => {
    const v: [number, number] = [...(values[id] ?? [1, 1])];
    v[dir] = 1 + Math.min(max, Math.max(min, Math.round(pct))) / 100;
    setValues({ ...values, [id]: v });
    setSaved(false);
  };
  const save = async (flightFares: Record<string, [number, number]>) => {
    const r = await sendCommand({ type: 'SetFares', airlineId: airline.id, payload: { routeId: route.id, fareFactor: route.fareFactor, flightFares } });
    setError(r.ok ? null : r.error);
    setSaved(r.ok);
  };
  const cell = (p: FlightPair, dir: 0 | 1, dep: number | undefined) => (
    <>
      <td className="mono">
        {airline.iata} {p.flightNumber + dir}{' '}
        <span className="muted small">
          {code(dir === 0 ? route.originId : route.destinationId)} {hhmmText(dep ?? 0)}
        </span>
      </td>
      <td className="num mono">{lfText(p.id, dir)}</td>
      <td className="num">
        <input
          className="input mono fares-flight-input"
          type="number"
          step={5}
          min={min}
          max={max}
          aria-label={t('fares.flightChange', { flight: `${airline.iata} ${p.flightNumber + dir}` })}
          value={Math.round(((values[p.id]?.[dir] ?? 1) - 1) * 100)}
          onChange={(e) => set(p.id, dir, Number(e.target.value))}
        />
      </td>
    </>
  );
  return (
    <>
      <p className="muted small">{t('fares.flightIntro', { min, max })}</p>
      {game.options.scheduling === 'simple' && <p className="small text--caution">{t('fares.flightSimple')}</p>}
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>{t('fares.days')}</th>
              <th>{t('fares.outbound')}</th>
              <th className="num">{t('fares.lf7')}</th>
              <th className="num">{t('fares.change')}</th>
              <th>{t('fares.return')}</th>
              <th className="num">{t('fares.lf7')}</th>
              <th className="num">{t('fares.change')}</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((p) => {
              const [d0, d1] = deps(p);
              return (
                <tr key={p.id}>
                  <td className="mono small">{daysText(p.days)}</td>
                  {cell(p, 0, d0)}
                  {cell(p, 1, d1)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="toolbar-row">
        <button type="button" className="button button--primary" onClick={() => void save(values)}>
          {t('fares.saveFlights')}
        </button>
        <button type="button" className="button" onClick={() => void save(Object.fromEntries(pairs.map((p) => [p.id, [1, 1] as [number, number]])))}>
          {t('fares.resetFlights')}
        </button>
      </div>
      {saved && <p className="small text--normal">{t('fares.flightsSaved')}</p>}
      <p className="small muted">{t('fares.flightNote')}</p>
      {error && <p className="notice notice--error">{t(`errors.${error}`)}</p>}
    </>
  );
}

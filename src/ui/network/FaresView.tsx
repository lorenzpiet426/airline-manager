import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_BUCKETS, type FareBucket } from '../../data/fares';
import { bucketsOf, limitOf } from '../../engine/bookings';
import { CLASSES } from '../../engine/cabins';
import type { CommandError } from '../../engine/commands';
import { flightId } from '../../engine/delays';
import type { Airline, CabinClass, GameState, Route } from '../../engine/state';
import { MINUTES_PER_DAY, startOfDay, toDate, utcOffsetMin } from '../../engine/time';
import type { EngineWorld } from '../../engine/world';
import { sendCommand } from '../../game/store';
import { formatGameDate, formatNumber } from '../../i18n/format';
import { useSettings } from '../../settings/settings';
import { Panel } from '../components/Panel';
import { Segmented } from '../components/Segmented';
import { hhmmText } from '../game/timetableText';
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

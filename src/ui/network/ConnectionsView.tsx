import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Airline, GameState } from '../../engine/state';
import { hubFlights, mctAt, playerConnections } from '../../engine/transfers';
import type { EngineWorld } from '../../engine/world';
import { formatNumber } from '../../i18n/format';
import { useSettings } from '../../settings/settings';
import { Panel } from '../components/Panel';
import { durationText } from '../game/timetableText';

const W = 720;
const H = 200;
const AXIS = H / 2;

/**
 * Your hub's connections (Phase 7.1): the waves of arrivals and departures over the day, the flights carrying the most
 * connecting passengers, and journeys that have travellers but no workable connection.
 */
export function ConnectionsView({ game, world, airline, code }: { game: GameState; world: EngineWorld; airline: Airline; code: (id: string) => string }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const hub = world.airportById.get(airline.hubId);
  const data = useMemo(() => {
    const pc = playerConnections(world, game, airline.id, airline.hubId);
    const flights = hubFlights(world, game, airline.id, airline.hubId);
    const arrivals = new Array<number>(24).fill(0);
    const departures = new Array<number>(24).fill(0);
    for (const list of flights.in.values()) for (const f of list) arrivals[Math.floor((f.at % 1440) / 60)]! += 1 / 7;
    for (const list of flights.out.values()) for (const f of list) departures[Math.floor((f.at % 1440) / 60)]! += 1 / 7;
    // Connecting passengers per flight (both the arriving and the departing one count them).
    const byFlight = new Map<string, { pax: number; partners: Set<string> }>();
    for (const c of pc.connections) {
      for (const [k, other] of [[c.arrival, c.to], [c.departure, c.from]] as const) {
        const e = byFlight.get(k) ?? byFlight.set(k, { pax: 0, partners: new Set() }).get(k)!;
        e.pax += c.pax;
        e.partners.add(other);
      }
    }
    const top = [...byFlight].sort((x, y) => y[1].pax - x[1].pax).slice(0, 12);
    const options = pc.connections.length;
    const waits = pc.connections.reduce((s, c) => s + c.wait * c.pax, 0) / Math.max(1, pc.connections.reduce((s, c) => s + c.pax, 0));
    return { arrivals, departures, top, missed: pc.missed.slice(0, 10), options, waits, potential: pc.connections.reduce((s, c) => s + c.pax, 0) };
  }, [world, game, airline.id, airline.hubId]);

  const lastWeek = game.finance[airline.id]?.history.at(-1);
  const lastTransfer = lastWeek ? Object.values(lastWeek.routes).reduce((s, r) => s + (r.transfer ?? 0), 0) : null;
  const max = Math.max(1, ...data.arrivals, ...data.departures);
  const bar = W / 24;
  const flightName = (key: string) => {
    const [pairId, dir] = key.split(':');
    const pair = game.flights[pairId!];
    const route = pair ? game.routes[pair.routeId] : undefined;
    if (!pair || !route) return null;
    return {
      number: `${airline.iata} ${pair.flightNumber + Number(dir)}`,
      route: dir === '0' ? `${code(route.originId)}–${code(route.destinationId)}` : `${code(route.destinationId)}–${code(route.originId)}`,
    };
  };

  return (
    <>
      <Panel title={t('connections.title', { hub: hub?.iata ?? airline.hubId })} code="HUB">
        <p className="muted small">{t('connections.intro')}</p>
        <dl className="facts facts--compact">
          <dt>{t('connections.mct')}</dt>
          <dd className="mono">
            {hub ? t('connections.mctValue', { short: mctAt(hub, false), long: mctAt(hub, true) }) : '—'}
          </dd>
          <dt>{t('connections.lastWeek')}</dt>
          <dd className="mono">{lastTransfer !== null ? formatNumber(language, Math.round(lastTransfer)) : '—'}</dd>
          <dt>{t('connections.options')}</dt>
          <dd className="mono">{formatNumber(language, data.options)}</dd>
          <dt>{t('connections.wait')}</dt>
          <dd className="mono">{data.potential > 0 ? durationText(Math.round(data.waits)) : '—'}</dd>
        </dl>
        <figure className="waves">
          <svg viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label={t('connections.chartLabel')} className="waves__chart">
            {data.arrivals.map((n, h) => (
              <rect key={`a${h}`} x={h * bar + 2} width={bar - 4} y={AXIS - (n / max) * (AXIS - 6)} height={(n / max) * (AXIS - 6)} rx={2} className="waves__arr">
                <title>{`${String(h).padStart(2, '0')}:00 · ${t('connections.arrivals')}: ${formatNumber(language, n, 1)}`}</title>
              </rect>
            ))}
            {data.departures.map((n, h) => (
              <rect key={`d${h}`} x={h * bar + 2} width={bar - 4} y={AXIS + 1} height={(n / max) * (AXIS - 6)} rx={2} className="waves__dep">
                <title>{`${String(h).padStart(2, '0')}:00 · ${t('connections.departures')}: ${formatNumber(language, n, 1)}`}</title>
              </rect>
            ))}
            <line x1={0} x2={W} y1={AXIS} y2={AXIS} className="waves__axis" />
            {[0, 6, 12, 18].map((h) => (
              <text key={h} x={h * bar + 2} y={H + 14} className="waves__tick">
                {`${String(h).padStart(2, '0')}:00`}
              </text>
            ))}
          </svg>
          <figcaption className="small muted">
            <span className="waves__key waves__key--arr" /> {t('connections.arrivals')} · <span className="waves__key waves__key--dep" /> {t('connections.departures')}{' '}
            · {t('connections.perDay')}
          </figcaption>
        </figure>
      </Panel>

      <Panel title={t('connections.top')} code="XFR">
        {data.top.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>{t('connections.flight')}</th>
                <th>{t('connections.route')}</th>
                <th className="num">{t('connections.pax')}</th>
                <th className="num">{t('connections.partners')}</th>
              </tr>
            </thead>
            <tbody>
              {data.top.map(([key, e]) => {
                const f = flightName(key);
                return f ? (
                  <tr key={key}>
                    <td className="mono">{f.number}</td>
                    <td className="mono">{f.route}</td>
                    <td className="num mono">{formatNumber(language, Math.round(e.pax))}</td>
                    <td className="num mono">{e.partners.size}</td>
                  </tr>
                ) : null;
              })}
            </tbody>
          </table>
        ) : (
          <p className="muted">{t('connections.none')}</p>
        )}
        <p className="muted small">{t('connections.topNote')}</p>
      </Panel>

      <Panel title={t('connections.missed')} code="MISS">
        <p className="muted small">{t('connections.missedNote', { hub: hub?.iata ?? '' })}</p>
        {data.missed.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>{t('connections.journey')}</th>
                <th className="num">{t('connections.possible')}</th>
              </tr>
            </thead>
            <tbody>
              {data.missed.map((m) => (
                <tr key={`${m.from}-${m.to}`}>
                  <td className="mono">{`${code(m.from)} → ${hub?.iata ?? ''} → ${code(m.to)}`}</td>
                  <td className="num mono">{formatNumber(language, Math.round(m.pax))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">{t('connections.noneMissed')}</p>
        )}
      </Panel>
    </>
  );
}

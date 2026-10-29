import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CONTACT_GATE_USD_YEAR,
  freeGates,
  gatesAt,
  gatesOf,
  hubGatesCached,
  LOUNGE_BUILD_MONTHS,
  LOUNGE_BUILD_USD_PER_SEAT,
  LOUNGE_QUALITIES,
  LOUNGE_RUN_USD_PER_SEAT_YEAR,
  LOUNGE_SEATS,
  loungeCrowding,
  REMOTE_STAND_USD_YEAR,
} from '../../engine/hub';
import { priceLevelAt } from '../../engine/era';
import { convert, money } from '../../engine/money';
import type { Airline, GameState, LoungeQuality } from '../../engine/state';
import { toDate } from '../../engine/time';
import type { EngineWorld } from '../../engine/world';
import { sendCommand } from '../../game/store';
import { formatGameDate, formatMoney, formatNumber } from '../../i18n/format';
import { useSettings } from '../../settings/settings';
import { Panel } from '../components/Panel';
import { weekdayNames } from '../game/timetableText';
import type { CommandError } from '../../engine/commands';

const W = 720;
const H = 140;

/** Your hub on the ground (Phase 7.3): gates rented and needed over the day, and your lounge. */
export function HubView({ game, world, airline, airportId }: { game: GameState; world: EngineWorld; airline: Airline; airportId: string }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const hub = world.airportById.get(airportId);
  const gates = gatesOf(airline, airportId) ?? { contact: 0, remote: 0 };
  const [contact, setContact] = useState(gates.contact);
  const [remote, setRemote] = useState(gates.remote);
  // After renting (or a timetable change renting stands) the fields show the new numbers.
  useEffect(() => {
    setContact(gates.contact);
    setRemote(gates.remote);
  }, [gates.contact, gates.remote]);
  const [seats, setSeats] = useState(200);
  const [quality, setQuality] = useState<LoungeQuality>('premium');
  const [error, setError] = useState<CommandError | null>(null);
  const level = priceLevelAt(game.time);
  const book = (usd: number) => formatMoney(language, convert(money(usd, 'USD'), airline.currency, game.fx), false);

  const data = useMemo(() => {
    const g = hubGatesCached(game, world, airline.id, airportId);
    // The most aircraft at the gates in each hour of the day (any day of the week).
    const perHour = new Array<number>(24).fill(0);
    g.load.forEach((n, i) => {
      const h = Math.floor((i * 5) / 60) % 24;
      perHour[h] = Math.max(perHour[h]!, n);
    });
    const kinds = [...g.gateOf.values()];
    return { peak: g.peak, peakAt: g.peakAt, perHour, contactShare: kinds.length ? kinds.filter((k) => k === 'contact').length / kinds.length : 0, short: g.short };
  }, [game, world, airline.id, airportId]);
  const free = freeGates(game, world, airline.id, airportId);
  const total = hub ? gatesAt(hub) : { contact: 0, remote: 0 };
  const max = Math.max(1, data.peak, gates.contact + gates.remote);
  const bar = W / 24;
  const lounge = airline.lounges?.find((l) => l.airportId === airportId);
  const crowd = lounge ? loungeCrowding(game, airline.id, lounge) : null;
  const run = async (command: Parameters<typeof sendCommand>[0]) => {
    const r = await sendCommand(command);
    setError(r.ok ? null : r.error);
  };
  const days = weekdayNames(language);

  return (
    <>
      <Panel title={t('hub.gatesTitle', { hub: hub?.iata ?? airportId })} code="GATE">
        <p className="muted small">{t('hub.gatesIntro')}</p>
        <dl className="facts facts--compact">
          <dt>{t('hub.rented')}</dt>
          <dd className="mono">{t('hub.rentedValue', { contact: gates.contact, remote: gates.remote })}</dd>
          <dt>{t('hub.peak')}</dt>
          <dd className="mono">
            {t('hub.peakValue', { count: data.peak, time: `${days[Math.floor(data.peakAt / 1440)]} ${String(Math.floor((data.peakAt % 1440) / 60)).padStart(2, '0')}:${String(data.peakAt % 60).padStart(2, '0')}` })}
          </dd>
          <dt>{t('hub.contactShare')}</dt>
          <dd className="mono">{`${Math.round(data.contactShare * 100)} %`}</dd>
          <dt>{t('hub.airportGates')}</dt>
          <dd className="mono">{t('hub.airportGatesValue', { contact: total.contact, remote: total.remote, freeContact: free.contact, freeRemote: free.remote })}</dd>
          <dt>{t('hub.rent')}</dt>
          <dd className="mono">{t('hub.rentValue', { contact: book(CONTACT_GATE_USD_YEAR * level), remote: book(REMOTE_STAND_USD_YEAR * level) })}</dd>
        </dl>
        <figure className="waves">
          <svg viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label={t('hub.chartLabel')} className="waves__chart">
            {data.perHour.map((n, h) => (
              <rect key={h} x={h * bar + 2} width={bar - 4} y={H - (n / max) * (H - 4)} height={(n / max) * (H - 4)} rx={2} className={n > gates.contact ? 'hub__over' : 'waves__dep'}>
                <title>{`${String(h).padStart(2, '0')}:00 · ${n}`}</title>
              </rect>
            ))}
            <line x1={0} x2={W} y1={H - (gates.contact / max) * (H - 4)} y2={H - (gates.contact / max) * (H - 4)} className="hub__line" />
            {[0, 6, 12, 18].map((h) => (
              <text key={h} x={h * bar + 2} y={H + 14} className="waves__tick">
                {`${String(h).padStart(2, '0')}:00`}
              </text>
            ))}
          </svg>
          <figcaption className="small muted">{t('hub.chartNote')}</figcaption>
        </figure>
        <div className="field-row">
          <label className="field">
            <span className="field__label">{t('hub.contactGates')}</span>
            <input className="input mono" type="number" min={0} max={gates.contact + free.contact} value={contact} onChange={(e) => setContact(Math.max(0, Math.round(Number(e.target.value))))} />
          </label>
          <label className="field">
            <span className="field__label">{t('hub.remoteStands')}</span>
            <input className="input mono" type="number" min={0} max={gates.remote + free.remote} value={remote} onChange={(e) => setRemote(Math.max(0, Math.round(Number(e.target.value))))} />
          </label>
        </div>
        <button
          type="button"
          className="button button--primary"
          disabled={contact === gates.contact && remote === gates.remote}
          onClick={() => void run({ type: 'RentGates', airlineId: airline.id, payload: { contact, remote, airportId } })}
        >
          {t('hub.applyGates')}
        </button>
      </Panel>

      <Panel title={t('hub.loungeTitle', { hub: hub?.iata ?? airportId })} code="LNG">
        <p className="muted small">{t('hub.loungeIntro')}</p>
        {lounge ? (
          <>
            <dl className="facts facts--compact">
              <dt>{t('hub.lounge')}</dt>
              <dd>{t('hub.loungeValue', { seats: lounge.seats, quality: t(`hub.quality.${lounge.quality}`) })}</dd>
              <dt>{t('hub.status')}</dt>
              <dd>{lounge.readyAt > game.time ? t('hub.building', { date: formatGameDate(language, toDate(lounge.readyAt), false) }) : t('hub.open')}</dd>
              {crowd && lounge.readyAt <= game.time && (
                <>
                  <dt>{t('hub.visitors')}</dt>
                  <dd className={`mono${crowd.load > 1 ? ' text--caution' : ''}`}>{t('hub.visitorsValue', { peak: formatNumber(language, Math.round(crowd.peak)), load: Math.round(crowd.load * 100) })}</dd>
                </>
              )}
              <dt>{t('hub.running')}</dt>
              <dd className="mono">{book(lounge.seats * LOUNGE_RUN_USD_PER_SEAT_YEAR[lounge.quality] * level)}</dd>
            </dl>
            <button
              type="button"
              className="button"
              onClick={() => window.confirm(t('hub.closeConfirm')) && void run({ type: 'CloseLounge', airlineId: airline.id, payload: { airportId } })}
            >
              {t('hub.close')}
            </button>
          </>
        ) : (
          <>
            <div className="field-row">
              <label className="field">
                <span className="field__label">{t('hub.seats')}</span>
                <input className="input mono" type="number" step={10} min={LOUNGE_SEATS[0]} max={LOUNGE_SEATS[1]} value={seats} onChange={(e) => setSeats(Math.round(Number(e.target.value)))} />
              </label>
              <label className="field">
                <span className="field__label">{t('hub.qualityLabel')}</span>
                <select className="input" value={quality} onChange={(e) => setQuality(e.target.value as LoungeQuality)}>
                  {LOUNGE_QUALITIES.map((q) => (
                    <option key={q} value={q}>
                      {t(`hub.quality.${q}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="small">
              {t('hub.buildCost', {
                cost: book(seats * LOUNGE_BUILD_USD_PER_SEAT[quality] * level),
                run: book(seats * LOUNGE_RUN_USD_PER_SEAT_YEAR[quality] * level),
                months: LOUNGE_BUILD_MONTHS,
              })}
            </p>
            <button type="button" className="button button--primary" onClick={() => void run({ type: 'BuildLounge', airlineId: airline.id, payload: { seats, quality, airportId } })}>
              {t('hub.build')}
            </button>
          </>
        )}
        {error && <p className="notice notice--error">{t(`errors.${error}`)}</p>}
      </Panel>
    </>
  );
}

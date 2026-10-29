import { Fragment, useState } from 'react';
import { priceLevelAt } from '../../engine/era';
import { useTranslation } from 'react-i18next';
import { getAircraftType } from '../../data/aircraft';
import { HANGAR_BUILD_MONTHS, HANGAR_FIRST_PAYMENT, HANGARS, TYPICAL_FH_PER_YEAR, type HangarSize } from '../../data/maintenance';
import { useGameWorld } from '../game/useEngineWorld';
import type { CommandError } from '../../engine/commands';
import { checkOffer, checksDue, dueOf, initialMaint } from '../../engine/maintenance';
import { convert, money } from '../../engine/money';
import type { Aircraft, Airline, GameState, SaleOffer } from '../../engine/state';
import { addMonths, fromDate, MINUTES_PER_DAY, startOfDay, toDate } from '../../engine/time';
import { sendCommand } from '../../game/store';
import { formatGameDate, formatMoney, formatNumber } from '../../i18n/format';
import { useSettings } from '../../settings/settings';
import { Panel } from '../components/Panel';
import { useEngineWorld } from '../game/useEngineWorld';

const DAY = MINUTES_PER_DAY;
const isoDay = (time: number) => toDate(time).toISOString().slice(0, 10);

function useFormat(game: GameState, airline: Airline) {
  const { language } = useSettings();
  return {
    language,
    usd: (usd: number) => formatMoney(language, convert(money(usd, 'USD'), airline.currency, game.fx)),
    date: (time: number) => formatGameDate(language, toDate(time), false),
  };
}

/** Chip for an aircraft in a check or grounded by a failure (null when it is flying normally). */
export function MaintenanceChip({ game, aircraft }: { game: GameState; aircraft: Aircraft }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const m = aircraft.maint;
  if (m?.inCheck && m.inCheck.until > game.time) {
    return <span className="chip chip--caution">{t('fleet.inCheck', { check: m.inCheck.kind, date: formatGameDate(language, toDate(m.inCheck.until), false) })}</span>;
  }
  if ((aircraft.paintUntil ?? 0) > game.time) {
    return <span className="chip chip--caution">{t('livery.inPaint', { date: formatGameDate(language, toDate(aircraft.paintUntil!), false) })}</span>;
  }
  if (m?.aog && game.time >= m.aog.from && game.time < m.aog.until) {
    return <span className="chip chip--warning">{t('fleet.aog', { date: formatGameDate(language, toDate(m.aog.until), false) })}</span>;
  }
  return null;
}

/**
 * An aircraft's maintenance on its fleet card: flight hours, next A-check, the next heavy check (planned date, days,
 * price) with a way to move it, and the reserves a lessor holds.
 */
export function CheckFacts({ game, airline, aircraft }: { game: GameState; airline: Airline; aircraft: Aircraft }) {
  const { t } = useTranslation();
  const world = useEngineWorld();
  const f = useFormat(game, airline);
  const [moving, setMoving] = useState(false);
  const [day, setDay] = useState<number | null>(null);
  const [error, setError] = useState<CommandError | null>(null);
  const m = aircraft.maint;
  if (!world || !m || aircraft.status !== 'active') return null;
  const due = dueOf(game, world, aircraft)!;
  const heavy = due.next.kind;
  const plan = m.plan;
  const inHeavy = m.inCheck && m.inCheck.kind !== 'A' && m.inCheck.until > game.time;
  const offer = plan ? checkOffer(game, aircraft, plan.kind, plan.start, plan.bookedAt) : null;
  const first = startOfDay(game.time) + DAY;
  const chosen = day ?? plan?.start ?? Math.min(due.next.due, first + 30 * DAY);
  const quote = checkOffer(game, aircraft, heavy, chosen, game.time);

  const move = async () => {
    const r = await sendCommand({ type: 'MoveCheck', airlineId: airline.id, payload: { aircraftId: aircraft.id, start: chosen } });
    if (r.ok) {
      setMoving(false);
      setDay(null);
      setError(null);
    } else setError(r.error);
  };

  return (
    <>
      <dl className="facts facts--compact">
        <dt>{t('maint.flightHours')}</dt>
        <dd className="mono">{formatNumber(f.language, Math.round(m.fh))}</dd>
        <dt>{t('maint.nextA')}</dt>
        <dd className="mono">{due.aHoursLeft > 0 ? t('maint.nextAValue', { hours: formatNumber(f.language, Math.round(due.aHoursLeft)) }) : t('maint.aDue')}</dd>
        <dt>{t('maint.heavy', { check: t(`maint.check.${heavy}`) })}</dt>
        <dd className="mono">
          {inHeavy
            ? t('maint.inCheckNow', { date: f.date(m.inCheck!.until) })
            : plan && offer
              ? t('maint.planned', { date: f.date(plan.start), days: offer.days, price: f.usd(offer.usd), where: t(`maint.where.${offer.where}`) })
              : t('maint.notPlanned', { date: f.date(due.next.due) })}
        </dd>
        {plan && !inHeavy && (
          <>
            <dt />
            <dd className="mono muted">{t('maint.dueBy', { date: f.date(due.next.due) })}</dd>
          </>
        )}
        {aircraft.lease && (
          <>
            <dt>{t('maint.reserves')}</dt>
            <dd className="mono">{t('maint.reservesValue', { amount: f.usd(m.reserves ?? 0), rate: f.usd(aircraft.lease.reserveUsdPerFh ?? 0) })}</dd>
          </>
        )}
      </dl>
      {!inHeavy &&
        (moving ? (
          <div className="confirm">
            <label className="field">
              <span className="field__label">{t('maint.startOn')}</span>
              <input
                type="date"
                className="input"
                min={isoDay(first)}
                max={isoDay(due.next.due)}
                value={isoDay(chosen)}
                onChange={(e) => e.target.value && setDay(fromDate(new Date(`${e.target.value}T00:00:00Z`)))}
              />
            </label>
            <p className="small">
              {t('maint.moveAsk', { check: t(`maint.check.${heavy}`), date: f.date(chosen), days: quote.days, price: f.usd(quote.usd), where: t(`maint.where.${quote.where}`) })}
              {quote.shortNotice && ` ${t('maint.shortNotice')}`}
              {quote.fromReserves > 0 && ` ${t('maint.fromReserves', { amount: f.usd(quote.fromReserves) })}`}
            </p>
            {error && <p className="notice notice--error small">{t(`errors.${error}`)}</p>}
            <div className="confirm__actions">
              <button type="button" className="button" onClick={() => (setMoving(false), setError(null), setDay(null))}>
                {t('common.cancel')}
              </button>
              <button type="button" className="button button--primary" onClick={() => void move()}>
                {t('maint.move')}
              </button>
            </div>
          </div>
        ) : (
          <div className="button-row">
            <button type="button" className="button button--small" onClick={() => setMoving(true)}>
              {t('maint.move')}
            </button>
          </div>
        ))}
    </>
  );
}

/** "Next heavy check" fact on a used aircraft for sale (its records come with it). */
export function SaleCheckFact({ game, offer }: { game: GameState; offer: SaleOffer }) {
  const { t } = useTranslation();
  const type = getAircraftType(offer.typeId);
  const m = initialMaint(offer.id, type, offer.builtYear, game.time, 'used');
  const due = checksDue(type, m, game.time, TYPICAL_FH_PER_YEAR[type.category] / 365);
  const months = Math.max(0, Math.round((due.next.due - game.time) / (30.4 * DAY)));
  return (
    <>
      <dt>{t('fleet.nextHeavy')}</dt>
      <dd className="mono">{t('fleet.nextHeavyValue', { check: due.next.kind, months })}</dd>
    </>
  );
}

/** The Maintenance tab: own hangars, and the check plan of the whole fleet. */
export function MaintenanceTab({ game, airline }: { game: GameState; airline: Airline }) {
  const { t } = useTranslation();
  const world = useEngineWorld();
  const f = useFormat(game, airline);
  const fleet = Object.values(game.aircraft)
    .filter((a) => a.airlineId === airline.id && a.status === 'active' && a.maint)
    .map((a) => ({ a, due: world ? dueOf(game, world, a) : null }))
    .sort((x, y) => (x.a.maint!.plan?.start ?? x.due?.next.due ?? 0) - (y.a.maint!.plan?.start ?? y.due?.next.due ?? 0));

  return (
    <>
      <p className="muted">{t('maint.intro')}</p>
      <Panel title={t('maint.planTitle')}>
        {!fleet.length || !world ? (
          <p className="muted">{t('maint.noFleet')}</p>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('maint.colAircraft')}</th>
                  <th>{t('maint.colNext')}</th>
                  <th>{t('maint.colWhen')}</th>
                  <th className="num">{t('maint.colCost')}</th>
                </tr>
              </thead>
              <tbody>
                {fleet.map(({ a, due }) => (
                  <PlanRow key={a.id} game={game} aircraft={a} due={due!} f={f} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small">{t('maint.costNote')}</p>
      </Panel>
      <Hangars game={game} airline={airline} />
    </>
  );
}

function PlanRow({ game, aircraft, due, f }: { game: GameState; aircraft: Aircraft; due: NonNullable<ReturnType<typeof dueOf>>; f: ReturnType<typeof useFormat> }) {
  const { t } = useTranslation();
  const m = aircraft.maint!;
  const inCheck = m.inCheck && m.inCheck.until > game.time;
  const plan = m.plan;
  // Unplanned checks: what it would cost at its due date, booked in good time.
  const offer = plan ? checkOffer(game, aircraft, plan.kind, plan.start, plan.bookedAt) : checkOffer(game, aircraft, due.next.kind, due.next.due, 0);
  return (
    <tr>
      <td className="mono">
        {aircraft.registration} <span className="muted">{getAircraftType(aircraft.typeId).icao}</span>
      </td>
      <td>{t(`maint.check.${inCheck ? m.inCheck!.kind : due.next.kind}`)}</td>
      <td className="mono">
        {inCheck
          ? t('maint.inCheckNow', { date: f.date(m.inCheck!.until) })
          : plan
            ? `${f.date(plan.start)} · ${t('maint.days', { count: offer.days })}`
            : t('maint.dueBy', { date: f.date(due.next.due) })}
      </td>
      <td className="num mono">
        {!plan && '≈ '}
        {f.usd(offer.usd)}
      </td>
    </tr>
  );
}

function Hangars({ game, airline }: { game: GameState; airline: Airline }) {
  const { t } = useTranslation();
  const f = useFormat(game, airline);
  const world = useGameWorld();
  const code = (id: string) => world?.airportById.get(id)?.iata ?? id;
  const [asking, setAsking] = useState<HangarSize | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const own = Object.values(game.hangars).filter((h) => h.airlineId === airline.id);
  const build = async (size: HangarSize) => {
    const r = await sendCommand({ type: 'BuildHangar', airlineId: airline.id, payload: { size } });
    setAsking(null);
    setNotice(r.ok ? { ok: true, text: t('maint.builtNotice') } : { ok: false, text: t(`errors.${r.error}`) });
  };
  const local = (usd: number) => convert(money(usd, 'USD'), airline.currency, game.fx).amount;
  return (
    <Panel title={t('maint.hangarTitle')}>
      <p className="muted">{t('maint.hangarIntro')}</p>
      {own.length > 0 && (
        <ul className="plain-list">
          {own.map((h) => (
            <li key={h.id} className="mono">
              {h.ready
                ? t('maint.hangarReady', { size: t(`maint.size.${h.size}`), airport: code(h.airportId) })
                : t('maint.hangarBuilding', { size: t(`maint.size.${h.size}`), airport: code(h.airportId), date: f.date(h.readyAt) })}
            </li>
          ))}
        </ul>
      )}
      {notice && <p className={`notice notice--${notice.ok ? 'ok' : 'error'} small`}>{notice.text}</p>}
      <dl className="facts">
        {(Object.keys(HANGARS) as HangarSize[]).map((size) => {
          // Prices of the time in historical games.
          const level = priceLevelAt(game.time);
          const spec = { ...HANGARS[size], usd: HANGARS[size].usd * level, runningUsdPerDay: HANGARS[size].runningUsdPerDay * level };
          return (
            <Fragment key={size}>
              <dt>{t(`maint.size.${size}`)}</dt>
              <dd>
                <span className="muted small">{t(`maint.sizeHint.${size}`)}</span>
                <br />
                <span className="small">{t('maint.hangarFacts', { price: f.usd(spec.usd), running: f.usd(spec.runningUsdPerDay) })}</span>
                {asking === size ? (
                  <div className="confirm">
                    <p className="small">
                      {t('maint.buildAsk', {
                        size: t(`maint.size.${size}`),
                        airport: code(airline.hubId),
                        price: f.usd(spec.usd),
                        now: f.usd(spec.usd * HANGAR_FIRST_PAYMENT),
                        date: f.date(addMonths(game.time, HANGAR_BUILD_MONTHS)),
                      })}
                    </p>
                    <div className="confirm__actions">
                      <button type="button" className="button" onClick={() => setAsking(null)}>
                        {t('common.cancel')}
                      </button>
                      <button type="button" className="button button--primary" onClick={() => void build(size)}>
                        {t('maint.build')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="button-row">
                    <button
                      type="button"
                      className="button button--small"
                      disabled={airline.cash.amount < local(spec.usd * HANGAR_FIRST_PAYMENT)}
                      onClick={() => (setAsking(size), setNotice(null))}
                    >
                      {airline.cash.amount < local(spec.usd * HANGAR_FIRST_PAYMENT) ? t('errors.insufficientCash') : t('maint.build')}
                    </button>
                  </div>
                )}
              </dd>
            </Fragment>
          );
        })}
      </dl>
    </Panel>
  );
}

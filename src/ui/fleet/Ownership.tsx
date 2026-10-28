import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAircraftType } from '../../data/aircraft';
import { EXTEND_WINDOW_MONTHS, partsValueUsd } from '../../data/factory';
import type { CommandError } from '../../engine/commands';
import { aircraftMarketValueUsd, bookValue, earlyReturnFeeUsd, extensionRentUsd } from '../../engine/fleet';
import { convert, money } from '../../engine/money';
import { pairsOfAircraft } from '../../engine/schedule';
import type { Aircraft, Airline, GameState } from '../../engine/state';
import { addMonths, toDate } from '../../engine/time';
import { sendCommand } from '../../game/store';
import { formatGameDate, formatMoney } from '../../i18n/format';
import { useSettings } from '../../settings/settings';

type Action = 'sell' | 'scrap' | 'return' | 'extend' | 'cancel';

/**
 * How the airline holds an aircraft (leased, owned or on order) with the matching facts, and what it can do with it:
 * extend or return a lease, sell or scrap an owned aircraft, cancel an order. Every action asks first.
 */
export function Ownership({ game, airline, aircraft }: { game: GameState; airline: Airline; aircraft: Aircraft }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const [asking, setAsking] = useState<Action | null>(null);
  const [years, setYears] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CommandError | null>(null);
  const local = (usd: number) => formatMoney(language, convert(money(usd, 'USD'), airline.currency, game.fx));
  const book = (amount: number) => formatMoney(language, { amount, currency: airline.currency });
  const date = (time: number) => formatGameDate(language, toDate(time), false);
  const routes = new Set(pairsOfAircraft(game, aircraft.id).map((p) => p.routeId)).size;
  const now = game.time;

  const run = async (action: Action) => {
    setBusy(true);
    setError(null);
    const id = aircraft.id;
    const result = await sendCommand(
      action === 'sell' || action === 'scrap'
        ? { type: 'SellAircraft', airlineId: airline.id, payload: { aircraftId: id, scrap: action === 'scrap' } }
        : action === 'return'
          ? { type: 'ReturnLease', airlineId: airline.id, payload: { aircraftId: id } }
          : action === 'extend'
            ? { type: 'ExtendLease', airlineId: airline.id, payload: { aircraftId: id, years } }
            : { type: 'CancelOrder', airlineId: airline.id, payload: { aircraftId: id } },
    );
    setBusy(false);
    if (result.ok) setAsking(null);
    else setError(result.error);
  };

  let facts: [string, string][] = [];
  let actions: Action[] = [];
  let question = '';
  if (aircraft.lease) {
    const l = aircraft.lease;
    facts = [
      [t('fleet.ownership'), t('fleet.leasedFrom', { lessor: l.lessor })],
      [t('fleet.rent'), `${formatMoney(language, l.monthlyRent)} ${t('fleet.perMonth')}`],
      [t('fleet.leaseEnds'), date(l.endAt)],
    ];
    const canExtend = l.endAt <= addMonths(now, EXTEND_WINDOW_MONTHS);
    actions = canExtend ? ['extend', 'return'] : ['return'];
    if (asking === 'return') question = t('fleet.ask.return', { fee: local(earlyReturnFeeUsd(aircraft, now)), deposit: formatMoney(language, l.deposit), count: routes });
    if (asking === 'extend') question = t('fleet.ask.extend', { rent: formatMoney(language, money(extensionRentUsd(aircraft, now), 'USD')), until: date(addMonths(l.endAt, years * 12)) });
  } else if (aircraft.owned) {
    const o = aircraft.owned;
    const market = aircraftMarketValueUsd(aircraft, now);
    facts = [
      [t('fleet.ownership'), t('fleet.ownedSince', { date: date(o.boughtAt) })],
      [t('fleet.paid'), book(o.price)],
      [t('fleet.bookValue'), book(bookValue(o, now))],
      [t('fleet.marketValue'), local(market)],
    ];
    actions = aircraft.status === 'active' ? ['sell', 'scrap'] : [];
    if (asking === 'sell') question = t('fleet.ask.sell', { price: local(Math.round(market * 0.97)), count: routes });
    if (asking === 'scrap') question = t('fleet.ask.scrap', { price: local(partsValueUsd(getAircraftType(aircraft.typeId))), count: routes });
  } else if (aircraft.order) {
    const o = aircraft.order;
    const paid = o.payments.reduce((s, p) => s + (p.paid ?? 0), 0);
    const next = o.payments.find((p) => p.paid === undefined);
    facts = [
      [t('fleet.ownership'), t('fleet.onOrder', { date: date(o.orderedAt) })],
      [t('fleet.price'), local(o.priceUsd)],
      [t('fleet.paidSoFar'), book(paid)],
      ...(next ? ([[t('fleet.nextPayment'), `${local(next.usd)} · ${date(next.due)}`]] as [string, string][]) : []),
    ];
    actions = ['cancel'];
    if (asking === 'cancel') question = t('fleet.ask.cancel', { lost: book(paid) });
  }

  return (
    <>
      <dl className="facts facts--compact">
        {facts.map(([k, v]) => (
          <Fragment key={k}>
            <dt>{k}</dt>
            <dd className="mono">{v}</dd>
          </Fragment>
        ))}
      </dl>
      {asking ? (
        <div className="confirm">
          {asking === 'extend' && (
            <label className="field">
              <span className="field__label">{t('fleet.extendYears')}</span>
              <select className="input" value={years} onChange={(e) => setYears(Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6].map((y) => (
                  <option key={y} value={y}>
                    {t('fleet.years', { count: y })}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="small">{question}</p>
          {error && <p className="notice notice--error small">{t(`errors.${error}`)}</p>}
          <div className="confirm__actions">
            <button type="button" className="button" onClick={() => (setAsking(null), setError(null))}>
              {t('common.cancel')}
            </button>
            <button type="button" className={`button ${asking === 'extend' ? 'button--primary' : 'button--danger'}`} disabled={busy} onClick={() => void run(asking)}>
              {t(`fleet.action.${asking}`)}
            </button>
          </div>
        </div>
      ) : (
        actions.length > 0 && (
          <div className="button-row">
            {actions.map((a) => (
              <button key={a} type="button" className="button button--small" onClick={() => setAsking(a)}>
                {t(`fleet.action.${a}`)}
              </button>
            ))}
          </div>
        )
      )}
    </>
  );
}

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AIRCRAFT_TYPES, getAircraftType, type AircraftCategory, type AircraftType } from '../../data/aircraft';
import { newPriceUsd, orderBlock, PAYMENT_PLAN } from '../../data/factory';
import { standardCabin, stylesFor, totalSeats, type CabinStyle } from '../../engine/cabins';
import type { CommandError } from '../../engine/commands';
import { deliverySlots } from '../../engine/fleet';
import { convert, money } from '../../engine/money';
import type { Airline, GameState, SaleOffer } from '../../engine/state';
import { MINUTES_PER_DAY, startOfDay, toDate, yearOf } from '../../engine/time';
import { sendCommand } from '../../game/store';
import { formatGameDate, formatMoney, formatNumber } from '../../i18n/format';
import { useSettings } from '../../settings/settings';
import { Segmented } from '../components/Segmented';
import { CabinBar } from './CabinBar';
import { cabinText } from './cabinText';
import { SaleCheckFact } from './Maintenance';

type Filter = 'all' | AircraftCategory;
const FILTERS: Filter[] = ['all', 'turboprop', 'regional', 'narrowbody', 'widebody'];

function CategoryFilter({ value, onChange }: { value: Filter; onChange: (f: Filter) => void }) {
  const { t } = useTranslation();
  return <Segmented label={t('fleet.filter')} value={value} options={FILTERS.map((v) => ({ value: v, label: t(`fleet.category.${v}`) }))} onChange={onChange} />;
}

/** Used aircraft for sale: pay the full price now, the aircraft arrives after inspection and repaint. */
export function BuyUsed({ game, airline, hubRunwayM }: { game: GameState; airline: Airline; hubRunwayM?: number }) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>('all');
  const [asking, setAsking] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const offers = useMemo(
    () => game.market.sales.filter((o) => filter === 'all' || getAircraftType(o.typeId).category === filter).sort((a, b) => a.priceUsd - b.priceUsd),
    [game.market.sales, filter],
  );
  const buy = async (offer: SaleOffer) => {
    const r = await sendCommand({ type: 'BuyAircraft', airlineId: airline.id, payload: { offerId: offer.id } });
    setAsking(null);
    setNotice(r.ok ? { ok: true, text: t('fleet.boughtNotice', { type: getAircraftType(offer.typeId).name }) } : { ok: false, text: t(`errors.${r.error}`) });
  };
  return (
    <>
      <p className="muted">{t('fleet.buyIntro')}</p>
      <CategoryFilter value={filter} onChange={setFilter} />
      {notice && <p className={`notice notice--${notice.ok ? 'ok' : 'error'}`}>{notice.text}</p>}
      <ul className="cards">
        {offers.map((offer) => (
          <SaleCard key={offer.id} offer={offer} game={game} airline={airline} hubRunwayM={hubRunwayM} asking={asking === offer.id} onAsk={() => (setAsking(offer.id), setNotice(null))} onCancel={() => setAsking(null)} onConfirm={() => void buy(offer)} />
        ))}
      </ul>
    </>
  );
}

function SaleCard({
  offer, game, airline, hubRunwayM, asking, onAsk, onCancel, onConfirm,
}: { offer: SaleOffer; game: GameState; airline: Airline; hubRunwayM?: number; asking: boolean; onAsk: () => void; onCancel: () => void; onConfirm: () => void }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const type = getAircraftType(offer.typeId);
  const price = convert(money(offer.priceUsd, 'USD'), airline.currency, game.fx);
  const cannotPay = airline.cash.amount < price.amount;
  const delivery = toDate(startOfDay(game.time) + offer.deliveryDays * MINUTES_PER_DAY);
  return (
    <li className="card">
      <div className="card__head">
        <div className="card__title">
          <span className="card__type">{type.name}</span>
          <span className="muted">
            {type.manufacturer} · <span className="mono">{type.icao}</span> · {t(`fleet.category.${type.category}`)}
          </span>
        </div>
        <span className="card__price mono">
          <span>{formatMoney(language, money(offer.priceUsd, 'USD'))}</span>
          {airline.currency !== 'USD' && <span className="card__local muted small">≈ {formatMoney(language, price)}</span>}
        </span>
      </div>
      <CabinBar type={type} cabin={offer.cabin} compact />
      <dl className="facts facts--compact">
        <dt>{t('fleet.built')}</dt>
        <dd className="mono">
          {offer.builtYear} ({t('fleet.age', { count: yearOf(game.time) - offer.builtYear })})
        </dd>
        <dt>{t('fleet.cabin')}</dt>
        <dd className="mono">{cabinText(offer.cabin)}</dd>
        <dt>{t('fleet.range')}</dt>
        <dd className="mono">{formatNumber(language, type.rangeKm)} km</dd>
        <dt>{t('fleet.takeoff')}</dt>
        <dd className={`mono ${hubRunwayM !== undefined && hubRunwayM < type.takeoffM ? 'text--caution' : ''}`}>{formatNumber(language, type.takeoffM)} m</dd>
        <dt>{t('fleet.delivery')}</dt>
        <dd className="mono">{formatGameDate(language, delivery, false)}</dd>
        <SaleCheckFact game={game} offer={offer} />
        <dt>{t('fleet.seller')}</dt>
        <dd>{offer.seller}</dd>
      </dl>
      {asking ? (
        <div className="confirm">
          <p className="small">{t('fleet.ask.buy', { price: formatMoney(language, price, false), date: formatGameDate(language, delivery, false) })}</p>
          <div className="confirm__actions">
            <button type="button" className="button" onClick={onCancel}>
              {t('common.cancel')}
            </button>
            <button type="button" className="button button--primary" onClick={onConfirm}>
              {t('fleet.action.buy')}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="button" disabled={cannotPay} onClick={onAsk}>
          {cannotPay ? t('errors.insufficientCash') : t('fleet.action.buy')}
        </button>
      )}
    </li>
  );
}

/** New aircraft from the manufacturers: delivery slots years ahead, a deposit now, payments before delivery. */
export function OrderNew({ game, airline }: { game: GameState; airline: Airline }) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>('all');
  const year = yearOf(game.time);
  const types = AIRCRAFT_TYPES.filter((type) => filter === 'all' || type.category === filter);
  const orderable = types.filter((type) => !orderBlock(type, year)).sort((a, b) => a.manufacturer.localeCompare(b.manufacturer) || a.listPriceUsdM - b.listPriceUsdM);
  const blocked = types.filter((type) => {
    const b = orderBlock(type, year);
    return b === 'sanctions' || b === 'chinaOnly';
  });
  return (
    <>
      <p className="muted">{t('fleet.orderIntro')}</p>
      <CategoryFilter value={filter} onChange={setFilter} />
      <ul className="cards">
        {orderable.map((type) => (
          <OrderCard key={type.id} type={type} game={game} airline={airline} />
        ))}
      </ul>
      {blocked.length > 0 && (
        <p className="muted small">
          {t('fleet.notOrderable')}{' '}
          {blocked.map((type) => `${type.name} (${t(`fleet.block.${orderBlock(type, year)}`)})`).join(' · ')}
        </p>
      )}
      <p className="muted small">{t('fleet.orderNote')}</p>
    </>
  );
}

function OrderCard({ type, game, airline }: { type: AircraftType; game: GameState; airline: Airline }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const [count, setCount] = useState(1);
  const styles = stylesFor(type);
  // Typical new-aircraft layouts: wide-bodies with three classes, narrow-bodies with European business, small types all economy.
  const preferred: CabinStyle = type.category === 'widebody' ? 'threeLong' : type.category === 'narrowbody' ? 'twoShort' : 'single';
  const [style, setStyle] = useState<CabinStyle>(styles.includes(preferred) ? preferred : 'single');
  const [asking, setAsking] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const price = newPriceUsd(type, count);
  const slots = deliverySlots(game, airline.id, type.id, count);
  const local = (usd: number) => formatMoney(language, convert(money(usd, 'USD'), airline.currency, game.fx), false);
  const date = (time: number) => formatGameDate(language, toDate(time), false);
  const deposit = PAYMENT_PLAN.find((p) => p.monthsBefore === 'signing')!.share;
  const atDelivery = PAYMENT_PLAN.find((p) => p.monthsBefore === 'delivery')!.share;
  const cabin = standardCabin(type, style);
  const dueNow = convert(money(price * deposit * count, 'USD'), airline.currency, game.fx).amount;

  const order = async () => {
    const r = await sendCommand({ type: 'OrderAircraft', airlineId: airline.id, payload: { typeId: type.id, count, cabin: style } });
    setAsking(false);
    setResult(r.ok ? { ok: true, text: t('fleet.orderedNotice', { count, type: type.name }) } : { ok: false, text: t(`errors.${r.error as CommandError}`) });
  };

  return (
    <li className="card">
      <div className="card__head">
        <div className="card__title">
          <span className="card__type">{type.name}</span>
          <span className="muted">
            {type.manufacturer} · <span className="mono">{type.icao}</span> · {t(`fleet.category.${type.category}`)}
          </span>
        </div>
        <span className="card__price mono">
          <span>{formatMoney(language, money(price, 'USD'))}</span>
          <span className="card__local muted small">{t('fleet.perAircraft')}</span>
        </span>
      </div>
      <CabinBar type={type} cabin={cabin} compact />
      <dl className="facts facts--compact">
        <dt>{t('fleet.firstDelivery')}</dt>
        <dd className="mono">
          {date(slots[0]!)}
          {count > 1 && ` – ${date(slots.at(-1)!)}`}
        </dd>
        <dt>{t('fleet.range')}</dt>
        <dd className="mono">{formatNumber(language, type.rangeKm)} km</dd>
        <dt>{t('fleet.listPrice')}</dt>
        <dd className="mono">{formatMoney(language, money(type.listPriceUsdM * 1e6, 'USD'))}</dd>
      </dl>
      <div className="field-row">
        <div className="field">
          <span className="field__label">{t('fleet.count')}</span>
          <div className="stepper">
            <button type="button" className="button" aria-label="−" onClick={() => setCount((c) => Math.max(1, c - 1))}>
              −
            </button>
            <span className="stepper__value mono">{count}</span>
            <button type="button" className="button" aria-label="+" onClick={() => setCount((c) => Math.min(20, c + 1))}>
              +
            </button>
          </div>
        </div>
        <label className="field">
          <span className="field__label">{t('fleet.orderCabin', { seats: totalSeats(cabin) })}</span>
          <select className="input" value={style} onChange={(e) => setStyle(e.target.value as CabinStyle)}>
            {styles.map((s) => (
              <option key={s} value={s}>
                {t(`cabin.style.${s}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted small">
        {t('fleet.paymentPlan', {
          now: local(price * deposit * count),
          before: local(price * (1 - deposit - atDelivery) * count),
          delivery: local(price * atDelivery * count),
        })}
      </p>
      {result && <p className={`notice notice--${result.ok ? 'ok' : 'error'} small`}>{result.text}</p>}
      {asking ? (
        <div className="confirm">
          <p className="small">{t('fleet.ask.order', { count, type: type.name, total: local(price * count), now: local(price * deposit * count), first: date(slots[0]!) })}</p>
          <div className="confirm__actions">
            <button type="button" className="button" onClick={() => setAsking(false)}>
              {t('common.cancel')}
            </button>
            <button type="button" className="button button--primary" onClick={() => void order()}>
              {t('fleet.action.order')}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="button" disabled={airline.cash.amount < dueNow} onClick={() => (setAsking(true), setResult(null))}>
          {airline.cash.amount < dueNow ? t('errors.insufficientCash') : t('fleet.action.order')}
        </button>
      )}
    </li>
  );
}

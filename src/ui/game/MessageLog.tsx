import { useTranslation } from 'react-i18next';
import type { GameMessage } from '../../engine/state';
import { toDate } from '../../engine/time';
import type { World } from '../../data/world';
import { countryName, formatGameDate, formatMoney, formatNumber, formatZulu } from '../../i18n/format';
import { airlineName } from './airlineName';
import { useSettings } from '../../settings/settings';

/** The ops message log (like ACARS messages in a cockpit), newest first. */
export function MessageLog({ messages, world, limit = 30 }: { messages: GameMessage[]; world: World | null; limit?: number }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const shown = messages.slice(-limit).reverse();
  if (!shown.length) return <p className="muted">{t('ops.noMessages')}</p>;

  const money = (p: GameMessage['params']) => formatMoney(language, { amount: Number(p.amount), currency: String(p.currency) });
  const date = (v: string | number | undefined) => formatGameDate(language, toDate(Number(v)), false);
  // Where a world event happens: airports by code, countries and continents by name.
  const placeNames = (area: string, where: string) =>
    area === 'world'
      ? t('world.worldwide')
      : where
          .split(',')
          .map((x) => (area === 'continents' ? t(`world.continent.${x}`) : area === 'countries' ? countryName(language, x, world?.countries[x]?.name ?? x) : x))
          .join(', ');
  const text = (m: GameMessage) => {
    // Modelled carriers of historical games are named in the player's language.
    const p = typeof m.params.airline === 'string' ? { ...m.params, airline: airlineName(t, language, m.params.airline) } : m.params;
    switch (m.kind) {
      case 'founded':
        return t('msg.founded', { name: p.name, hub: p.hub, capital: formatMoney(language, { amount: Number(p.capital), currency: String(p.currency) }) });
      case 'takenOver':
        return t('msg.takenOver', p);
      case 'takeoverRoutes':
        return t('msg.takeoverRoutes', p);
      case 'leaseSigned':
        return t('msg.leaseSigned', { ...p, date: formatGameDate(language, toDate(Number(p.deliveryAt)), false) });
      case 'delivered': {
        const airport = world?.airportById.get(String(p.airport));
        return t('msg.delivered', { ...p, airport: airport?.iata ?? p.airport });
      }
      case 'rentPaid':
        return t('msg.rentPaid', { amount: formatMoney(language, { amount: Number(p.amount), currency: String(p.currency) }) });
      case 'cashNegative':
        return t('msg.cashNegative');
      case 'routeOpened':
        return t('msg.routeOpened', p);
      case 'routeClosed':
        return t('msg.routeClosed', p);
      case 'weekReport': {
        const currency = String(p.currency);
        return t(Number(p.profit) >= 0 ? 'msg.weekProfit' : 'msg.weekLoss', {
          revenue: formatMoney(language, { amount: Number(p.revenue), currency }),
          profit: formatMoney(language, { amount: Math.abs(Number(p.profit)), currency }),
        });
      }
      // AI airlines (2.1b)
      case 'aiFare':
        return t('msg.aiFare', { ...p, value: Math.abs(Number(p.value)) });
      case 'aiFrequency':
        return t('msg.aiFrequency', { ...p, count: Number(p.value) });
      case 'aiEnter':
        return t('msg.aiEnter', { ...p, count: Number(p.value) });
      case 'aiExit':
        return Number(p.value) === 0 ? t('msg.aiExitClosed', p) : t('msg.aiExitReduced', { ...p, count: Number(p.value) });
      case 'aiNewRoute':
        return t('msg.aiNewRoute', { ...p, count: Number(p.value) });
      case 'aiBankrupt':
        return t('msg.aiBankrupt', { ...p, count: Number(p.routes) });
      case 'currencyChanged':
        return t('msg.currencyChanged', { ...p, rate: formatNumber(language, Number(p.rate), 6) });
      case 'airportMoved':
        return t('msg.airportMoved', p);
      case 'cabinChanged':
        return t('msg.cabinChanged', p);
      case 'refitStarted':
        return t('msg.refitStarted', {
          ...p,
          count: Number(p.days),
          amount: formatMoney(language, { amount: Number(p.amount), currency: String(p.currency) }),
          date: formatGameDate(language, toDate(Number(p.until)), false),
        });
      case 'refitDone':
        return t('msg.refitDone', p);
      case 'ordered':
        return t('msg.ordered', { ...p, count: Number(p.count), amount: money(p), first: date(p.first), last: date(p.last) });
      case 'orderPayment':
        return t('msg.orderPayment', { amount: money(p) });
      case 'orderCancelled':
        return t('msg.orderCancelled', { ...p, amount: money(p) });
      case 'bought':
        return t('msg.bought', { ...p, amount: money(p), date: date(p.deliveryAt) });
      case 'sold':
      case 'scrapped':
        return t(`msg.${m.kind}`, { ...p, amount: money(p) });
      case 'leaseEnding':
        return t('msg.leaseEnding', { ...p, date: date(p.endAt) });
      case 'leaseEnded':
        return t('msg.leaseEnded', { ...p, count: Number(p.routes) });
      case 'leaseReturned':
        return t('msg.leaseReturned', { ...p, count: Number(p.routes), amount: money(p) });
      case 'leaseExtended':
        return t('msg.leaseExtended', { ...p, amount: money(p), date: date(p.endAt) });
      // Maintenance (Phase 4.2)
      case 'checkPlanned':
        return t('msg.checkPlanned', { ...p, check: t(`maint.check.${p.check}`), date: date(p.start), due: date(p.due) });
      case 'checkMoved':
        return t('msg.checkMoved', { ...p, check: t(`maint.check.${p.check}`), date: date(p.start) });
      case 'checkStarted':
        return t(Number(p.reserves) > 0 ? 'msg.checkStartedReserves' : 'msg.checkStarted', {
          ...p,
          check: t(`maint.check.${p.check}`),
          where: t(`maint.where.${p.where}`),
          date: date(p.until),
          amount: money(p),
          reserves: formatMoney(language, { amount: Number(p.reserves), currency: String(p.currency) }),
        });
      case 'checkDone':
        return t('msg.checkDone', { ...p, check: t(`maint.check.${p.check}`) });
      case 'aCheckGrounded':
        return t('msg.aCheckGrounded', p);
      case 'failure':
        return t('msg.failure', { ...p, count: Number(p.flights), date: `${date(p.until)} ${formatZulu(toDate(Number(p.until)))}`, amount: money(p) });
      case 'hangarOrdered': {
        const airport = world?.airportById.get(String(p.airport));
        return t('msg.hangarOrdered', { ...p, size: t(`maint.size.${p.size}`), airport: airport?.iata ?? p.airport, date: date(p.readyAt), amount: money(p) });
      }
      // Liveries (Phase 4.3)
      case 'liveryChanged':
        return t('msg.liveryChanged', { count: Number(p.count) });
      case 'repaintStarted':
        return t('msg.repaintStarted', { ...p, date: date(p.until), amount: money(p) });
      case 'repaintDone':
        return t('msg.repaintDone', p);
      // World events (Phase 5.1)
      case 'worldEvent':
      case 'eventAffects':
        return t(m.kind === 'worldEvent' ? 'msg.worldEvent' : 'msg.eventAffects', {
          what: p.historic ? t(`hist.${p.historic}.name`) : t(`world.kind.${p.event}`, { label: p.label }),
          where: placeNames(String(p.area), String(p.where)),
          date: Number(p.open) ? t('world.openEnd') : date(p.until),
          depth: p.depth,
        });
      case 'eventCancellations':
        return t('msg.eventCancellations', {
          count: Number(p.flights),
          pax: p.pax,
          amount: money(p),
          why: String(p.events).split(',').map((k) => t(`world.kind.${k}`, { label: '' })).join(', '),
        });
      case 'hangarReady': {
        const airport = world?.airportById.get(String(p.airport));
        return t('msg.hangarReady', { size: t(`maint.size.${p.size}`), airport: airport?.iata ?? p.airport });
      }
    }
  };

  return (
    <ol className="msglog">
      {shown.map((m) => {
        const date = toDate(m.at);
        return (
          <li key={m.id} className={`msglog__item msglog__item--${m.level}`}>
            <span className="msglog__time mono">
              {formatGameDate(language, date, false)} {formatZulu(date)}
            </span>
            <span className="msglog__text">{text(m)}</span>
          </li>
        );
      })}
    </ol>
  );
}

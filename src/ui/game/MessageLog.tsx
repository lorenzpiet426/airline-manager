import { useTranslation } from 'react-i18next';
import type { GameMessage } from '../../engine/state';
import { toDate } from '../../engine/time';
import type { World } from '../../data/world';
import { formatGameDate, formatMoney, formatZulu } from '../../i18n/format';
import { useSettings } from '../../settings/settings';

/** The ops message log (like ACARS messages in a cockpit), newest first. */
export function MessageLog({ messages, world, limit = 30 }: { messages: GameMessage[]; world: World | null; limit?: number }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const shown = messages.slice(-limit).reverse();
  if (!shown.length) return <p className="muted">{t('ops.noMessages')}</p>;

  const text = (m: GameMessage) => {
    const p = m.params;
    switch (m.kind) {
      case 'founded':
        return t('msg.founded', { name: p.name, hub: p.hub, capital: formatMoney(language, { amount: Number(p.capital), currency: String(p.currency) }) });
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

import { useTranslation } from 'react-i18next';
import { aircraftMarketValueUsd } from '../../engine/fleet';
import { convert, money } from '../../engine/money';
import type { Airline, GameState } from '../../engine/state';
import { formatMoney } from '../../i18n/format';
import { useSettings } from '../../settings/settings';

/** One line above the fleet: leased / owned / on order, what the owned aircraft are worth, what is still owed on orders. */
export function FleetSummary({ game, airline }: { game: GameState; airline: Airline }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const fleet = Object.values(game.aircraft).filter((a) => a.airlineId === airline.id);
  const owned = fleet.filter((a) => a.owned);
  const ordered = fleet.filter((a) => a.order);
  const value = owned.reduce((s, a) => s + aircraftMarketValueUsd(a, game.time), 0);
  const owed = ordered.reduce((s, a) => s + a.order!.payments.filter((p) => p.paid === undefined).reduce((x, p) => x + p.usd, 0), 0);
  const local = (usd: number) => formatMoney(language, convert(money(usd, 'USD'), airline.currency, game.fx));
  return (
    <p className="muted small mono">
      {t('fleet.summary', { leased: fleet.filter((a) => a.lease).length, owned: owned.length, ordered: ordered.length })}
      {owned.length > 0 && ` · ${t('fleet.summaryValue', { value: local(value) })}`}
      {ordered.length > 0 && ` · ${t('fleet.summaryOwed', { owed: local(owed) })}`}
    </p>
  );
}

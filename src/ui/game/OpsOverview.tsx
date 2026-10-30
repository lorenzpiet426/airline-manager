import { useTranslation } from 'react-i18next';
import type { Airline, GameState } from '../../engine/state';
import type { EngineWorld } from '../../engine/world';
import { formatMoney, formatNumber } from '../../i18n/format';
import { useSettings } from '../../settings/settings';
import { Panel } from '../components/Panel';
import { hrefFor } from '../navigation';
import { actionItems, fleetSummary, moneySummary, networkSummary, operationSummary } from './opsSummary';

const pct = (language: string, v: number | null) => (v === null ? '—' : `${formatNumber(language as never, v * 100, 0)} %`);

/** Everything that waits for the player, with a button to the screen where it's done. */
export function ActionPanel({ game, world, airline }: { game: GameState; world: EngineWorld | null; airline: Airline }) {
  const { t } = useTranslation();
  const items = actionItems(game, world, airline);
  return (
    <Panel title={t('overview.actionsTitle', { count: items.length })} code="TODO" className="panel--wide">
      {items.length === 0 ? (
        <p className="text--normal">{t('overview.allClear')}</p>
      ) : (
        <ul className="action-list">
          {items.map((it, i) => (
            <li key={`${it.key}${i}`} className={`action-list__item action-list__item--${it.level}`}>
              <span className={`dot dot--${it.level === 'warning' ? 'warning' : it.level === 'caution' ? 'caution' : 'info'}`} aria-hidden="true" />
              <span className="action-list__text">{t(`overview.action.${it.key}`, { ...it.params, ...(it.params.group ? { group: t(`overview.group.${it.params.group}`) } : {}) })}</span>
              <a className="button button--small" href={hrefFor(it.route, it.query)}>
                {t('overview.open')}
              </a>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** Phone: the four numbers that matter most, under the action list. */
export function KeyNumbers({ game, airline }: { game: GameState; airline: Airline }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const m = moneySummary(game, airline);
  const o = operationSummary(game, airline);
  const money = (v: number | null) => (v === null ? '—' : formatMoney(language, { amount: Math.round(v), currency: airline.currency }, false));
  const cells: [string, string, string][] = [
    [t('overview.cash'), money(m.cash.amount), m.cash.amount < 0 ? 'text--warning' : ''],
    [t('overview.weekResult'), money(m.result), m.result === null ? '' : m.result >= 0 ? 'text--normal' : 'text--warning'],
    [t('overview.onTime'), pct(language, o.onTime), ''],
    [t('overview.load'), pct(language, m.load), ''],
  ];
  return (
    <div className="key-numbers panel--wide">
      {cells.map(([label, value, cls]) => (
        <div key={label} className="key-numbers__cell">
          <span className="key-numbers__label">{label}</span>
          <span className={`key-numbers__value mono ${cls}`}>{value}</span>
        </div>
      ))}
    </div>
  );
}

/** The four tiles: money, today's operation, network, fleet and people. */
export function OverviewTiles({ game, world, airline }: { game: GameState; world: EngineWorld | null; airline: Airline }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const m = moneySummary(game, airline);
  const o = operationSummary(game, airline);
  const n = networkSummary(game, world, airline);
  const f = fleetSummary(game, airline);
  const money = (v: number | null, signed = false) =>
    v === null ? '—' : `${signed && v > 0 ? '+' : ''}${formatMoney(language, { amount: Math.round(v), currency: airline.currency }, false)}`;
  const num = (v: number) => formatNumber(language, v);
  const tone = (v: number | null) => (v === null ? '' : v >= 0 ? 'text--normal' : 'text--warning');
  return (
    <>
      <Panel title={t('overview.moneyTitle')} code="$">
        <dl className="facts facts--compact">
          <dt>{t('overview.cash')}</dt>
          <dd className={`mono ${m.cash.amount < 0 ? 'text--warning' : ''}`}>{money(m.cash.amount)}</dd>
          <dt>{t('overview.weekResult')}</dt>
          <dd className={`mono ${tone(m.result)}`}>
            {money(m.result, true)}
            {m.margin !== null && <span className="muted small"> · {pct(language, m.margin)}</span>}
          </dd>
          <dt>{t('overview.weekBefore')}</dt>
          <dd className={`mono ${tone(m.previous)}`}>{money(m.previous, true)}</dd>
          {airline.equity && (
            <>
              <dt>{t('overview.sharePrice')}</dt>
              <dd className="mono">{formatNumber(language, airline.equity.price, 2)} {airline.currency}</dd>
            </>
          )}
          {airline.board && (
            <>
              <dt>{t('overview.board')}</dt>
              <dd className={`mono ${airline.board.confidence < 40 ? 'text--warning' : airline.board.confidence < 50 ? 'text--caution' : ''}`}>{Math.round(airline.board.confidence)} / 100</dd>
            </>
          )}
        </dl>
        <a className="button button--small" href={hrefFor('finance')}>
          {t('overview.toFinance')}
        </a>
      </Panel>

      <Panel title={t('overview.opsTitle')} code="OPS">
        <dl className="facts facts--compact">
          <dt>{t('overview.flightsToday')}</dt>
          <dd className="mono">{num(o.flights)}</dd>
          <dt>{t('overview.delayed')}</dt>
          <dd className={`mono ${o.delayed ? 'text--caution' : ''}`}>{num(o.delayed)}</dd>
          <dt>{t('overview.cancelled')}</dt>
          <dd className={`mono ${o.cancelled ? 'text--warning' : ''}`}>{num(o.cancelled)}</dd>
          <dt>{t('overview.onTimeYesterday')}</dt>
          <dd className="mono">{pct(language, o.onTime)}</dd>
          <dt>{t('overview.grounded')}</dt>
          <dd className={`mono ${o.grounded ? 'text--caution' : ''}`}>{num(o.grounded)}</dd>
        </dl>
        <p className="small muted">{t('overview.opsNote')}</p>
      </Panel>

      <Panel title={t('overview.networkTitle')} code="NET">
        <dl className="facts facts--compact">
          <dt>{t('overview.routes')}</dt>
          <dd className="mono">{num(n.routes)}</dd>
          {n.best && (
            <>
              <dt>{t('overview.best')}</dt>
              <dd className="mono">
                {n.best.name} <span className={tone(n.best.value)}>{money(n.best.value, true)}</span>
              </dd>
              <dt>{t('overview.worst')}</dt>
              <dd className="mono">
                {n.worst!.name} <span className={tone(n.worst!.value)}>{money(n.worst!.value, true)}</span>
              </dd>
              <dt>{t('overview.fullest')}</dt>
              <dd className="mono">
                {n.fullest!.name} {pct(language, n.fullest!.value)}
              </dd>
              <dt>{t('overview.emptiest')}</dt>
              <dd className="mono">
                {n.emptiest!.name} {pct(language, n.emptiest!.value)}
              </dd>
            </>
          )}
        </dl>
        <p className="small muted">{t('overview.networkNote')}</p>
        <a className="button button--small" href={hrefFor('network')}>
          {t('overview.toNetwork')}
        </a>
      </Panel>

      <Panel title={t('overview.fleetTitle')} code="FLT">
        <dl className="facts facts--compact">
          <dt>{t('overview.aircraft')}</dt>
          <dd className="mono">
            {num(f.active)}
            {f.idle > 0 && <span className="text--caution small"> · {t('overview.idleCount', { count: f.idle })}</span>}
          </dd>
          <dt>{t('overview.arriving')}</dt>
          <dd className="mono">
            {num(f.arriving)}
            {f.ordered > 0 && <span className="muted small"> · {t('overview.laterCount', { count: f.ordered })}</span>}
          </dd>
          <dt>{t('overview.crews')}</dt>
          <dd className="mono">
            {t('overview.crewCount', { pilots: num(f.pilots), cabin: num(f.cabin) })}
          </dd>
          <dt>{t('overview.training')}</dt>
          <dd className="mono">{num(f.training)}</dd>
        </dl>
        <div className="toolbar-row">
          <a className="button button--small" href={hrefFor('fleet')}>
            {t('overview.toFleet')}
          </a>
          <a className="button button--small" href={hrefFor('fleet', { tab: 'crew' })}>
            {t('overview.toCrews')}
          </a>
        </div>
      </Panel>
    </>
  );
}

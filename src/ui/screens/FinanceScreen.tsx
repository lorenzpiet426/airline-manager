import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel } from '../components/Panel';
import { Segmented } from '../components/Segmented';
import { usePlayer } from '../game/usePlayer';
import { lfClass } from './NetworkScreen';
import { useWorld } from '../../data/world';
import { pnlCosts, type PnlLines, type PnlWeek } from '../../engine/state';
import { MINUTES_PER_DAY, toDate } from '../../engine/time';
import { formatGameDate, formatMoney, formatNumber } from '../../i18n/format';
import { useSettings } from '../../settings/settings';
import { hrefFor } from '../navigation';

const COST_LINES: (keyof PnlLines)[] = ['fuel', 'crew', 'maintenance', 'airport', 'handling', 'navigation', 'distribution', 'lease'];

export function FinanceScreen() {
  const { t } = useTranslation();
  const { language } = useSettings();
  const { game, airline } = usePlayer();
  const world = useWorld();
  const [period, setPeriod] = useState<'last' | 'current'>('last');

  if (!game || !airline) {
    return (
      <div className="screen">
        <h1 className="screen__title">{t('finance.title')}</h1>
        <Panel title={t('finance.title')}>
          <p className="muted">{t('fleet.noGame')}</p>
          <a href={hrefFor('new')} className="button button--primary">
            {t('ops.newGame')}
          </a>
        </Panel>
      </div>
    );
  }

  const fin = game.finance[airline.id];
  const history = fin?.history ?? [];
  const last = history[history.length - 1];
  const week: PnlWeek | undefined = period === 'last' ? last : fin?.week;
  const m = (amount: number) => formatMoney(language, { amount, currency: airline.currency }, false);
  const profit = week ? week.lines.revenue - pnlCosts(week.lines) : 0;
  const recent = history.slice(-12);
  const maxAbs = Math.max(1, ...recent.map((w) => Math.abs(w.lines.revenue - pnlCosts(w.lines))));
  const weekLabel = (w: PnlWeek) =>
    `${formatGameDate(language, toDate(w.start), false)} – ${formatGameDate(language, toDate(w.start + 6 * MINUTES_PER_DAY), false)}`;

  return (
    <div className="screen">
      <h1 className="screen__title">{t('finance.title')}</h1>
      <div className="grid">
        <Panel title={t('finance.cash')} code={airline.currency}>
          <span className={`bignum mono ${airline.cash.amount < 0 ? 'text--warning' : 'text--normal'}`}>
            {formatMoney(language, airline.cash, false)}
          </span>
          <p className="muted small">{t('finance.cashNote')}</p>
        </Panel>

        <Panel title={t('finance.history')} code={t('finance.weeks', { count: recent.length })}>
          {recent.length === 0 ? (
            <p className="muted">{t('finance.noWeeks')}</p>
          ) : (
            <div className="bars" role="img" aria-label={t('finance.history')}>
              {recent.map((w) => {
                const p = w.lines.revenue - pnlCosts(w.lines);
                return (
                  <div key={w.start} className="bars__col" title={`${weekLabel(w)}: ${m(p)}`}>
                    <div className="bars__half bars__half--up">
                      {p > 0 && <span className="bars__bar bars__bar--profit" style={{ height: `${(p / maxAbs) * 100}%` }} />}
                    </div>
                    <div className="bars__half">
                      {p < 0 && <span className="bars__bar bars__bar--loss" style={{ height: `${(-p / maxAbs) * 100}%` }} />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      <Segmented
        label={t('finance.period')}
        value={period}
        options={[
          { value: 'last', label: t('finance.lastWeek') },
          { value: 'current', label: t('finance.thisWeek') },
        ]}
        onChange={setPeriod}
      />

      {!week ? (
        <Panel title={t('finance.pnl')}>
          <p className="muted">{t('finance.noWeeks')}</p>
        </Panel>
      ) : (
        <div className="grid">
          <Panel title={t('finance.pnl')} code={weekLabel(week)}>
            <dl className="facts pnl">
              <dt>{t('finance.line.revenue')}</dt>
              <dd className="mono">{m(week.lines.revenue)}</dd>
              {COST_LINES.map((k) => (
                <FactLine key={k} label={t(`finance.line.${k}`)} value={`− ${m(week.lines[k])}`} />
              ))}
              <dt className="pnl__total">{t('finance.result')}</dt>
              <dd className={`mono pnl__total ${profit >= 0 ? 'text--normal' : 'text--warning'}`}>{m(profit)}</dd>
              {week.lines.revenue > 0 && (
                <>
                  <dt>{t('finance.margin')}</dt>
                  <dd className="mono">{formatNumber(language, (profit / week.lines.revenue) * 100, 1)} %</dd>
                </>
              )}
            </dl>
            <p className="muted small">{t('finance.pnlNote')}</p>
          </Panel>

          <Panel title={t('finance.routes')} code={t('finance.direct')}>
            {Object.keys(week.routes).length === 0 ? (
              <p className="muted">{t('finance.noRoutes')}</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('finance.route')}</th>
                    <th className="num">{t('network.passengers')}</th>
                    <th className="num">{t('network.lfShort')}</th>
                    <th className="num">{t('finance.result')}</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(week.routes).map(([id, s]) => {
                    const route = game.routes[id];
                    const dest = route && world?.airportById.get(route.destinationId);
                    const lf = s.pax / Math.max(1, s.seats);
                    const result = s.revenue - s.directCosts;
                    return (
                      <tr key={id}>
                        <td className="mono">
                          {route ? `${airline.iata} ${route.flightNumber}` : '—'} {dest?.iata ?? ''}
                        </td>
                        <td className="num mono">{formatNumber(language, Math.round(s.pax))}</td>
                        <td className={`num mono ${lfClass(lf)}`}>{formatNumber(language, lf * 100)} %</td>
                        <td className={`num mono ${result >= 0 ? 'text--normal' : 'text--warning'}`}>{m(result)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <p className="muted small">{t('finance.directNote')}</p>
          </Panel>
        </div>
      )}
    </div>
  );
}

function FactLine({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className="mono muted">{value}</dd>
    </>
  );
}

import { useTranslation } from 'react-i18next';
import { useGameWorld } from './useEngineWorld';
import { toDate } from '../../engine/time';
import { dismissAwayReport, useAwayReport, useCatchingUp } from '../../game/store';
import { formatGameDate, formatMoney, formatNumber } from '../../i18n/format';
import { useSettings } from '../../settings/settings';
import { Panel } from '../components/Panel';
import { MessageLog } from './MessageLog';

/** Real clock: shown on every screen while the game simulates the time the app was closed. */
export function CatchUpBanner() {
  const { t } = useTranslation();
  const { language } = useSettings();
  const catchingUp = useCatchingUp();
  if (!catchingUp) return null;
  return (
    <p className="notice notice--planned catchup" role="status">
      {t('away.catchingUp', {
        from: formatGameDate(language, toDate(catchingUp.from), false),
        to: formatGameDate(language, toDate(catchingUp.to), false),
      })}
    </p>
  );
}

/** Real clock: "While you were away": time missed, cash change, results and the messages of that time. */
export function AwayReportPanel() {
  const { t } = useTranslation();
  const { language } = useSettings();
  const world = useGameWorld();
  const report = useAwayReport();
  if (!report) return null;
  const hours = (report.to - report.from) / 60;
  const cashChange = report.cashAfter.amount - report.cashBefore.amount;
  const money = (amount: number) => formatMoney(language, { amount, currency: report.cashAfter.currency });
  return (
    <Panel title={t('away.title')} code="AWAY" className="panel--wide">
      <p className="lead">
        {hours < 48 ? t('away.hours', { count: Math.round(hours) }) : t('away.days', { count: Math.round(hours / 24) })}{' '}
        <span className="muted mono small">
          {formatGameDate(language, toDate(report.from), true)} → {formatGameDate(language, toDate(report.to), true)}
        </span>
      </p>
      <dl className="facts">
        <dt>{t('away.flights')}</dt>
        <dd className="mono">{formatNumber(language, report.flights)}</dd>
        <dt>{t('away.pax')}</dt>
        <dd className="mono">{formatNumber(language, Math.round(report.pax))}</dd>
        <dt>{t('away.revenue')}</dt>
        <dd className="mono">{money(report.revenue)}</dd>
        <dt>{t('away.result')}</dt>
        <dd className={`mono ${report.result >= 0 ? 'text--normal' : 'text--warning'}`}>{money(report.result)}</dd>
        <dt>{t('away.cash')}</dt>
        <dd className={`mono ${cashChange >= 0 ? 'text--normal' : 'text--warning'}`}>
          {money(report.cashBefore.amount)} → {money(report.cashAfter.amount)}
        </dd>
      </dl>
      {report.messages.length > 0 && <MessageLog messages={[...report.messages].reverse()} world={world} limit={40} />}
      <p className="muted small">{t('away.note')}</p>
      <button type="button" className="button button--primary" onClick={dismissAwayReport}>
        {t('away.close')}
      </button>
    </Panel>
  );
}

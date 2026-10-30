import { BalanceAndLoans } from '../finance/BalanceAndLoans';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel } from '../components/Panel';
import { Segmented } from '../components/Segmented';
import { usePlayer } from '../game/usePlayer';
import { ResultChart, type ChartPeriod } from '../components/ResultChart';
import { lfClass } from './NetworkScreen';
import { useGameWorld } from '../game/useEngineWorld';
import { sumPeriods, type PnlPeriod } from '../../engine/finance';
import { pnlCosts, type AirlineFinance, type PnlLines } from '../../engine/state';
import { MINUTES_PER_DAY, simTime, toDate } from '../../engine/time';
import { formatGameDate, formatMoney, formatNumber, localeFor } from '../../i18n/format';
import { useSettings, type Language } from '../../settings/settings';
import { hrefFor } from '../navigation';

const COST_LINES: (keyof PnlLines)[] = ['fuel', 'crew', 'maintenance', 'airport', 'handling', 'service', 'navigation', 'distribution', 'lease', 'depreciation', 'disposals', 'disruption', 'loyalty', 'overhead', 'interest'];

type Granularity = 'week' | 'month' | 'quarter' | 'year';

interface Period extends ChartPeriod {
  data: PnlPeriod;
}

/** All periods of the chosen length, oldest first; the running one is marked as partial. */
function buildPeriods(fin: AirlineFinance, granularity: Granularity, language: Language, soFar: string): Period[] {
  const locale = localeFor(language);
  const monthName = (start: number, style: 'short' | 'long') =>
    new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: style, ...(style === 'long' ? { year: 'numeric' } : {}) }).format(toDate(start));
  const mark = (label: string, partial: boolean) => (partial ? `${label} (${soFar})` : label);

  if (granularity === 'week') {
    return [...fin.history, fin.week].map((w, i, all) => {
      const partial = i === all.length - 1;
      const from = formatGameDate(language, toDate(w.start), false);
      const to = formatGameDate(language, toDate(w.start + 6 * MINUTES_PER_DAY), false);
      return { key: String(w.start), label: mark(`${from} – ${to}`, partial), short: from.replace(/\s\d{4}$/, ''), partial, data: w };
    });
  }
  const months = [...fin.months, fin.month];
  if (granularity === 'month') {
    return months.map((m, i) => {
      const partial = i === months.length - 1;
      return { key: String(m.start), label: mark(monthName(m.start, 'long'), partial), short: monthName(m.start, 'short'), partial, data: m };
    });
  }
  // Quarters and years are added up from months.
  const groups = new Map<string, { start: number; label: string; short: string; items: PnlPeriod[]; partial: boolean }>();
  months.forEach((m, i) => {
    const d = toDate(m.start);
    const year = d.getUTCFullYear();
    const q = Math.floor(d.getUTCMonth() / 3);
    const key = granularity === 'quarter' ? `${year}-Q${q + 1}` : String(year);
    const start = granularity === 'quarter' ? simTime(year, q * 3 + 1, 1) : simTime(year, 1, 1);
    const label = granularity === 'quarter' ? `Q${q + 1} ${year}` : String(year);
    const short = granularity === 'quarter' ? `Q${q + 1}` : String(year);
    const group = groups.get(key) ?? { start, label, short, items: [], partial: false };
    group.items.push(m);
    group.partial ||= i === months.length - 1;
    groups.set(key, group);
  });
  return [...groups.entries()].map(([key, g]) => ({
    key,
    label: mark(g.label, g.partial),
    short: g.short,
    partial: g.partial,
    data: sumPeriods(g.start, g.items),
  }));
}

const resultOf = (p: PnlPeriod) => p.lines.revenue - pnlCosts(p.lines);

export function FinanceScreen() {
  const { t } = useTranslation();
  const { language } = useSettings();
  const { game, airline } = usePlayer();
  const world = useGameWorld();
  const [granularity, setGranularity] = useState<Granularity>('month');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const fin = game && airline ? game.finance[airline.id] : undefined;
  const periods = useMemo(
    () => (fin ? buildPeriods(fin, granularity, language, t('finance.soFar')) : []),
    [fin, granularity, language, t],
  );

  if (!game || !airline || !fin) {
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

  // Default: the last completed period (or the running one if none is complete yet).
  const selectedIndex = Math.max(
    0,
    selectedKey !== null && periods.some((p) => p.key === selectedKey)
      ? periods.findIndex((p) => p.key === selectedKey)
      : periods.length - (periods.length > 1 ? 2 : 1),
  );
  const selected = periods[selectedIndex];
  const previous = periods[selectedIndex - 1];
  const m = (amount: number) => formatMoney(language, { amount, currency: airline.currency }, false);
  const mShort = (amount: number) => formatMoney(language, { amount, currency: airline.currency });

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
      </div>

      <Segmented
        label={t('finance.period')}
        value={granularity}
        options={(['week', 'month', 'quarter', 'year'] as const).map((value) => ({ value, label: t(`finance.granularity.${value}`) }))}
        onChange={(g) => {
          setGranularity(g);
          setSelectedKey(null);
        }}
      />

      <Panel title={t('finance.history')} code={t(`finance.granularity.${granularity}`)}>
        <ResultChart
          periods={periods.map((p) => ({ key: p.key, label: p.label, short: p.short, partial: p.partial, value: resultOf(p.data) }))}
          selectedKey={selected?.key ?? null}
          onSelect={setSelectedKey}
          format={mShort}
          ariaLabel={t('finance.history')}
          soFar={t('finance.soFar')}
        />
        <p className="muted small">{t('finance.chartHint')}</p>
      </Panel>

      {selected && periodDetail({ period: selected, previous, currency: airline.currency, iata: airline.iata, m })}

      <BalanceAndLoans game={game} airline={airline} />
    </div>
  );

  function periodDetail({
    period,
    previous,
    currency,
    iata,
    m,
  }: {
    period: Period;
    previous: Period | undefined;
    currency: string;
    iata: string;
    m: (n: number) => string;
  }) {
    const lines = period.data.lines;
    const result = resultOf(period.data);
    const routes = Object.values(period.data.routes);
    const pax = routes.reduce((s, r) => s + r.pax, 0);
    const seats = routes.reduce((s, r) => s + r.seats, 0);
    const change = previous ? result - resultOf(previous.data) : null;

    const kpis: { label: string; value: string; className?: string }[] = [
      { label: t('finance.line.revenue'), value: m(lines.revenue) },
      { label: t('finance.result'), value: m(result), className: result >= 0 ? 'text--normal' : 'text--warning' },
      {
        label: t('finance.margin'),
        value: lines.revenue > 0 ? `${formatNumber(language, (result / lines.revenue) * 100, 1)} %` : '—',
      },
      { label: t('network.passengers'), value: formatNumber(language, Math.round(pax)) },
      { label: t('network.lfShort'), value: seats > 0 ? `${formatNumber(language, (pax / seats) * 100)} %` : '—', className: seats > 0 ? lfClass(pax / seats) : '' },
    ];

    return (
      <>
        <Panel title={period.label} code={period.partial ? t('finance.soFar') : currency}>
          <div className="kpis">
            {kpis.map((k) => (
              <div key={k.label} className="kpi">
                <span className="kpi__label">{k.label}</span>
                <span className={`kpi__value mono ${k.className ?? ''}`}>{k.value}</span>
              </div>
            ))}
          </div>
          {change !== null && previous && (
            <p className="muted small">
              {t('finance.vsPrevious', { change: `${change >= 0 ? '+' : '−'}${m(Math.abs(change))}`, period: previous.label })}
            </p>
          )}
        </Panel>

        <div className="grid">
          <Panel title={t('finance.pnl')} code={period.partial ? t('finance.soFar') : ''}>
            <dl className="facts pnl">
              <dt>{t('finance.line.revenue')}</dt>
              <dd className="mono">{m(lines.revenue)}</dd>
              {COST_LINES.map((k) => (
                <FactLine key={k} label={t(`finance.line.${k}`)} value={`− ${m(lines[k] ?? 0)}`} />
              ))}
              <dt className="pnl__total">{t('finance.result')}</dt>
              <dd className={`mono pnl__total ${result >= 0 ? 'text--normal' : 'text--warning'}`}>{m(result)}</dd>
            </dl>
            <p className="muted small">{t('finance.pnlNote')}</p>
          </Panel>

          <Panel title={t('finance.routes')} code={t('finance.direct')}>
            {routes.length === 0 ? (
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
                  {Object.entries(period.data.routes)
                    .sort(([, a], [, b]) => b.revenue - b.directCosts - (a.revenue - a.directCosts))
                    .map(([id, s]) => {
                      const route = game!.routes[id];
                      const dest = route && world?.airportById.get(route.destinationId);
                      const lf = s.pax / Math.max(1, s.seats);
                      const r = s.revenue - s.directCosts;
                      return (
                        <tr key={id}>
                          <td className="mono">
                            {route ? `${iata} ${route.flightNumber} ${dest?.iata ?? ''}` : t('finance.closedRoute')}
                          </td>
                          <td className="num mono">{formatNumber(language, Math.round(s.pax))}</td>
                          <td className={`num mono ${lfClass(lf)}`}>{formatNumber(language, lf * 100)} %</td>
                          <td className={`num mono ${r >= 0 ? 'text--normal' : 'text--warning'}`}>{m(r)}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            )}
            <p className="muted small">{t('finance.directNote')}</p>
          </Panel>
        </div>
      </>
    );
  }
}

function FactLine({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className="mono muted">{value}</dd>
    </>
  );
}

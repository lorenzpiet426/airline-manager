import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorld } from '../../data/world';
import { periodKpis, type Kpis } from '../../engine/kpis';
import type { Airline, GameState } from '../../engine/state';
import { toDate } from '../../engine/time';
import { formatGameDate, formatMoney, formatNumber } from '../../i18n/format';
import { useSettings, type Language } from '../../settings/settings';
import { hrefFor } from '../navigation';

const TREND_WEEKS = 12;

type Key = 'result' | 'margin' | 'revenue' | 'pax' | 'loadFactor' | 'rask' | 'cask' | 'caskExFuel' | 'yield' | 'utilisation';

/** Which way is good for each figure (costs should go down). */
const TILES: { key: Key; good: 'up' | 'down' }[] = [
  { key: 'margin', good: 'up' },
  { key: 'revenue', good: 'up' },
  { key: 'pax', good: 'up' },
  { key: 'loadFactor', good: 'up' },
  { key: 'rask', good: 'up' },
  { key: 'cask', good: 'down' },
  { key: 'caskExFuel', good: 'down' },
  { key: 'yield', good: 'up' },
  { key: 'utilisation', good: 'up' },
];

function value(k: Kpis, key: Key): number | null {
  return k[key];
}

function format(language: Language, currency: string, key: Key, v: number | null): string {
  if (v === null) return '—';
  switch (key) {
    case 'result':
    case 'revenue':
      return formatMoney(language, { amount: v, currency });
    case 'margin':
    case 'loadFactor':
      return `${formatNumber(language, v * 100, 1)} %`;
    case 'pax':
      return formatNumber(language, Math.round(v));
    case 'rask':
    case 'cask':
    case 'caskExFuel':
    case 'yield':
      // Hundredths of the book currency per km ("cents"), as airlines report them.
      return formatNumber(language, v * 100, 2);
    case 'utilisation':
      return `${formatNumber(language, v, 1)} h`;
  }
}

/**
 * The airline's key figures for the last full week, each with the change against the week before and a 12-week trend
 * (Ops screen = dashboard). Figures come from the weekly accounts, so they appear after the first full week.
 */
export function Dashboard({ game, airline }: { game: GameState; airline: Airline }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const world = useWorld();
  const fin = game.finance[airline.id];
  const weeks = (fin?.history ?? []).slice(-TREND_WEEKS);
  const active = Object.values(game.aircraft).filter((a) => a.airlineId === airline.id && a.status === 'active').length;
  const series = weeks.map((w) => periodKpis(w, game.routes, 7, active));
  const now = series.at(-1);
  const before = series.at(-2);
  const lastWeek = weeks.at(-1);

  if (!now || !lastWeek) {
    return (
      <div className="dashboard">
        <Tile label={t('dashboard.cash')} value={formatMoney(language, airline.cash, false)} hint={t('dashboard.hint.cash')} warning={airline.cash.amount < 0} />
        <p className="muted">{t('dashboard.waiting')}</p>
      </div>
    );
  }

  const week = formatGameDate(language, toDate(lastWeek.start), false);
  const routes = Object.entries(lastWeek.routes)
    .map(([id, s]) => ({ id, result: s.revenue - s.directCosts, lf: s.seats ? s.pax / s.seats : 0, route: game.routes[id] }))
    .filter((r) => r.route)
    .sort((a, b) => b.result - a.result);
  const code = (id: string) => world?.airportById.get(id)?.iata ?? id;

  return (
    <div className="dashboard">
      <p className="muted small">{t('dashboard.period', { week })}</p>
      <div className="kpi-hero">
        <Tile
          hero
          label={t('dashboard.kpi.result')}
          value={format(language, airline.currency, 'result', now.result)}
          hint={t('dashboard.hint.result')}
          warning={now.result < 0}
          delta={deltaOf(language, airline.currency, 'result', now, before, 'up', t)}
          trend={series.map((k) => k.result)}
          labels={weeks.map((w) => formatGameDate(language, toDate(w.start), false))}
          formatPoint={(v) => format(language, airline.currency, 'result', v)}
        />
        <Tile label={t('dashboard.cash')} value={formatMoney(language, airline.cash, false)} hint={t('dashboard.hint.cash')} warning={airline.cash.amount < 0} />
      </div>
      <div className="kpi-grid">
        {TILES.map(({ key, good }) => (
          <Tile
            key={key}
            label={t(`dashboard.kpi.${key}`)}
            unit={['rask', 'cask', 'caskExFuel', 'yield'].includes(key) ? t('dashboard.centsPer', { currency: airline.currency, unit: key === 'yield' ? 'RPK' : 'ASK' }) : undefined}
            value={format(language, airline.currency, key, value(now, key))}
            hint={t(`dashboard.hint.${key}`)}
            delta={deltaOf(language, airline.currency, key, now, before, good, t)}
            trend={series.map((k) => value(k, key))}
            labels={weeks.map((w) => formatGameDate(language, toDate(w.start), false))}
            formatPoint={(v) => format(language, airline.currency, key, v)}
          />
        ))}
      </div>
      {routes.length > 0 && (
        <div className="kpi-routes">
          <RouteList title={t(routes.length > 3 ? 'dashboard.bestRoutes' : 'dashboard.routesLastWeek')} items={routes.slice(0, 3)} code={code} currency={airline.currency} />
          {routes.length > 3 && <RouteList title={t('dashboard.worstRoutes')} items={routes.slice(-3).reverse()} code={code} currency={airline.currency} />}
        </div>
      )}
      <p className="muted small">
        {t('dashboard.note')} <a href={hrefFor('finance')}>{t('dashboard.toFinance')}</a>
      </p>
    </div>
  );
}

function deltaOf(
  language: Language,
  currency: string,
  key: Key,
  now: Kpis,
  before: Kpis | undefined,
  good: 'up' | 'down',
  t: (k: string, o?: Record<string, unknown>) => string,
): { text: string; level: 'normal' | 'warning' | 'muted' } | undefined {
  const a = value(now, key);
  const b = before ? value(before, key) : null;
  if (a === null || b === null) return undefined;
  const diff = a - b;
  if (Math.abs(diff) < 1e-9) return { text: `± ${t('dashboard.vsLastWeek')}`, level: 'muted' };
  const arrow = diff > 0 ? '▲' : '▼';
  // Percent points for shares, relative change for the rest.
  const shares = key === 'margin' || key === 'loadFactor';
  const amount = shares
    ? `${formatNumber(language, Math.abs(diff) * 100, 1)} ${t('dashboard.points')}`
    : key === 'result'
      ? formatMoney(language, { amount: Math.abs(diff), currency })
      : `${formatNumber(language, b !== 0 ? Math.abs(diff / b) * 100 : 0, 1)} %`;
  const better = (diff > 0) === (good === 'up');
  return { text: `${arrow} ${amount} ${t('dashboard.vsLastWeek')}`, level: better ? 'normal' : 'warning' };
}

function Tile({
  label,
  unit,
  value,
  hint,
  delta,
  trend,
  labels,
  formatPoint,
  hero,
  warning,
}: {
  label: string;
  unit?: string;
  value: string;
  hint: string;
  delta?: { text: string; level: 'normal' | 'warning' | 'muted' };
  trend?: (number | null)[];
  labels?: string[];
  formatPoint?: (v: number) => string;
  hero?: boolean;
  warning?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const points = trend?.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null) ?? [];
  const shown = hover !== null && trend?.[hover] != null && labels && formatPoint ? `${labels[hover]}: ${formatPoint(trend[hover]!)}` : null;
  return (
    <div className={`kpi${hero ? ' kpi--hero' : ''}`}>
      <span className="kpi__label">
        {label}
        {unit && <span className="kpi__unit"> · {unit}</span>}
      </span>
      <span className={`kpi__value${warning ? ' text--warning' : ''}`}>{value}</span>
      {shown ? (
        <span className="kpi__delta mono">{shown}</span>
      ) : (
        delta && <span className={`kpi__delta ${delta.level === 'muted' ? 'muted' : `text--${delta.level}`}`}>{delta.text}</span>
      )}
      {trend && points.length >= 2 && <Sparkline values={trend} onHover={setHover} hover={hover} />}
      <span className="kpi__hint">{hint}</span>
    </div>
  );
}

/** 12 weeks as a thin line in a faint colour, the latest week marked in the accent colour; hover shows the value. */
function Sparkline({ values, hover, onHover }: { values: (number | null)[]; hover: number | null; onHover: (i: number | null) => void }) {
  const known = values.filter((v): v is number => v !== null);
  const min = Math.min(...known);
  const max = Math.max(...known);
  const span = max - min || 1;
  const x = (i: number) => (values.length > 1 ? (i / (values.length - 1)) * 100 : 50);
  const y = (v: number) => 26 - ((v - min) / span) * 22;
  const path = values
    .map((v, i) => (v === null ? null : `${x(i).toFixed(2)},${y(v).toFixed(2)}`))
    .filter(Boolean)
    .join(' ');
  const zero = min < 0 && max > 0 ? y(0) : null;
  const last = values.length - 1;
  const marker = (i: number) => values[i] != null && <span className={`spark__dot${i === last ? ' spark__dot--now' : ''}`} style={{ left: `${x(i)}%`, top: `${(y(values[i]!) / 28) * 100}%` }} />;
  return (
    <div
      className="spark"
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onHover(Math.max(0, Math.min(last, Math.round(((e.clientX - r.left) / r.width) * last))));
      }}
      onPointerLeave={() => onHover(null)}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="spark__svg">
        {zero !== null && <line x1="0" x2="100" y1={zero} y2={zero} className="spark__zero" vectorEffect="non-scaling-stroke" />}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1="0" y2="28" className="spark__guide" vectorEffect="non-scaling-stroke" />}
        <polyline points={path} className="spark__line" vectorEffect="non-scaling-stroke" />
      </svg>
      {marker(last)}
      {hover !== null && hover !== last && marker(hover)}
    </div>
  );
}

function RouteList({ title, items, code, currency }: { title: string; items: { id: string; result: number; lf: number; route: GameState['routes'][string] | undefined }[]; code: (id: string) => string; currency: string }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  return (
    <div>
      <span className="field__label">{title}</span>
      <ul className="kpi-route-list">
        {items.map((r) => (
          <li key={r.id}>
            <span className="mono">
              {code(r.route!.originId)}–{code(r.route!.destinationId)}
            </span>
            <span className="muted small mono">
              {formatNumber(language, r.lf * 100)} % {t('network.lfShort')}
            </span>
            <span className={`mono ${r.result >= 0 ? 'text--normal' : 'text--warning'}`}>{formatMoney(language, { amount: r.result, currency })}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

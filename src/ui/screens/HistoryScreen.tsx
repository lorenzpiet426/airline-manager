import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LEGACY_CURRENCIES } from '../../data/currencyHistory';
import { ECONOMY_YEARS, WORLD_ECONOMY } from '../../data/economyHistory';
import { jetFuelSpot } from '../../data/fuel';
import { loadFxHistory, type FxHistory } from '../../data/fxHistory';
import { HISTORIC_EVENTS, type HistoricEvent } from '../../data/history';
import { usdInYear } from '../../data/inflation';
import { CLOSING } from '../../engine/worldEvents';
import { countryName, formatGameDate, formatNumber, localeFor } from '../../i18n/format';
import { useSettings, type Language } from '../../settings/settings';
import { Panel } from '../components/Panel';
import { Segmented } from '../components/Segmented';
import { useEngineWorld } from '../game/useEngineWorld';
import { usePlayer } from '../game/usePlayer';

// The History screen (Phase 5.2): the real world since 1970 as the game knows it — jet fuel, exchange rates, air travel
// and the timeline of real events with where, when, how strong and the source.

const FIRST = 1970;
const LAST_MONTH = new Date(Date.UTC(2026, 9, 1));
const MONTHS = (LAST_MONTH.getUTCFullYear() - FIRST) * 12 + LAST_MONTH.getUTCMonth() + 1;
const DECADES = [1970, 1980, 1990, 2000, 2010, 2020];

type ChartKind = 'fuel' | 'fx' | 'traffic';
type Filter = 'all' | 'crises' | 'closures' | 'milestones';

interface Series {
  values: (number | null)[];
  label: string;
  className: string;
}

/** A line chart over the years since 1970 with decade grid lines and a hover readout (one y axis). */
function HistoryChart({ series, perYear, format, label }: { series: Series[]; perYear: number; format: (v: number) => string; label: string }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const [hover, setHover] = useState<number | null>(null);
  const length = Math.max(...series.map((s) => s.values.length));
  const known = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const max = Math.max(...known) * 1.05;
  const W = 640;
  const H = 220;
  const x = (i: number) => (length > 1 ? (i / (length - 1)) * W : 0);
  const y = (v: number) => H - (v / max) * H;
  const yearAt = (i: number) => FIRST + i / perYear;
  const ticks = [0.25, 0.5, 0.75, 1].map((f) => (max / 1.05) * f);
  const when = (i: number) =>
    perYear === 12
      ? new Intl.DateTimeFormat(localeFor(language), { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(FIRST, i, 1)))
      : String(FIRST + i);
  const shown = hover ?? length - 1;
  return (
    <figure className="history-chart">
      <figcaption className="history-chart__readout">
        <span className="mono muted">{when(shown)}</span>
        {series.map((s) => (
          <span key={s.label} className="history-chart__value">
            <span className={`history-chart__swatch ${s.className}`} aria-hidden="true" />
            {s.label} <strong className="mono">{s.values[shown] != null ? format(s.values[shown]!) : '–'}</strong>
          </span>
        ))}
      </figcaption>
      <div
        className="history-chart__plot"
        role="img"
        aria-label={label}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHover(Math.max(0, Math.min(length - 1, Math.round(((e.clientX - r.left) / r.width) * (length - 1)))));
        }}
        onPointerLeave={() => setHover(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="history-chart__svg">
          {ticks.map((v) => (
            <line key={v} x1={0} x2={W} y1={y(v)} y2={y(v)} className="history-chart__grid" vectorEffect="non-scaling-stroke" />
          ))}
          {DECADES.map((d) => (
            <line key={d} x1={x((d - FIRST) * perYear)} x2={x((d - FIRST) * perYear)} y1={0} y2={H} className="history-chart__grid" vectorEffect="non-scaling-stroke" />
          ))}
          <line x1={0} x2={W} y1={H} y2={H} className="history-chart__axis" vectorEffect="non-scaling-stroke" />
          {series.map((s) => (
            <polyline
              key={s.label}
              className={`history-chart__line ${s.className}`}
              vectorEffect="non-scaling-stroke"
              points={s.values.map((v, i) => (v === null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(' ')}
            />
          ))}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} className="history-chart__guide" vectorEffect="non-scaling-stroke" />}
        </svg>
        {hover !== null &&
          series.map((s) =>
            s.values[hover] != null ? (
              <span key={s.label} className={`history-chart__dot ${s.className}`} style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(s.values[hover]!) / H) * 100}%` }} />
            ) : null,
          )}
        {ticks.map((v) => (
          <span key={v} className="history-chart__tick mono" style={{ top: `${(y(v) / H) * 100}%` }}>
            {format(v)}
          </span>
        ))}
      </div>
      <div className="history-chart__years mono" aria-hidden="true">
        {DECADES.map((d) => (
          <span key={d} style={{ left: `${(x((d - FIRST) * perYear) / W) * 100}%` }}>
            {d}
          </span>
        ))}
      </div>
      <span className="visually-hidden">{t('history.chartHint', { from: when(0), to: when(length - 1), year: Math.round(yearAt(length - 1)) })}</span>
    </figure>
  );
}

function FuelChart() {
  const { t } = useTranslation();
  const { language } = useSettings();
  const [today, setToday] = useState(false);
  const values = useMemo(
    () =>
      Array.from({ length: MONTHS }, (_, i) => {
        const date = new Date(Date.UTC(FIRST, i, 15));
        const v = jetFuelSpot(date);
        return today ? usdInYear(v, date.getUTCFullYear(), 2025) : v;
      }),
    [today],
  );
  return (
    <>
      <Segmented
        label={t('history.money')}
        value={today ? 'today' : 'then'}
        options={[
          { value: 'then', label: t('history.moneyThen') },
          { value: 'today', label: t('history.moneyToday') },
        ]}
        onChange={(v) => setToday(v === 'today')}
      />
      <HistoryChart
        perYear={12}
        label={t('history.fuelLabel')}
        series={[{ values, label: t('history.fuelSeries'), className: 'history-chart__s1' }]}
        format={(v) => `$${v.toLocaleString(localeFor(language), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
      />
      <p className="small muted">{t('history.fuelNote')}</p>
    </>
  );
}

/** Currencies offered in the exchange rate chart: the old euro currencies first, then the others. */
function fxOptions(fx: FxHistory): string[] {
  const legacy = LEGACY_CURRENCIES.map((l) => l.code);
  return [...legacy, ...Object.keys(fx.perUsd).filter((c) => !legacy.includes(c)).sort()];
}

function FxChart({ defaultCurrency }: { defaultCurrency: string }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const [fx, setFx] = useState<FxHistory | null>(null);
  const [currency, setCurrency] = useState(defaultCurrency);
  useEffect(() => {
    let alive = true;
    void loadFxHistory().then((data) => alive && setFx(data));
    return () => {
      alive = false;
    };
  }, []);
  if (!fx) return <p className="muted">{t('common.loading')}</p>;
  const values = fx.perUsd[currency] ?? [];
  const legacy = LEGACY_CURRENCIES.find((l) => l.code === currency);
  const legacyCodes = new Set(LEGACY_CURRENCIES.map((l) => l.code));
  const digits = Math.max(...values.filter((v): v is number => v !== null)) < 10 ? 3 : 1;
  return (
    <>
      <label className="field">
        <span className="field__label">{t('history.currency')}</span>
        <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {fxOptions(fx).map((c) => (
            <option key={c} value={c}>
              {c} · {legacyCodes.has(c) ? t(`history.currencyName.${c}`) : currencyLabel(language, c)}
            </option>
          ))}
        </select>
      </label>
      <HistoryChart
        perYear={12}
        label={t('history.fxLabel', { currency })}
        series={[{ values, label: t('history.fxSeries', { currency }), className: 'history-chart__s1' }]}
        format={(v) => formatNumber(language, v, v < 10 ? digits : 1)}
      />
      <p className="small muted">
        {legacy ? t('history.fxLegacy', { currency, rate: formatNumber(language, legacy.perEur, 6), date: formatGameDate(language, new Date(`${legacy.euroFrom}T00:00:00Z`), false) }) : ''} {t('history.fxNote')}
      </p>
    </>
  );
}

function currencyLabel(language: Language, code: string): string {
  try {
    return new Intl.DisplayNames([localeFor(language)], { type: 'currency' }).of(code) ?? code;
  } catch {
    return code;
  }
}

function TrafficChart() {
  const { t } = useTranslation();
  const { language } = useSettings();
  // The model index (2024 = 1) in passengers: scaled so that 2019 matches the real 2019 total.
  const real = WORLD_ECONOMY.passengers;
  const i2019 = 2019 - ECONOMY_YEARS[0];
  const scale = real[i2019]! / WORLD_ECONOMY.modelIndex[i2019]!;
  const model = WORLD_ECONOMY.modelIndex.map((v) => Math.round(v * scale * 10) / 10);
  return (
    <>
      <HistoryChart
        perYear={1}
        label={t('history.trafficLabel')}
        series={[
          { values: real, label: t('history.trafficReal'), className: 'history-chart__s1' },
          { values: model, label: t('history.trafficModel'), className: 'history-chart__s2' },
        ]}
        format={(v) => t('history.millions', { value: formatNumber(language, v, 0) })}
      />
      <p className="small muted">{t('history.trafficNote')}</p>
    </>
  );
}

const FILTERS: Record<Filter, (e: HistoricEvent) => boolean> = {
  all: () => true,
  crises: (e) => !CLOSING.has(e.kind) && e.kind !== 'milestone',
  closures: (e) => CLOSING.has(e.kind),
  milestones: (e) => e.kind === 'milestone',
};

export function HistoryScreen() {
  const { t } = useTranslation();
  const { language } = useSettings();
  const { airline } = usePlayer();
  const world = useEngineWorld();
  const [chart, setChart] = useState<ChartKind>('fuel');
  const [filter, setFilter] = useState<Filter>('all');
  const [decade, setDecade] = useState<number | null>(null);
  const hubCountry = airline && world ? world.airportById.get(airline.hubId)?.country : undefined;
  const defaultCurrency = LEGACY_CURRENCIES.find((l) => hubCountry && l.countries.includes(hubCountry))?.code ?? (airline?.currency !== 'USD' ? airline?.currency : undefined) ?? 'ATS';

  const events = HISTORIC_EVENTS.filter((e) => FILTERS[filter](e) && (decade === null || (Number(e.start.slice(0, 4)) >= decade && Number(e.start.slice(0, 4)) < decade + 10)));
  const date = (iso: string) => formatGameDate(language, new Date(`${iso}T00:00:00Z`), false);
  const where = (e: HistoricEvent): string => {
    const names = [
      ...(e.continents?.length === 6 ? [t('world.worldwide')] : (e.continents ?? []).map((c) => t(`world.continent.${c}`))),
      ...(e.countries ?? []).map((c) => countryName(language, c, world?.countries[c]?.name ?? c)),
      ...(e.airports ?? []).map((id) => world?.airportById.get(id)?.iata ?? id),
    ];
    if (!names.length) names.push(t('world.worldwide'));
    const shortList = names.length > 8 ? [...names.slice(0, 7), t('history.more', { count: names.length - 7 })] : names;
    return e.pairWith ? t('history.banLine', { where: shortList.join(', '), with: e.pairWith.length > 6 ? t('history.countries', { count: e.pairWith.length }) : e.pairWith.map((c) => countryName(language, c, c)).join(', ') }) : shortList.join(', ');
  };
  const effect = (e: HistoricEvent): string | null => {
    if (e.kind === 'milestone') return null;
    if (e.kind === 'fuelShock') return t('history.effectFuel');
    if (CLOSING.has(e.kind)) return t('history.effectClosure', { share: Math.round(e.depth * 100) });
    return t('history.effectDemand', { share: Math.round(e.depth * 100) });
  };

  const decadesShown = DECADES.filter((d) => events.some((e) => Number(e.start.slice(0, 4)) >= d && Number(e.start.slice(0, 4)) < d + 10));
  const list: ReactNode[] = decadesShown.map((d) => (
    <li key={d}>
      <h3 className="history-decade">{t('types.decadeOpt', { decade: d })}</h3>
      <ol className="history-events">
        {events
          .filter((e) => Number(e.start.slice(0, 4)) >= d && Number(e.start.slice(0, 4)) < d + 10)
          .map((e) => (
            <li key={e.id} className={`history-event history-event--${e.kind === 'milestone' ? 'milestone' : CLOSING.has(e.kind) ? 'closure' : 'crisis'}`}>
              <span className="history-event__date mono">
                {date(e.start)}
                {e.end && e.end !== e.start ? ` – ${date(e.end)}` : e.end ? '' : ` – ${t('history.ongoing')}`}
              </span>
              <strong>{t(`hist.${e.id}.name`)}</strong>
              <span>{t(`hist.${e.id}.text`)}</span>
              {e.kind !== 'milestone' && (
                <span className="small muted">
                  {t(`world.kind.${e.kind}`, { label: e.label ?? '' })} · {where(e)} · {effect(e)}
                </span>
              )}
              <a className="small muted" href={`https://en.wikipedia.org/wiki/${encodeURIComponent(e.source.replace(/ /g, '_'))}`} target="_blank" rel="noreferrer">
                {t('history.source', { title: e.source })}
              </a>
            </li>
          ))}
      </ol>
    </li>
  ));

  return (
    <div className="screen">
      <h1 className="screen__title">{t('history.title')}</h1>
      <p className="muted">{t('history.intro')}</p>
      <Panel title={t('history.charts')} code="1970–2026">
        <Segmented
          label={t('history.charts')}
          value={chart}
          options={(['fuel', 'fx', 'traffic'] as const).map((v) => ({ value: v, label: t(`history.chart.${v}`) }))}
          onChange={setChart}
        />
        {chart === 'fuel' ? <FuelChart /> : chart === 'fx' ? <FxChart defaultCurrency={defaultCurrency} /> : <TrafficChart />}
      </Panel>
      <Panel title={t('history.timeline')} code={t('history.eventCount', { count: events.length })}>
        <div className="types__filters">
          <Segmented label={t('history.filter')} value={filter} options={(Object.keys(FILTERS) as Filter[]).map((v) => ({ value: v, label: t(`history.filterOpt.${v}`) }))} onChange={setFilter} />
          <label className="field">
            <span className="field__label">{t('types.decade')}</span>
            <select className="input" value={decade ?? ''} onChange={(e) => setDecade(e.target.value ? Number(e.target.value) : null)}>
              <option value="">{t('types.allDecades')}</option>
              {DECADES.map((d) => (
                <option key={d} value={d}>
                  {t('types.decadeOpt', { decade: d })}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="small muted">{t('history.timelineNote')}</p>
        <ol className="history-decades">{list}</ol>
      </Panel>
    </div>
  );
}

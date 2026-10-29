import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { JET_FUEL_SPOT_USD_PER_GAL } from '../../data/fuel';
import type { Airline, GameState, WorldEvent } from '../../engine/state';
import { fromDate, MINUTES_PER_DAY, toDate } from '../../engine/time';
import type { EngineWorld } from '../../engine/world';
import { CLOSING, conditionsOf, eventsOf, intensity, REAL_DATA_END } from '../../engine/worldEvents';
import { countryName, formatGameDate, formatNumber, localeFor } from '../../i18n/format';
import { useSettings } from '../../settings/settings';
import { Sparkline } from './Dashboard';

/** The last 52 weekly fuel prices: real ones before the real data ends, simulated ones after. */
function fuelSeries(game: GameState): number[] {
  const real = JET_FUEL_SPOT_USD_PER_GAL.map(([d, v]) => [fromDate(new Date(d)), v] as const);
  const all = [...real.filter(([t]) => t <= Math.min(game.time, REAL_DATA_END)), ...game.world.fuelHistory.filter(([t]) => t <= game.time)];
  return all.slice(-52).map(([, v]) => v);
}

const pct = (language: string, v: number) => `${v >= 0 ? '+' : '−'}${formatNumber(language as 'en' | 'de', Math.abs(v * 100), 0)} %`;

/**
 * The world around the airline (Phase 5.1): jet fuel price, the book currency against the dollar, the economy where the
 * hub is, long-term traffic growth, and what is happening right now (events with where and until when).
 */
export function WorldPanel({ game, airline, world }: { game: GameState; airline: Airline; world: EngineWorld }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const [hover, setHover] = useState<number | null>(null);
  const [fxHover, setFxHover] = useState<number | null>(null);
  const c = conditionsOf(game, world);
  const fuel = fuelSeries(game);
  const fuelShown = hover !== null && fuel[hover] !== undefined ? fuel[hover]! : c.fuelSpot;
  const hub = world.airportById.get(airline.hubId);
  const continent = hub ? world.countries[hub.country]?.continent : undefined;
  // Demand on a typical trip within the hub's continent.
  const biz = hub ? c.demand(hub, hub, 'business') : 1;
  const leisure = hub ? c.demand(hub, hub, 'leisure') : 1;
  const currency = airline.currency === 'USD' ? 'EUR' : airline.currency;
  const perUsd = (fx: Record<string, number>) => (currency === 'EUR' ? (fx.USD ?? 1) : (fx[currency] ?? 1) / (fx.USD ?? 1));
  const fxSeries = game.world.fxHistory.slice(-24).map(([, usdPerEur]) => (currency === 'EUR' ? usdPerEur : null));
  const all = eventsOf(game).filter((e) => e.kind !== 'milestone');
  const active = all.filter((e) => e.start <= game.time && e.end > game.time).sort((a, b) => a.end - b.end);
  // Events of the last three months that are over (the newest first).
  const recent = all.filter((e) => e.end <= game.time && e.end > game.time - 91 * MINUTES_PER_DAY).sort((a, b) => b.start - a.start).slice(0, 8);
  const where = (e: WorldEvent) =>
    e.airports?.length
      ? [...(e.countries ?? []).map((x) => countryName(language, x, world.countries[x]?.name ?? x)), ...e.airports.map((id) => world.airportById.get(id)?.iata ?? id)].join(', ')
      : e.continents?.length === 6
        ? t('world.worldwide')
        : (e.countries ?? e.continents ?? []).map((x) => (e.countries ? countryName(language, x, world.countries[x]?.name ?? x) : t(`world.continent.${x}`))).join(', ');

  const name = (e: WorldEvent) => (e.historic ? t(`hist.${e.historic}.name`) : t(`world.kind.${e.kind}`, { label: e.label ?? '' }));

  return (
    <div className="world-panel">
      <div className="kpi-grid">
        <div className="kpi">
          <span className="kpi__label">{t('world.fuel')}</span>
          <span className="kpi__value mono">${fuelShown.toLocaleString(localeFor(language), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          {fuel.length > 1 && <Sparkline values={fuel} hover={hover} onHover={setHover} />}
          <span className="kpi__hint">{t('world.fuelHint')}</span>
        </div>
        <div className="kpi">
          <span className="kpi__label">{currency === 'EUR' ? t('world.eurUsd') : t('world.perUsd', { currency })}</span>
          <span className="kpi__value mono">{formatNumber(language, fxHover !== null && fxSeries[fxHover] ? fxSeries[fxHover]! : perUsd(game.fx), 4)}</span>
          {fxSeries.filter((v) => v !== null).length > 1 && <Sparkline values={fxSeries} hover={fxHover} onHover={setFxHover} />}
          <span className="kpi__hint">{t('world.fxHint', { date: game.fxDate })}</span>
        </div>
        <div className="kpi">
          <span className="kpi__label">{t('world.demand', { region: continent ? t(`world.continent.${continent}`) : '' })}</span>
          <span className={`kpi__value mono ${biz < 0.97 ? 'text--caution' : ''}`}>
            {biz >= 0.995 && leisure >= 0.995 ? t('world.normal') : `${pct(language, biz - 1)} / ${pct(language, leisure - 1)}`}
          </span>
          <span className="kpi__hint">{t('world.demandHint')}</span>
        </div>
        <div className="kpi">
          {/* Before today: how much air travel there was compared with today (1975: about a tenth). */}
          <span className="kpi__label">{t(c.trend < 1 ? 'world.trafficToday' : 'world.growth')}</span>
          <span className="kpi__value mono">{c.trend < 1 ? `${Math.round(c.trend * 100)} %` : pct(language, c.trend - 1)}</span>
          <span className="kpi__hint">{t(c.trend < 1 ? 'world.trafficTodayHint' : 'world.growthHint')}</span>
        </div>
      </div>
      <h3 className="world-panel__title">{t('world.now')}</h3>
      {game.time < REAL_DATA_END && <p className="muted small">{t('world.realPeriod', { date: formatGameDate(language, toDate(REAL_DATA_END), false) })}</p>}
      {active.length === 0 ? (
        <p className="muted small">{t('world.quiet')}</p>
      ) : (
        <ul className="world-events">
          {active.map((e) => (
            <li key={e.id} className={`world-events__item ${CLOSING.has(e.kind) ? 'world-events__item--closure' : ''}`}>
              <strong>{name(e)}</strong>
              <span className="small">{where(e)}</span>
              <span className="small muted mono">
                {e.openEnded
                  ? t(CLOSING.has(e.kind) ? 'world.openClosureLine' : 'world.openLine', { share: Math.round(intensity(e, game.time) * e.depth * 100) })
                  : CLOSING.has(e.kind)
                  ? t('world.closureLine', { share: Math.round(e.depth * 100), until: formatGameDate(language, toDate(e.end), false) })
                  : t('world.gradualLine', {
                      now: Math.round(intensity(e, game.time) * e.depth * 100),
                      until: formatGameDate(language, toDate(e.end), false),
                      days: Math.round((e.end - game.time) / MINUTES_PER_DAY),
                    })}
              </span>
            </li>
          ))}
        </ul>
      )}
      {recent.length > 0 && (
        <>
          <h3 className="world-panel__title">{t('world.recent')}</h3>
          <ul className="world-recent small">
            {recent.map((e) => (
              <li key={e.id}>
                <span className="mono muted">{formatGameDate(language, toDate(e.start), false)}</span> {name(e)} · {where(e)}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

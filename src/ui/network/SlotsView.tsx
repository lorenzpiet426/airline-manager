import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { curfewsAt } from '../../data/curfews';
import { slotAirport } from '../../data/slots';
import { nextSeasonStart, slotNeeds, slotUse, slotsPerDay, USE_IT_OR_LOSE_IT } from '../../engine/slots';
import type { Airline, GameState } from '../../engine/state';
import { toDate, yearOf } from '../../engine/time';
import type { EngineWorld } from '../../engine/world';
import { formatGameDate, formatNumber } from '../../i18n/format';
import { useSettings } from '../../settings/settings';
import { Panel } from '../components/Panel';

/**
 * Your slots (Phase 7.2): at every slot-coordinated airport you fly to, the slots you hold and need, how much of them you
 * used this season (use it or lose it), slots asked for; and the night curfews on your network.
 */
export function SlotsView({ game, world, airline, code }: { game: GameState; world: EngineWorld; airline: Airline; code: (id: string) => string }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const rows = useMemo(() => {
    const needs = slotNeeds(game, world, airline.id);
    const ids = new Set([...needs.keys(), ...Object.keys(game.slots ?? {})]);
    return [...ids]
      .filter((id) => slotAirport(id))
      .map((id) => {
        const h = game.slots?.[id];
        const need = needs.get(id)?.reduce((s, n) => s + n, 0) ?? 0;
        const held = h?.held.reduce((s, n) => s + n, 0) ?? 0;
        const used = h && h.weeks > 0 && held > 0 ? h.used.reduce((s, n) => s + n, 0) / (h.weeks * held) : null;
        const requests = h?.requests.reduce((s, n) => s + n, 0) ?? 0;
        return { id, perDay: slotsPerDay(h), need: need / 7, used, requests, full: slotUse(world, id, game.time) };
      })
      .sort((a, b) => b.perDay - a.perDay);
  }, [game, world, airline.id]);
  const year = yearOf(game.time);
  const curfews = useMemo(() => {
    const ids = new Set<string>([airline.hubId]);
    for (const r of Object.values(game.routes)) if (r.airlineId === airline.id) ids.add(r.destinationId);
    return [...ids].flatMap((id) => curfewsAt(id, year).map((c) => ({ ...c, id })));
  }, [game.routes, airline, year]);
  const when = formatGameDate(language, toDate(nextSeasonStart(game.time)), false);

  return (
    <>
      <Panel title={t('slots.title')} code="SLOT">
        <p className="muted small">{t('slots.intro', { share: Math.round(USE_IT_OR_LOSE_IT * 100), date: when })}</p>
        {rows.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>{t('slots.airport')}</th>
                <th className="num">{t('slots.held')}</th>
                <th className="num">{t('slots.needed')}</th>
                <th className="num">{t('slots.used')}</th>
                <th className="num">{t('slots.asked')}</th>
                <th className="num">{t('slots.full')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{code(r.id)}</td>
                  <td className="num mono">{formatNumber(language, r.perDay, 1)}</td>
                  <td className="num mono">{formatNumber(language, r.need, 1)}</td>
                  <td className={`num mono${r.used !== null && r.used < USE_IT_OR_LOSE_IT ? ' text--caution' : ''}`}>
                    {r.used !== null ? `${Math.round(r.used * 100)} %` : '—'}
                  </td>
                  <td className="num mono">{r.requests || '—'}</td>
                  <td className="num mono">{`${Math.round(r.full * 100)} %`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">{t('slots.none')}</p>
        )}
        <p className="muted small">{t('slots.tableNote')}</p>
      </Panel>
      <Panel title={t('slots.curfews')} code="NIGHT">
        {curfews.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>{t('slots.airport')}</th>
                <th>{t('slots.hours')}</th>
                <th>{t('slots.rule')}</th>
              </tr>
            </thead>
            <tbody>
              {curfews.map((c, i) => (
                <tr key={`${c.id}${i}`}>
                  <td className="mono">{code(c.id)}</td>
                  <td className="mono">{`${c.from}–${c.until}`}</td>
                  <td className="small">
                    {t(`slots.kind.${c.kind}`)} <span className="muted">· {c.note}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">{t('slots.noCurfews')}</p>
        )}
        <p className="muted small">{t('slots.curfewNote')}</p>
      </Panel>
    </>
  );
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ON_TIME_MIN } from '../../data/delays';
import type { Airline, GameState, OpsFlight } from '../../engine/state';
import { startOfDay, utcOffsetMin } from '../../engine/time';
import type { EngineWorld } from '../../engine/world';
import { formatNumber } from '../../i18n/format';
import { useSettings } from '../../settings/settings';
import { Segmented } from '../components/Segmented';
import { hhmmText } from './timetableText';
import { flightId } from '../../engine/delays';
import { hrefFor } from '../navigation';

/** Delays become known this long before departure (until then a flight shows as scheduled). */
const KNOWN_BEFORE_MIN = 120;
type Filter = 'next' | 'problems' | 'all';

/**
 * Today's flights like an airport's departures board (Phase 9.1): scheduled local time, expected or actual times,
 * delays with their cause, diversions and cancellations. Yesterday's punctuality on top.
 */
export function DeparturesBoard({ game, world, airline }: { game: GameState; world: EngineWorld; airline: Airline }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const [filter, setFilter] = useState<Filter>('next');
  const ops = game.ops;
  if (!ops) return <p className="muted small">{t('board.none')}</p>;
  const mine = ops.flights.filter((f) => f.airlineId === airline.id).sort((a, b) => a.dep - b.dep);
  const now = game.time;
  const known = (f: OpsFlight) => now >= f.dep - KNOWN_BEFORE_MIN;
  const arrived = (f: OpsFlight) => f.status !== 'cancelled' && now >= f.arr + f.arrDelay;
  const problem = (f: OpsFlight) => known(f) && (f.status !== 'ok' || f.arrDelay > ON_TIME_MIN || f.depDelay > ON_TIME_MIN);
  const shown = filter === 'all' ? mine : filter === 'problems' ? mine.filter(problem) : mine.filter((f) => !arrived(f)).slice(0, 15);
  const yesterday = ops.prev.filter((f) => f.airlineId === airline.id && f.status !== 'cancelled');
  const onTime = yesterday.length ? yesterday.filter((f) => f.status === 'ok' && f.arrDelay <= ON_TIME_MIN).length / yesterday.length : null;
  const code = (id: string) => world.airportById.get(id)?.iata ?? id;
  const local = (airportId: string, time: number) => {
    const a = world.airportById.get(airportId);
    return hhmmText(time - startOfDay(time) + (a ? utcOffsetMin(a.tz, time) : 0));
  };

  const status = (f: OpsFlight) => {
    if (f.status === 'cancelled') return { cls: 'chip--warning', text: t('board.cancelled', { reason: t(`board.reason.${f.reason ?? 'other'}`) }) };
    if (!known(f)) return { cls: 'muted', text: t('board.scheduled') };
    const cause = f.cause ? ` · ${t(`board.cause.${f.cause}`)}` : '';
    if (now < f.dep + f.depDelay) {
      return f.depDelay > 5
        ? { cls: 'chip--caution', text: t('board.delayed', { time: local(f.fromId, f.dep + f.depDelay) }) + cause }
        : { cls: 'chip--normal', text: t('board.onTime') };
    }
    if (f.status === 'diverted') return { cls: 'chip--warning', text: t('board.diverted', { airport: code(f.divertedTo ?? '') }) + cause };
    const late = f.arrDelay > ON_TIME_MIN;
    const sign = f.arrDelay > 0 ? `+${f.arrDelay}` : `${f.arrDelay}`;
    if (now < f.arr + f.arrDelay) return { cls: late ? 'chip--caution' : 'chip--normal', text: t('board.airborne', { time: local(f.toId, f.arr + f.arrDelay), delay: sign }) };
    return { cls: late ? 'chip--caution' : 'chip--normal', text: t('board.landed', { time: local(f.toId, f.arr + f.arrDelay), delay: sign }) + (late ? cause : '') };
  };

  return (
    <div className="board">
      <p className="small">
        {onTime !== null
          ? t('board.yesterday', { percent: formatNumber(language, onTime * 100), count: yesterday.length })
          : t('board.noYesterday')}
      </p>
      <Segmented
        label={t('board.filter')}
        value={filter}
        options={(['next', 'problems', 'all'] as const).map((v) => ({ value: v, label: t(`board.filters.${v}`) }))}
        onChange={setFilter}
      />
      {shown.length === 0 ? (
        <p className="muted small">{t(filter === 'problems' ? 'board.noProblems' : 'board.empty')}</p>
      ) : (
        <div className="table-scroll">
          <table className="table board__table">
            <thead>
              <tr>
                <th>{t('board.flight')}</th>
                <th>{t('board.route')}</th>
                <th className="num">{t('board.std')}</th>
                <th>{t('board.status')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((f) => {
                const s = status(f);
                return (
                  <tr key={`${f.pairId}|${f.dir}`}>
                    <td className="mono">
                      <a href={hrefFor('flight', { id: flightId(f) })}>
                        {airline.iata} {f.flightNumber}
                      </a>
                    </td>
                    <td className="mono">
                      {code(f.fromId)}–{code(f.toId)}
                    </td>
                    <td className="num mono">{local(f.fromId, f.dep)}</td>
                    <td>
                      <span className={s.cls.startsWith('chip') ? `chip ${s.cls}` : `small ${s.cls}`}>{s.text}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">{t('board.note')}</p>
    </div>
  );
}

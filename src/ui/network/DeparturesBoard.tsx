import { flightId, knownFlights } from '../../engine/delays';
import { hrefFor } from '../navigation';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAircraftType } from '../../data/aircraft';
import { pairTimes } from '../../engine/schedule';
import type { Airline, GameState } from '../../engine/state';
import { hasDay, shiftDays, wrapDay } from '../../engine/timetable';
import type { EngineWorld } from '../../engine/world';
import { useSettings } from '../../settings/settings';
import { daysText, hhmm, weekdayNames } from '../game/timetableText';

interface Row {
  flight: string;
  from: string;
  to: string;
  dep: number;
  arr: number;
  days: number;
  registration: string;
  type: string;
  out: boolean;
  /** The flight's most recent operation (Phase 9.2), for a link to its page. */
  last?: string;
}

/** All of the airline's flights as a departures board (local times), filterable by weekday. */
export function DeparturesBoard({ game, world, airline, code }: { game: GameState; world: EngineWorld; airline: Airline; code: (id: string) => string }) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const [day, setDay] = useState<number | null>(null);
  const names = weekdayNames(language);

  const rows: Row[] = [];
  const known = knownFlights(game);
  for (const pair of Object.values(game.flights)) {
    const route = game.routes[pair.routeId];
    const aircraft = game.aircraft[pair.aircraftId];
    if (!route || !aircraft || route.airlineId !== airline.id) continue;
    const times = pairTimes(world, aircraft.typeId, route, pair, game.time);
    const back = wrapDay(times.backDep);
    const common = { registration: aircraft.registration, type: getAircraftType(aircraft.typeId).name };
    const lastOf = (dir: 0 | 1) => {
      const f = known.filter((x) => x.pairId === pair.id && x.dir === dir && x.dep <= game.time).at(-1);
      return f ? flightId(f) : undefined;
    };
    rows.push({ ...common, last: lastOf(0), flight: `${airline.iata} ${pair.flightNumber}`, from: route.originId, to: route.destinationId, dep: times.outDep, arr: times.outArr, days: pair.days, out: true });
    rows.push({
      ...common,
      flight: `${airline.iata} ${pair.flightNumber + 1}`,
      last: lastOf(1),
      from: route.destinationId,
      to: route.originId,
      dep: back.min,
      // Arrival relative to the return flight's own departure day.
      arr: times.backArr - back.shift * 1440,
      days: shiftDays(pair.days, back.shift),
      out: false,
    });
  }
  const shown = rows.filter((r) => day === null || hasDay(r.days, day)).sort((a, b) => a.dep - b.dep || a.flight.localeCompare(b.flight));

  return (
    <div className="board">
      <div className="chips-row" role="group" aria-label={t('timetable.days')}>
        <button type="button" className="tt-day tt-day--wide" aria-pressed={day === null} onClick={() => setDay(null)}>
          {t('timetable.allDays')}
        </button>
        {names.map((n, d) => (
          <button key={d} type="button" className="tt-day tt-day--wide" aria-pressed={day === d} onClick={() => setDay(d)}>
            {n}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="muted">{t('timetable.noFlights')}</p>
      ) : (
        <div className="table-scroll">
          <table className="table board__table">
            <thead>
              <tr>
                <th>{t('timetable.flight')}</th>
                <th>{t('timetable.from')}</th>
                <th>{t('timetable.to')}</th>
                <th className="num">{t('timetable.dep')}</th>
                <th className="num">{t('timetable.arr')}</th>
                <th>{t('timetable.days')}</th>
                <th>{t('network.aircraft')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => {
                const arr = hhmm(r.arr);
                return (
                  <tr key={i} className={r.out ? '' : 'board__return'}>
                    <td className="mono">{r.last ? <a href={hrefFor('flight', { id: r.last })}>{r.flight}</a> : r.flight}</td>
                    <td className="mono">{code(r.from)}</td>
                    <td className="mono">{code(r.to)}</td>
                    <td className="num mono board__time">{hhmm(r.dep).time}</td>
                    <td className="num mono">
                      {arr.time}
                      {arr.dayShift && <sup>{arr.dayShift}</sup>}
                    </td>
                    <td className="mono">{daysText(r.days)}</td>
                    <td className="mono small">
                      {r.registration} <span className="muted">{r.type}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">{t('timetable.boardNote')}</p>
    </div>
  );
}

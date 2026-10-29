import { useTranslation } from 'react-i18next';
import { stationOf } from '../../engine/bases';
import { getAircraftType, TURNAROUND_MIN } from '../../data/aircraft';
import { MAX_GROUND_MIN, pairTimes, type FlightSpec } from '../../engine/schedule';
import type { GameState, Route } from '../../engine/state';
import { DAYS_ALL } from '../../engine/timetable';
import type { EngineWorld } from '../../engine/world';
import { useSettings } from '../../settings/settings';
import { AircraftTimeline } from '../components/AircraftTimeline';
import { hhmmText, weekdayNames } from '../game/timetableText';

/** A sensible next flight: after the last one of that aircraft on this route has come back, else 07:00. */
export function nextSpec(game: GameState, world: EngineWorld, route: Route, specs: readonly FlightSpec[], fleet: string[]): FlightSpec {
  const last = specs.at(-1);
  const aircraftId = last?.aircraftId ?? fleet[0] ?? '';
  const aircraft = game.aircraft[aircraftId];
  const turn = aircraft ? TURNAROUND_MIN[getAircraftType(aircraft.typeId).category] : 40;
  if (last && aircraft) {
    const back = pairTimes(world, aircraft.typeId, route, last, game.time).backArr + turn;
    const dep = Math.ceil(back / 5) * 5;
    if (dep <= 21 * 60) return { aircraftId, dep, days: last.days, groundMin: turn };
  }
  return { aircraftId, dep: 7 * 60, days: DAYS_ALL, groundMin: turn };
}

/** Detailed scheduling: the route's flight pairs with aircraft, departure time, weekdays and ground time. */
export function TimetableEditor({
  game,
  world,
  route,
  specs,
  numbers,
  errorIndex,
  onChange,
  code,
}: {
  game: GameState;
  world: EngineWorld;
  route: Route;
  specs: FlightSpec[];
  /** Flight numbers of existing pairs by id. */
  numbers: Map<string, number>;
  errorIndex: number | null;
  onChange: (specs: FlightSpec[]) => void;
  code: (airportId: string) => string;
}) {
  const { t } = useTranslation();
  const { language } = useSettings();
  // Only aircraft stationed where the route starts (Phase 7.4).
  const airline = game.airlines[route.airlineId];
  const fleet = Object.values(game.aircraft).filter((a) => a.airlineId === route.airlineId && stationOf(airline, a) === route.originId);
  const names = weekdayNames(language, 'narrow');
  const update = (i: number, change: Partial<FlightSpec>) => onChange(specs.map((s, j) => (j === i ? { ...s, ...change } : s)));
  const hub = code(route.originId);
  const dest = code(route.destinationId);

  return (
    <div className="tt-editor">
      {specs.length === 0 && <p className="muted">{t('timetable.empty')}</p>}
      <ol className="tt-list">
        {specs.map((spec, i) => {
          const aircraft = game.aircraft[spec.aircraftId];
          const times = aircraft ? pairTimes(world, aircraft.typeId, route, spec, game.time) : null;
          const minGround = aircraft ? TURNAROUND_MIN[getAircraftType(aircraft.typeId).category] : 0;
          const number = spec.id ? numbers.get(spec.id) : undefined;
          return (
            <li key={i} className={`tt-row${errorIndex === i ? ' tt-row--error' : ''}`}>
              <div className="tt-row__head">
                <span className="mono tt-row__flight">
                  {number ? `${airline?.iata ?? ''} ${number}/${number + 1}` : t('timetable.newFlight')}
                </span>
                <button type="button" className="button button--small" onClick={() => onChange(specs.filter((_, j) => j !== i))} aria-label={t('timetable.remove')}>
                  ✕
                </button>
              </div>
              <div className="tt-row__fields">
                <label className="field">
                  <span className="field__label">{t('network.aircraft')}</span>
                  <select className="input" value={spec.aircraftId} onChange={(e) => update(i, { aircraftId: e.target.value })}>
                    {fleet.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.registration} · {getAircraftType(a.typeId).name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="field__label">{t('timetable.departure', { airport: hub })}</span>
                  {/* Two pickers instead of <input type="time">: always 24-hour time, as in aviation, on every device. */}
                  <span className="tt-time">
                    <select className="input mono" aria-label={t('timetable.hour')} value={Math.floor(spec.dep / 60)} onChange={(e) => update(i, { dep: Number(e.target.value) * 60 + (spec.dep % 60) })}>
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>
                          {String(h).padStart(2, '0')}
                        </option>
                      ))}
                    </select>
                    <span className="mono">:</span>
                    <select className="input mono" aria-label={t('timetable.minute')} value={spec.dep % 60} onChange={(e) => update(i, { dep: Math.floor(spec.dep / 60) * 60 + Number(e.target.value) })}>
                      {Array.from({ length: 12 }, (_, k) => (
                        <option key={k} value={k * 5}>
                          {String(k * 5).padStart(2, '0')}
                        </option>
                      ))}
                    </select>
                  </span>
                </label>
                <label className="field">
                  <span className="field__label">{t('timetable.ground', { airport: dest })}</span>
                  <input
                    type="number"
                    className="input mono"
                    min={minGround}
                    max={MAX_GROUND_MIN}
                    step={5}
                    value={spec.groundMin}
                    onChange={(e) => update(i, { groundMin: Math.max(0, Math.round(Number(e.target.value) / 5) * 5) })}
                  />
                </label>
              </div>
              <div className="tt-days" role="group" aria-label={t('timetable.days')}>
                {names.map((n, d) => (
                  <button
                    key={d}
                    type="button"
                    className="tt-day"
                    aria-pressed={(spec.days & (1 << d)) !== 0}
                    onClick={() => update(i, { days: spec.days ^ (1 << d) })}
                  >
                    {n}
                  </button>
                ))}
                <button type="button" className="button button--small" onClick={() => update(i, { days: DAYS_ALL })}>
                  {t('timetable.daily')}
                </button>
              </div>
              {times && (
                <p className="mono small tt-row__times">
                  {hub} {hhmmText(times.outDep)} → {dest} {hhmmText(times.outArr)} · {dest} {hhmmText(times.backDep)} → {hub} {hhmmText(times.backArr)}
                  {spec.groundMin >= 8 * 60 && <span className="chip chip--planned"> {t('timetable.nightStop')}</span>}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        className="button"
        disabled={!fleet.length}
        onClick={() => onChange([...specs, nextSpec(game, world, route, specs, fleet.map((a) => a.id))])}
      >
        + {t('timetable.add')}
      </button>
      <p className="muted small">{t('timetable.hint', { hub, dest })}</p>
      {[...new Set(specs.map((s) => s.aircraftId))].map((id) => (
        <div key={id} className="tt-timeline">
          <span className="field__label">
            {t('timeline.title', { registration: game.aircraft[id]?.registration ?? '' })}
          </span>
          <AircraftTimeline game={game} world={world} aircraftId={id} draft={{ route, specs }} code={code} />
        </div>
      ))}
    </div>
  );
}

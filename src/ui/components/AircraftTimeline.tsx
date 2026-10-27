import { useTranslation } from 'react-i18next';
import { getAircraftType, TURNAROUND_MIN } from '../../data/aircraft';
import { pairBlocks, type FlightSpec } from '../../engine/schedule';
import type { GameState, Route } from '../../engine/state';
import { hasDay } from '../../engine/timetable';
import type { EngineWorld } from '../../engine/world';
import { useSettings } from '../../settings/settings';
import { hhmmText, weekdayNames } from '../game/timetableText';

const WEEK = 7 * 1440;

interface Item {
  route: Route;
  dep: number;
  days: number;
  groundMin: number;
  flightNumber: number | null;
  draft: boolean;
}

interface Bar {
  start: number;
  end: number;
  kind: 'out' | 'ground' | 'back' | 'turn';
  label: string;
  title: string;
  draft: boolean;
  conflict: boolean;
}

/**
 * One aircraft's week as a rotation chart (hub local time, Monday on top): flights out and back, the time on the
 * ground at the destination, and the minimum turnaround at the hub. A route being edited is drawn in magenta
 * ("planned"); flights that collide are red.
 */
export function AircraftTimeline({
  game,
  world,
  aircraftId,
  draft,
  code,
}: {
  game: GameState;
  world: EngineWorld;
  aircraftId: string;
  /** A route's timetable being edited (replaces that route's saved pairs). */
  draft?: { route: Route; specs: readonly FlightSpec[] };
  code: (airportId: string) => string;
}) {
  const { t } = useTranslation();
  const { language } = useSettings();
  const aircraft = game.aircraft[aircraftId];
  if (!aircraft) return null;
  const turn = TURNAROUND_MIN[getAircraftType(aircraft.typeId).category];

  const items: Item[] = [
    ...Object.values(game.flights)
      .filter((p) => p.aircraftId === aircraftId && p.routeId !== draft?.route.id && game.routes[p.routeId])
      .map((p) => ({ route: game.routes[p.routeId]!, dep: p.dep, days: p.days, groundMin: p.groundMin, flightNumber: p.flightNumber, draft: false })),
    ...(draft?.specs ?? [])
      .filter((s) => s.aircraftId === aircraftId)
      .map((s) => ({ route: draft!.route, dep: s.dep, days: s.days, groundMin: s.groundMin, flightNumber: null, draft: true })),
  ];

  // Busy time per item and day, to find collisions.
  const busy = items.map((item) => {
    const { out, back } = pairBlocks(world, aircraft.typeId, item.route);
    return [0, 1, 2, 3, 4, 5, 6].filter((d) => hasDay(item.days, d)).map((d) => [d * 1440 + item.dep, d * 1440 + item.dep + out + item.groundMin + back + turn] as const);
  });
  const collides = (a: readonly [number, number], b: readonly [number, number]) => [-WEEK, 0, WEEK].some((s) => a[0] < b[1] + s && b[0] + s < a[1]);

  const bars: Bar[] = [];
  items.forEach((item, i) => {
    const { out, back } = pairBlocks(world, aircraft.typeId, item.route);
    const dest = code(item.route.destinationId);
    const hub = code(item.route.originId);
    busy[i]!.forEach((interval) => {
      const conflict = busy.some((other, j) => j !== i && other.some((o) => collides(interval, o)));
      const s = interval[0];
      const parts: [number, number, Bar['kind'], string, string][] = [
        [s, s + out, 'out', dest, `${hub}–${dest} ${hhmmText(s % 1440)}`],
        [s + out, s + out + item.groundMin, 'ground', '', `${dest} ${t('timeline.ground', { minutes: item.groundMin })}`],
        [s + out + item.groundMin, s + out + item.groundMin + back, 'back', hub, `${dest}–${hub}`],
        [s + out + item.groundMin + back, s + out + item.groundMin + back + turn, 'turn', '', t('timeline.turn')],
      ];
      for (const [a, b, kind, label, title] of parts) bars.push({ start: a, end: b, kind, label, title, draft: item.draft, conflict });
    });
  });

  // Split bars at midnight so each lands in its day's row (the week wraps from Sunday to Monday).
  const rows: Bar[][] = [[], [], [], [], [], [], []];
  for (const bar of bars) {
    let a = ((bar.start % WEEK) + WEEK) % WEEK;
    let left = bar.end - bar.start;
    let first = true;
    while (left > 0) {
      const day = Math.floor(a / 1440);
      const inDay = Math.min(left, (day + 1) * 1440 - a);
      rows[day % 7]!.push({ ...bar, start: a - day * 1440, end: a - day * 1440 + inDay, label: first ? bar.label : '' });
      first = false;
      left -= inDay;
      a = (a + inDay) % WEEK;
    }
  }

  const names = weekdayNames(language);
  return (
    <div className="timeline" role="img" aria-label={t('timeline.label', { registration: aircraft.registration })}>
      <div className="timeline__hours" aria-hidden="true">
        {[0, 6, 12, 18].map((h) => (
          <span key={h} style={{ left: `${(h / 24) * 100}%` }}>
            {String(h).padStart(2, '0')}
          </span>
        ))}
      </div>
      {rows.map((row, d) => (
        <div key={d} className="timeline__row">
          <span className="timeline__day">{names[d]}</span>
          <div className="timeline__track">
            {row.map((bar, k) => (
              <span
                key={k}
                className={`timeline__bar timeline__bar--${bar.kind}${bar.draft ? ' timeline__bar--draft' : ''}${bar.conflict ? ' timeline__bar--conflict' : ''}`}
                style={{ left: `${(bar.start / 1440) * 100}%`, width: `${((bar.end - bar.start) / 1440) * 100}%` }}
                title={bar.title}
              >
                {bar.end - bar.start >= 75 ? bar.label : ''}
              </span>
            ))}
          </div>
        </div>
      ))}
      <p className="muted small">{t('timeline.note')}</p>
    </div>
  );
}

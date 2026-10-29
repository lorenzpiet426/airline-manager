// Turns the timetable (flight pairs, see schedule.ts) into actual flights with UTC times, so the map can show where
// every aircraft is. Each aircraft repeats the same week.
import { pairBlocks, pairsOfAircraft } from './schedule';
import { bearing, intermediatePoint } from './geo';
import type { GameState } from './state';
import { MINUTES_PER_DAY, MINUTES_PER_WEEK, startOfWeek, utcOffsetMin, type SimTime } from './time';
import { hasDay } from './timetable';
import type { EngineWorld } from './world';

export interface Leg {
  routeId: string;
  /** The flight pair and direction (0 = out, 1 = back), for links to the flight's page. */
  pairId: string;
  dir: 0 | 1;
  aircraftId: string;
  flightNumber: number;
  fromId: string;
  toId: string;
  /** Minutes after Monday 00:00 UTC (may run past the end of the week). */
  dep: number;
  arr: number;
}

/** The repeating weekly pattern of one aircraft, in UTC, sorted by departure. */
export function weeklyLegs(state: GameState, world: EngineWorld, aircraftId: string): Leg[] {
  const aircraft = state.aircraft[aircraftId];
  if (!aircraft) return [];
  const legs: Leg[] = [];
  for (const pair of pairsOfAircraft(state, aircraftId)) {
    const route = state.routes[pair.routeId];
    const hub = route && world.airportById.get(route.originId);
    if (!route || !hub) continue;
    const { out, back } = pairBlocks(world, aircraft.typeId, route);
    const offset = utcOffsetMin(hub.tz, state.time);
    for (let day = 0; day < 7; day++) {
      if (!hasDay(pair.days, day)) continue;
      // Hub local time → UTC; a departure just after local midnight on Monday belongs to the end of the UTC week.
      let dep = day * MINUTES_PER_DAY + pair.dep - offset;
      if (dep < 0) dep += MINUTES_PER_WEEK;
      const common = { routeId: route.id, aircraftId, pairId: pair.id };
      legs.push({ ...common, dir: 0, flightNumber: pair.flightNumber, fromId: route.originId, toId: route.destinationId, dep, arr: dep + out });
      const backDep = dep + out + pair.groundMin;
      legs.push({ ...common, dir: 1, flightNumber: pair.flightNumber + 1, fromId: route.destinationId, toId: route.originId, dep: backDep, arr: backDep + back });
    }
  }
  return legs.sort((a, b) => a.dep - b.dep);
}

export interface AirborneFlight {
  leg: Leg;
  lat: number;
  lon: number;
  /** Course over ground in degrees. */
  heading: number;
  /** 0 … 1 of the flight completed. */
  progress: number;
  /** Scheduled departure (UTC) of this operation of the leg. */
  scheduledDep: SimTime;
}

/** Today's operation of a leg (Phase 9.1): minutes late at departure and arrival, a diversion, or null if cancelled. */
export type LegAdjust = (leg: Leg, scheduledDep: SimTime) => { dep: number; arr: number; toId?: string } | null;

/** Which of these legs is in the air at `time`, and where (with today's delays when `adjust` is given). */
export function airborne(legs: readonly Leg[], world: EngineWorld, time: SimTime, adjust?: LegAdjust): AirborneFlight | null {
  const week = startOfWeek(time);
  const minute = time - week;
  for (const leg of legs) {
    // A leg can belong to the end of last week's pattern (after Sunday midnight) or this week's.
    for (const m of [minute, minute + MINUTES_PER_WEEK]) {
      const scheduled = week + leg.dep - (m === minute ? 0 : MINUTES_PER_WEEK);
      const late = adjust ? adjust(leg, scheduled) : { dep: 0, arr: 0 };
      if (!late) continue;
      const dep = leg.dep + late.dep;
      const arr = Math.max(dep + 1, leg.arr + late.arr);
      if (m >= dep && m < arr) {
        const from = world.airportById.get(leg.fromId);
        const to = world.airportById.get(late.toId ?? leg.toId);
        if (!from || !to) return null;
        const progress = (m - dep) / (arr - dep);
        const here = intermediatePoint(from, to, progress);
        const ahead = intermediatePoint(from, to, Math.min(1, progress + 0.01));
        return { leg, lat: here.lat, lon: here.lon, heading: bearing(here, ahead), progress, scheduledDep: scheduled };
      }
    }
  }
  return null;
}

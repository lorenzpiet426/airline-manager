// Turns "VIE–LHR 14× per week on OE-LAB" into actual flights with times, so the map can show
// where every aircraft is. Simple scheduling: each aircraft repeats the same week; the first
// departure of a day is at 06:00 hub time and nobody departs after 21:00 hub time.
import { getAircraftType, TURNAROUND_MIN } from '../data/aircraft';
import type { Airport } from '../data/types';
import { blockHours } from './economics';
import { bearing, intermediatePoint } from './geo';
import type { GameState, Route } from './state';
import { MINUTES_PER_DAY, MINUTES_PER_WEEK, startOfWeek, type SimTime } from './time';
import type { EngineWorld } from './world';

export interface Leg {
  routeId: string;
  aircraftId: string;
  flightNumber: number;
  fromId: string;
  toId: string;
  /** Minutes after Monday 00:00 UTC (may run past the end of the week). */
  dep: number;
  arr: number;
}

const FIRST_DEPARTURE_H = 6;
const LAST_DEPARTURE_H = 21;

/** Hub local time is approximated from longitude (15° = 1 hour); good enough for a weekly pattern. */
const hubOffsetMin = (hub: Airport) => Math.round(hub.lon / 15) * 60;

/** The repeating weekly pattern of one aircraft. */
export function weeklyLegs(state: GameState, world: EngineWorld, aircraftId: string): Leg[] {
  const aircraft = state.aircraft[aircraftId];
  if (!aircraft) return [];
  const routes = Object.values(state.routes)
    .filter((r) => r.aircraftId === aircraftId)
    .sort((a, b) => a.flightNumber - b.flightNumber);
  if (!routes.length) return [];
  const hub = world.airportById.get(routes[0]!.originId);
  if (!hub) return [];
  const type = getAircraftType(aircraft.typeId);
  const turn = TURNAROUND_MIN[type.category];
  const offset = hubOffsetMin(hub);

  // Interleave the routes so that each one's flights spread over the week: per pass, a route
  // with three times the frequency of the smallest gets three round trips.
  const queue: Route[] = [];
  const left = new Map(routes.map((r) => [r.id, r.frequency]));
  const smallest = Math.min(...routes.map((r) => r.frequency));
  while ([...left.values()].some((n) => n > 0)) {
    for (const r of routes) {
      const per = Math.max(1, Math.round(r.frequency / smallest));
      for (let i = 0; i < per && left.get(r.id)! > 0; i++) {
        queue.push(r);
        left.set(r.id, left.get(r.id)! - 1);
      }
    }
  }

  const legs: Leg[] = [];
  const localDay = (t: number) => Math.floor((t + offset) / MINUTES_PER_DAY);
  const localMin = (t: number) => (((t + offset) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  let cursor = FIRST_DEPARTURE_H * 60 - offset; // Monday 06:00 hub time, in minutes after Monday 00:00 UTC
  for (const route of queue) {
    const tod = localMin(cursor);
    if (tod > LAST_DEPARTURE_H * 60 || tod < FIRST_DEPARTURE_H * 60) {
      // Night stop: wait for 06:00 hub time.
      const nextDay = localDay(cursor) + (tod > LAST_DEPARTURE_H * 60 ? 1 : 0);
      cursor = nextDay * MINUTES_PER_DAY + FIRST_DEPARTURE_H * 60 - offset;
    }
    const block = Math.round(blockHours(type, route.distanceKm) * 60);
    const out = { dep: cursor, arr: cursor + block };
    const back = { dep: out.arr + turn, arr: out.arr + turn + block };
    legs.push({ routeId: route.id, aircraftId, flightNumber: route.flightNumber, fromId: route.originId, toId: route.destinationId, ...out });
    legs.push({ routeId: route.id, aircraftId, flightNumber: route.flightNumber + 1, fromId: route.destinationId, toId: route.originId, ...back });
    cursor = back.arr + turn;
  }
  return legs;
}

export interface AirborneFlight {
  leg: Leg;
  lat: number;
  lon: number;
  /** Course over ground in degrees. */
  heading: number;
  /** 0 … 1 of the flight completed. */
  progress: number;
}

/** Which of these legs is in the air at `time`, and where. */
export function airborne(legs: readonly Leg[], world: EngineWorld, time: SimTime): AirborneFlight | null {
  const minute = time - startOfWeek(time);
  for (const leg of legs) {
    // A leg can belong to the end of last week's pattern (after Sunday midnight) or this week's.
    for (const m of [minute, minute + MINUTES_PER_WEEK]) {
      if (m >= leg.dep && m < leg.arr) {
        const from = world.airportById.get(leg.fromId);
        const to = world.airportById.get(leg.toId);
        if (!from || !to) return null;
        const progress = (m - leg.dep) / (leg.arr - leg.dep);
        const here = intermediatePoint(from, to, progress);
        const ahead = intermediatePoint(from, to, Math.min(1, progress + 0.01));
        return { leg, lat: here.lat, lon: here.lon, heading: bearing(here, ahead), progress };
      }
    }
  }
  return null;
}

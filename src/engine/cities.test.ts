// Cities with several airports (fix after Phase 8.3): Paris CDG/Orly, London, Milan, Vienna/Bratislava.
import { describe, expect, it } from 'vitest';
import airportsJson from '../data/generated/airports.json';
import countriesJson from '../data/generated/countries.json';
import airlinesJson from '../data/generated/airlines.json';
import networksJson from '../data/generated/networks.json';
import detailsJson from '../data/generated/airline-details.json';
import registersJson from '../data/generated/registers.json';
import eurostatJson from '../data/generated/routes-eurostat.json';
import { getAircraftType } from '../data/aircraft';
import type { Airport, Country } from '../data/types';
import { advance } from './advance';
import { economyCabin } from './cabins';
import { applyCommand } from './commands';
import { createGame } from './game';
import { routeOutlook } from './managers';
import { nearbyAirports, nearbyCompetitors } from './economics';
import { buildRealAirlines } from './realAirlines';
import { simTime } from './time';
import { DAYS_ALL } from './timetable';
import { buildEngineWorld } from './world';

const real = buildRealAirlines(airlinesJson as never, networksJson as never, detailsJson as never, registersJson as never, eurostatJson);
const world = buildEngineWorld(airportsJson as Airport[], countriesJson as unknown as Record<string, Country>, real);
const A320 = getAircraftType('A20N');
const DAY = 24 * 60;

function airline() {
  const state = createGame({ seed: 7, startYear: 2026, startTime: simTime(2026, 3, 2), timeMode: 'weekly', realism: 'realistic', scheduling: 'detailed' });
  const founded = applyCommand(state, world, {
    type: 'FoundAirline',
    payload: { name: 'Test Air', iata: 'T7', icao: 'TST', primary: '#c8102e', secondary: '#ffffff', hubId: 'LOWW', capitalEur: 200_000_000, controller: 'human' },
  });
  const airlineId = (founded as { id: string }).id;
  for (const id of ['T1', 'T2']) {
    state.aircraft[id] = {
      id, typeId: 'A20N', airlineId, registration: `OE-L${id}`, builtYear: 2020, seats: 180, cabin: economyCabin(A320, 180), status: 'active', deliveryAt: state.time, locationId: 'LOWW',
      lease: { lessor: 'AerCap', monthlyRent: { amount: 380_000, currency: 'USD' }, deposit: { amount: 760_000, currency: 'USD' }, startAt: state.time, endAt: state.time + 3 * 365 * DAY },
    };
  }
  delete state.airlines[airlineId]!.crew;
  for (const [dest, dep] of [['LEMG', 7 * 60], ['EGLL', 15 * 60]] as const) {
    if (dest === 'EGLL') continue;
    expect(applyCommand(state, world, { type: 'OpenRoute', airlineId, payload: { destinationId: dest, aircraftId: '', frequency: 0, fareFactor: 1, flights: [{ aircraftId: 'T1', dep, days: DAYS_ALL, groundMin: 45 }] } }).ok).toBe(true);
  }
  advance(state, world, state.time + DAY);
  return { state, airlineId, a: () => state.airlines[airlineId]! };
}

describe('cities with several airports', () => {
  it('knows which airports serve the same city', () => {
    const near = (id: string) => nearbyAirports(world, world.airportById.get(id)!).map((x) => x.airport.id);
    expect(near('LFPG')).toContain('LFPO');
    expect(near('EGLL')).toEqual(expect.arrayContaining(['EGKK', 'EGSS', 'EGGW', 'EGLC']));
    expect(near('LOWW')).toContain('LZIB');
    expect(near('LOWW')).not.toContain('LOWL');
    const s = nearbyAirports(world, world.airportById.get('LFPG')!).find((x) => x.airport.id === 'LFPO')!.s;
    expect(s).toBeGreaterThan(0.5);
    expect(s).toBeLessThan(0.65);
  });

  it('Vienna–Orly competes with the Vienna–CDG flights: no easy profits at a city’s second airport', () => {
    const results = ['LFPO', 'LFPG'].map((dest) => {
      const { state, airlineId } = airline();
      const r = applyCommand(state, world, { type: 'OpenRoute', airlineId, payload: { destinationId: dest, aircraftId: '', frequency: 0, fareFactor: 1, flights: [{ aircraftId: 'T2', dep: 9 * 60, days: DAYS_ALL, groundMin: 45 }] } });
      expect(r.ok).toBe(true);
      const o = routeOutlook(state, world, state.routes[(r as { id: string }).id]!, 1, 1)!;
      return o.result / o.revenue;
    });
    // Before the fix Orly made ≈ 52 % before crews and leases (no competition, double-counted travellers).
    expect(results[0]).toBeLessThan(0.15);
    expect(Math.abs(results[0]! - results[1]!)).toBeLessThan(0.15);
    const vie = world.airportById.get('LOWW')!;
    const ory = world.airportById.get('LFPO')!;
    expect(nearbyCompetitors(world, vie, ory).some((n) => n.to.id === 'LFPG' && n.competitors.some((c) => c.airlineId === 'AUA'))).toBe(true);
  }, 120_000);
});

// Phase 7.1: connecting passengers flight by flight at the player's hub.
import { describe, expect, it } from 'vitest';
import airportsJson from '../data/generated/airports.json';
import countriesJson from '../data/generated/countries.json';
import airlinesJson from '../data/generated/airlines.json';
import networksJson from '../data/generated/networks.json';
import detailsJson from '../data/generated/airline-details.json';
import registersJson from '../data/generated/registers.json';
import eurostatJson from '../data/generated/routes-eurostat.json';
import type { Airport, Country } from '../data/types';
import { applyCommand } from './commands';
import { createGame } from './game';
import { buildRealAirlines } from './realAirlines';
import { simTime } from './time';
import { connectionQuality, hubFlights, mctAt, playerConnections, routeTransfers } from './transfers';
import { buildEngineWorld } from './world';

const real = buildRealAirlines(airlinesJson as never, networksJson as never, detailsJson as never, registersJson as never, eurostatJson);
const world = buildEngineWorld(airportsJson as Airport[], countriesJson as unknown as Record<string, Country>, real);
const vie = world.airportById.get('LOWW')!;

function austrian() {
  const state = createGame({ seed: 3, startYear: 2026, startTime: simTime(2026, 11, 2), timeMode: 'weekly', realism: 'realistic', scheduling: 'detailed' }, world);
  const result = applyCommand(state, world, { type: 'TakeOverAirline', payload: { realId: 'AUA' } });
  return { state, id: (result as { id: string }).id };
}

describe('connections at the hub (7.1)', () => {
  it('need the minimum connecting time and lose travellers on long waits', () => {
    expect(mctAt(vie, false)).toBe(25); // Vienna, the shortest of Europe's big hubs
    expect(mctAt(vie, true)).toBe(35);
    expect(connectionQuality(20, 25, 1000)).toBe(0);
    expect(connectionQuality(25, 25, 1000)).toBe(1);
    expect(connectionQuality(140, 25, 1000)).toBe(1);
    expect(connectionQuality(300, 25, 1000)).toBeGreaterThan(0);
    expect(connectionQuality(300, 25, 1000)).toBeLessThan(1);
    expect(connectionQuality(500, 25, 1000)).toBe(0);
    // Long journeys: travellers wait longer.
    expect(connectionQuality(500, 35, 8000)).toBeGreaterThan(0);
  });

  it('put connecting passengers on the flights that really connect', () => {
    const { state, id } = austrian();
    const pc = playerConnections(world, state, id, 'LOWW');
    expect(pc.connections.length).toBeGreaterThan(1000);
    // Every connection respects the minimum connecting time.
    for (const c of pc.connections.slice(0, 2000)) expect(c.wait).toBeGreaterThanOrEqual(25);
    // A route's transfer passengers sit on its own flights: the per-flight numbers add up to the leg total (own
    // connections plus partners' passengers).
    for (const route of Object.values(state.routes).slice(0, 30)) {
      const [out, back] = routeTransfers(world, state, route);
      for (const leg of [out, back]) {
        if (!leg || leg.pax <= 0) continue;
        const sum = [...leg.perFlight!.values()].reduce((s, days) => s + days.reduce((x, y) => x + y, 0), 0);
        expect(sum).toBeCloseTo(leg.pax, 3);
      }
    }
  }, 60_000);

  it('the takeover timetable flies in waves: most departures leave with a bank', () => {
    const { state, id } = austrian();
    const out = [...hubFlights(world, state, id, 'LOWW').out.values()].flat();
    const waves = [420, 630, 810, 1020, 1230];
    const inWave = out.filter((f) => waves.some((w) => Math.abs((f.at % 1440) - w) <= 30)).length;
    expect(inWave / out.length).toBeGreaterThan(0.6);
  }, 60_000);
});

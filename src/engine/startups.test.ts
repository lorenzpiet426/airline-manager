// Phase 6.4: fictional startup airlines in games with real airlines.
import { describe, expect, it } from 'vitest';
import airportsJson from '../data/generated/airports.json';
import countriesJson from '../data/generated/countries.json';
import airlinesJson from '../data/generated/airlines.json';
import networksJson from '../data/generated/networks.json';
import detailsJson from '../data/generated/airline-details.json';
import registersJson from '../data/generated/registers.json';
import eurostatJson from '../data/generated/routes-eurostat.json';
import historyJson from '../data/generated/airline-history.json';
import fxJson from '../data/generated/fx-history.json';
import airportHistoryJson from '../data/generated/airport-history.json';
import type { Airport, Country } from '../data/types';
import { advance } from './advance';
import { competitorsOn } from './economics';
import { createGame } from './game';
import { buildRealAirlines } from './realAirlines';
import { withStartups } from './startups';
import type { GameState } from './state';
import { simTime, toDate } from './time';
import { worldCache } from './world';

const real = buildRealAirlines(airlinesJson as never, networksJson as never, detailsJson as never, registersJson as never, eurostatJson, historyJson as never);
const worldAt = worldCache({ airports: airportsJson as Airport[], countries: countriesJson as unknown as Record<string, Country>, realAirlines: real, fxHistory: fxJson as never, airportHistory: airportHistoryJson as never });
const provider = (s: GameState) => worldAt(s.options.startYear, toDate(s.time));

function run(startYear: number | undefined, from: number, to: number) {
  const start = simTime(from, 1, 1);
  const options = { seed: 11, ...(startYear !== undefined ? { startYear } : {}), startTime: start, timeMode: 'weekly', realism: 'realistic', scheduling: 'simple' } as Parameters<typeof createGame>[0];
  const state = createGame(options, provider({ options: { startYear }, time: start } as GameState));
  advance(state, provider, simTime(to, 1, 1));
  return state;
}

describe('fictional startups (6.4)', () => {
  it("a few a year in today's free markets: they fly, compete, and some fail", () => {
    const state = run(undefined, 2027, 2029);
    const startups = Object.values(state.ai.startups ?? {});
    expect(startups.length).toBeGreaterThanOrEqual(6);
    expect(startups.length).toBeLessThanOrEqual(35);
    // Made-up names and codes that no real airline uses.
    const realNames = new Set([...real.byId.values()].map((a) => a.name));
    const realCodes = new Set([...real.byId.values()].flatMap((a) => [a.iata, a.icao]));
    for (const s of startups) {
      expect(realNames.has(s.name)).toBe(false);
      expect(realCodes.has(s.iata) || realCodes.has(s.icao)).toBe(false);
    }
    expect(new Set(startups.map((s) => s.name)).size).toBe(startups.length);
    const alive = startups.filter((s) => state.ai.airlines[s.id]?.status === 'active');
    expect(alive.length).toBeGreaterThan(0);
    // A living startup is a competitor on its routes.
    const w = withStartups(provider(state), state);
    const s = alive[0]!;
    const [key] = Object.entries(state.ai.routes).find(([k, r]) => k.startsWith(`${s.id}|`) && !r.closed)!;
    const [, a, b] = key.split('|');
    expect(competitorsOn(w, w.airportById.get(a!)!, w.airportById.get(b!)!, undefined, state.ai)!.some((c) => c.airlineId === s.id)).toBe(true);
    expect(state.messages.some((m) => m.kind === 'startupFounded')).toBe(true);
  }, 300_000);

  it('none in 1975, when fares were still fixed everywhere', () => {
    const state = run(1975, 1975, 1976);
    expect(Object.keys(state.ai.startups ?? {})).toHaveLength(0);
  }, 300_000);
});

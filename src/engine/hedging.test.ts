// Phase 10.2: fuel and currency hedging.
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
import { callPremium, forwardFuel, forwardFx } from './hedging';
import { buildRealAirlines } from './realAirlines';
import { simTime } from './time';
import { DAYS_ALL } from './timetable';
import { buildEngineWorld } from './world';
import { slow } from '../testing/slow';

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

const LADDER_POLICY = { fuel: [0.8, 0.6, 0.3] as [number, number, number], fx: [0.8, 0.5, 0.2] as [number, number, number], optionShare: 0.5, strikeOffset: 0.1 };

describe('fuel and currency hedging (10.2)', () => {
  it('prices: forward fuel drifts to the average, dollars follow interest rates, options cost more for longer', () => {
    expect(forwardFuel(4, 2.5, 1)).toBeGreaterThan(forwardFuel(4, 2.5, 12));
    expect(forwardFuel(4, 2.5, 24)).toBeGreaterThan(2.5);
    // Euro rates below dollar rates: dollars are cheaper forward.
    expect(forwardFx(0.9, 2, 4, 12)).toBeLessThan(0.9);
    expect(callPremium(2.5, 2.75, 12, 4)).toBeGreaterThan(callPremium(2.5, 2.75, 1, 4));
    expect(callPremium(2.5, 2.75, 12, 4)).toBeGreaterThan(0.05);
  });

  it('the treasury fills the ladder; hedges bought before the March 2026 fuel spike pay off', () => {
    const { state, airlineId, a } = airline();
    advance(state, world, simTime(2026, 4, 2));
    expect(applyCommand(state, world, { type: 'SetHedgePolicy', airlineId, payload: { policy: LADDER_POLICY } }).ok).toBe(true);
    const h = a().hedging!;
    const months = new Set(h.contracts.map((c) => c.month));
    expect(months.size).toBeGreaterThanOrEqual(20);
    expect(h.contracts.some((c) => c.kind === 'fuelCall' && (c.premium ?? 0) > 0)).toBe(true);
    // The near months are hedged more than the far ones.
    const fuelIn = (k: string) => h.contracts.filter((c) => c.month === k && c.kind !== 'fxForward').reduce((n, c) => n + c.amount, 0);
    expect(fuelIn('2026-05')).toBeGreaterThan(fuelIn('2027-12'));
    advance(state, world, simTime(2026, 6, 2));
    expect(a().hedging!.settled.length).toBeGreaterThan(0);
  }, slow(240_000));

  it('margin calls: swaps far above the market need cash as collateral', () => {
    const { state, airlineId, a } = airline();
    applyCommand(state, world, { type: 'SetHedgePolicy', airlineId, payload: { policy: LADDER_POLICY } });
    // As if fuel had collapsed after the swaps were bought (2008, 2020).
    for (const c of a().hedging!.contracts) if (c.kind === 'fuelSwap') c.price *= 3;
    const cash = a().cash.amount;
    advance(state, world, state.time + 8 * DAY);
    expect(a().hedging!.collateral).toBeGreaterThan(0);
    expect(a().cash.amount).toBeLessThan(cash);
    expect(state.messages.some((m) => m.kind === 'marginCall')).toBe(true);
    expect(a().hedging!.value).toBeLessThan(0);
  }, slow(120_000));

  it('Austrian hedges like the Lufthansa Group from the start', () => {
    const state = createGame({ seed: 3, startYear: 2026, startTime: simTime(2026, 11, 2), timeMode: 'weekly', realism: 'realistic', scheduling: 'detailed' }, world);
    const r = applyCommand(state, world, { type: 'TakeOverAirline', payload: { realId: 'AUA' } });
    const id = (r as { id: string }).id;
    expect(state.airlines[id]!.hedging!.policy.fuel[0]).toBeGreaterThan(0.5);
    advance(state, world, simTime(2026, 12, 2));
    expect(state.airlines[id]!.hedging!.contracts.length).toBeGreaterThan(20);
  }, slow(300_000));
});

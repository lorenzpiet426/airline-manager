// Phase 7.4: bases away from the hub.
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
import { baseRight } from './bases';
import { economyCabin } from './cabins';
import { applyCommand } from './commands';
import { createGame } from './game';
import { buildRealAirlines } from './realAirlines';
import { simTime } from './time';
import { DAYS_ALL } from './timetable';
import { playerConnections } from './transfers';
import { buildEngineWorld } from './world';

const real = buildRealAirlines(airlinesJson as never, networksJson as never, detailsJson as never, registersJson as never, eurostatJson);
const world = buildEngineWorld(airportsJson as Airport[], countriesJson as unknown as Record<string, Country>, real);
const A320 = getAircraftType('A20N');

function startup() {
  const state = createGame({ seed: 1, startYear: 2026, startTime: simTime(2026, 11, 2), timeMode: 'weekly', realism: 'realistic', scheduling: 'detailed' });
  const founded = applyCommand(state, world, {
    type: 'FoundAirline',
    payload: { name: 'Danube Air', iata: 'D7', icao: 'DNB', primary: '#c8102e', secondary: '#ffffff', hubId: 'LOWW', capitalEur: 200_000_000, controller: 'human' },
  });
  const airlineId = (founded as { id: string }).id;
  for (const id of ['T1', 'T2', 'T3']) {
    state.aircraft[id] = {
      id, typeId: 'A20N', airlineId, registration: `OE-L${id}`, builtYear: 2020, seats: 180, cabin: economyCabin(A320, 180), status: 'active', deliveryAt: state.time, locationId: 'LOWW',
      lease: { lessor: 'AerCap', monthlyRent: { amount: 380_000, currency: 'USD' }, deposit: { amount: 760_000, currency: 'USD' }, startAt: state.time, endAt: state.time + 1e6 },
    };
  }
  return { state, airlineId };
}
type S = ReturnType<typeof startup>['state'];
const open = (state: S, airlineId: string, originId: string | undefined, dest: string, aircraftId: string, dep: number) =>
  applyCommand(state, world, {
    type: 'OpenRoute',
    airlineId,
    payload: { ...(originId ? { originId } : {}), destinationId: dest, aircraftId: '', frequency: 0, fareFactor: 1, flights: [{ aircraftId, dep, days: DAYS_ALL, groundMin: 45 }] },
  });

describe('bases (7.4)', () => {
  it('follow the real traffic rights: own country, and the EU single market from 1997 (the UK until 2020)', () => {
    const { state, airlineId } = startup();
    const airline = state.airlines[airlineId]!;
    const right = (airport: string, y: number) => baseRight(state, world, airline, airport, simTime(y, 6, 1));
    expect(right('LOWS', 1990)).toBeNull(); // Salzburg: own country
    expect(right('EDDM', 1990)).toBe('baseNotAllowed'); // before the single market
    expect(right('EDDM', 2026)).toBeNull();
    expect(right('EPKK', 2003)).toBe('baseNotAllowed'); // Poland joined in May 2004
    expect(right('EPKK', 2005)).toBeNull();
    expect(right('EGLL', 2010)).toBeNull();
    expect(right('EGLL', 2026)).toBe('baseNotAllowed'); // Brexit
    expect(right('KJFK', 2026)).toBe('baseNotAllowed');
  });

  it('station aircraft that fly routes from the base, with their own gates and connections', () => {
    const { state, airlineId } = startup();
    const cash = state.airlines[airlineId]!.cash.amount;
    expect(applyCommand(state, world, { type: 'OpenBase', airlineId, payload: { airportId: 'KJFK' } })).toMatchObject({ ok: false, error: 'baseNotAllowed' });
    expect(applyCommand(state, world, { type: 'OpenBase', airlineId, payload: { airportId: 'EDDM' } }).ok).toBe(true);
    expect(cash - state.airlines[airlineId]!.cash.amount).toBeGreaterThan(1_500_000);
    // A hub aircraft can't fly from Munich; a route can't start where there is no base.
    expect(open(state, airlineId, 'EDDM', 'LEMG', 'T1', 9 * 60)).toMatchObject({ ok: false, error: 'aircraftElsewhere' });
    expect(open(state, airlineId, 'LOWS', 'LEMG', 'T1', 9 * 60)).toMatchObject({ ok: false, error: 'originNotBase' });
    for (const id of ['T2', 'T3']) expect(applyCommand(state, world, { type: 'StationAircraft', airlineId, payload: { aircraftId: id, airportId: 'EDDM' } }).ok).toBe(true);
    // Two Munich flights: Málaga out at 07:00, back ≈ 13:35; Warsaw out at 15:00 — a connection Málaga → Munich → Warsaw.
    expect(open(state, airlineId, 'EDDM', 'LEMG', 'T2', 7 * 60).ok).toBe(true);
    expect(open(state, airlineId, 'EDDM', 'EPWA', 'T3', 15 * 60).ok).toBe(true);
    const base = state.airlines[airlineId]!.bases![0]!;
    expect(base.gates!.contact + base.gates!.remote).toBeGreaterThan(0);
    const pc = playerConnections(world, state, airlineId, 'EDDM');
    expect(pc.connections.some((c) => c.from === 'LEMG' && c.to === 'EPWA')).toBe(true);
    // One route per pair of airports, either way round: Munich–Vienna exists once.
    expect(applyCommand(state, world, { type: 'StationAircraft', airlineId, payload: { aircraftId: 'T1', airportId: 'LOWW' } }).ok).toBe(true);
    expect(open(state, airlineId, undefined, 'EDDM', 'T1', 9 * 60).ok).toBe(true);
    // (no Munich aircraft free for the way round; the pair is taken anyway)
    expect(open(state, airlineId, 'EDDM', 'LOWW', 'T2', 18 * 60)).toMatchObject({ ok: false, error: 'routeExists' });
    // A base in use can't be closed; an aircraft with flights can't move.
    expect(applyCommand(state, world, { type: 'CloseBase', airlineId, payload: { airportId: 'EDDM' } })).toMatchObject({ ok: false, error: 'baseInUse' });
    expect(applyCommand(state, world, { type: 'StationAircraft', airlineId, payload: { aircraftId: 'T2', airportId: 'LOWW' } })).toMatchObject({ ok: false, error: 'aircraftHasFlights' });
  });
});

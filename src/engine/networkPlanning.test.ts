// Network planning packages (head of network: times, days, aircraft, waves).
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
import { preview, routeOptions, specsOf } from './networkPlanning';
import { buildRealAirlines } from './realAirlines';
import { pairsOfRoute } from './schedule';
import { nextSeasonStart } from './slots';
import { simTime } from './time';
import { DAYS_ALL } from './timetable';
import { buildEngineWorld } from './world';
import { slow } from '../testing/slow';

const real = buildRealAirlines(airlinesJson as never, networksJson as never, detailsJson as never, registersJson as never, eurostatJson);
const world = buildEngineWorld(airportsJson as Airport[], countriesJson as unknown as Record<string, Country>, real);
const A320 = getAircraftType('A20N');
const DAY = 24 * 60;

function airline() {
  const state = createGame({ seed: 4, startYear: 2026, startTime: simTime(2026, 5, 4), timeMode: 'weekly', realism: 'realistic', scheduling: 'detailed' });
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
  const open = (dest: string, aircraftId: string, dep: number) => {
    const r = applyCommand(state, world, { type: 'OpenRoute', airlineId, payload: { destinationId: dest, aircraftId: '', frequency: 0, fareFactor: 1, flights: [{ aircraftId, dep, days: DAYS_ALL, groundMin: 45 }] } });
    expect(r.ok).toBe(true);
    return state.routes[(r as { id: string }).id]!;
  };
  const malaga = open('LEMG', 'T1', 7 * 60);
  const athens = open('LGAV', 'T1', 15 * 60);
  return { state, airlineId, a: () => state.airlines[airlineId]!, malaga, athens };
}

describe('network planning packages', () => {
  it('a package is applied all at once or not at all', () => {
    const { state, airlineId, malaga, athens } = airline();
    const before = structuredClone(state.flights);
    // Málaga moves to 15:00 on T1 — where Athens already flies — while Athens stays: impossible, nothing changes.
    const bad = specsOf(state, malaga.id).map((s) => ({ ...s, dep: 15 * 60 }));
    expect(applyCommand(state, world, { type: 'UpdateTimetable', airlineId, payload: { routes: [{ routeId: malaga.id, flights: bad }] } }).ok).toBe(false);
    expect(state.flights).toEqual(before);
    // Both at once (Athens to T2): fine.
    const athensT2 = specsOf(state, athens.id).map((s) => ({ ...s, aircraftId: 'T2' }));
    expect(applyCommand(state, world, { type: 'UpdateTimetable', airlineId, payload: { routes: [{ routeId: malaga.id, flights: bad }, { routeId: athens.id, flights: athensT2 }] } }).ok).toBe(true);
    expect(pairsOfRoute(state, malaga.id)[0]!.dep).toBe(15 * 60);
    expect(pairsOfRoute(state, athens.id)[0]!.aircraftId).toBe('T2');
  });

  it('a season package waits for the season and then takes effect', () => {
    const { state, airlineId, a, malaga } = airline();
    const season = nextSeasonStart(state.time);
    const later = specsOf(state, malaga.id).map((s) => ({ ...s, dep: 6 * 60 + 30 }));
    expect(applyCommand(state, world, { type: 'UpdateTimetable', airlineId, payload: { routes: [{ routeId: malaga.id, flights: later }], effectiveAt: season, label: 'VIE' } }).ok).toBe(true);
    expect(pairsOfRoute(state, malaga.id)[0]!.dep).toBe(7 * 60);
    expect(a().plannedTimetables).toHaveLength(1);
    advance(state, world, season + DAY);
    const msgs = state.messages.filter((m) => m.kind === 'timetableApplied' || m.kind === 'timetableFailed').map((m) => m.kind);
    expect(msgs).toEqual(['timetableApplied']);
    expect(pairsOfRoute(state, malaga.id)[0]!.dep).toBe(6 * 60 + 30);
    expect(state.messages.some((m) => m.kind === 'timetableApplied')).toBe(true);
    expect(a().plannedTimetables).toHaveLength(0);
  }, slow(240_000));

  it('the planner tries times, other days, other aircraft and more flights, with a preview of each', () => {
    const { state, a, malaga } = airline();
    const options = routeOptions(state, world, a(), malaga, 0.9);
    const kinds = new Set(options.map((o) => o.kind));
    for (const k of ['retime', 'splitDays', 'addFlights'] as const) expect(kinds.has(k)).toBe(true);
    const split = options.find((o) => o.kind === 'splitDays')!;
    const lines = preview(state, world, a(), split.pkg);
    expect(lines.some((l) => l.before === '')).toBe(true); // the weekend (or weekday) flight is new
    // Empty: fewer days are among the options.
    expect(routeOptions(state, world, a(), malaga, 0.4).some((o) => o.kind === 'cutFlights')).toBe(true);
  });
});

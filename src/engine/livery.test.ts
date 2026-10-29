import { describe, expect, it } from 'vitest';
import airportsJson from '../data/generated/airports.json';
import countriesJson from '../data/generated/countries.json';
import { getAircraftType } from '../data/aircraft';
import type { Airport, Country } from '../data/types';
import { advance } from './advance';
import { economyCabin } from './cabins';
import { applyCommand } from './commands';
import { createGame, migrate } from './game';
import { currentPaint, defaultLivery, inOldLivery, liveryOf, MAX_IMAGE_CHARS, repaintQuote, validateLivery } from './livery';
import { ensureMaint } from './maintenance';
import { planFor } from './operations';
import { SAVE_VERSION, type GameState, type Livery } from './state';
import { addMonths, MINUTES_PER_DAY, simTime } from './time';
import { buildEngineWorld } from './world';
import { slotHolding } from './slots';

const world = buildEngineWorld(airportsJson as Airport[], countriesJson as unknown as Record<string, Country>);
const DAY = MINUTES_PER_DAY;

function startup() {
  const state = createGame({ seed: 3, startYear: 2026, startTime: simTime(2026, 10, 28), timeMode: 'realtime', realism: 'realistic', scheduling: 'simple' });
  // These tests fly to Heathrow, where a newcomer would get no slots (Phase 7.2): the test airline holds some.
  state.slots = { EGLL: slotHolding(20) };
  const r = applyCommand(state, world, {
    type: 'FoundAirline',
    payload: { name: 'Danube Air', iata: 'D7', icao: 'DNB', primary: '#c8102e', secondary: '#ffffff', hubId: 'LOWW', capitalEur: 200_000_000, controller: 'human' },
  });
  const airlineId = (r as { id: string }).id;
  state.aircraft.P1 = {
    id: 'P1', typeId: 'A20N', airlineId, registration: 'OE-LPA', builtYear: 2019, seats: 180, cabin: economyCabin(getAircraftType('A20N'), 180),
    status: 'active', deliveryAt: state.time, locationId: 'LOWW', paint: 0,
    lease: { lessor: 'AerCap', monthlyRent: { amount: 300_000, currency: 'USD' }, deposit: { amount: 600_000, currency: 'USD' }, startAt: state.time, endAt: state.time + 3000 * DAY },
  };
  ensureMaint(state, state.aircraft.P1);
  applyCommand(state, world, { type: 'OpenRoute', airlineId, payload: { destinationId: 'EGLL', aircraftId: 'P1', frequency: 14, fareFactor: 1 } });
  return { state, airlineId, airline: state.airlines[airlineId]! };
}

const blue = (): Livery => ({
  ...defaultLivery({ primary: '#0b2a5b', secondary: '#f2b705' }, 'Danube Air', 'D7'),
  tail: 'chevron',
  fuselage: 'cheatline',
  logo: { kind: 'symbol', symbol: 'swallow', color: 's' },
  drawing: [{ color: '#f2b705', width: 6, points: [100, 200, 200, 210, 300, 190] }],
});

describe('liveries', () => {
  it('founds an airline with a livery in its colours', () => {
    const { airline } = startup();
    expect(airline.liveries).toHaveLength(1);
    expect(airline.liveries![0]!.colors[0]).toBe('#c8102e');
    expect(airline.liveries![0]!.titles?.text).toBe('Danube Air');
  });

  it('checks liveries sent by the screen', () => {
    expect(validateLivery(blue())).toBeNull();
    expect(validateLivery({ ...blue(), colors: ['red', '#000000', '#000000'] })).toBe('liveryInvalid');
    expect(validateLivery({ ...blue(), tail: 'zigzag' as never })).toBe('liveryInvalid');
    expect(validateLivery({ ...blue(), logo: { kind: 'image', image: 'https://example.com/logo.png' } })).toBe('liveryInvalid');
    expect(validateLivery({ ...blue(), logo: { kind: 'image', image: `data:image/png;base64,${'A'.repeat(MAX_IMAGE_CHARS)}` } })).toBe('imageTooBig');
    const many = Array.from({ length: 300 }, () => ({ color: '#ffffff', width: 3, points: [1, 2, 3, 4] }));
    expect(validateLivery({ ...blue(), drawing: many })).toBe('drawingTooBig');
  });

  it('keeps the fleet in the old livery until it is repainted; new aircraft come in the new one', () => {
    const { state, airlineId, airline } = startup();
    expect(applyCommand(state, world, { type: 'SetLivery', airlineId, payload: { livery: blue() } }).ok).toBe(true);
    expect(airline.colors.primary).toBe('#0b2a5b');
    const p1 = state.aircraft.P1!;
    expect(inOldLivery(airline, p1)).toBe(true);
    expect(liveryOf(airline, p1).tail).toBe('solid');
    expect(state.messages.at(-1)!.kind).toBe('liveryChanged');

    // A leased aircraft delivered later wears the new livery.
    const offer = state.market.offers[0]!;
    const r = applyCommand(state, world, { type: 'LeaseAircraft', airlineId, payload: { offerId: offer.id } }) as { ok: true; id: string };
    advance(state, world, state.aircraft[r.id]!.deliveryAt + 60);
    expect(state.aircraft[r.id]!.paint).toBe(currentPaint(airline));
    expect(inOldLivery(airline, state.aircraft[r.id]!)).toBe(false);
  });

  it('repaints now: cash, days out of service, then the new livery', () => {
    const { state, airlineId, airline } = startup();
    applyCommand(state, world, { type: 'SetLivery', airlineId, payload: { livery: blue() } });
    const before = airline.cash.amount;
    expect(applyCommand(state, world, { type: 'Repaint', airlineId, payload: { aircraftId: 'P1', atCheck: false } }).ok).toBe(true);
    const p1 = state.aircraft.P1!;
    const q = repaintQuote(p1);
    expect(before - airline.cash.amount).toBeGreaterThan(q.usd * 0.8);
    expect(p1.paintUntil).toBeDefined();
    advance(state, world, state.time + 2 * DAY);
    expect(planFor(state, world, Object.values(state.routes)[0]!, state.time)).toBeNull();
    advance(state, world, p1.paintUntil! + 60);
    expect(inOldLivery(airline, p1)).toBe(false);
    expect(liveryOf(airline, p1).tail).toBe('chevron');
    // Nobody wears the first livery any more: it is dropped from the save.
    expect(airline.liveries![0]).toBeNull();
    expect(applyCommand(state, world, { type: 'Repaint', airlineId, payload: { aircraftId: 'P1', atCheck: false } })).toEqual({ ok: false, error: 'alreadyPainted' });
  });

  it('repaints with the next heavy check without extra days', () => {
    const { state, airlineId, airline } = startup();
    applyCommand(state, world, { type: 'SetLivery', airlineId, payload: { livery: blue() } });
    expect(applyCommand(state, world, { type: 'Repaint', airlineId, payload: { aircraftId: 'P1', atCheck: true } }).ok).toBe(true);
    const p1 = state.aircraft.P1!;
    expect(p1.paintUntil).toBeUndefined();
    p1.maint!.c = { at: addMonths(state.time, -36), fh: p1.maint!.fh - 3000 };
    advance(state, world, state.time + 3 * DAY);
    expect(p1.maint!.inCheck?.kind).toBe('C');
    expect(inOldLivery(airline, p1)).toBe(false);
    expect(state.ledger.some((l) => l.kind === 'repaint')).toBe(true);
  });
});

describe('saves from before Phase 4.3', () => {
  it('get a livery from the airline colours', () => {
    const { state } = startup();
    const old = JSON.parse(JSON.stringify(state)) as GameState;
    old.version = 9;
    for (const a of Object.values(old.airlines)) delete a.liveries;
    delete old.aircraft.P1!.paint;
    const upgraded = migrate(old)!;
    expect(upgraded.version).toBe(SAVE_VERSION);
    const airline = Object.values(upgraded.airlines)[0]!;
    expect(airline.liveries![0]!.colors[0]).toBe('#c8102e');
    expect(upgraded.aircraft.P1!.paint).toBe(0);
  });
});

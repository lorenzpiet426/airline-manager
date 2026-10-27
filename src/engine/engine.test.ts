import { describe, expect, it } from 'vitest';
import airportsJson from '../data/generated/airports.json';
import countriesJson from '../data/generated/countries.json';
import type { Airport, Country } from '../data/types';
import { getAircraftType } from '../data/aircraft';
import { advance } from './advance';
import { applyCommand, type FoundAirline } from './commands';
import { buildEngineWorld } from './world';
import { createGame } from './game';
import { typicalRentUsd } from './market';
import { simTime, toDate } from './time';

const airports = airportsJson as Airport[];
const world = buildEngineWorld(airports, countriesJson as unknown as Record<string, Country>);
const VIE = airports.find((a) => a.iata === 'VIE')!;
const JFK = airports.find((a) => a.iata === 'JFK')!;

const newGame = (seed = 42) => createGame({ seed, startYear: 2026, timeMode: 'realtime', realism: 'realistic', scheduling: 'simple' });

const founding = (overrides: Partial<FoundAirline['payload']> = {}): FoundAirline => ({
  type: 'FoundAirline',
  payload: {
    name: 'Danube Air',
    iata: 'D7',
    icao: 'DNB',
    primary: '#c8102e',
    secondary: '#ffffff',
    hubId: VIE.id,
    capitalEur: 75_000_000,
    controller: 'human',
    ...overrides,
  },
});

function foundedGame(seed = 42) {
  const state = newGame(seed);
  const result = applyCommand(state, world, founding());
  if (!result.ok || !result.id) throw new Error('founding failed');
  return { state, airlineId: result.id };
}

describe('new game', () => {
  it('starts on 1 January 2026 with a full lease market', () => {
    const state = newGame();
    expect(toDate(state.time).toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(state.market.offers.length).toBe(36);
    // No aircraft that has not entered service yet, and only used aircraft (≥ 1 year old).
    for (const offer of state.market.offers) {
      const type = getAircraftType(offer.typeId);
      expect(type.eis).toBeLessThanOrEqual(2026);
      expect(offer.builtYear).toBeLessThanOrEqual(2025);
      expect(offer.builtYear).toBeGreaterThanOrEqual(type.built[0]);
      if (type.built[1] !== null) expect(offer.builtYear).toBeLessThanOrEqual(type.built[1]);
    }
    expect(state.market.offers.some((o) => o.typeId === 'B779')).toBe(false);
    // Freighters are not offered to a passenger startup.
    expect(state.market.offers.every((o) => getAircraftType(o.typeId).payloadT === undefined)).toBe(true);
  });

  it('is deterministic: same seed → same world', () => {
    expect(JSON.stringify(newGame(7))).toBe(JSON.stringify(newGame(7)));
    expect(JSON.stringify(newGame(7))).not.toBe(JSON.stringify(newGame(8)));
  });
});

describe('founding an airline', () => {
  it('creates the airline with euro books and €75M at VIE', () => {
    const { state, airlineId } = foundedGame();
    const airline = state.airlines[airlineId]!;
    expect(airline.currency).toBe('EUR');
    expect(airline.cash).toEqual({ amount: 75_000_000, currency: 'EUR' });
    expect(state.ledger).toHaveLength(1);
  });

  it('converts the capital into the hub currency (JFK → US dollars)', () => {
    const state = newGame();
    const result = applyCommand(state, world, founding({ hubId: JFK.id }));
    const airline = state.airlines[(result as { id: string }).id]!;
    expect(airline.currency).toBe('USD');
    expect(airline.cash.amount).toBe(84_000_000); // €75M × 1.1188, rounded to a headline figure
  });

  it('rejects invalid input', () => {
    const state = newGame();
    expect(applyCommand(state, world, founding({ name: 'X' }))).toEqual({ ok: false, error: 'nameLength' });
    expect(applyCommand(state, world, founding({ iata: '12' }))).toEqual({ ok: false, error: 'iataFormat' });
    expect(applyCommand(state, world, founding({ icao: 'D7X' }))).toEqual({ ok: false, error: 'icaoFormat' });
    expect(applyCommand(state, world, founding({ hubId: 'nowhere' }))).toEqual({ ok: false, error: 'hubUnknown' });
    expect(applyCommand(state, world, founding({ capitalEur: 1e12 }))).toEqual({ ok: false, error: 'capitalInvalid' });
    expect(applyCommand(state, world, founding({ primary: 'red' }))).toEqual({ ok: false, error: 'colorFormat' });
    applyCommand(state, world, founding());
    expect(applyCommand(state, world, founding({ icao: 'ABC' }))).toEqual({ ok: false, error: 'codeTaken' });
  });
});

describe('leasing an aircraft', () => {
  it('pays the deposit, registers it in Austria and delivers it later', () => {
    const { state, airlineId } = foundedGame();
    const offer = state.market.offers.find((o) => getAircraftType(o.typeId).category === 'narrowbody')!;
    const result = applyCommand(state, world, { type: 'LeaseAircraft', airlineId, payload: { offerId: offer.id } });
    expect(result.ok).toBe(true);
    const aircraft = state.aircraft[(result as { id: string }).id]!;
    expect(aircraft.registration).toMatch(/^OE-L[A-Z]{2}$/);
    expect(aircraft.status).toBe('delivering');
    expect(state.market.offers.find((o) => o.id === offer.id)).toBeUndefined();

    const deposit = Math.round(offer.deposit.amount / state.fx.USD!);
    expect(state.airlines[airlineId]!.cash.amount).toBe(75_000_000 - deposit);

    // The same offer cannot be leased twice.
    expect(applyCommand(state, world, { type: 'LeaseAircraft', airlineId, payload: { offerId: offer.id } })).toEqual({
      ok: false,
      error: 'offerGone',
    });

    advance(state, world, aircraft.deliveryAt - 1);
    expect(aircraft.status).toBe('delivering');
    advance(state, world, aircraft.deliveryAt);
    expect(aircraft.status).toBe('active');
    expect(state.messages.some((m) => m.kind === 'delivered')).toBe(true);
  });

  it('refuses a lease without enough cash for the deposit', () => {
    const { state, airlineId } = foundedGame();
    state.airlines[airlineId]!.cash.amount = 1000;
    const offer = state.market.offers[0]!;
    expect(applyCommand(state, world, { type: 'LeaseAircraft', airlineId, payload: { offerId: offer.id } })).toEqual({
      ok: false,
      error: 'insufficientCash',
    });
  });

  it('charges a full month of rent on the 1st of each month after delivery', () => {
    const { state, airlineId } = foundedGame();
    const offer = state.market.offers[0]!;
    const result = applyCommand(state, world, { type: 'LeaseAircraft', airlineId, payload: { offerId: offer.id } });
    const aircraft = state.aircraft[(result as { id: string }).id]!;
    advance(state, world, aircraft.deliveryAt);
    const d = toDate(aircraft.deliveryAt);
    const firstOfMonth = simTime(d.getUTCFullYear(), d.getUTCMonth() + 2, 1);
    advance(state, world, firstOfMonth); // the next 1st of the month
    const rentEur = Math.round(offer.monthlyRent.amount / state.fx.USD!);
    const rent = state.ledger.find((l) => l.kind === 'leaseRent' && l.at === firstOfMonth);
    expect(rent?.amount).toEqual({ amount: -rentEur, currency: 'EUR' });
  });
});

describe('time and market', () => {
  it('runs a year: 12 monthly market refreshes, offers never expired', () => {
    const state = newGame();
    advance(state, world, simTime(2027, 1, 1));
    expect(toDate(state.time).toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(state.market.offers.length).toBe(36);
    expect(state.market.offers.every((o) => o.expiresAt > state.time)).toBe(true);
    // The 777-9 enters service in 2027 but needs to be a year old to be offered used.
    expect(state.market.offers.some((o) => o.typeId === 'B779')).toBe(false);
  });

  it('prices leases realistically: older is cheaper, wide-bodies cost more', () => {
    const a320neo = getAircraftType('A20N');
    expect(typicalRentUsd(a320neo, 1)).toBeGreaterThan(typicalRentUsd(a320neo, 8));
    expect(typicalRentUsd(a320neo, 3)).toBeCloseTo(390_000, -3);
    expect(typicalRentUsd(getAircraftType('A359'), 5)).toBeGreaterThan(3 * typicalRentUsd(a320neo, 5));
  });
});

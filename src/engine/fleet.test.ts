import { describe, expect, it } from 'vitest';
import airportsJson from '../data/generated/airports.json';
import countriesJson from '../data/generated/countries.json';
import { getAircraftType } from '../data/aircraft';
import { marketValueUsd, newPriceUsd, orderBlock } from '../data/factory';
import type { Airport, Country } from '../data/types';
import { advance } from './advance';
import { economyCabin } from './cabins';
import { applyCommand } from './commands';
import { bookValue, earlyReturnFeeUsd } from './fleet';
import { createGame, migrate } from './game';
import { SAVE_VERSION, type GameState } from './state';
import { addMonths, MINUTES_PER_DAY, simTime, yearOf } from './time';
import { buildEngineWorld } from './world';

const world = buildEngineWorld(airportsJson as Airport[], countriesJson as unknown as Record<string, Country>);

function startup(capitalEur = 200_000_000) {
  const state = createGame({ seed: 11, startYear: 2026, startTime: simTime(2026, 10, 28), timeMode: 'realtime', realism: 'realistic', scheduling: 'simple' });
  const r = applyCommand(state, world, {
    type: 'FoundAirline',
    payload: { name: 'Danube Air', iata: 'D7', icao: 'DNB', primary: '#c8102e', secondary: '#ffffff', hubId: 'LOWW', capitalEur, controller: 'human' },
  });
  return { state, airlineId: (r as { id: string }).id };
}
const cash = (state: GameState, id: string) => state.airlines[id]!.cash.amount;

describe('aircraft values', () => {
  it('prices new aircraft at about half the list price and lets them lose value with age', () => {
    const a320 = getAircraftType('A20N');
    expect(newPriceUsd(a320)).toBeGreaterThan(45e6);
    expect(newPriceUsd(a320)).toBeLessThan(65e6);
    expect(newPriceUsd(a320, 10)).toBeLessThan(newPriceUsd(a320));
    const ten = marketValueUsd(a320, 10, 2026) / newPriceUsd(a320);
    expect(ten).toBeGreaterThan(0.4);
    expect(ten).toBeLessThan(0.55);
    // Out of production: worth less at the same age.
    expect(marketValueUsd(getAircraftType('A320'), 10, 2026)).toBeLessThan(marketValueUsd(getAircraftType('A320'), 10, 2020) * 1.0001);
  });

  it('knows what a European startup can order', () => {
    expect(orderBlock(getAircraftType('A20N'), 2026)).toBeNull();
    expect(orderBlock(getAircraftType('A320'), 2026)).toBe('notBuilt');
    expect(orderBlock(getAircraftType('SU95'), 2026)).toBe('sanctions');
    expect(orderBlock(getAircraftType('C919'), 2026)).toBe('chinaOnly');
    expect(orderBlock(getAircraftType('B77L-F'), 2026)).toBe('freighter');
  });
});

describe('factory orders', () => {
  it('delivers an A320neo ordered in 2026 in the 2030s and collects the payments in stages', () => {
    const { state, airlineId } = startup();
    const before = cash(state, airlineId);
    const r = applyCommand(state, world, { type: 'OrderAircraft', airlineId, payload: { typeId: 'A20N', count: 3, cabin: 'single' } });
    expect(r.ok).toBe(true);
    const ordered = Object.values(state.aircraft).filter((a) => a.order);
    expect(ordered).toHaveLength(3);
    expect(yearOf(ordered[0]!.deliveryAt)).toBeGreaterThanOrEqual(2032);
    // Two per month: the third comes a month after the first two.
    expect(ordered[2]!.deliveryAt).toBeGreaterThan(ordered[1]!.deliveryAt);
    // Only the deposits (1 %) on signing.
    const price = ordered[0]!.order!.priceUsd;
    expect(before - cash(state, airlineId)).toBeLessThan(0.05 * 3 * price);
    expect(before - cash(state, airlineId)).toBeGreaterThan(0);
    // Two years before delivery the pre-delivery payments start.
    const first = ordered[0]!;
    advance(state, world, addMonths(first.deliveryAt, -23));
    expect(first.order!.payments.filter((p) => p.paid !== undefined).length).toBeGreaterThanOrEqual(2);
    advance(state, world, first.deliveryAt + MINUTES_PER_DAY);
    const delivered = state.aircraft[first.id]!;
    expect(delivered.status).toBe('active');
    expect(delivered.order).toBeUndefined();
    expect(delivered.owned!.price).toBeGreaterThan(0.8 * price * 0.8); // in euros
    expect(state.finance[airlineId]!.month.lines.depreciation).toBeGreaterThan(0);
  });

  it('keeps the money paid when an order is cancelled', () => {
    const { state, airlineId } = startup();
    applyCommand(state, world, { type: 'OrderAircraft', airlineId, payload: { typeId: 'AT76', count: 1, cabin: 'single' } });
    const id = Object.values(state.aircraft).find((a) => a.order)!.id;
    expect(applyCommand(state, world, { type: 'CancelOrder', airlineId, payload: { aircraftId: id } }).ok).toBe(true);
    expect(state.aircraft[id]).toBeUndefined();
    expect(state.finance[airlineId]!.week.lines.disposals).toBeGreaterThan(0);
    advance(state, world, state.time + 4 * 365 * MINUTES_PER_DAY); // the delivery event finds nothing
  });

  it('refuses types that cannot be ordered', () => {
    const { state, airlineId } = startup();
    expect(applyCommand(state, world, { type: 'OrderAircraft', airlineId, payload: { typeId: 'A320', count: 1, cabin: 'single' } })).toEqual({ ok: false, error: 'notOrderable' });
  });
});

describe('used aircraft', () => {
  it('buys, writes off and sells an aircraft with a gain or loss in the accounts', () => {
    const { state, airlineId } = startup();
    const offer = state.market.sales.find((o) => getAircraftType(o.typeId).category === 'narrowbody') ?? state.market.sales[0]!;
    const before = cash(state, airlineId);
    const r = applyCommand(state, world, { type: 'BuyAircraft', airlineId, payload: { offerId: offer.id } });
    expect(r.ok).toBe(true);
    const id = (r as { id: string }).id;
    expect(before - cash(state, airlineId)).toBeGreaterThan(0.8 * offer.priceUsd * 0.8);
    expect(state.market.sales.some((o) => o.id === offer.id)).toBe(false);
    expect(applyCommand(state, world, { type: 'SellAircraft', airlineId, payload: { aircraftId: id } })).toEqual({ ok: false, error: 'notDelivered' });
    advance(state, world, state.aircraft[id]!.deliveryAt + 30 * MINUTES_PER_DAY);
    const a = state.aircraft[id]!;
    expect(bookValue(a.owned!, state.time)).toBeLessThan(a.owned!.price);
    const cashBefore = cash(state, airlineId);
    expect(applyCommand(state, world, { type: 'SellAircraft', airlineId, payload: { aircraftId: id } }).ok).toBe(true);
    expect(cash(state, airlineId)).toBeGreaterThan(cashBefore);
    expect(state.aircraft[id]).toBeUndefined();
    expect(state.finance[airlineId]!.month.lines.disposals).not.toBe(0);
  });
});

describe('leases', () => {
  function leased(endInDays: number) {
    const { state, airlineId } = startup();
    state.aircraft.T1 = {
      id: 'T1', typeId: 'A20N', airlineId, registration: 'OE-LTA', builtYear: 2018, seats: 180, cabin: economyCabin(getAircraftType('A20N'), 180),
      status: 'active', deliveryAt: state.time, locationId: 'LOWW',
      lease: { lessor: 'AerCap', monthlyRent: { amount: 300_000, currency: 'USD' }, deposit: { amount: 600_000, currency: 'USD' }, startAt: state.time - 1e6, endAt: state.time + endInDays * MINUTES_PER_DAY },
    };
    applyCommand(state, world, { type: 'OpenRoute', airlineId, payload: { destinationId: 'EGLL', aircraftId: 'T1', frequency: 7, fareFactor: 1 } });
    return { state, airlineId };
  }

  it('reminds, then hands the aircraft back at the end of the lease (deposit back, flights gone)', () => {
    const { state, airlineId } = leased(100);
    advance(state, world, state.time + 20 * MINUTES_PER_DAY);
    expect(state.messages.some((m) => m.kind === 'leaseEnding')).toBe(true);
    advance(state, world, state.time + 90 * MINUTES_PER_DAY);
    expect(state.aircraft.T1).toBeUndefined();
    expect(Object.keys(state.flights)).toHaveLength(0);
    expect(state.ledger.some((l) => l.kind === 'depositBack' && l.airlineId === airlineId)).toBe(true);
  });

  it('extends a lease near its end at today\'s market rent', () => {
    const far = leased(1000);
    expect(applyCommand(far.state, world, { type: 'ExtendLease', airlineId: far.airlineId, payload: { aircraftId: 'T1', years: 3 } })).toEqual({ ok: false, error: 'extendTooEarly' });
    const { state, airlineId } = leased(200);
    const end = state.aircraft.T1!.lease!.endAt;
    expect(applyCommand(state, world, { type: 'ExtendLease', airlineId, payload: { aircraftId: 'T1', years: 3 } }).ok).toBe(true);
    expect(state.aircraft.T1!.lease!.endAt).toBe(addMonths(end, 36));
    // An 8-year-old A320neo rents for less than a new one.
    expect(state.aircraft.T1!.lease!.monthlyRent.amount).toBeLessThan(450_000);
  });

  it('charges 60 % of the remaining rent for an early return', () => {
    const { state, airlineId } = leased(365);
    const fee = earlyReturnFeeUsd(state.aircraft.T1!, state.time);
    expect(fee).toBeGreaterThan(0.6 * 300_000 * 11.5);
    expect(fee).toBeLessThan(0.6 * 300_000 * 12.5);
    expect(applyCommand(state, world, { type: 'ReturnLease', airlineId, payload: { aircraftId: 'T1' } }).ok).toBe(true);
    expect(state.aircraft.T1).toBeUndefined();
  });
});

describe('saves from before Phase 4.1', () => {
  it('get a used-aircraft market and the new accounts line', () => {
    const { state } = startup();
    const old = JSON.parse(JSON.stringify(state)) as GameState;
    old.version = 7;
    delete (old.market as Partial<GameState['market']>).sales;
    for (const p of [old.finance[Object.keys(old.finance)[0]!]!.week]) delete (p.lines as Partial<typeof p.lines>).disposals;
    const upgraded = migrate(old)!;
    expect(upgraded.version).toBe(SAVE_VERSION);
    expect(upgraded.market.sales.length).toBeGreaterThan(10);
  });
});

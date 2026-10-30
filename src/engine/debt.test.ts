// Phase 10.1: balance sheet, credit rating, loans and bonds.
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
import { balanceSheet, creditView, loanOffers } from './debt';
import { newOwnership } from './fleet';
import { policyRate } from '../data/rates';
import { buildRealAirlines } from './realAirlines';
import type { GameState } from './state';
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

/** Gives the airline an owned aircraft (as if bought earlier). */
function own(state: GameState, airlineId: string) {
  state.aircraft.O1 = {
    id: 'O1', typeId: 'A20N', airlineId, registration: 'OE-LOW', builtYear: 2018, seats: 180, cabin: economyCabin(A320, 180), status: 'active', deliveryAt: state.time, locationId: 'LOWW',
    owned: newOwnership(state, { typeId: 'A20N', builtYear: 2018 }, 40_000_000, 'EUR'),
  };
}

describe('balance sheet, loans and bonds (10.1)', () => {
  it('real central bank rates by currency and year (BIS)', () => {
    expect(policyRate('USD', new Date(Date.UTC(1981, 0, 15)))).toBeGreaterThan(15); // Volcker
    expect(policyRate('EUR', new Date(Date.UTC(2021, 5, 15)))).toBeLessThanOrEqual(0.01);
    expect(policyRate('ATS', new Date(Date.UTC(1985, 5, 15)))).toBeGreaterThan(3);
    expect(policyRate('GBP', new Date(Date.UTC(2023, 9, 15)))).toBeGreaterThan(4);
  });

  it('a young startup: balance sheet with its leases, rated B or lower, a bank loan at the central bank rate plus a spread', () => {
    const { state, a } = airline();
    const b = balanceSheet(state, a());
    expect(b.leases).toBeGreaterThan(0);
    expect(b.deposits).toBeGreaterThan(0);
    expect(b.equity).toBeLessThan(b.cash);
    const view = creditView(state, a());
    expect(['B', 'CCC']).toContain(view.rating);
    const bank = loanOffers(state, a()).find((o) => o.kind === 'bank')!;
    expect(bank.rate(5)).toBeGreaterThan(policyRate('EUR', new Date(Date.UTC(2026, 2, 3))) + 4);
    // Bonds are for big airlines.
    expect(loanOffers(state, a()).find((o) => o.kind === 'bond')!.refusal).toBe('size');
  });

  it('a loan: cash now, interest every day, monthly repayments; early repayment costs a fee', () => {
    const { state, airlineId, a } = airline();
    const cash = a().cash.amount;
    const bank = loanOffers(state, a()).find((o) => o.kind === 'bank')!;
    const amount = Math.min(bank.max, 20_000_000);
    expect(applyCommand(state, world, { type: 'TakeLoan', airlineId, payload: { kind: 'bank', amount, years: 3 } }).ok).toBe(true);
    expect(a().cash.amount).toBe(cash + amount);
    const loan = a().loans![0]!;
    advance(state, world, simTime(2026, 5, 2));
    expect(a().loans![0]!.outstanding).toBeLessThan(loan.original);
    // The startup's cash earns interest too; the loan costs more than its money earns on the account.
    const without = airline();
    advance(without.state, world, simTime(2026, 5, 2));
    expect(state.finance[airlineId]!.months.at(-1)!.lines.interest!).toBeGreaterThan(without.state.finance[without.airlineId]!.months.at(-1)!.lines.interest!);
    const before = a().cash.amount;
    const owed = a().loans![0]!.outstanding;
    expect(applyCommand(state, world, { type: 'RepayLoan', airlineId, payload: { loanId: loan.id } }).ok).toBe(true);
    expect(before - a().cash.amount).toBeCloseTo(owed * 1.01, -1);
  }, 120_000);

  it('aircraft finance: an owned aircraft secures a cheaper loan and can’t be sold meanwhile; sale-and-leaseback', () => {
    const { state, airlineId, a } = airline();
    own(state, airlineId);
    const offers = loanOffers(state, a());
    const plane = offers.find((o) => o.kind === 'aircraft' && o.aircraftId === 'O1')!;
    const bank = offers.find((o) => o.kind === 'bank')!;
    expect(plane.rate(5)).toBeLessThan(bank.rate(5));
    expect(applyCommand(state, world, { type: 'TakeLoan', airlineId, payload: { kind: 'aircraft', amount: plane.max, years: 8, aircraftId: 'O1' } }).ok).toBe(true);
    expect(applyCommand(state, world, { type: 'SellAircraft', airlineId, payload: { aircraftId: 'O1' } })).toMatchObject({ ok: false, error: 'aircraftPledged' });
    expect(applyCommand(state, world, { type: 'SaleLeaseback', airlineId, payload: { aircraftId: 'O1' } })).toMatchObject({ ok: false, error: 'aircraftPledged' });
    // Another owned aircraft: sold to a lessor and leased back.
    state.aircraft.O2 = { ...state.aircraft.O1!, id: 'O2', registration: 'OE-LOX' };
    const cash = a().cash.amount;
    expect(applyCommand(state, world, { type: 'SaleLeaseback', airlineId, payload: { aircraftId: 'O2' } }).ok).toBe(true);
    expect(state.aircraft.O2!.owned).toBeUndefined();
    expect(state.aircraft.O2!.lease).toBeDefined();
    expect(a().cash.amount).toBeGreaterThan(cash);
  });

  it('cash below zero for 60 days: insolvent', () => {
    const { state, a } = airline();
    a().cash = { amount: -1_000_000, currency: a().currency };
    advance(state, world, state.time + 30 * DAY);
    expect(a().bankruptAt).toBeUndefined();
    expect(state.messages.some((m) => m.kind === 'insolvencyWarning')).toBe(true);
    advance(state, world, state.time + 35 * DAY);
    expect(a().bankruptAt).toBeDefined();
  }, 120_000);
});

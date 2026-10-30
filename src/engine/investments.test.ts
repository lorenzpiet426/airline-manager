// Phase 10.5: other airlines' shares, takeovers and mergers.
import { describe, expect, it } from 'vitest';
import airportsJson from '../data/generated/airports.json';
import countriesJson from '../data/generated/countries.json';
import airlinesJson from '../data/generated/airlines.json';
import networksJson from '../data/generated/networks.json';
import detailsJson from '../data/generated/airline-details.json';
import registersJson from '../data/generated/registers.json';
import eurostatJson from '../data/generated/routes-eurostat.json';
import { getAircraftType } from '../data/aircraft';
import { listedById } from '../data/listedAirlines';
import type { Airport, Country } from '../data/types';
import { advance } from './advance';
import { economyCabin } from './cabins';
import { applyCommand } from './commands';
import { book } from './core';
import { createGame } from './game';
import { companyValue, investmentsDailyStep, isListed, listedNow, listedState } from './investments';
import { money } from './money';
import { buildRealAirlines } from './realAirlines';
import { ensureEquity } from './shares';
import { addMonths, simTime } from './time';
import { DAYS_ALL } from './timetable';
import { buildEngineWorld } from './world';
import { slow } from '../testing/slow';

const real = buildRealAirlines(airlinesJson as never, networksJson as never, detailsJson as never, registersJson as never, eurostatJson);
const world = buildEngineWorld(airportsJson as Airport[], countriesJson as unknown as Record<string, Country>, real);
const A320 = getAircraftType('A20N');
const DAY = 24 * 60;
const L = (id: string) => listedById.get(id)!;

function airline(startYear = 2026) {
  const state = createGame({ seed: 5, startYear, startTime: simTime(startYear, 3, 2), timeMode: 'weekly', realism: 'realistic', scheduling: 'detailed' });
  const founded = applyCommand(state, world, {
    type: 'FoundAirline',
    payload: { name: 'Test Air', iata: 'T7', icao: 'TST', primary: '#c8102e', secondary: '#ffffff', hubId: 'LOWW', capitalEur: 200_000_000, controller: 'human' },
  });
  const airlineId = (founded as { id: string }).id;
  state.aircraft.T1 = {
    id: 'T1', typeId: 'A20N', airlineId, registration: 'OE-LT1', builtYear: 2020, seats: 180, cabin: economyCabin(A320, 180), status: 'active', deliveryAt: state.time, locationId: 'LOWW',
    lease: { lessor: 'AerCap', monthlyRent: { amount: 380_000, currency: 'USD' }, deposit: { amount: 760_000, currency: 'USD' }, startAt: state.time, endAt: state.time + 3 * 365 * DAY },
  };
  delete state.airlines[airlineId]!.crew;
  expect(applyCommand(state, world, { type: 'OpenRoute', airlineId, payload: { destinationId: 'LEMG', aircraftId: '', frequency: 0, fareFactor: 1, flights: [{ aircraftId: 'T1', dep: 7 * 60, days: DAYS_ALL, groundMin: 45 }] } }).ok).toBe(true);
  // A rich investor's war chest for the tests.
  book(state, airlineId, 'capital', money(5_000_000_000, 'EUR'));
  ensureEquity(state);
  return { state, airlineId, a: () => state.airlines[airlineId]! };
}

const trade = (state: ReturnType<typeof airline>['state'], airlineId: string, listedId: string, share: number) =>
  applyCommand(state, world, { type: 'TradeStake', airlineId, payload: { listedId, share } });

describe("other airlines' shares (10.5)", () => {
  it('lists the companies on the stock exchange in each year, with believable values', () => {
    const { state } = airline();
    const ids = listedNow(state, world).map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(['LHA', 'RYA', 'IAG', 'AFKL', 'WIZZ', 'DAL']));
    expect(ids).not.toContain('AF');
    expect(ids).not.toContain('BA');
    const lh = companyValue(state, world, L('LHA'));
    expect(lh).toBeGreaterThan(4e9);
    expect(lh).toBeLessThan(20e9);
    const ryr = companyValue(state, world, L('RYA'));
    expect(ryr).toBeGreaterThan(15e9);
    expect(ryr).toBeLessThan(45e9);
    // 1995: Austrian and British Airways were listed, Ryanair not yet.
    const old = createGame({ seed: 5, startYear: 1995, timeMode: 'weekly', realism: 'realistic', scheduling: 'simple' });
    expect(isListed(old, world, L('BA'))).toBe(true);
    expect(isListed(old, world, L('RYA'))).toBe(false);
  });

  it('buys on the market a few per cent a week, announces stakes, and needs an offer above 30 %', () => {
    const { state, airlineId, a } = airline();
    const cash = a().cash.amount;
    expect(trade(state, airlineId, 'WIZZ', 0.03).ok).toBe(true);
    const cost = cash - a().cash.amount;
    const cap = listedState(state, world, L('WIZZ')).price * 103e6;
    expect(cost).toBeGreaterThan(0.025 * cap);
    expect(trade(state, airlineId, 'WIZZ', 0.02)).toEqual({ ok: false, error: 'weeklyLimit' });
    advance(state, world, state.time + 7 * DAY);
    expect(trade(state, airlineId, 'WIZZ', 0.03).ok).toBe(true);
    expect(state.messages.some((m) => m.kind === 'stakeDisclosed' && m.airlineId === airlineId)).toBe(true);
    expect(state.messages.some((m) => m.kind === 'stakeNews' && m.airlineId === null)).toBe(true);
    a().holdings!.WIZZ!.share = 0.29;
    advance(state, world, state.time + 7 * DAY);
    expect(trade(state, airlineId, 'WIZZ', 0.02)).toEqual({ ok: false, error: 'mandatoryBid' });
    // Selling books the gain or loss.
    expect(trade(state, airlineId, 'WIZZ', -0.1).ok).toBe(true);
    expect(a().holdings!.WIZZ!.share).toBeCloseTo(0.19, 5);
    // A US airline: foreigners may hold at most 25 % of the votes.
    a().holdings!.DAL = { share: 0.24, cost: 1, since: state.time, disclosed: 0.2 };
    expect(trade(state, airlineId, 'DAL', 0.02)).toEqual({ ok: false, error: 'ownershipCap' });
    // Governments with a blocking minority keep their flag carrier.
    const p = listedState(state, world, L('AFKL')).price;
    expect(applyCommand(state, world, { type: 'OfferTakeover', airlineId, payload: { listedId: 'AFKL', price: p * 1.5, minAcceptance: 0.5 } })).toEqual({ ok: false, error: 'stateBlocks' });
  }, slow(60_000));

  it('takes over Aegean with a premium, passes the review, then merges Olympic Air into the airline', () => {
    const { state, airlineId, a } = airline();
    const x = L('AEG');
    const low = listedState(state, world, x).price;
    expect(applyCommand(state, world, { type: 'OfferTakeover', airlineId, payload: { listedId: 'AEG', price: low * 0.8, minAcceptance: 0.5 } })).toEqual({ ok: false, error: 'offerTooLow' });
    expect(applyCommand(state, world, { type: 'OfferTakeover', airlineId, payload: { listedId: 'AEG', price: low * 1.5, minAcceptance: 0.75 } }).ok).toBe(true);
    advance(state, world, state.time + 4 * 7 * DAY + DAY);
    expect(a().takeover?.stage).toBe('review');
    advance(state, world, a().takeover!.until + DAY);
    expect(a().takeover).toBeUndefined();
    expect(state.messages.some((m) => m.kind === 'takeoverDone')).toBe(true);
    const h = a().holdings!.AEG!;
    expect(h.share).toBeGreaterThanOrEqual(0.75);
    expect(a().partners).toContain('AEE');
    // A month later the subsidiary's result arrives.
    advance(state, world, addMonths(state.time, 1) + DAY);
    expect(state.ledger.some((l) => l.kind === 'investment' && l.amount.amount !== 0 && !l.ref)).toBe(true);
    // Merging Olympic Air: its aircraft and routes join, from a base at Athens.
    const before = Object.values(state.aircraft).filter((x2) => x2.airlineId === airlineId).length;
    expect(applyCommand(state, world, { type: 'MergeAirline', airlineId, payload: { listedId: 'AEG', memberId: 'OAL' } }).ok).toBe(true);
    const fleet = Object.values(state.aircraft).filter((x2) => x2.airlineId === airlineId);
    expect(fleet.length).toBeGreaterThan(before);
    expect(fleet.some((x2) => x2.baseId === 'LGAV')).toBe(true);
    expect(Object.values(state.routes).some((r) => r.airlineId === airlineId && r.originId === 'LGAV')).toBe(true);
    expect(state.ai.airlines.OAL?.status).toBe('player');
    expect(a().partners).not.toContain('OAL');
    expect(a().partners).toContain('AEE');
    expect(state.stocks!.listed!.AEG!.ownedBy).toBe(airlineId);
  }, slow(240_000));

  it("lets a rival group buy the player's cheap listed airline when shareholders accept", () => {
    const { state, a } = airline();
    const e = a().equity!;
    e.listed = true;
    e.holders = [{ kind: 'player', name: 'player', shares: e.shares * 0.1 }, { kind: 'public', name: 'public', shares: e.shares * 0.9 }];
    e.bid = { bidder: 'Deutsche Lufthansa AG', price: e.price * 3, until: state.time, tender: false };
    investmentsDailyStep(state, world, () => e.price);
    expect(state.messages.some((m) => m.kind === 'airlineSold')).toBe(true);
    expect(a().equity!.holders.find((h) => h.kind === 'group')?.name).toBe('Deutsche Lufthansa AG');
  });

  it('AI groups buy weak airlines only rarely, and the same way every time', () => {
    const run = () => {
      const { state } = airline();
      for (const id of ['JBU']) state.ai.airlines[id] = { status: 'active', health: -0.06 };
      const out: string[] = [];
      for (let m = 1; m <= 120; m++) {
        state.time = addMonths(simTime(2026, 4, 1), m);
        investmentsDailyStep(state, world, () => 1);
        state.ai.airlines.JBU!.health = state.stocks?.listed?.JBLU?.ownedBy ? 0 : -0.06;
      }
      for (const [id, s] of Object.entries(state.stocks?.listed ?? {})) if (s.ownedBy) out.push(`${id}>${s.ownedBy}`);
      return out;
    };
    const a1 = run();
    expect(a1.length).toBeLessThanOrEqual(3);
    expect(run()).toEqual(a1);
  }, slow(60_000));
});

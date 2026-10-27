import { describe, expect, it } from 'vitest';
import airportsJson from '../data/generated/airports.json';
import countriesJson from '../data/generated/countries.json';
import airlinesJson from '../data/generated/airlines.json';
import networksJson from '../data/generated/networks.json';
import detailsJson from '../data/generated/airline-details.json';
import registersJson from '../data/generated/registers.json';
import eurostatJson from '../data/generated/routes-eurostat.json';
import { AIRCRAFT_TYPES, getAircraftType, isFreighter } from '../data/aircraft';
import type { Airport, Country } from '../data/types';
import { advance } from './advance';
import { economyCabin, refitQuote, standardCabin, stylesFor, totalSeats, validateCabin } from './cabins';
import { applyCommand } from './commands';
import { routeWeek } from './economics';
import { createGame, migrate } from './game';
import { buildRealAirlines } from './realAirlines';
import { newReputation, addExperience, closeReputationWeek } from './reputation';
import { SAVE_VERSION, type CabinLayout, type GameState } from './state';
import { simTime } from './time';
import { buildEngineWorld } from './world';

const real = buildRealAirlines(airlinesJson as never, networksJson as never, detailsJson as never, registersJson as never, eurostatJson);
const world = buildEngineWorld(airportsJson as Airport[], countriesJson as unknown as Record<string, Country>, real);
const ap = (id: string) => world.airportById.get(id)!;
const JULY = new Date(Date.UTC(2026, 6, 15));

describe('cabin layouts', () => {
  it('fits every typical layout into every passenger aircraft', () => {
    for (const type of AIRCRAFT_TYPES.filter((t) => !isFreighter(t))) {
      for (const style of stylesFor(type)) {
        const cabin = standardCabin(type, style);
        expect(validateCabin(type, cabin), `${type.id} ${style}`).toBeNull();
      }
    }
  });

  it('gives realistic seat counts (A320neo, 787-9)', () => {
    const a320 = getAircraftType('A20N');
    expect(totalSeats(standardCabin(a320, 'single'))).toBeGreaterThanOrEqual(174);
    expect(totalSeats(standardCabin(a320, 'single'))).toBeLessThanOrEqual(190);
    expect(totalSeats(standardCabin(a320, 'dense'))).toBe(a320.seats.max);
    const b789 = getAircraftType('B789');
    const three = standardCabin(b789, 'threeLong');
    expect(totalSeats(three)).toBeGreaterThan(270);
    expect(totalSeats(three)).toBeLessThan(310);
    expect(three.find((s) => s.cls === 'J')?.seats).toBe(28);
  });

  it('refuses layouts that do not fit or are not allowed', () => {
    const a320 = getAircraftType('A20N');
    expect(validateCabin(a320, [{ cls: 'F', product: 'suite', pitch: 82, seats: 4 }, { cls: 'Y', product: 'economy', pitch: 30, seats: 150 }])).toBe('productInvalid');
    expect(validateCabin(a320, [{ cls: 'Y', product: 'economy', pitch: 34, seats: 186 }])).toBe('cabinTooLong');
    expect(validateCabin(a320, [{ cls: 'Y', product: 'economy', pitch: 28, seats: 200 }])).toBe('exitLimit');
    expect(validateCabin(a320, [{ cls: 'Y', product: 'economy', pitch: 27, seats: 100 }])).toBe('pitchInvalid');
    expect(validateCabin(a320, [{ cls: 'Y', product: 'economy', pitch: 30, seats: 100 }, { cls: 'J', product: 'euro', pitch: 31, seats: 8 }])).toBe('cabinOrder');
  });

  it('prices a refit: new lie-flat seats take weeks and millions, moving economy rows only days', () => {
    const b789 = getAircraftType('B789');
    const flat = refitQuote(b789, standardCabin(b789, 'single'), standardCabin(b789, 'threeLong'));
    expect(flat.costUsd).toBeGreaterThan(5_000_000);
    expect(flat.days).toBeGreaterThanOrEqual(14);
    const a320 = getAircraftType('A20N');
    const euro = refitQuote(a320, standardCabin(a320, 'single'), standardCabin(a320, 'twoShort'));
    expect(euro.newSeats).toBe(0);
    expect(euro.days).toBeLessThanOrEqual(3);
  });
});

describe('passengers and cabins', () => {
  const week = (typeId: string, to: string, cabin: CabinLayout, extra: Partial<Parameters<typeof routeWeek>[3]> = {}) => {
    const type = getAircraftType(typeId);
    return routeWeek(world, ap('LOWW'), ap(to), { type, seats: totalSeats(cabin), cabin, frequency: 7, fareFactor: 1, ageYears: 5, rampUp: 1, ...extra }, JULY);
  };

  it('fills a flat-bed business class better than recliners on long-haul', () => {
    const b789 = getAircraftType('B789');
    const flat = standardCabin(b789, 'twoLong');
    const recliner = flat.map((s) => (s.cls === 'J' ? { ...s, product: 'recliner' as const, pitch: 50 } : s));
    expect(week('B789', 'KJFK', flat).byClass.J!.pax).toBeGreaterThan(1.2 * week('B789', 'KJFK', recliner).byClass.J!.pax);
  });

  it('wins more travellers with more legroom, fewer with a premium fare', () => {
    const a320 = getAircraftType('A20N');
    const roomy = [{ cls: 'Y' as const, product: 'economy' as const, pitch: 32, seats: 150 }];
    const tight = [{ cls: 'Y' as const, product: 'economy' as const, pitch: 28, seats: 150 }];
    expect(week('A20N', 'EGLL', roomy).demand).toBeGreaterThan(week('A20N', 'EGLL', tight).demand);
    const two = standardCabin(a320, 'twoShort');
    expect(week('A20N', 'EGLL', two, { classFares: { W: 1, J: 1.4, F: 1 } }).byClass.J!.demand).toBeLessThan(week('A20N', 'EGLL', two).byClass.J!.demand);
  });

  it('moves the European business curtain to the bookings of each flight', () => {
    const a320 = getAircraftType('A20N');
    const two = standardCabin(a320, 'twoShort');
    const w = week('A20N', 'LGAV', two);
    const j = w.byClass.J!;
    // Business is sized to its passengers (whole rows), the rest of the rows are sold as economy.
    expect(j.seats).toBeLessThan(two[0]!.seats * w.flights);
    expect(j.pax / j.seats).toBeGreaterThan(0.3);
    expect(w.seats).toBeGreaterThanOrEqual(totalSeats(two) * w.flights);
  });

  it('earns more per business passenger than per economy passenger', () => {
    const w = week('A20N', 'EGLL', standardCabin(getAircraftType('A20N'), 'twoShort'));
    expect(w.byClass.J!.fareUsd).toBeGreaterThan(2 * w.byClass.Y!.fareUsd);
    expect(w.revenue).toBeCloseTo(w.byClass.J!.revenue + w.byClass.Y!.revenue, 0);
  });
});

describe('refits in the game', () => {
  function startup() {
    const state = createGame({ seed: 3, startYear: 2026, timeMode: 'realtime', realism: 'realistic', scheduling: 'simple' });
    const r = applyCommand(state, world, {
      type: 'FoundAirline',
      payload: { name: 'Danube Air', iata: 'D7', icao: 'DNB', primary: '#c8102e', secondary: '#ffffff', hubId: 'LOWW', capitalEur: 200_000_000, controller: 'human' },
    });
    const airlineId = (r as { id: string }).id;
    const offer = state.market.offers.find((o) => o.typeId === 'A20N' || getAircraftType(o.typeId).category === 'narrowbody')!;
    const leased = applyCommand(state, world, { type: 'LeaseAircraft', airlineId, payload: { offerId: offer.id } });
    return { state, airlineId, aircraftId: (leased as { id: string }).id };
  }

  it('changes the cabin for free before delivery', () => {
    const { state, airlineId, aircraftId } = startup();
    const type = getAircraftType(state.aircraft[aircraftId]!.typeId);
    const cash = state.airlines[airlineId]!.cash.amount;
    const cabin = standardCabin(type, 'dense');
    const r = applyCommand(state, world, { type: 'RefitCabin', airlineId, payload: { aircraftId, cabin } });
    expect(r.ok || (r as { error: string }).error === 'cabinUnchanged').toBe(true);
    expect(state.airlines[airlineId]!.cash.amount).toBe(cash);
    expect(state.aircraft[aircraftId]!.seats).toBe(totalSeats(cabin));
    expect(state.aircraft[aircraftId]!.refitUntil).toBeUndefined();
  });

  it('takes an aircraft out of service, cancels its flights and writes the cost off', () => {
    const { state, airlineId, aircraftId } = startup();
    advance(state, world, state.aircraft[aircraftId]!.deliveryAt + 1);
    applyCommand(state, world, { type: 'OpenRoute', airlineId, payload: { destinationId: 'LGAV', aircraftId, frequency: 7, fareFactor: 1 } });
    const type = getAircraftType(state.aircraft[aircraftId]!.typeId);
    const target = stylesFor(type).map((s) => standardCabin(type, s)).find((c) => refitQuote(type, state.aircraft[aircraftId]!.cabin, c).newSeats > 0)
      ?? economyCabin(type, totalSeats(state.aircraft[aircraftId]!.cabin) - 6);
    const cash = state.airlines[airlineId]!.cash.amount;
    expect(applyCommand(state, world, { type: 'RefitCabin', airlineId, payload: { aircraftId, cabin: target } }).ok).toBe(true);
    const aircraft = state.aircraft[aircraftId]!;
    expect(state.airlines[airlineId]!.cash.amount).toBeLessThan(cash);
    expect(aircraft.refitUntil).toBeGreaterThan(state.time);
    expect(applyCommand(state, world, { type: 'RefitCabin', airlineId, payload: { aircraftId, cabin: target } })).toEqual({ ok: false, error: 'inRefit' });
    // No passengers while in the hangar, but the write-off runs.
    const until = aircraft.refitUntil!;
    advance(state, world, until - 1440);
    const month = state.finance[airlineId]!.month;
    expect(month.lines.depreciation).toBeGreaterThan(0);
    advance(state, world, until + 3 * 1440);
    expect(aircraft.refitUntil).toBeUndefined();
    expect(state.messages.some((m) => m.kind === 'refitDone')).toBe(true);
  });
});

describe('reputation', () => {
  it('rises with a good product and falls with a cramped old one', () => {
    const good = newReputation();
    const bad = newReputation();
    for (let w = 0; w < 26; w++) {
      addExperience(good, { J: { pax: 100, product: 100 * 6, age: 300, value: 0, crowd: 0 }, Y: { pax: 1000, product: 1000 * 4, age: 3000, value: 0, crowd: 0 } });
      addExperience(bad, { Y: { pax: 1000, product: -1000 * 7, age: -1000 * 6, value: 0, crowd: -1000 * 4 } });
      closeReputationWeek(good, w);
      closeReputationWeek(bad, w);
    }
    expect(good.score).toBeGreaterThan(64);
    expect(bad.score).toBeLessThan(50);
    expect(good.history).toHaveLength(26);
  });

  it('becomes better known with passengers', () => {
    const rep = newReputation();
    const start = rep.awareness;
    for (let w = 0; w < 20; w++) {
      addExperience(rep, { Y: { pax: 10_000, product: 0, age: 0, value: 0, crowd: 0 } });
      closeReputationWeek(rep, w);
    }
    expect(rep.awareness).toBeGreaterThan(start + 0.3);
  });

  it('is kept up to date by the game every Monday', () => {
    const state = createGame({ seed: 4, startYear: 2026, timeMode: 'realtime', realism: 'realistic', scheduling: 'simple' });
    const r = applyCommand(state, world, {
      type: 'FoundAirline',
      payload: { name: 'Danube Air', iata: 'D7', icao: 'DNB', primary: '#c8102e', secondary: '#ffffff', hubId: 'LOWW', capitalEur: 75_000_000, controller: 'human' },
    });
    advance(state, world, simTime(2026, 2, 2));
    expect(state.reputation[(r as { id: string }).id]!.history.length).toBeGreaterThanOrEqual(4);
  });
});

describe('saves from before cabins', () => {
  it('get all-economy cabins, premium fares and a reputation', () => {
    const state = createGame({ seed: 5, startYear: 2026, timeMode: 'realtime', realism: 'realistic', scheduling: 'simple' });
    applyCommand(state, world, {
      type: 'FoundAirline',
      payload: { name: 'Danube Air', iata: 'D7', icao: 'DNB', primary: '#c8102e', secondary: '#ffffff', hubId: 'LOWW', capitalEur: 75_000_000, controller: 'human' },
    });
    const old = JSON.parse(JSON.stringify(state)) as GameState & Record<string, unknown>;
    old.version = 6;
    delete (old as Partial<GameState>).reputation;
    for (const o of old.market.offers) delete (o as Partial<typeof o>).cabin;
    const upgraded = migrate(old)!;
    expect(upgraded.version).toBe(SAVE_VERSION);
    expect(upgraded.market.offers.every((o) => o.cabin.length === 1 && o.cabin[0]!.cls === 'Y')).toBe(true);
    expect(Object.keys(upgraded.reputation)).toHaveLength(1);
  });
});

import { describe, expect, it } from 'vitest';
import airportsJson from '../data/generated/airports.json';
import countriesJson from '../data/generated/countries.json';
import fxJson from '../data/generated/fx-history.json';
import airportHistoryJson from '../data/generated/airport-history.json';
import airlinesJson from '../data/generated/airlines.json';
import networksJson from '../data/generated/networks.json';
import detailsJson from '../data/generated/airline-details.json';
import registersJson from '../data/generated/registers.json';
import eurostatJson from '../data/generated/routes-eurostat.json';
import airlineHistoryJson from '../data/generated/airline-history.json';
import { getAircraftType } from '../data/aircraft';
import { currencyAt, type FxHistory } from '../data/fxHistory';
import { eraLevels, faresFreeFrom, regulatedRange, stateOf } from '../data/eras';
import { newPriceUsd, orderBlock } from '../data/factory';
import type { Airport, Country } from '../data/types';
import { advance } from './advance';
import { economyCabin } from './cabins';
import { applyCommand, fareRange } from './commands';
import { airportOnDate, airportsAt, type AirportHistory } from './era';
import { createGame } from './game';
import { typicalRentUsd } from './market';
import { buildRealAirlines } from './realAirlines';
import { pnlCosts, type GameState } from './state';
import { simTime, toDate } from './time';
import { worldCache } from './world';

const airports = airportsJson as Airport[];
const countries = countriesJson as unknown as Record<string, Country>;
const history = airportHistoryJson as unknown as AirportHistory;
const fxHistory = fxJson as unknown as FxHistory;
const real = buildRealAirlines(airlinesJson as never, networksJson as never, detailsJson as never, registersJson as never, eurostatJson, airlineHistoryJson as never);
const worldAt = worldCache({ airports, countries, realAirlines: real, fxHistory, airportHistory: history });
const provider = (s: GameState) => worldAt(s.options.startYear, toDate(s.time));
const day = (iso: string) => new Date(`${iso}T12:00:00Z`);

/** A startup founded on 1 January of `year` at Vienna. */
function startup(year: number, capitalEur = 75_000_000) {
  const state = createGame({ seed: 7, startYear: year, timeMode: 'weekly', realism: 'realistic', scheduling: 'simple' }, worldAt(year, day(`${year}-01-01`)));
  const founded = applyCommand(state, provider(state), {
    type: 'FoundAirline',
    payload: { name: 'Danube Air', iata: 'D7', icao: 'DNB', primary: '#c8102e', secondary: '#ffffff', hubId: 'LOWW', capitalEur, controller: 'human' },
  });
  expect(founded.ok).toBe(true);
  // Crews (Phase 8.1) aren't what these tests are about: the first timetable gets its crews, as in games from before 8.1.
  delete state.airlines[(founded as { id: string }).id]!.crew;
  return { state, airlineId: (founded as { id: string }).id };
}

describe('airports through the years', () => {
  it('shows replaced airports as the old one until the move', () => {
    const in1990 = new Map(airportsAt(airports, history, day('1990-06-01')).map((a) => [a.id, a]));
    const kaiTak = in1990.get('VHHH')!;
    expect(kaiTak.iata).toBe('HKG');
    expect(kaiTak.name).toMatch(/Kai Tak/);
    expect(kaiTak.lon).toBeGreaterThan(114.18);
    expect(in1990.get('EDDM')!.name).toMatch(/Riem/);
    expect(in1990.get('EDDB')!.iata).toBe('TXL');
    expect(in1990.has('DE-0440')).toBe(true); // Schönefeld
    expect(in1990.has('DE-0456')).toBe(true); // Tempelhof
    const in2000 = new Map(airportsAt(airports, history, day('2000-06-01')).map((a) => [a.id, a]));
    expect(in2000.get('VHHH')!.name).not.toMatch(/Kai Tak/);
    expect(in2000.get('EDDM')!.name).not.toMatch(/Riem/);
    const in2021 = new Set(airportsAt(airports, history, day('2021-06-01')).map((a) => a.id));
    expect(in2021.has('DE-0440')).toBe(false);
    expect(in2021.has('DE-0456')).toBe(false);
  });

  it('leaves out airports before they opened, with the old airport taking their flights', () => {
    const in1972 = new Set(airportsAt(airports, history, day('1972-06-01')).map((a) => a.id));
    expect(in1972.has('KDFW')).toBe(false);
    expect(in1972.has('KDAL')).toBe(true);
    expect(in1972.has('LFPG')).toBe(false);
    expect(in1972.has('RJAA')).toBe(false);
    expect(airportOnDate(history, 'RJAA', day('1975-01-01'))).toBe('RJTT');
    expect(airportOnDate(history, 'RJAA', day('1979-01-01'))).toBe('RJAA');
    expect(airportOnDate(history, 'DE-0456', day('2010-01-01'))).toBe('EDDB');
    // Vienna, London and New York existed all the time.
    for (const id of ['LOWW', 'EGLL', 'KJFK']) expect(in1972.has(id)).toBe(true);
  });
});

describe('real airlines of past years (6.3)', () => {
  it('fly in 1980 with the types of the time: Austrian, Pan Am, Interflug, Aeroflot for the whole Soviet Union', () => {
    const w = worldAt(1980, day('1980-06-01'));
    const r = w.realAirlines!;
    const austrian = r.byId.get('AUA')!;
    expect(austrian.hubs).toContain('LOWW');
    expect(austrian.fleet.map((f) => f.type)).toEqual(expect.arrayContaining(['DC93']));
    expect(austrian.fleet.some((f) => f.type.startsWith('A3'))).toBe(false);
    expect(r.byId.get('Q8681')?.name).toBe('Pan Am');
    expect(r.byId.get('Q573915')?.name).toBe('Interflug');
    expect(r.byId.has('AFL')).toBe(true);
    // Airlines founded later are not there yet; every type flown was in service in 1980.
    for (const id of ['UAE', 'EZY', 'SWR', 'BEL']) expect(r.byId.has(id)).toBe(false);
    for (const a of r.byId.values()) for (const f of a.fleet) expect(getAircraftType(f.type).eis).toBeLessThanOrEqual(1980);
    // Vienna–London: the national carriers of both countries.
    expect(r.on('LOWW', 'EGLL').map((c) => c.airline.id)).toEqual(expect.arrayContaining(['AUA', 'BAW']));
    // West Berlin before reunification: only American, British and French airlines.
    expect(r.routesOf('AUA').some((x) => x.a === 'EDDB' || x.b === 'EDDB')).toBe(false); // EDDB = Tegel before 2020
    expect(r.byId.get('Q573915')!.hubs).toEqual(['DE-0440']); // Interflug at Schönefeld
    // A country without a real airline of that time in the data keeps a modelled national carrier.
    expect([...r.byId.values()].some((a) => a.modelled)).toBe(true);
  });

  it('grow young and low-cost airlines the way they really grew', () => {
    const routes = (id: string, year: number) => worldAt(1980, day(`${year}-06-01`)).realAirlines!.routesOf(id).length;
    expect(routes('RYR', 1990)).toBeLessThanOrEqual(5);
    expect(routes('RYR', 2012)).toBeGreaterThan(100);
    expect(routes('UAE', 1990)).toBeLessThan(routes('UAE', 2005));
    expect(routes('AUA', 1975)).toBeLessThan(routes('AUA', 2005));
  });

  it('start and stop flying on their real dates', () => {
    const has = (id: string, iso: string) => worldAt(1980, day(iso)).realAirlines!.byId.has(id);
    expect(has('Q8681', '1991-12-03')).toBe(true);
    expect(has('Q8681', '1991-12-05')).toBe(false); // Pan Am stopped flying on 4 December 1991
    expect(has('Q694098', '2002-03-30')).toBe(true);
    expect(has('Q694098', '2002-04-02')).toBe(false); // Swissair: 31 March 2002
    expect(has('UAE', '1985-03-20')).toBe(false);
    expect(has('UAE', '1985-03-30')).toBe(true); // Emirates: founded 25 March 1985
  });

  it('are in the news when they stop flying', { timeout: 60_000 }, () => {
    const state = createGame(
      { seed: 7, startYear: 1991, startTime: simTime(1991, 12, 1), timeMode: 'weekly', realism: 'realistic', scheduling: 'simple' },
      worldAt(1991, day('1991-12-01')),
    );
    applyCommand(state, provider(state), {
      type: 'FoundAirline',
      payload: { name: 'Danube Air', iata: 'D7', icao: 'DNB', primary: '#c8102e', secondary: '#ffffff', hubId: 'LOWW', capitalEur: 75_000_000, controller: 'human' },
    });
    advance(state, provider, simTime(1991, 12, 6));
    expect(state.messages.some((m) => m.kind === 'airlineCeased' && m.params.airline === 'Pan Am')).toBe(true);
  });

  it('let the old modelled carriers stand in when the airline history is not loaded', () => {
    const plain = buildRealAirlines(airlinesJson as never, networksJson as never, detailsJson as never, registersJson as never, eurostatJson);
    const r = worldCache({ airports, countries, realAirlines: plain, fxHistory, airportHistory: history })(1980, day('1980-06-01')).realAirlines!;
    expect(r.byId.get('~ATN')?.hubs).toContain('LOWW');
    expect(r.byId.has('~SUN')).toBe(true);
  });

});

describe('states of the time', () => {
  it('know the states of the time', () => {
    expect(stateOf('UA', 'UKBB', day('1985-01-01'))).toBe('SU');
    expect(stateOf('UA', 'UKBB', day('1995-01-01'))).toBe('UA');
    expect(stateOf('DE', 'EDDP', day('1985-01-01'))).toBe('DD');
    expect(stateOf('DE', 'EDDF', day('1985-01-01'))).toBe('DW');
    expect(stateOf('DE', 'EDDF', day('1995-01-01'))).toBe('DE');
    expect(stateOf('HR', 'LDZA', day('1990-01-01'))).toBe('YU');
  });
});

describe('money of the time', () => {
  it('keeps the books in schilling, with the same buying power as today', () => {
    const { state, airlineId } = startup(1975);
    const airline = state.airlines[airlineId]!;
    expect(airline.currency).toBe('ATS');
    // €75M of today ≈ US$14M of 1975 ≈ 250M schilling.
    expect(airline.cash.amount).toBeGreaterThan(180e6);
    expect(airline.cash.amount).toBeLessThan(330e6);
    // January 1975: ≈ 16.8 schilling per dollar (Federal Reserve H.10).
    expect(state.fx.ATS! / state.fx.USD!).toBeGreaterThan(16);
    expect(state.fx.ATS! / state.fx.USD!).toBeLessThan(18);
  });

  it('chooses the old units and dollars where the money of the time was different', () => {
    expect(currencyAt('TR', day('1990-01-01'))).toBe('TRL');
    expect(currencyAt('TR', day('2010-01-01'))).toBe('TRY');
    expect(currencyAt('PL', day('1985-01-01'))).toBe('USD');
    expect(currencyAt('PL', day('1992-01-01'))).toBe('PLZ');
    expect(currencyAt('BG', day('2000-01-01'))).toBe('BGN');
    expect(currencyAt('IL', day('1978-01-01'))).toBe('ILP');
  });

  it('switches to the euro on 1 January 1999 and restates the accounts', { timeout: 30_000 }, () => {
    const { state, airlineId } = startup(1998);
    advance(state, provider, simTime(1998, 12, 31));
    const before = state.airlines[airlineId]!.cash.amount;
    const pastRevenue = state.finance[airlineId]!.months.reduce((s, m) => s + pnlCosts(m.lines), 0);
    advance(state, provider, simTime(1999, 1, 2));
    const airline = state.airlines[airlineId]!;
    expect(airline.currency).toBe('EUR');
    // (one more day of overheads was paid in between, and December's interest on the cash came in on 1 January)
    expect(airline.cash.amount / (before / 13.7603)).toBeCloseTo(1, 2);
    const restated = state.finance[airlineId]!.months.slice(0, -1).reduce((s, m) => s + pnlCosts(m.lines), 0);
    expect(restated).toBeCloseTo(pastRevenue / 13.7603, -2);
    expect(state.messages.some((m) => m.kind === 'currencyChanged')).toBe(true);
  });

  it('prices aircraft, fares and costs in the money of the year', () => {
    expect(eraLevels(2025)).toEqual({ prices: 1, fares: 1, costs: 1 });
    const l1975 = eraLevels(1975);
    expect(l1975.prices).toBeGreaterThan(0.15);
    expect(l1975.prices).toBeLessThan(0.18);
    // Flying was much more expensive after inflation: fares ≈ half of today's in 1975 dollars, not a sixth.
    expect(l1975.fares).toBeGreaterThan(2.5 * l1975.prices);
    // A new 737-200 cost about US$4–5 million in the mid-1970s (list), with small discounts then.
    expect(newPriceUsd(getAircraftType('B732'), 1, 1975)).toBeGreaterThan(3e6);
    expect(newPriceUsd(getAircraftType('B732'), 1, 1975)).toBeLessThan(5.5e6);
    // A young aircraft rents for more than an old one of an older type.
    expect(typicalRentUsd(getAircraftType('B732'), 3, 1975)).toBeGreaterThan(typicalRentUsd(getAircraftType('B721'), 8, 1975) * 0.5);
  });

  it('lets a startup order the types that were being built then', () => {
    expect(orderBlock(getAircraftType('DC93'), 1975)).toBeNull();
    expect(orderBlock(getAircraftType('B732'), 1975)).toBeNull();
    expect(orderBlock(getAircraftType('DC93'), 1982)).toBe('notBuilt');
    expect(orderBlock(getAircraftType('A20N'), 1990)).toBe('notInService');
    expect(orderBlock(getAircraftType('T154'), 1980)).toBe('eastBloc');
    expect(orderBlock(getAircraftType('A320'), 2000)).toBeNull();
    expect(orderBlock(getAircraftType('A320'), 2026)).toBe('notBuilt');
  });
});

describe('regulated fares', () => {
  it('fixes fares in Europe until the single market, in the USA until 1978', () => {
    expect(faresFreeFrom('AT', 'GB')).toBe('1994-01-01');
    expect(faresFreeFrom('US', 'US')).toBe('1978-10-24');
    expect(regulatedRange('AT', 'GB', day('1985-01-01'))).toEqual([0.9, 1.1]);
    expect(regulatedRange('AT', 'GB', day('1996-01-01'))).toBeNull();
    const { state, airlineId } = startup(1985);
    const w = provider(state);
    expect(fareRange(state, w.airportById.get('LOWW')!, w.airportById.get('EGLL')!)).toEqual([0.9, 1.1]);
    state.aircraft.T1 = {
      id: 'T1', typeId: 'B733', airlineId, registration: 'OE-ILA', builtYear: 1984, seats: 140, cabin: economyCabin(getAircraftType('B733'), 140), status: 'active', deliveryAt: state.time, locationId: 'LOWW',
      lease: { lessor: 'GPA', monthlyRent: { amount: 150_000, currency: 'USD' }, deposit: { amount: 300_000, currency: 'USD' }, startAt: state.time, endAt: state.time + 1e7 },
    };
    const cut = applyCommand(state, w, { type: 'OpenRoute', airlineId, payload: { destinationId: 'EGLL', aircraftId: 'T1', frequency: 7, fareFactor: 0.7 } });
    expect(cut).toEqual({ ok: false, error: 'fareInvalid' });
  });
});

describe('historical economics', () => {
  /** Weekly margin of a Vienna startup with one era aircraft at the market fare, after the ramp-up. */
  function margin(year: number, typeId: string, dests: [string, number][], builtYear: number) {
    const { state, airlineId } = startup(year, 200_000_000);
    const type = getAircraftType(typeId);
    const rent = typicalRentUsd(type, year - builtYear, year);
    state.aircraft.T1 = {
      id: 'T1', typeId, airlineId, registration: 'OE-ILA', builtYear, seats: type.seats.typical, cabin: economyCabin(type, type.seats.typical), status: 'active', deliveryAt: state.time, locationId: 'LOWW',
      lease: { lessor: 'GPA', monthlyRent: { amount: rent, currency: 'USD' }, deposit: { amount: 2 * rent, currency: 'USD' }, startAt: state.time, endAt: state.time + 1e7 },
    };
    for (const [dest, frequency] of dests) {
      const opened = applyCommand(state, provider(state), { type: 'OpenRoute', airlineId, payload: { destinationId: dest, aircraftId: 'T1', frequency, fareFactor: 1 } });
      expect(opened.ok, dest).toBe(true);
    }
    advance(state, provider, simTime(year, 5, 31));
    const weeks = state.finance[airlineId]!.history.slice(-6);
    const revenue = weeks.reduce((s, w) => s + w.lines.revenue, 0);
    const costs = weeks.reduce((s, w) => s + pnlCosts(w.lines), 0);
    return (revenue - costs) / revenue;
  }

  it('lets typical routes of each decade make believable money (not a gold mine, not a disaster)', () => {
    // A few flights a week to several big cities: markets were small then (Vienna–London had about two flights a day).
    const cases: [number, string, [string, number][], number][] = [
      [1975, 'DC93', [['EGLL', 4], ['LFPO', 4], ['EDDF', 4], ['LIRF', 3], ['LSZH', 3]], 1970],
      [1985, 'B733', [['EGLL', 5], ['LFPG', 5], ['EHAM', 4], ['LGAV', 4]], 1984],
      [1995, 'A320', [['EGLL', 7], ['EHAM', 5], ['LEBL', 5]], 1992],
      [2005, 'A320', [['LGAV', 14], ['LPPT', 4]], 2000],
    ];
    // In the first months a newcomer loses money in every era (2026 with the same Athens/Lisbon plan: ≈ −26 %), but no
    // decade is a gold mine or hopeless.
    for (const [year, type, dests, built] of cases) {
      const m = margin(year, type, dests, built);
      expect(m, `${year} ${type}`).toBeGreaterThan(-0.45);
      expect(m, `${year} ${type}`).toBeLessThan(0.3);
    }
  }, 60_000);
});

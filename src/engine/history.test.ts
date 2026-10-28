import { describe, expect, it } from 'vitest';
import airportsJson from '../data/generated/airports.json';
import countriesJson from '../data/generated/countries.json';
import fxJson from '../data/generated/fx-history.json';
import { demandIndex, worldDemandIndex } from '../data/economyHistory';
import { jetFuelSpot } from '../data/fuel';
import { currencyAt, monthOf, perUsdAt, type FxHistory } from '../data/fxHistory';
import { HISTORIC_EVENTS } from '../data/history';
import type { Airport, Country } from '../data/types';
import en from '../i18n/en.json';
import { createGame } from './game';
import type { GameState } from './state';
import { MINUTES_PER_DAY, simTime } from './time';
import { closureCancels, conditionsOf, historicEvents, REAL_DATA_END } from './worldEvents';
import { buildEngineWorld } from './world';

const world = buildEngineWorld(airportsJson as Airport[], countriesJson as unknown as Record<string, Country>);
const ap = (id: string) => world.airportById.get(id)!;
const fx = fxJson as unknown as FxHistory;
const game = (seed = 1): GameState =>
  createGame({ seed, startYear: 2026, startTime: simTime(2026, 1, 5), timeMode: 'realtime', realism: 'realistic', scheduling: 'simple' });
const DAY = MINUTES_PER_DAY;
/** Ukraine has no airports with scheduled flights today, so they are missing from the airport data (until Phase 5.3). */
const NOT_IN_TODAYS_DATA = new Set(['UA', 'UKCC', 'UKCW']);

describe('the real event timeline', () => {
  it('is consistent: unique ids, known places, valid dates, a text in the game', () => {
    const ids = new Set<string>();
    const names = (en as unknown as { hist: Record<string, { name: string; text: string }> }).hist;
    for (const e of HISTORIC_EVENTS) {
      expect(ids.has(e.id), e.id).toBe(false);
      ids.add(e.id);
      for (const id of e.airports ?? []) if (!NOT_IN_TODAYS_DATA.has(id)) expect(world.airportById.has(id), `${e.id}: ${id}`).toBe(true);
      for (const c of [...(e.countries ?? []), ...(e.pairWith ?? [])]) if (!NOT_IN_TODAYS_DATA.has(c)) expect(world.countries[c], `${e.id}: ${c}`).toBeDefined();
      expect(e.start >= '1970-01-01' && e.start < '2026-10-24', e.id).toBe(true);
      if (e.end) expect(e.end >= e.start, e.id).toBe(true);
      expect(names[e.id]?.name, e.id).toBeTruthy();
      expect(e.depth).toBeGreaterThanOrEqual(0);
      expect(e.depth).toBeLessThanOrEqual(e.kind === 'fuelShock' ? 2 : 1);
    }
    expect(HISTORIC_EVENTS.length).toBeGreaterThan(100);
  });

  it('closes Europe for the 2010 ash cloud: Vienna–London cancelled, Vienna–Athens flies', () => {
    const state = game();
    const dep = simTime(2010, 4, 17) + 10 * 60;
    expect(closureCancels(state, world, 'LOWW', 'EGLL', dep, 'p1')?.historic).toBe('eyjafjallajokull2010');
    expect(closureCancels(state, world, 'LOWW', 'LGAV', dep, 'p1')?.historic).toBe('eyjafjallajokull2010'); // Vienna itself closed
    expect(closureCancels(state, world, 'LIRF', 'LGAV', dep, 'p1')).toBeNull();
    expect(closureCancels(state, world, 'LOWW', 'EGLL', simTime(2010, 4, 25), 'p1')).toBeNull();
  });

  it('flight bans only stop flights to the banned countries', () => {
    const state = game();
    const dep = simTime(2023, 6, 1) + 9 * 60;
    expect(closureCancels(state, world, 'LOWW', 'UUEE', dep, 'p')?.historic).toBe('russiaBan2022');
    expect(closureCancels(state, world, 'LTFM', 'UUEE', dep, 'p')).toBeNull();
    expect(closureCancels(state, world, 'EGKK', 'HESH', simTime(2017, 3, 1), 'p')?.historic).toBe('sinaiUk2015');
    expect(closureCancels(state, world, 'LOWW', 'HESH', simTime(2017, 3, 1), 'p')).toBeNull();
  });

  it('events still going on end at a different date in every game, after the real data', () => {
    const end = (seed: number) => historicEvents(seed).find((e) => e.historic === 'ukraine2022')!.end;
    const ends = [1, 2, 3, 4, 5].map(end);
    for (const t of ends) {
      expect(t).toBeGreaterThan(REAL_DATA_END + 80 * DAY);
      expect(t).toBeLessThan(REAL_DATA_END + 1100 * DAY);
    }
    expect(new Set(ends).size).toBeGreaterThan(1);
  });

  it('9/11 and SARS cut demand where they happened', () => {
    const state = game();
    const sept = conditionsOf(state, world, simTime(2001, 10, 1));
    expect(sept.demand(ap('KJFK'), ap('KLAX'), 'business')).toBeLessThan(0.85);
    const sars = conditionsOf(state, world, simTime(2003, 4, 20));
    expect(sars.demand(ap('LOWW'), ap('VHHH'), 'leisure')).toBeLessThan(0.6);
    expect(sars.demand(ap('LOWW'), ap('LFPG'), 'leisure')).toBeGreaterThan(0.85); // only the Iraq war dip in Europe
  });

  it('COVID cuts world air travel about as much as really happened', () => {
    const state = game();
    // A rough world mix: 40 % international, 60 % domestic travel.
    const year = (y: number) => {
      let sum = 0;
      for (let m = 1; m <= 12; m++) {
        const c = conditionsOf(state, world, simTime(y, m, 15));
        sum += 0.4 * c.demand(ap('LOWW'), ap('KJFK'), 'leisure') + 0.6 * c.demand(ap('KJFK'), ap('KLAX'), 'leisure');
      }
      return sum / 12;
    };
    expect(year(2019)).toBe(1);
    expect(year(2020)).toBeGreaterThan(0.33); // real: ≈ 0.40 of 2019
    expect(year(2020)).toBeLessThan(0.5);
    expect(year(2021)).toBeGreaterThan(0.42); // real: ≈ 0.51
    expect(year(2021)).toBeLessThan(0.62);
    expect(year(2022)).toBeGreaterThan(0.7); // real: ≈ 0.72
  });
});

describe('historical data', () => {
  it('jet fuel prices since 1970 in the money of their time', () => {
    expect(jetFuelSpot(new Date('1970-06-15'))).toBeGreaterThan(0.08);
    expect(jetFuelSpot(new Date('1970-06-15'))).toBeLessThan(0.16);
    expect(jetFuelSpot(new Date('1981-03-15'))).toBeGreaterThan(0.8); // after the second oil crisis
    expect(jetFuelSpot(new Date('2008-07-15'))).toBeGreaterThan(3.5);
    expect(jetFuelSpot(new Date('2020-04-15'))).toBeLessThan(0.9);
    // No jump where the monthly history meets the weekly 2026 data.
    expect(Math.abs(jetFuelSpot(new Date('2025-12-20')) - jetFuelSpot(new Date('2025-12-27')))).toBeLessThan(0.2);
  });

  it('exchange rates: the schilling, the euro and the fixed conversion', () => {
    expect(perUsdAt(fx, 'ATS', new Date('1970-06-15'))).toBeCloseTo(26, 0); // Bretton Woods parity
    expect(perUsdAt(fx, 'ATS', new Date('1985-02-15'))).toBeGreaterThan(20); // strongest dollar
    const eur = perUsdAt(fx, 'EUR', new Date('2005-06-15'))!;
    expect(perUsdAt(fx, 'ATS', new Date('2005-06-15'))! / eur).toBeCloseTo(13.7603, 3);
    expect(perUsdAt(fx, 'DEM', new Date('1995-06-15'))! / perUsdAt(fx, 'EUR', new Date('1995-06-15'))!).toBeCloseTo(1.95583, 3);
    expect(perUsdAt(fx, 'JPY', new Date('1970-06-15'))).toBe(360);
    expect(monthOf(fx, new Date('1960-01-01'))).toBe(0);
    for (const [c, s] of Object.entries(fx.perUsd)) expect(s.every((v) => v !== null && v > 0), c).toBe(true);
  });

  it('the money each country used', () => {
    expect(currencyAt('AT', new Date('1998-12-31'))).toBe('ATS');
    expect(currencyAt('AT', new Date('1999-01-01'))).toBe('EUR');
    expect(currencyAt('GR', new Date('2000-06-01'))).toBe('GRD');
    expect(currencyAt('HR', new Date('2022-06-01'))).toBe('HRK');
    expect(currencyAt('GB', new Date('1980-06-01'))).toBe('GBP');
  });

  it('air travel grows with the economy: little in 1970, much in China since', () => {
    expect(worldDemandIndex(1970.5)).toBeGreaterThan(0.04);
    expect(worldDemandIndex(1970.5)).toBeLessThan(0.12);
    expect(worldDemandIndex(2000.5)).toBeGreaterThan(worldDemandIndex(1990.5));
    expect(worldDemandIndex(2026)).toBe(1);
    expect(demandIndex('CN', 1990.5)).toBeLessThan(demandIndex('AT', 1990.5));
    expect(demandIndex('AT', 1990.5)).toBeLessThan(0.6);
    const old = conditionsOf(game(), world, simTime(1990, 6, 1));
    expect(old.growth(ap('LOWW'), ap('EGLL'))).toBeLessThan(0.6);
  });
});

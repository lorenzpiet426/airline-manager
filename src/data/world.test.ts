// Sanity checks for the generated world data. If a future data refresh breaks something
// important (missing hub, wrong runway, broken time zone), these tests fail before the game is published.
import { describe, expect, it } from 'vitest';
import airportsJson from './generated/airports.json';
import countriesJson from './generated/countries.json';
import type { Airport, Country } from './types';

const airports = airportsJson as Airport[];
const countries = countriesJson as Record<string, Country>;
const byIata = new Map(airports.filter((a) => a.iata).map((a) => [a.iata!, a]));

describe('airports', () => {
  it('covers the world’s scheduled-service airports', () => {
    expect(airports.length).toBeGreaterThan(3500);
  });

  it('has unique ids and unique IATA codes', () => {
    expect(new Set(airports.map((a) => a.id)).size).toBe(airports.length);
    const iata = airports.flatMap((a) => (a.iata ? [a.iata] : []));
    expect(new Set(iata).size).toBe(iata.length);
  });

  it('includes the major hubs', () => {
    for (const code of ['VIE', 'LHR', 'CDG', 'FRA', 'MUC', 'ZRH', 'IST', 'DXB', 'DOH', 'JFK', 'ATL', 'LAX', 'HND', 'SIN', 'SYD', 'GRU', 'JNB']) {
      expect(byIata.get(code), code).toBeDefined();
      expect(byIata.get(code)!.size, code).toBe('large');
    }
  });

  it('has correct data for Vienna (VIE/LOWW)', () => {
    const vie = byIata.get('VIE')!;
    expect(vie.icao).toBe('LOWW');
    expect(vie.country).toBe('AT');
    expect(vie.tz).toBe('Europe/Vienna');
    expect(vie.lat).toBeCloseTo(48.11, 1);
    expect(vie.lon).toBeCloseTo(16.57, 1);
    expect(vie.elevationFt).toBe(600);
    expect(vie.runways.map((r) => r.ends).sort()).toEqual(['11/29', '16/34']);
    expect(vie.longestRunwayM).toBe(3600);
    expect(vie.catchmentPop).toBeGreaterThan(2_000_000);
  });

  it('has plausible values everywhere', () => {
    for (const a of airports) {
      expect(Math.abs(a.lat), a.id).toBeLessThanOrEqual(90);
      expect(Math.abs(a.lon), a.id).toBeLessThanOrEqual(180);
      expect(a.longestRunwayM, a.id).toBeLessThan(6000);
      expect(a.tz, a.id).toMatch(/^[A-Za-z_]+\/[A-Za-z_\-/]+$/);
      expect(countries[a.country], `${a.id} country ${a.country}`).toBeDefined();
    }
  });

  it('uses time zones the browser understands', () => {
    for (const tz of new Set(airports.map((a) => a.tz))) {
      expect(() => new Intl.DateTimeFormat('en', { timeZone: tz }), tz).not.toThrow();
    }
  });

  it('puts famous airports in the right time zone', () => {
    expect(byIata.get('JFK')!.tz).toBe('America/New_York');
    expect(byIata.get('LAX')!.tz).toBe('America/Los_Angeles');
    expect(byIata.get('DXB')!.tz).toBe('Asia/Dubai');
    expect(byIata.get('SYD')!.tz).toBe('Australia/Sydney');
  });
});

describe('countries', () => {
  it('every country has a GDP per capita', () => {
    for (const c of Object.values(countries)) expect(c.gdpPerCapitaUsd, c.code).toBeGreaterThan(0);
  });

  it('wealth values are in a believable range', () => {
    expect(countries.AT!.gdpPerCapitaUsd).toBeGreaterThan(40_000);
    expect(countries.AT!.gdpPerCapitaUsd).toBeLessThan(90_000);
    expect(countries.IN!.gdpPerCapitaUsd).toBeLessThan(10_000);
  });
});

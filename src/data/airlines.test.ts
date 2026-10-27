import { describe, expect, it } from 'vitest';
import airlinesJson from './generated/airlines.json';
import routesJson from './generated/routes-eurostat.json';
import airportsJson from './generated/airports.json';

const airlines = airlinesJson.airlines;
const byIcao = new Map(airlines.map((a) => [a.icao, a]));
const airportIds = new Set((airportsJson as { id: string }[]).map((a) => a.id));

describe('real airlines (Wikidata)', () => {
  it('has the well-known airlines with the right codes and home bases', () => {
    const expect_ = (icao: string, name: string, iata: string, country: string, hub?: string) => {
      const a = byIcao.get(icao);
      expect(a?.name, icao).toBe(name);
      expect(a?.iata, icao).toBe(iata);
      expect(a?.country, icao).toBe(country);
      if (hub) expect(a?.hubs, icao).toContain(hub);
    };
    expect_('AUA', 'Austrian Airlines', 'OS', 'AT', 'LOWW');
    expect_('DLH', 'Lufthansa', 'LH', 'DE', 'EDDF');
    expect_('THY', 'Turkish Airlines', 'TK', 'TR');
    expect_('RYR', 'Ryanair', 'FR', 'IE');
    expect_('WZZ', 'Wizz Air', 'W6', 'HU', 'LHBP');
    expect_('UAE', 'Emirates', 'EK', 'AE', 'OMDB');
  });

  it('has one airline per ICAO code, only known airports as hubs, and no cargo-only carriers', () => {
    expect(airlines.length).toBeGreaterThan(1000);
    expect(new Set(airlines.map((a) => a.icao)).size).toBe(airlines.length);
    for (const a of airlines) for (const h of a.hubs) expect(airportIds.has(h), `${a.icao} ${h}`).toBe(true);
    // Airlines tagged as cargo carriers in Wikidata are left out (others without passenger routes drop out later).
    expect(byIcao.has('FDX')).toBe(false); // FedEx Express
    expect(byIcao.has('UPS')).toBe(false); // UPS Airlines
  });
});

describe('Eurostat route totals (summer 2024)', () => {
  const route = (from: string, to: string) => routesJson.routes.find((r) => r.from === from && r.to === to);

  it('is labelled with its season', () => {
    expect(routesJson.season).toBe('S24');
  });

  it('matches known traffic: Vienna–London Heathrow ~8 flights a day each way, Vienna–New York daily', () => {
    expect(route('LOWW', 'EGLL')!.weeklyFlights).toBeGreaterThan(45);
    expect(route('LOWW', 'EGLL')!.weeklyFlights).toBeLessThan(75);
    expect(route('LOWW', 'KJFK')!.weeklyFlights).toBeGreaterThan(5);
    expect(route('LOWW', 'KJFK')!.weeklyFlights).toBeLessThan(10);
    // Seats per flight are plausible for every route (no unit mix-ups).
    for (const r of routesJson.routes) if (r.weeklyFlights >= 7) expect(r.weeklySeats / r.weeklyFlights, `${r.from}-${r.to}`).toBeLessThan(600);
  });
});

import { describe, expect, it } from 'vitest';
import airportsJson from '../data/generated/airports.json';
import countriesJson from '../data/generated/countries.json';
import airlinesJson from '../data/generated/airlines.json';
import networksJson from '../data/generated/networks.json';
import detailsJson from '../data/generated/airline-details.json';
import registersJson from '../data/generated/registers.json';
import eurostatJson from '../data/generated/routes-eurostat.json';
import type { Airport, Country } from '../data/types';
import { getAircraftType } from '../data/aircraft';
import { competitorsOn, routeWeek } from './economics';
import { buildRealAirlines, type RealAirlines } from './realAirlines';
import { buildEngineWorld } from './world';

const real = buildRealAirlines(airlinesJson as never, networksJson as never, detailsJson as never, registersJson as never, eurostatJson) as RealAirlines;
const world = buildEngineWorld(airportsJson as Airport[], countriesJson as unknown as Record<string, Country>, real);
const ap = (id: string) => world.airportById.get(id)!;
const JUL = new Date(Date.UTC(2026, 6, 15));

describe('real airlines in the engine', () => {
  it('knows who flies Vienna–London Heathrow and how often', () => {
    const c = competitorsOn(world, ap('LOWW'), ap('EGLL'))!;
    expect(c.map((x) => x.airlineId)).toEqual(expect.arrayContaining(['AUA', 'BAW']));
    const total = c.reduce((s, x) => s + x.weekly, 0);
    expect(total).toBeGreaterThan(45);
    expect(total).toBeLessThan(75);
    // Two airlines share the official route total: both numbers are estimates.
    expect(c.every((x) => x.source === 'modelled')).toBe(true);
  });

  it('fills routes without official numbers with the demand model', () => {
    const vie = real.routesOf('AUA').find((r) => (r.a === 'LOWW' || r.b === 'LOWW') && r.weeklyAB === null)!;
    const other = vie.a === 'LOWW' ? vie.b : vie.a;
    const c = competitorsOn(world, ap('LOWW'), ap(other))!.find((x) => x.airlineId === 'AUA')!;
    expect(c.source).toBe('modelled');
    expect(c.weekly).toBeGreaterThanOrEqual(1);
  });

  it('gives low-cost airlines a lower fare level and real colours where known', () => {
    expect(real.byId.get('RYR')!.model).toBe('lowcost');
    expect(real.byId.get('AUA')!.colors).toEqual({ primary: '#e2001a', secondary: '#ffffff', source: 'known' });
    expect(real.byId.get('AUA')!.registered.length).toBe(68);
  });

  it('makes entering a busy route against real airlines hard, an empty one easier', () => {
    const type = getAircraftType('A20N');
    const plan = { type, seats: 165, frequency: 14, fareFactor: 1, ageYears: 5, rampUp: 1 };
    const busy = routeWeek(world, ap('LOWW'), ap('EGLL'), plan, JUL);
    expect(busy.loadFactor).toBeLessThan(0.8);
    expect(busy.loadFactor).toBeGreaterThan(0.2);
  });
});

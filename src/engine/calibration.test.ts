// Phase 6.1: the real airlines flying their real networks must carry, fill and earn about what their annual reports
// say (Austrian Airlines 2024: 14.6 m passengers, load factor 81 %, adjusted EBIT margin 3.1 %, about half of them
// changing planes in Vienna; Ryanair FY25: load factor 94 %, ~11 % operating margin, ~€70 revenue per passenger).
// The model is simpler than reality, so the ranges are wide; they catch changes that break the economics.
import { describe, expect, it } from 'vitest';
import airportsJson from '../data/generated/airports.json';
import countriesJson from '../data/generated/countries.json';
import airlinesJson from '../data/generated/airlines.json';
import networksJson from '../data/generated/networks.json';
import detailsJson from '../data/generated/airline-details.json';
import registersJson from '../data/generated/registers.json';
import eurostatJson from '../data/generated/routes-eurostat.json';
import type { Airport, Country } from '../data/types';
import { evaluate } from './ai';
import { competitorsOn } from './economics';
import { createGame } from './game';
import { buildRealAirlines } from './realAirlines';
import { realHubLegs, realLegTransfers, transferTable } from './transfers';
import { buildEngineWorld } from './world';
import { slow } from '../testing/slow';

const real = buildRealAirlines(airlinesJson as never, networksJson as never, detailsJson as never, registersJson as never, eurostatJson);
const world = buildEngineWorld(airportsJson as Airport[], countriesJson as unknown as Record<string, Country>, real);

/** An airline's year (four months, each counted for three) with its real network and fares. */
function year(id: string) {
  const state = createGame({ seed: 1, startYear: 2026, timeMode: 'realtime', realism: 'realistic', scheduling: 'simple' });
  const airline = real.byId.get(id)!;
  const t = { revenue: 0, profit: 0, pax: 0, ask: 0, rpk: 0 };
  for (const month of [0, 3, 6, 9]) {
    const date = new Date(Date.UTC(2025, month, 15));
    for (const r of real.routesOf(id)) {
      const A = world.airportById.get(r.a);
      const B = world.airportById.get(r.b);
      if (!A || !B) continue;
      const me = competitorsOn(world, A, B)?.find((c) => c.airlineId === id);
      if (!me) continue;
      const e = evaluate(world, state, airline, A, B, me.weekly, me.fareFactor, undefined, date, false);
      if (!e) continue;
      t.revenue += e.revenue;
      t.profit += e.profit;
      t.pax += e.pax;
      t.ask += e.seats * e.km;
      t.rpk += e.pax * e.km;
    }
  }
  // One evaluation covers both directions for a week; four sample weeks stand for 52.
  return { paxPerYear: (t.pax * 52) / 4, loadFactor: t.rpk / t.ask, margin: t.profit / t.revenue, revenuePerPax: t.revenue / t.pax };
}

describe('real airlines earn about what they really earn (6.1)', () => {
  it('Austrian Airlines: passengers, load factor and a small profit', () => {
    const aua = year('AUA');
    expect(aua.paxPerYear).toBeGreaterThan(11e6);
    expect(aua.paxPerYear).toBeLessThan(18e6);
    expect(aua.loadFactor).toBeGreaterThan(0.55);
    expect(aua.margin).toBeGreaterThan(-0.02); // before overheads (≈ 3 % of revenue)
    expect(aua.margin).toBeLessThan(0.14);
  }, slow(60_000));

  it('Ryanair: full planes, low fares, a healthy margin', () => {
    const ryr = year('RYR');
    expect(ryr.loadFactor).toBeGreaterThan(0.75);
    expect(ryr.revenuePerPax).toBeGreaterThan(65);
    expect(ryr.revenuePerPax).toBeLessThan(110);
    expect(ryr.margin).toBeGreaterThan(0.05);
    expect(ryr.margin).toBeLessThan(0.25);
  }, slow(60_000));

  it('about half of Austrian\'s passengers can change planes in Vienna', () => {
    const aua = real.byId.get('AUA')!;
    const legs = realHubLegs(world, aua, 'LOWW');
    const table = transferTable(world, 'LOWW', legs, 'AUA');
    let transfer = 0;
    let flights = 0;
    for (const [dest, weekly] of legs) {
      transfer += table.get(dest)?.pax ?? 0;
      flights += weekly;
    }
    // Real: ~118 passengers per Austrian flight from Vienna (Eurostat), ~46 % of them transfers (Flughafen Wien 2024).
    const perFlight = transfer / flights;
    expect(perFlight).toBeGreaterThan(35);
    expect(perFlight).toBeLessThan(80);
    // Transfer passengers pay a share of their whole journey's fare: less than a local fare on the leg.
    expect(table.get('KJFK')!.yield).toBeLessThan(1);
  });

  it('a low-cost airline sells no connections', () => {
    const ryr = real.byId.get('RYR')!;
    expect(realLegTransfers(world, ryr, 'EIDW', 'EGSS')).toBeNull();
    expect(realLegTransfers(world, real.byId.get('AUA')!, 'LOWW', 'KJFK')!.pax).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import networksJson from './generated/networks.json';
import detailsJson from './generated/airline-details.json';

const networks = new Map(networksJson.airlines.map((n) => [n.id, n]));
const details = new Map(detailsJson.airlines.map((d) => [d.id, d]));
const fleetOf = (id: string) => new Map(details.get(id)!.fleet.map((f) => [f.type, f.inService]));

describe('real airline networks (Wikipedia + Eurostat)', () => {
  it('has the season and a large world network', () => {
    expect(networksJson.season).toBe('S24');
    expect(networksJson.airlines.length).toBeGreaterThan(700);
    expect(networksJson.airlines.reduce((s, n) => s + n.routes.length, 0)).toBeGreaterThan(40_000);
  });

  it('gives Austrian its Vienna network and Lufthansa its Frankfurt/Munich network', () => {
    const vie = networks.get('AUA')!.routes.filter((r) => r.a === 'LOWW' || r.b === 'LOWW');
    expect(vie.length).toBeGreaterThan(100);
    expect(vie.some((r) => r.a === 'EGLL' || r.b === 'EGLL')).toBe(true);
    const dlh = networks.get('DLH')!;
    expect(dlh.hubs).toEqual(expect.arrayContaining(['EDDF', 'EDDM']));
    expect(dlh.routes.length).toBeGreaterThan(150);
  });

  it('splits official totals: an airline never gets more flights than the whole route has', () => {
    for (const n of networksJson.airlines) for (const r of n.routes) {
      if (r.weeklyAB !== null) expect(r.weeklyAB, `${n.id} ${r.a}-${r.b}`).toBeLessThan(500);
    }
  });
});

describe('real airline fleets and business models (Wikipedia)', () => {
  it('reads fleet tables correctly (current fleet only, no delivery history)', () => {
    expect(fleetOf('AUA').get('A320')).toBe(29);
    expect(fleetOf('AUA').get('E195')).toBe(13);
    const ek = fleetOf('UAE');
    expect(ek.get('A388')).toBeGreaterThan(90);
    expect(ek.get('A388')).toBeLessThan(130);
    expect(fleetOf('RYR').get('B738')).toBeGreaterThan(300);
  });

  it('knows low-cost carriers', () => {
    for (const id of ['RYR', 'WZZ', 'EZY']) expect(details.get(id)!.model, id).toBe('lowcost');
    expect(details.get('AUA')!.model).toBe('legacy');
  });
});

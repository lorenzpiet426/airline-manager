import { describe, expect, it } from 'vitest';
import registersJson from './generated/registers.json';
import { aircraftTypeById } from './aircraft';

const fleet = (id: string) => registersJson.aircraft[id as keyof typeof registersJson.aircraft] ?? [];
const count = (id: string, type: string) => fleet(id).filter((a) => a[1] === type).length;

describe('official aircraft registers matched to airlines', () => {
  it('finds the big US, Canadian, Austrian and Irish fleets', () => {
    expect(fleet('UAL').length).toBeGreaterThan(800);
    expect(fleet('DAL').length).toBeGreaterThan(800);
    expect(fleet('SWA').length).toBeGreaterThan(600);
    expect(fleet('ACA').length).toBeGreaterThan(150);
    expect(fleet('SKW').length).toBeGreaterThan(400); // regional operator flying under partners' brands
    expect(fleet('AUA').length).toBe(68);
    expect(count('AUA', 'E195')).toBe(13);
    expect(fleet('RYR').length).toBeGreaterThan(300);
  });

  it('uses the right registration formats and known aircraft types', () => {
    for (const [reg] of fleet('DAL')) expect(reg).toMatch(/^N[0-9A-Z]{1,5}$/);
    for (const [reg] of fleet('ACA')) expect(reg).toMatch(/^C-[A-Z]{4}$/);
    for (const [reg] of fleet('AUA')) expect(reg).toMatch(/^OE-L[A-Z]{2}$/);
    for (const list of Object.values(registersJson.aircraft)) for (const [, type] of list) expect(aircraftTypeById.has(String(type)), String(type)).toBe(true);
    expect(count('SWA', 'B737') + count('SWA', 'B38M')).toBeGreaterThan(600);
  });
});

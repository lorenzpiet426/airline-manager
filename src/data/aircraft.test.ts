import { describe, expect, it } from 'vitest';
import { AIRCRAFT_TYPES } from './aircraft';
import { bookCurrencyFor, ECB_RATES } from './currencies';
import { REGISTRATION_PATTERNS } from './registrations';

describe('aircraft database', () => {
  it('has unique ids and plausible values for every type', () => {
    expect(new Set(AIRCRAFT_TYPES.map((t) => t.id)).size).toBe(AIRCRAFT_TYPES.length);
    for (const t of AIRCRAFT_TYPES) {
      expect(t.icao, t.id).toMatch(/^[A-Z0-9]{3,4}$/);
      expect(t.seats.typical, t.id).toBeLessThanOrEqual(t.seats.max);
      expect(t.rangeKm, t.id).toBeGreaterThan(1000);
      expect(t.rangeKm, t.id).toBeLessThan(18000);
      expect(t.takeoffM, t.id).toBeGreaterThan(300); // a Twin Otter needs 366 m
      expect(t.takeoffM, t.id).toBeLessThan(3500);
      // Built from entry into service (±1 year); converted freighters were built earlier as passenger jets.
      expect(t.built[0], t.id).toBeLessThanOrEqual(t.eis + 1);
      if (t.payloadT === undefined) expect(t.built[0], t.id).toBeGreaterThanOrEqual(t.eis - 3);
      else expect(t.payloadT, t.id).toBeGreaterThan(5);
      if (t.built[1] !== null) expect(t.built[1], t.id).toBeGreaterThanOrEqual(t.built[0]);
      expect(t.lease.usdK * 1000 * 12 * 15, t.id).toBeLessThan(t.listPriceUsdM * 1e6 * 1.5);
    }
  });

  it('covers the common types flown today, incl. turboprops, regional jets and freighters', () => {
    const icaos = new Set(AIRCRAFT_TYPES.map((t) => t.icao));
    for (const code of ['AT45', 'AT75', 'DH8C', 'CRJ9', 'E195', 'A319', 'B737', 'B739', 'B752', 'A332', 'A388', 'B763', 'B772', 'B744', 'MD11']) {
      expect(icaos.has(code), code).toBe(true);
    }
    expect(AIRCRAFT_TYPES.filter((t) => t.payloadT !== undefined).length).toBeGreaterThanOrEqual(8);
  });

  it('orders the A320 family sensibly', () => {
    const byId = Object.fromEntries(AIRCRAFT_TYPES.map((t) => [t.id, t]));
    expect(byId.A21N!.seats.typical).toBeGreaterThan(byId.A20N!.seats.typical);
    expect(byId['A21N-XLR']!.rangeKm).toBeGreaterThan(byId.A21N!.rangeKm);
    expect(byId.A20N!.lease.usdK).toBeGreaterThan(byId.A320!.lease.usdK);
  });
});

describe('currencies and registrations', () => {
  it('maps hubs to book currencies that have an exchange rate', () => {
    expect(bookCurrencyFor('AT')).toBe('EUR');
    expect(bookCurrencyFor('BG')).toBe('EUR');
    expect(bookCurrencyFor('CH')).toBe('CHF');
    expect(bookCurrencyFor('GB')).toBe('GBP');
    expect(bookCurrencyFor('AE')).toBe('USD');
    for (const code of ['AT', 'US', 'JP', 'GB', 'CH', 'AU', 'DK']) expect(ECB_RATES[bookCurrencyFor(code)]).toBeGreaterThan(0);
  });

  it('has valid registration patterns', () => {
    for (const [country, pattern] of Object.entries(REGISTRATION_PATTERNS)) {
      expect(pattern, country).toMatch(/^[A-Z0-9-]*[?#%][?#%A-Z0-9]*$/);
    }
  });
});

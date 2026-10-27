import { describe, expect, it } from 'vitest';
import { formatLatLon, formatNumber, localTimeIn } from './format';

describe('formatting', () => {
  it('writes aviation-style coordinates', () => {
    expect(formatLatLon(48.1103, 16.5697)).toBe("N48°06.6' E016°34.2'");
    expect(formatLatLon(40.6394, -73.7793)).toBe("N40°38.4' W073°46.8'");
    expect(formatLatLon(-33.9461, 151.1772)).toBe("S33°56.8' E151°10.6'");
  });

  it('uses German and English number styles', () => {
    expect(formatNumber('de', 3600)).toMatch(/^3.600$/); // de-AT uses a (narrow) space or dot
    expect(formatNumber('en', 3600)).toBe('3,600');
  });

  it('knows the UTC offset of Vienna in winter and summer', () => {
    expect(localTimeIn('en', 'Europe/Vienna', new Date('2026-01-15T12:00:00Z'))).toEqual({ time: '13:00', offset: 'UTC+1' });
    expect(localTimeIn('en', 'Europe/Vienna', new Date('2026-07-15T12:00:00Z'))).toEqual({ time: '14:00', offset: 'UTC+2' });
  });
});

// Which airports existed in which year (Phase 5.3, built by tools/build-airport-history.ts). Loaded on demand (≈ 10 kB).
import type { AirportHistory } from '../engine/era';

export const loadAirportHistory = async (): Promise<AirportHistory> =>
  (await import('./generated/airport-history.json')).default as unknown as AirportHistory;

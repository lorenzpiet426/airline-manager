// Starter aircraft database: the types a startup can lease today (Phase 1.3).
// Values are rounded manufacturer figures (typical 2-class seating, range with typical payload,
// take-off field length at maximum take-off weight, ISA, sea level). Lease rates are rough
// 2025 market levels from public trade-press reporting. Sources and caveats: docs/DATA_SOURCES.md.
// Fuel burn and maintenance costs are added in Phase 1.4 (from OpenAP and BTS Form 41).

export type AircraftCategory = 'turboprop' | 'regional' | 'narrowbody' | 'widebody';

export interface AircraftType {
  /** Our id; we use the ICAO type designator where it is unique. */
  id: string;
  /** ICAO type designator as filed in flight plans (A20N, B38M…). */
  icao: string;
  manufacturer: string;
  name: string;
  category: AircraftCategory;
  engines: string;
  /** Year of entry into service with the first airline. */
  eis: number;
  /** Years in which aircraft of this type were built (null = still in production). */
  built: [number, number | null];
  /** Year the type left passenger service worldwide (null = still flying). For historical start years. */
  retired: number | null;
  seats: { typical: number; max: number };
  rangeKm: number;
  cruiseKmh: number;
  mtowKg: number;
  /** Take-off field length at MTOW, ISA, sea level (m). Shorter flights need less. */
  takeoffM: number;
  /** Maximum ETOPS diversion time in minutes (0 = not approved for ETOPS). */
  etopsMin: number;
  /** Last published list price in millions of USD (airlines pay far less after discounts). */
  listPriceUsdM: number;
  /** Typical monthly lease rate (thousand USD) for an aircraft of the given age, 2025 market. */
  lease: { ageYears: number; usdK: number };
  /** Rough size of the world fleet: how often the type shows up on the lease market. */
  fleetWeight: number;
}

export const AIRCRAFT_TYPES: AircraftType[] = [
  // ── Turboprops ──────────────────────────────────────────────────────────────
  {
    id: 'AT46', icao: 'AT46', manufacturer: 'ATR', name: 'ATR 42-600', category: 'turboprop',
    engines: 'PW127XT-M', eis: 2012, built: [2012, null], retired: null,
    seats: { typical: 48, max: 50 }, rangeKm: 1326, cruiseKmh: 556, mtowKg: 18600, takeoffM: 1165,
    etopsMin: 0, listPriceUsdM: 19.5, lease: { ageYears: 5, usdK: 130 }, fleetWeight: 200,
  },
  {
    id: 'AT76', icao: 'AT76', manufacturer: 'ATR', name: 'ATR 72-600', category: 'turboprop',
    engines: 'PW127XT-M', eis: 2011, built: [2011, null], retired: null,
    seats: { typical: 70, max: 78 }, rangeKm: 1528, cruiseKmh: 510, mtowKg: 23000, takeoffM: 1367,
    etopsMin: 0, listPriceUsdM: 26.8, lease: { ageYears: 5, usdK: 175 }, fleetWeight: 900,
  },
  {
    id: 'DH8D', icao: 'DH8D', manufacturer: 'De Havilland Canada', name: 'Dash 8-400', category: 'turboprop',
    engines: 'PW150A', eis: 2000, built: [2000, 2022], retired: null,
    seats: { typical: 78, max: 90 }, rangeKm: 2040, cruiseKmh: 667, mtowKg: 29574, takeoffM: 1425,
    etopsMin: 0, listPriceUsdM: 32.0, lease: { ageYears: 10, usdK: 130 }, fleetWeight: 450,
  },
  // ── Regional jets ───────────────────────────────────────────────────────────
  {
    id: 'E175', icao: 'E175', manufacturer: 'Embraer', name: 'E175', category: 'regional',
    engines: 'CF34-8E', eis: 2005, built: [2005, null], retired: null,
    seats: { typical: 76, max: 88 }, rangeKm: 3700, cruiseKmh: 829, mtowKg: 40370, takeoffM: 2244,
    etopsMin: 0, listPriceUsdM: 55.0, lease: { ageYears: 5, usdK: 190 }, fleetWeight: 750,
  },
  {
    id: 'E190', icao: 'E190', manufacturer: 'Embraer', name: 'E190', category: 'regional',
    engines: 'CF34-10E', eis: 2005, built: [2005, 2020], retired: null,
    seats: { typical: 100, max: 114 }, rangeKm: 4537, cruiseKmh: 829, mtowKg: 51800, takeoffM: 2056,
    etopsMin: 0, listPriceUsdM: 50.0, lease: { ageYears: 10, usdK: 150 }, fleetWeight: 450,
  },
  {
    id: 'E290', icao: 'E290', manufacturer: 'Embraer', name: 'E190-E2', category: 'regional',
    engines: 'PW1900G', eis: 2018, built: [2018, null], retired: null,
    seats: { typical: 97, max: 114 }, rangeKm: 5278, cruiseKmh: 829, mtowKg: 56400, takeoffM: 1730,
    etopsMin: 120, listPriceUsdM: 63.0, lease: { ageYears: 3, usdK: 250 }, fleetWeight: 40,
  },
  {
    id: 'E295', icao: 'E295', manufacturer: 'Embraer', name: 'E195-E2', category: 'regional',
    engines: 'PW1900G', eis: 2019, built: [2019, null], retired: null,
    seats: { typical: 120, max: 146 }, rangeKm: 4815, cruiseKmh: 829, mtowKg: 62500, takeoffM: 1970,
    etopsMin: 120, listPriceUsdM: 68.4, lease: { ageYears: 3, usdK: 290 }, fleetWeight: 120,
  },
  // ── Narrow-bodies ───────────────────────────────────────────────────────────
  {
    id: 'BCS1', icao: 'BCS1', manufacturer: 'Airbus', name: 'A220-100', category: 'narrowbody',
    engines: 'PW1500G', eis: 2016, built: [2016, null], retired: null,
    seats: { typical: 110, max: 135 }, rangeKm: 6390, cruiseKmh: 829, mtowKg: 63100, takeoffM: 1463,
    etopsMin: 180, listPriceUsdM: 81.0, lease: { ageYears: 4, usdK: 240 }, fleetWeight: 70,
  },
  {
    id: 'BCS3', icao: 'BCS3', manufacturer: 'Airbus', name: 'A220-300', category: 'narrowbody',
    engines: 'PW1500G', eis: 2016, built: [2016, null], retired: null,
    seats: { typical: 140, max: 160 }, rangeKm: 6700, cruiseKmh: 829, mtowKg: 70900, takeoffM: 1890,
    etopsMin: 180, listPriceUsdM: 91.5, lease: { ageYears: 4, usdK: 300 }, fleetWeight: 350,
  },
  {
    id: 'A320', icao: 'A320', manufacturer: 'Airbus', name: 'A320ceo', category: 'narrowbody',
    engines: 'CFM56-5B / V2500', eis: 1988, built: [1988, 2019], retired: null,
    seats: { typical: 150, max: 180 }, rangeKm: 6100, cruiseKmh: 829, mtowKg: 78000, takeoffM: 2090,
    etopsMin: 180, listPriceUsdM: 101.0, lease: { ageYears: 10, usdK: 260 }, fleetWeight: 3800,
  },
  {
    id: 'A20N', icao: 'A20N', manufacturer: 'Airbus', name: 'A320neo', category: 'narrowbody',
    engines: 'LEAP-1A / PW1100G', eis: 2016, built: [2016, null], retired: null,
    seats: { typical: 165, max: 194 }, rangeKm: 6500, cruiseKmh: 829, mtowKg: 79000, takeoffM: 2100,
    etopsMin: 180, listPriceUsdM: 110.6, lease: { ageYears: 3, usdK: 390 }, fleetWeight: 2000,
  },
  {
    id: 'A321', icao: 'A321', manufacturer: 'Airbus', name: 'A321ceo', category: 'narrowbody',
    engines: 'CFM56-5B / V2500', eis: 1994, built: [1994, 2019], retired: null,
    seats: { typical: 185, max: 220 }, rangeKm: 5950, cruiseKmh: 829, mtowKg: 93500, takeoffM: 2450,
    etopsMin: 180, listPriceUsdM: 118.3, lease: { ageYears: 10, usdK: 320 }, fleetWeight: 1700,
  },
  {
    id: 'A21N', icao: 'A21N', manufacturer: 'Airbus', name: 'A321neo', category: 'narrowbody',
    engines: 'LEAP-1A / PW1100G', eis: 2017, built: [2017, null], retired: null,
    seats: { typical: 206, max: 244 }, rangeKm: 6850, cruiseKmh: 829, mtowKg: 97000, takeoffM: 2350,
    etopsMin: 180, listPriceUsdM: 129.5, lease: { ageYears: 3, usdK: 460 }, fleetWeight: 1600,
  },
  {
    // Same ICAO designator as the A321neo; a separate id because range and price differ.
    id: 'A21N-XLR', icao: 'A21N', manufacturer: 'Airbus', name: 'A321XLR', category: 'narrowbody',
    engines: 'LEAP-1A / PW1100G', eis: 2024, built: [2024, null], retired: null,
    seats: { typical: 190, max: 220 }, rangeKm: 8700, cruiseKmh: 829, mtowKg: 101000, takeoffM: 2600,
    etopsMin: 180, listPriceUsdM: 142.0, lease: { ageYears: 1, usdK: 540 }, fleetWeight: 40,
  },
  {
    id: 'B738', icao: 'B738', manufacturer: 'Boeing', name: '737-800', category: 'narrowbody',
    engines: 'CFM56-7B', eis: 1998, built: [1998, 2019], retired: null,
    seats: { typical: 162, max: 189 }, rangeKm: 5436, cruiseKmh: 842, mtowKg: 79016, takeoffM: 2300,
    etopsMin: 180, listPriceUsdM: 106.1, lease: { ageYears: 12, usdK: 220 }, fleetWeight: 4400,
  },
  {
    id: 'B38M', icao: 'B38M', manufacturer: 'Boeing', name: '737-8 (MAX 8)', category: 'narrowbody',
    engines: 'LEAP-1B', eis: 2017, built: [2017, null], retired: null,
    seats: { typical: 172, max: 210 }, rangeKm: 6570, cruiseKmh: 842, mtowKg: 82191, takeoffM: 2500,
    etopsMin: 180, listPriceUsdM: 121.6, lease: { ageYears: 3, usdK: 390 }, fleetWeight: 1600,
  },
  {
    id: 'B39M', icao: 'B39M', manufacturer: 'Boeing', name: '737-9 (MAX 9)', category: 'narrowbody',
    engines: 'LEAP-1B', eis: 2018, built: [2018, null], retired: null,
    seats: { typical: 178, max: 220 }, rangeKm: 6570, cruiseKmh: 842, mtowKg: 88314, takeoffM: 2700,
    etopsMin: 180, listPriceUsdM: 128.9, lease: { ageYears: 3, usdK: 410 }, fleetWeight: 250,
  },
  // ── Wide-bodies ─────────────────────────────────────────────────────────────
  {
    id: 'A333', icao: 'A333', manufacturer: 'Airbus', name: 'A330-300', category: 'widebody',
    engines: 'Trent 700 / CF6-80E / PW4000', eis: 1994, built: [1994, 2020], retired: null,
    seats: { typical: 290, max: 440 }, rangeKm: 11750, cruiseKmh: 871, mtowKg: 242000, takeoffM: 2770,
    etopsMin: 240, listPriceUsdM: 264.2, lease: { ageYears: 12, usdK: 420 }, fleetWeight: 600,
  },
  {
    id: 'A339', icao: 'A339', manufacturer: 'Airbus', name: 'A330-900', category: 'widebody',
    engines: 'Trent 7000', eis: 2018, built: [2018, null], retired: null,
    seats: { typical: 287, max: 460 }, rangeKm: 13334, cruiseKmh: 871, mtowKg: 251000, takeoffM: 2770,
    etopsMin: 285, listPriceUsdM: 296.4, lease: { ageYears: 3, usdK: 980 }, fleetWeight: 200,
  },
  {
    id: 'B788', icao: 'B788', manufacturer: 'Boeing', name: '787-8', category: 'widebody',
    engines: 'GEnx-1B / Trent 1000', eis: 2011, built: [2011, null], retired: null,
    seats: { typical: 248, max: 359 }, rangeKm: 13530, cruiseKmh: 903, mtowKg: 227930, takeoffM: 2600,
    etopsMin: 330, listPriceUsdM: 248.3, lease: { ageYears: 8, usdK: 800 }, fleetWeight: 400,
  },
  {
    id: 'B789', icao: 'B789', manufacturer: 'Boeing', name: '787-9', category: 'widebody',
    engines: 'GEnx-1B / Trent 1000', eis: 2014, built: [2014, null], retired: null,
    seats: { typical: 296, max: 420 }, rangeKm: 14010, cruiseKmh: 903, mtowKg: 254011, takeoffM: 2800,
    etopsMin: 330, listPriceUsdM: 292.5, lease: { ageYears: 5, usdK: 1100 }, fleetWeight: 700,
  },
  {
    id: 'B78X', icao: 'B78X', manufacturer: 'Boeing', name: '787-10', category: 'widebody',
    engines: 'GEnx-1B / Trent 1000', eis: 2018, built: [2018, null], retired: null,
    seats: { typical: 336, max: 440 }, rangeKm: 11730, cruiseKmh: 903, mtowKg: 254011, takeoffM: 2900,
    etopsMin: 330, listPriceUsdM: 338.4, lease: { ageYears: 5, usdK: 1200 }, fleetWeight: 120,
  },
  {
    id: 'A359', icao: 'A359', manufacturer: 'Airbus', name: 'A350-900', category: 'widebody',
    engines: 'Trent XWB-84', eis: 2015, built: [2015, null], retired: null,
    seats: { typical: 315, max: 440 }, rangeKm: 15000, cruiseKmh: 903, mtowKg: 283000, takeoffM: 2600,
    etopsMin: 370, listPriceUsdM: 317.4, lease: { ageYears: 5, usdK: 1150 }, fleetWeight: 550,
  },
  {
    id: 'A35K', icao: 'A35K', manufacturer: 'Airbus', name: 'A350-1000', category: 'widebody',
    engines: 'Trent XWB-97', eis: 2018, built: [2018, null], retired: null,
    seats: { typical: 369, max: 480 }, rangeKm: 16100, cruiseKmh: 903, mtowKg: 319000, takeoffM: 2750,
    etopsMin: 370, listPriceUsdM: 366.5, lease: { ageYears: 4, usdK: 1350 }, fleetWeight: 90,
  },
  {
    id: 'B77W', icao: 'B77W', manufacturer: 'Boeing', name: '777-300ER', category: 'widebody',
    engines: 'GE90-115B', eis: 2004, built: [2004, 2023], retired: null,
    seats: { typical: 365, max: 550 }, rangeKm: 13650, cruiseKmh: 892, mtowKg: 351535, takeoffM: 3050,
    etopsMin: 330, listPriceUsdM: 375.5, lease: { ageYears: 10, usdK: 750 }, fleetWeight: 800,
  },
  {
    // Not yet in service in 2026 (first delivery planned for 2027): appears once it enters service.
    id: 'B779', icao: 'B779', manufacturer: 'Boeing', name: '777-9', category: 'widebody',
    engines: 'GE9X', eis: 2027, built: [2027, null], retired: null,
    seats: { typical: 426, max: 550 }, rangeKm: 13500, cruiseKmh: 892, mtowKg: 351535, takeoffM: 3050,
    etopsMin: 330, listPriceUsdM: 442.2, lease: { ageYears: 1, usdK: 1600 }, fleetWeight: 50,
  },
];

export const aircraftTypeById: ReadonlyMap<string, AircraftType> = new Map(AIRCRAFT_TYPES.map((t) => [t.id, t]));

export function getAircraftType(id: string): AircraftType {
  const type = aircraftTypeById.get(id);
  if (!type) throw new Error(`Unknown aircraft type ${id}`);
  return type;
}

/** Is the type flying with airlines in this year? */
export function isInService(type: AircraftType, year: number): boolean {
  return type.eis <= year && (type.retired === null || type.retired > year);
}

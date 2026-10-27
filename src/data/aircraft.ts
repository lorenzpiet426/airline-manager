// Aircraft database: the starter types (Phase 1.3) plus all other common types flown by real airlines (Phase 2.1),
// including older and out-of-production types, turboprops, regional jets and freighters.
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
  /** Maximum ETOPS diversion time in minutes (0 = not approved; 420 = three or four engines, no practical limit). */
  etopsMin: number;
  /** Last published list price in millions of USD (airlines pay far less after discounts). */
  listPriceUsdM: number;
  /** Typical monthly lease rate (thousand USD) for an aircraft of the given age, 2025 market. */
  lease: { ageYears: number; usdK: number };
  /** Rough size of the world fleet: how often the type shows up on the lease market. */
  fleetWeight: number;
  /** Average fuel burn per block hour (kg), typical stage length. Rough estimate; OpenAP check planned. */
  fuelKgPerHour: number;
  /** Direct maintenance cost per block hour (USD) for a mid-life aircraft (engines, airframe, components), European level. */
  maintUsdPerBlockHour: number;
  /** Freighters only: maximum structural payload in tonnes (they have no passenger seats). */
  payloadT?: number;
}

/** Freighters carry cargo, not passengers (cargo operations come in a later phase). */
export const isFreighter = (type: AircraftType): boolean => type.payloadT !== undefined;

/** Minimum ground time between two flights (minutes): unload, clean, refuel, board. */
export const TURNAROUND_MIN: Record<AircraftCategory, number> = {
  turboprop: 25,
  regional: 30,
  narrowbody: 40,
  widebody: 90,
};

export const AIRCRAFT_TYPES: AircraftType[] = [
  // ── Turboprops ──────────────────────────────────────────────────────────────
  {
    id: 'AT46', icao: 'AT46', manufacturer: 'ATR', name: 'ATR 42-600', category: 'turboprop',
    engines: 'PW127XT-M', eis: 2012, built: [2012, null], retired: null,
    seats: { typical: 48, max: 50 }, rangeKm: 1326, cruiseKmh: 556, mtowKg: 18600, takeoffM: 1165,
    etopsMin: 0, listPriceUsdM: 19.5, lease: { ageYears: 5, usdK: 130 }, fleetWeight: 200,
    fuelKgPerHour: 470, maintUsdPerBlockHour: 260,
  },
  {
    id: 'AT76', icao: 'AT76', manufacturer: 'ATR', name: 'ATR 72-600', category: 'turboprop',
    engines: 'PW127XT-M', eis: 2011, built: [2011, null], retired: null,
    seats: { typical: 70, max: 78 }, rangeKm: 1528, cruiseKmh: 510, mtowKg: 23000, takeoffM: 1367,
    etopsMin: 0, listPriceUsdM: 26.8, lease: { ageYears: 5, usdK: 175 }, fleetWeight: 900,
    fuelKgPerHour: 650, maintUsdPerBlockHour: 340,
  },
  {
    id: 'DH8D', icao: 'DH8D', manufacturer: 'De Havilland Canada', name: 'Dash 8-400', category: 'turboprop',
    engines: 'PW150A', eis: 2000, built: [2000, 2022], retired: null,
    seats: { typical: 78, max: 90 }, rangeKm: 2040, cruiseKmh: 667, mtowKg: 29574, takeoffM: 1425,
    etopsMin: 0, listPriceUsdM: 32.0, lease: { ageYears: 10, usdK: 130 }, fleetWeight: 450,
    fuelKgPerHour: 1000, maintUsdPerBlockHour: 450,
  },
  // ── Regional jets ───────────────────────────────────────────────────────────
  {
    id: 'E175', icao: 'E175', manufacturer: 'Embraer', name: 'E175', category: 'regional',
    engines: 'CF34-8E', eis: 2005, built: [2005, null], retired: null,
    seats: { typical: 76, max: 88 }, rangeKm: 3700, cruiseKmh: 829, mtowKg: 40370, takeoffM: 2244,
    etopsMin: 0, listPriceUsdM: 55.0, lease: { ageYears: 5, usdK: 190 }, fleetWeight: 750,
    fuelKgPerHour: 1650, maintUsdPerBlockHour: 600,
  },
  {
    id: 'E190', icao: 'E190', manufacturer: 'Embraer', name: 'E190', category: 'regional',
    engines: 'CF34-10E', eis: 2005, built: [2005, 2020], retired: null,
    seats: { typical: 100, max: 114 }, rangeKm: 4537, cruiseKmh: 829, mtowKg: 51800, takeoffM: 2056,
    etopsMin: 0, listPriceUsdM: 50.0, lease: { ageYears: 10, usdK: 150 }, fleetWeight: 450,
    fuelKgPerHour: 1900, maintUsdPerBlockHour: 680,
  },
  {
    id: 'E290', icao: 'E290', manufacturer: 'Embraer', name: 'E190-E2', category: 'regional',
    engines: 'PW1900G', eis: 2018, built: [2018, null], retired: null,
    seats: { typical: 97, max: 114 }, rangeKm: 5278, cruiseKmh: 829, mtowKg: 56400, takeoffM: 1730,
    etopsMin: 120, listPriceUsdM: 63.0, lease: { ageYears: 3, usdK: 250 }, fleetWeight: 40,
    fuelKgPerHour: 1650, maintUsdPerBlockHour: 600,
  },
  {
    id: 'E295', icao: 'E295', manufacturer: 'Embraer', name: 'E195-E2', category: 'regional',
    engines: 'PW1900G', eis: 2019, built: [2019, null], retired: null,
    seats: { typical: 120, max: 146 }, rangeKm: 4815, cruiseKmh: 829, mtowKg: 62500, takeoffM: 1970,
    etopsMin: 120, listPriceUsdM: 68.4, lease: { ageYears: 3, usdK: 290 }, fleetWeight: 120,
    fuelKgPerHour: 1800, maintUsdPerBlockHour: 640,
  },
  // ── Narrow-bodies ───────────────────────────────────────────────────────────
  {
    id: 'BCS1', icao: 'BCS1', manufacturer: 'Airbus', name: 'A220-100', category: 'narrowbody',
    engines: 'PW1500G', eis: 2016, built: [2016, null], retired: null,
    seats: { typical: 110, max: 135 }, rangeKm: 6390, cruiseKmh: 829, mtowKg: 63100, takeoffM: 1463,
    etopsMin: 180, listPriceUsdM: 81.0, lease: { ageYears: 4, usdK: 240 }, fleetWeight: 70,
    fuelKgPerHour: 1700, maintUsdPerBlockHour: 640,
  },
  {
    id: 'BCS3', icao: 'BCS3', manufacturer: 'Airbus', name: 'A220-300', category: 'narrowbody',
    engines: 'PW1500G', eis: 2016, built: [2016, null], retired: null,
    seats: { typical: 140, max: 160 }, rangeKm: 6700, cruiseKmh: 829, mtowKg: 70900, takeoffM: 1890,
    etopsMin: 180, listPriceUsdM: 91.5, lease: { ageYears: 4, usdK: 300 }, fleetWeight: 350,
    fuelKgPerHour: 1850, maintUsdPerBlockHour: 680,
  },
  {
    id: 'A320', icao: 'A320', manufacturer: 'Airbus', name: 'A320ceo', category: 'narrowbody',
    engines: 'CFM56-5B / V2500', eis: 1988, built: [1988, 2019], retired: null,
    seats: { typical: 150, max: 180 }, rangeKm: 6100, cruiseKmh: 829, mtowKg: 78000, takeoffM: 2090,
    etopsMin: 180, listPriceUsdM: 101.0, lease: { ageYears: 10, usdK: 260 }, fleetWeight: 3800,
    fuelKgPerHour: 2500, maintUsdPerBlockHour: 820,
  },
  {
    id: 'A20N', icao: 'A20N', manufacturer: 'Airbus', name: 'A320neo', category: 'narrowbody',
    engines: 'LEAP-1A / PW1100G', eis: 2016, built: [2016, null], retired: null,
    seats: { typical: 165, max: 194 }, rangeKm: 6500, cruiseKmh: 829, mtowKg: 79000, takeoffM: 2100,
    etopsMin: 180, listPriceUsdM: 110.6, lease: { ageYears: 3, usdK: 390 }, fleetWeight: 2000,
    fuelKgPerHour: 2150, maintUsdPerBlockHour: 710,
  },
  {
    id: 'A321', icao: 'A321', manufacturer: 'Airbus', name: 'A321ceo', category: 'narrowbody',
    engines: 'CFM56-5B / V2500', eis: 1994, built: [1994, 2019], retired: null,
    seats: { typical: 185, max: 220 }, rangeKm: 5950, cruiseKmh: 829, mtowKg: 93500, takeoffM: 2450,
    etopsMin: 180, listPriceUsdM: 118.3, lease: { ageYears: 10, usdK: 320 }, fleetWeight: 1700,
    fuelKgPerHour: 2900, maintUsdPerBlockHour: 900,
  },
  {
    id: 'A21N', icao: 'A21N', manufacturer: 'Airbus', name: 'A321neo', category: 'narrowbody',
    engines: 'LEAP-1A / PW1100G', eis: 2017, built: [2017, null], retired: null,
    seats: { typical: 206, max: 244 }, rangeKm: 6850, cruiseKmh: 829, mtowKg: 97000, takeoffM: 2350,
    etopsMin: 180, listPriceUsdM: 129.5, lease: { ageYears: 3, usdK: 460 }, fleetWeight: 1600,
    fuelKgPerHour: 2500, maintUsdPerBlockHour: 790,
  },
  {
    // Same ICAO designator as the A321neo; a separate id because range and price differ.
    id: 'A21N-XLR', icao: 'A21N', manufacturer: 'Airbus', name: 'A321XLR', category: 'narrowbody',
    engines: 'LEAP-1A / PW1100G', eis: 2024, built: [2024, null], retired: null,
    seats: { typical: 190, max: 220 }, rangeKm: 8700, cruiseKmh: 829, mtowKg: 101000, takeoffM: 2600,
    etopsMin: 180, listPriceUsdM: 142.0, lease: { ageYears: 1, usdK: 540 }, fleetWeight: 40,
    fuelKgPerHour: 2600, maintUsdPerBlockHour: 820,
  },
  {
    id: 'B738', icao: 'B738', manufacturer: 'Boeing', name: '737-800', category: 'narrowbody',
    engines: 'CFM56-7B', eis: 1998, built: [1998, 2019], retired: null,
    seats: { typical: 162, max: 189 }, rangeKm: 5436, cruiseKmh: 842, mtowKg: 79016, takeoffM: 2300,
    etopsMin: 180, listPriceUsdM: 106.1, lease: { ageYears: 12, usdK: 220 }, fleetWeight: 4400,
    fuelKgPerHour: 2500, maintUsdPerBlockHour: 820,
  },
  {
    id: 'B38M', icao: 'B38M', manufacturer: 'Boeing', name: '737-8 (MAX 8)', category: 'narrowbody',
    engines: 'LEAP-1B', eis: 2017, built: [2017, null], retired: null,
    seats: { typical: 172, max: 210 }, rangeKm: 6570, cruiseKmh: 842, mtowKg: 82191, takeoffM: 2500,
    etopsMin: 180, listPriceUsdM: 121.6, lease: { ageYears: 3, usdK: 390 }, fleetWeight: 1600,
    fuelKgPerHour: 2150, maintUsdPerBlockHour: 710,
  },
  {
    id: 'B39M', icao: 'B39M', manufacturer: 'Boeing', name: '737-9 (MAX 9)', category: 'narrowbody',
    engines: 'LEAP-1B', eis: 2018, built: [2018, null], retired: null,
    seats: { typical: 178, max: 220 }, rangeKm: 6570, cruiseKmh: 842, mtowKg: 88314, takeoffM: 2700,
    etopsMin: 180, listPriceUsdM: 128.9, lease: { ageYears: 3, usdK: 410 }, fleetWeight: 250,
    fuelKgPerHour: 2300, maintUsdPerBlockHour: 750,
  },
  // ── Wide-bodies ─────────────────────────────────────────────────────────────
  {
    id: 'A333', icao: 'A333', manufacturer: 'Airbus', name: 'A330-300', category: 'widebody',
    engines: 'Trent 700 / CF6-80E / PW4000', eis: 1994, built: [1994, 2020], retired: null,
    seats: { typical: 290, max: 440 }, rangeKm: 11750, cruiseKmh: 871, mtowKg: 242000, takeoffM: 2770,
    etopsMin: 240, listPriceUsdM: 264.2, lease: { ageYears: 12, usdK: 420 }, fleetWeight: 600,
    fuelKgPerHour: 5800, maintUsdPerBlockHour: 1720,
  },
  {
    id: 'A339', icao: 'A339', manufacturer: 'Airbus', name: 'A330-900', category: 'widebody',
    engines: 'Trent 7000', eis: 2018, built: [2018, null], retired: null,
    seats: { typical: 287, max: 460 }, rangeKm: 13334, cruiseKmh: 871, mtowKg: 251000, takeoffM: 2770,
    etopsMin: 285, listPriceUsdM: 296.4, lease: { ageYears: 3, usdK: 980 }, fleetWeight: 200,
    fuelKgPerHour: 5300, maintUsdPerBlockHour: 1580,
  },
  {
    id: 'B788', icao: 'B788', manufacturer: 'Boeing', name: '787-8', category: 'widebody',
    engines: 'GEnx-1B / Trent 1000', eis: 2011, built: [2011, null], retired: null,
    seats: { typical: 248, max: 359 }, rangeKm: 13530, cruiseKmh: 903, mtowKg: 227930, takeoffM: 2600,
    etopsMin: 330, listPriceUsdM: 248.3, lease: { ageYears: 8, usdK: 800 }, fleetWeight: 400,
    fuelKgPerHour: 4900, maintUsdPerBlockHour: 1500,
  },
  {
    id: 'B789', icao: 'B789', manufacturer: 'Boeing', name: '787-9', category: 'widebody',
    engines: 'GEnx-1B / Trent 1000', eis: 2014, built: [2014, null], retired: null,
    seats: { typical: 296, max: 420 }, rangeKm: 14010, cruiseKmh: 903, mtowKg: 254011, takeoffM: 2800,
    etopsMin: 330, listPriceUsdM: 292.5, lease: { ageYears: 5, usdK: 1100 }, fleetWeight: 700,
    fuelKgPerHour: 5500, maintUsdPerBlockHour: 1650,
  },
  {
    id: 'B78X', icao: 'B78X', manufacturer: 'Boeing', name: '787-10', category: 'widebody',
    engines: 'GEnx-1B / Trent 1000', eis: 2018, built: [2018, null], retired: null,
    seats: { typical: 336, max: 440 }, rangeKm: 11730, cruiseKmh: 903, mtowKg: 254011, takeoffM: 2900,
    etopsMin: 330, listPriceUsdM: 338.4, lease: { ageYears: 5, usdK: 1200 }, fleetWeight: 120,
    fuelKgPerHour: 6000, maintUsdPerBlockHour: 1800,
  },
  {
    id: 'A359', icao: 'A359', manufacturer: 'Airbus', name: 'A350-900', category: 'widebody',
    engines: 'Trent XWB-84', eis: 2015, built: [2015, null], retired: null,
    seats: { typical: 315, max: 440 }, rangeKm: 15000, cruiseKmh: 903, mtowKg: 283000, takeoffM: 2600,
    etopsMin: 370, listPriceUsdM: 317.4, lease: { ageYears: 5, usdK: 1150 }, fleetWeight: 550,
    fuelKgPerHour: 5900, maintUsdPerBlockHour: 1720,
  },
  {
    id: 'A35K', icao: 'A35K', manufacturer: 'Airbus', name: 'A350-1000', category: 'widebody',
    engines: 'Trent XWB-97', eis: 2018, built: [2018, null], retired: null,
    seats: { typical: 369, max: 480 }, rangeKm: 16100, cruiseKmh: 903, mtowKg: 319000, takeoffM: 2750,
    etopsMin: 370, listPriceUsdM: 366.5, lease: { ageYears: 4, usdK: 1350 }, fleetWeight: 90,
    fuelKgPerHour: 6900, maintUsdPerBlockHour: 1950,
  },
  {
    id: 'B77W', icao: 'B77W', manufacturer: 'Boeing', name: '777-300ER', category: 'widebody',
    engines: 'GE90-115B', eis: 2004, built: [2004, 2023], retired: null,
    seats: { typical: 365, max: 550 }, rangeKm: 13650, cruiseKmh: 892, mtowKg: 351535, takeoffM: 3050,
    etopsMin: 330, listPriceUsdM: 375.5, lease: { ageYears: 10, usdK: 750 }, fleetWeight: 800,
    fuelKgPerHour: 7800, maintUsdPerBlockHour: 2250,
  },
  {
    // Not yet in service in 2026 (first delivery planned for 2027): appears once it enters service.
    id: 'B779', icao: 'B779', manufacturer: 'Boeing', name: '777-9', category: 'widebody',
    engines: 'GE9X', eis: 2027, built: [2027, null], retired: null,
    seats: { typical: 426, max: 550 }, rangeKm: 13500, cruiseKmh: 892, mtowKg: 351535, takeoffM: 3050,
    etopsMin: 330, listPriceUsdM: 442.2, lease: { ageYears: 1, usdK: 1600 }, fleetWeight: 50,
    fuelKgPerHour: 7000, maintUsdPerBlockHour: 2180,
  },
  // ── Turboprops (added in Phase 2.1) ──────────────────────────────────────────────────
  {
    id: 'AT45', icao: 'AT45', manufacturer: 'ATR', name: 'ATR 42-500', category: 'turboprop',
    engines: 'PW127E', eis: 1995, built: [1995, 2012], retired: null,
    seats: { typical: 48, max: 50 }, rangeKm: 1555, cruiseKmh: 556, mtowKg: 18600, takeoffM: 1165,
    etopsMin: 0, listPriceUsdM: 17, lease: { ageYears: 15, usdK: 70 }, fleetWeight: 150,
    fuelKgPerHour: 450, maintUsdPerBlockHour: 260,
  },
  {
    id: 'AT75', icao: 'AT75', manufacturer: 'ATR', name: 'ATR 72-500', category: 'turboprop',
    engines: 'PW127F', eis: 1997, built: [1997, 2011], retired: null,
    seats: { typical: 70, max: 74 }, rangeKm: 1650, cruiseKmh: 510, mtowKg: 22800, takeoffM: 1290,
    etopsMin: 0, listPriceUsdM: 23, lease: { ageYears: 15, usdK: 100 }, fleetWeight: 350,
    fuelKgPerHour: 640, maintUsdPerBlockHour: 330,
  },
  {
    id: 'DH8A', icao: 'DH8A', manufacturer: 'De Havilland Canada', name: 'Dash 8-100', category: 'turboprop',
    engines: 'PW120A', eis: 1984, built: [1984, 2005], retired: null,
    seats: { typical: 37, max: 39 }, rangeKm: 1889, cruiseKmh: 500, mtowKg: 16466, takeoffM: 940,
    etopsMin: 0, listPriceUsdM: 13, lease: { ageYears: 25, usdK: 40 }, fleetWeight: 100,
    fuelKgPerHour: 380, maintUsdPerBlockHour: 300,
  },
  {
    id: 'DH8B', icao: 'DH8B', manufacturer: 'De Havilland Canada', name: 'Dash 8-200', category: 'turboprop',
    engines: 'PW123C', eis: 1995, built: [1995, 2008], retired: null,
    seats: { typical: 37, max: 39 }, rangeKm: 1713, cruiseKmh: 537, mtowKg: 16466, takeoffM: 1000,
    etopsMin: 0, listPriceUsdM: 15, lease: { ageYears: 20, usdK: 50 }, fleetWeight: 60,
    fuelKgPerHour: 400, maintUsdPerBlockHour: 300,
  },
  {
    id: 'DH8C', icao: 'DH8C', manufacturer: 'De Havilland Canada', name: 'Dash 8-300', category: 'turboprop',
    engines: 'PW123', eis: 1989, built: [1989, 2009], retired: null,
    seats: { typical: 50, max: 56 }, rangeKm: 1558, cruiseKmh: 528, mtowKg: 19500, takeoffM: 1180,
    etopsMin: 0, listPriceUsdM: 17, lease: { ageYears: 20, usdK: 60 }, fleetWeight: 120,
    fuelKgPerHour: 480, maintUsdPerBlockHour: 330,
  },
  {
    id: 'SF34', icao: 'SF34', manufacturer: 'Saab', name: 'Saab 340', category: 'turboprop',
    engines: 'CT7-9B', eis: 1984, built: [1983, 1999], retired: null,
    seats: { typical: 34, max: 37 }, rangeKm: 1730, cruiseKmh: 522, mtowKg: 13155, takeoffM: 1300,
    etopsMin: 0, listPriceUsdM: 8, lease: { ageYears: 28, usdK: 25 }, fleetWeight: 150,
    fuelKgPerHour: 330, maintUsdPerBlockHour: 280,
  },
  {
    id: 'SB20', icao: 'SB20', manufacturer: 'Saab', name: 'Saab 2000', category: 'turboprop',
    engines: 'AE2100A', eis: 1994, built: [1992, 1999], retired: null,
    seats: { typical: 50, max: 58 }, rangeKm: 2868, cruiseKmh: 665, mtowKg: 22800, takeoffM: 1300,
    etopsMin: 0, listPriceUsdM: 15, lease: { ageYears: 28, usdK: 45 }, fleetWeight: 15,
    fuelKgPerHour: 650, maintUsdPerBlockHour: 400,
  },
  {
    id: 'D328', icao: 'D328', manufacturer: 'Dornier', name: 'Dornier 328', category: 'turboprop',
    engines: 'PW119B', eis: 1993, built: [1993, 2000], retired: null,
    seats: { typical: 32, max: 33 }, rangeKm: 1300, cruiseKmh: 620, mtowKg: 13990, takeoffM: 1088,
    etopsMin: 0, listPriceUsdM: 10, lease: { ageYears: 28, usdK: 30 }, fleetWeight: 40,
    fuelKgPerHour: 380, maintUsdPerBlockHour: 330,
  },
  {
    id: 'E120', icao: 'E120', manufacturer: 'Embraer', name: 'EMB 120 Brasilia', category: 'turboprop',
    engines: 'PW118', eis: 1985, built: [1985, 2001], retired: null,
    seats: { typical: 30, max: 30 }, rangeKm: 1575, cruiseKmh: 552, mtowKg: 11990, takeoffM: 1420,
    etopsMin: 0, listPriceUsdM: 8, lease: { ageYears: 30, usdK: 20 }, fleetWeight: 40,
    fuelKgPerHour: 320, maintUsdPerBlockHour: 280,
  },
  {
    id: 'JS41', icao: 'JS41', manufacturer: 'BAe', name: 'Jetstream 41', category: 'turboprop',
    engines: 'TPE331-14', eis: 1992, built: [1991, 1997], retired: null,
    seats: { typical: 29, max: 30 }, rangeKm: 1433, cruiseKmh: 547, mtowKg: 10886, takeoffM: 1500,
    etopsMin: 0, listPriceUsdM: 7, lease: { ageYears: 30, usdK: 18 }, fleetWeight: 20,
    fuelKgPerHour: 300, maintUsdPerBlockHour: 280,
  },
  {
    id: 'F50', icao: 'F50', manufacturer: 'Fokker', name: 'Fokker 50', category: 'turboprop',
    engines: 'PW125B', eis: 1987, built: [1987, 1997], retired: null,
    seats: { typical: 50, max: 58 }, rangeKm: 2055, cruiseKmh: 522, mtowKg: 20820, takeoffM: 1350,
    etopsMin: 0, listPriceUsdM: 15, lease: { ageYears: 32, usdK: 30 }, fleetWeight: 30,
    fuelKgPerHour: 530, maintUsdPerBlockHour: 380,
  },
  {
    id: 'B190', icao: 'B190', manufacturer: 'Beechcraft', name: 'Beech 1900D', category: 'turboprop',
    engines: 'PT6A-67D', eis: 1991, built: [1991, 2002], retired: null,
    seats: { typical: 19, max: 19 }, rangeKm: 1200, cruiseKmh: 518, mtowKg: 7764, takeoffM: 1140,
    etopsMin: 0, listPriceUsdM: 5, lease: { ageYears: 28, usdK: 15 }, fleetWeight: 120,
    fuelKgPerHour: 250, maintUsdPerBlockHour: 200,
  },
  {
    id: 'DHC6', icao: 'DHC6', manufacturer: 'De Havilland Canada', name: 'DHC-6 Twin Otter', category: 'turboprop',
    engines: 'PT6A-34', eis: 1966, built: [1966, null], retired: null,
    seats: { typical: 19, max: 19 }, rangeKm: 1480, cruiseKmh: 337, mtowKg: 5670, takeoffM: 366,
    etopsMin: 0, listPriceUsdM: 7, lease: { ageYears: 20, usdK: 25 }, fleetWeight: 300,
    fuelKgPerHour: 280, maintUsdPerBlockHour: 180,
  },
  {
    id: 'L410', icao: 'L410', manufacturer: 'Let', name: 'L-410 Turbolet', category: 'turboprop',
    engines: 'H80-200', eis: 1971, built: [1971, null], retired: null,
    seats: { typical: 19, max: 19 }, rangeKm: 1380, cruiseKmh: 365, mtowKg: 6600, takeoffM: 685,
    etopsMin: 0, listPriceUsdM: 7, lease: { ageYears: 15, usdK: 25 }, fleetWeight: 200,
    fuelKgPerHour: 230, maintUsdPerBlockHour: 180,
  },
  // ── Regional jets (added in Phase 2.1) ───────────────────────────────────────────────
  {
    id: 'CRJ2', icao: 'CRJ2', manufacturer: 'Bombardier', name: 'CRJ200', category: 'regional',
    engines: 'CF34-3B1', eis: 1992, built: [1992, 2006], retired: null,
    seats: { typical: 50, max: 50 }, rangeKm: 3045, cruiseKmh: 786, mtowKg: 24041, takeoffM: 1918,
    etopsMin: 0, listPriceUsdM: 25, lease: { ageYears: 22, usdK: 45 }, fleetWeight: 300,
    fuelKgPerHour: 1150, maintUsdPerBlockHour: 520,
  },
  {
    id: 'CRJ7', icao: 'CRJ7', manufacturer: 'Bombardier', name: 'CRJ700', category: 'regional',
    engines: 'CF34-8C1', eis: 2001, built: [2001, 2020], retired: null,
    seats: { typical: 70, max: 78 }, rangeKm: 3125, cruiseKmh: 829, mtowKg: 34019, takeoffM: 1564,
    etopsMin: 0, listPriceUsdM: 41, lease: { ageYears: 15, usdK: 110 }, fleetWeight: 280,
    fuelKgPerHour: 1400, maintUsdPerBlockHour: 600,
  },
  {
    id: 'CRJ9', icao: 'CRJ9', manufacturer: 'Bombardier', name: 'CRJ900', category: 'regional',
    engines: 'CF34-8C5', eis: 2003, built: [2003, 2020], retired: null,
    seats: { typical: 76, max: 90 }, rangeKm: 2956, cruiseKmh: 829, mtowKg: 38330, takeoffM: 1778,
    etopsMin: 0, listPriceUsdM: 48, lease: { ageYears: 12, usdK: 130 }, fleetWeight: 450,
    fuelKgPerHour: 1550, maintUsdPerBlockHour: 630,
  },
  {
    id: 'CRJX', icao: 'CRJX', manufacturer: 'Bombardier', name: 'CRJ1000', category: 'regional',
    engines: 'CF34-8C5A1', eis: 2010, built: [2010, 2020], retired: null,
    seats: { typical: 100, max: 104 }, rangeKm: 3004, cruiseKmh: 829, mtowKg: 41640, takeoffM: 2079,
    etopsMin: 0, listPriceUsdM: 52, lease: { ageYears: 10, usdK: 140 }, fleetWeight: 60,
    fuelKgPerHour: 1700, maintUsdPerBlockHour: 650,
  },
  {
    id: 'E170', icao: 'E170', manufacturer: 'Embraer', name: 'E170', category: 'regional',
    engines: 'CF34-8E', eis: 2004, built: [2004, 2021], retired: null,
    seats: { typical: 72, max: 78 }, rangeKm: 3982, cruiseKmh: 829, mtowKg: 38600, takeoffM: 1644,
    etopsMin: 0, listPriceUsdM: 45, lease: { ageYears: 14, usdK: 130 }, fleetWeight: 150,
    fuelKgPerHour: 1550, maintUsdPerBlockHour: 580,
  },
  {
    id: 'E195', icao: 'E195', manufacturer: 'Embraer', name: 'E195', category: 'regional',
    engines: 'CF34-10E', eis: 2006, built: [2006, 2021], retired: null,
    seats: { typical: 118, max: 124 }, rangeKm: 4260, cruiseKmh: 829, mtowKg: 52290, takeoffM: 2179,
    etopsMin: 0, listPriceUsdM: 53, lease: { ageYears: 12, usdK: 160 }, fleetWeight: 150,
    fuelKgPerHour: 2000, maintUsdPerBlockHour: 700,
  },
  {
    id: 'E145', icao: 'E145', manufacturer: 'Embraer', name: 'ERJ-145', category: 'regional',
    engines: 'AE3007A1', eis: 1997, built: [1996, 2020], retired: null,
    seats: { typical: 50, max: 50 }, rangeKm: 2873, cruiseKmh: 833, mtowKg: 22000, takeoffM: 2270,
    etopsMin: 0, listPriceUsdM: 20, lease: { ageYears: 20, usdK: 40 }, fleetWeight: 400,
    fuelKgPerHour: 1100, maintUsdPerBlockHour: 500,
  },
  {
    id: 'E135', icao: 'E135', manufacturer: 'Embraer', name: 'ERJ-135', category: 'regional',
    engines: 'AE3007A1/3', eis: 1999, built: [1999, 2008], retired: null,
    seats: { typical: 37, max: 37 }, rangeKm: 3241, cruiseKmh: 833, mtowKg: 20000, takeoffM: 1580,
    etopsMin: 0, listPriceUsdM: 17, lease: { ageYears: 22, usdK: 30 }, fleetWeight: 50,
    fuelKgPerHour: 1000, maintUsdPerBlockHour: 480,
  },
  {
    id: 'SU95', icao: 'SU95', manufacturer: 'Sukhoi', name: 'Superjet 100', category: 'regional',
    engines: 'SaM146', eis: 2011, built: [2008, null], retired: null,
    seats: { typical: 98, max: 108 }, rangeKm: 3048, cruiseKmh: 828, mtowKg: 45880, takeoffM: 1731,
    etopsMin: 0, listPriceUsdM: 50, lease: { ageYears: 8, usdK: 150 }, fleetWeight: 140,
    fuelKgPerHour: 1700, maintUsdPerBlockHour: 900,
  },
  {
    id: 'AJ27', icao: 'AJ27', manufacturer: 'COMAC', name: 'C909 (ARJ21-700)', category: 'regional',
    engines: 'CF34-10A', eis: 2016, built: [2016, null], retired: null,
    seats: { typical: 90, max: 95 }, rangeKm: 3700, cruiseKmh: 828, mtowKg: 43500, takeoffM: 1700,
    etopsMin: 0, listPriceUsdM: 38, lease: { ageYears: 4, usdK: 160 }, fleetWeight: 150,
    fuelKgPerHour: 1900, maintUsdPerBlockHour: 750,
  },
  {
    id: 'F100', icao: 'F100', manufacturer: 'Fokker', name: 'Fokker 100', category: 'regional',
    engines: 'Tay 650', eis: 1988, built: [1986, 1997], retired: null,
    seats: { typical: 100, max: 109 }, rangeKm: 3170, cruiseKmh: 845, mtowKg: 45810, takeoffM: 1855,
    etopsMin: 0, listPriceUsdM: 25, lease: { ageYears: 32, usdK: 40 }, fleetWeight: 40,
    fuelKgPerHour: 2100, maintUsdPerBlockHour: 750,
  },
  // ── Narrow-bodies (added in Phase 2.1) ───────────────────────────────────────────────
  {
    id: 'A318', icao: 'A318', manufacturer: 'Airbus', name: 'A318', category: 'narrowbody',
    engines: 'CFM56-5B / PW6000', eis: 2003, built: [2003, 2013], retired: null,
    seats: { typical: 107, max: 132 }, rangeKm: 5750, cruiseKmh: 829, mtowKg: 68000, takeoffM: 1780,
    etopsMin: 180, listPriceUsdM: 77, lease: { ageYears: 15, usdK: 140 }, fleetWeight: 40,
    fuelKgPerHour: 2200, maintUsdPerBlockHour: 750,
  },
  {
    id: 'A319', icao: 'A319', manufacturer: 'Airbus', name: 'A319ceo', category: 'narrowbody',
    engines: 'CFM56-5B / V2500', eis: 1996, built: [1995, 2019], retired: null,
    seats: { typical: 124, max: 156 }, rangeKm: 6850, cruiseKmh: 829, mtowKg: 75500, takeoffM: 1850,
    etopsMin: 180, listPriceUsdM: 92, lease: { ageYears: 14, usdK: 180 }, fleetWeight: 1200,
    fuelKgPerHour: 2350, maintUsdPerBlockHour: 790,
  },
  {
    id: 'A19N', icao: 'A19N', manufacturer: 'Airbus', name: 'A319neo', category: 'narrowbody',
    engines: 'LEAP-1A / PW1100G', eis: 2019, built: [2019, null], retired: null,
    seats: { typical: 140, max: 160 }, rangeKm: 6950, cruiseKmh: 829, mtowKg: 75500, takeoffM: 2000,
    etopsMin: 180, listPriceUsdM: 101.5, lease: { ageYears: 3, usdK: 320 }, fleetWeight: 40,
    fuelKgPerHour: 2000, maintUsdPerBlockHour: 680,
  },
  {
    id: 'B733', icao: 'B733', manufacturer: 'Boeing', name: '737-300', category: 'narrowbody',
    engines: 'CFM56-3', eis: 1984, built: [1984, 1999], retired: null,
    seats: { typical: 128, max: 149 }, rangeKm: 4200, cruiseKmh: 794, mtowKg: 62820, takeoffM: 1940,
    etopsMin: 120, listPriceUsdM: 40, lease: { ageYears: 35, usdK: 40 }, fleetWeight: 150,
    fuelKgPerHour: 2600, maintUsdPerBlockHour: 900,
  },
  {
    id: 'B737', icao: 'B737', manufacturer: 'Boeing', name: '737-700', category: 'narrowbody',
    engines: 'CFM56-7B', eis: 1998, built: [1997, 2019], retired: null,
    seats: { typical: 128, max: 149 }, rangeKm: 6370, cruiseKmh: 842, mtowKg: 70080, takeoffM: 2042,
    etopsMin: 180, listPriceUsdM: 89, lease: { ageYears: 15, usdK: 160 }, fleetWeight: 900,
    fuelKgPerHour: 2350, maintUsdPerBlockHour: 790,
  },
  {
    id: 'B739', icao: 'B739', manufacturer: 'Boeing', name: '737-900ER', category: 'narrowbody',
    engines: 'CFM56-7B', eis: 2007, built: [2007, 2019], retired: null,
    seats: { typical: 180, max: 220 }, rangeKm: 5925, cruiseKmh: 842, mtowKg: 85139, takeoffM: 2804,
    etopsMin: 180, listPriceUsdM: 112, lease: { ageYears: 10, usdK: 230 }, fleetWeight: 500,
    fuelKgPerHour: 2650, maintUsdPerBlockHour: 830,
  },
  {
    id: 'B37M', icao: 'B37M', manufacturer: 'Boeing', name: '737-7 (MAX 7)', category: 'narrowbody',
    engines: 'LEAP-1B', eis: 2027, built: [2027, null], retired: null,
    seats: { typical: 153, max: 172 }, rangeKm: 7130, cruiseKmh: 842, mtowKg: 80286, takeoffM: 2100,
    etopsMin: 180, listPriceUsdM: 99.7, lease: { ageYears: 1, usdK: 340 }, fleetWeight: 20,
    fuelKgPerHour: 2050, maintUsdPerBlockHour: 700,
  },
  {
    id: 'B3XM', icao: 'B3XM', manufacturer: 'Boeing', name: '737-10 (MAX 10)', category: 'narrowbody',
    engines: 'LEAP-1B', eis: 2027, built: [2027, null], retired: null,
    seats: { typical: 188, max: 230 }, rangeKm: 5740, cruiseKmh: 842, mtowKg: 89765, takeoffM: 2700,
    etopsMin: 180, listPriceUsdM: 134.9, lease: { ageYears: 1, usdK: 430 }, fleetWeight: 20,
    fuelKgPerHour: 2400, maintUsdPerBlockHour: 760,
  },
  {
    id: 'B752', icao: 'B752', manufacturer: 'Boeing', name: '757-200', category: 'narrowbody',
    engines: 'RB211-535 / PW2000', eis: 1983, built: [1982, 2004], retired: null,
    seats: { typical: 200, max: 239 }, rangeKm: 7222, cruiseKmh: 850, mtowKg: 115680, takeoffM: 2347,
    etopsMin: 180, listPriceUsdM: 65, lease: { ageYears: 28, usdK: 100 }, fleetWeight: 450,
    fuelKgPerHour: 3200, maintUsdPerBlockHour: 1100,
  },
  {
    id: 'B753', icao: 'B753', manufacturer: 'Boeing', name: '757-300', category: 'narrowbody',
    engines: 'RB211-535E4', eis: 1999, built: [1998, 2004], retired: null,
    seats: { typical: 243, max: 295 }, rangeKm: 6295, cruiseKmh: 850, mtowKg: 123600, takeoffM: 2550,
    etopsMin: 180, listPriceUsdM: 80, lease: { ageYears: 24, usdK: 110 }, fleetWeight: 50,
    fuelKgPerHour: 3500, maintUsdPerBlockHour: 1150,
  },
  {
    id: 'C919', icao: 'C919', manufacturer: 'COMAC', name: 'C919', category: 'narrowbody',
    engines: 'LEAP-1C', eis: 2023, built: [2022, null], retired: null,
    seats: { typical: 158, max: 192 }, rangeKm: 4075, cruiseKmh: 834, mtowKg: 72500, takeoffM: 2200,
    etopsMin: 0, listPriceUsdM: 99, lease: { ageYears: 2, usdK: 330 }, fleetWeight: 20,
    fuelKgPerHour: 2400, maintUsdPerBlockHour: 750,
  },
  // ── Wide-bodies (added in Phase 2.1) ─────────────────────────────────────────────────
  {
    id: 'A332', icao: 'A332', manufacturer: 'Airbus', name: 'A330-200', category: 'widebody',
    engines: 'Trent 700 / CF6-80E / PW4000', eis: 1998, built: [1998, 2020], retired: null,
    seats: { typical: 246, max: 406 }, rangeKm: 13450, cruiseKmh: 871, mtowKg: 242000, takeoffM: 2400,
    etopsMin: 240, listPriceUsdM: 238.5, lease: { ageYears: 14, usdK: 380 }, fleetWeight: 550,
    fuelKgPerHour: 5600, maintUsdPerBlockHour: 1650,
  },
  {
    id: 'A338', icao: 'A338', manufacturer: 'Airbus', name: 'A330-800', category: 'widebody',
    engines: 'Trent 7000', eis: 2020, built: [2019, null], retired: null,
    seats: { typical: 257, max: 406 }, rangeKm: 15094, cruiseKmh: 871, mtowKg: 251000, takeoffM: 2500,
    etopsMin: 285, listPriceUsdM: 259.9, lease: { ageYears: 3, usdK: 850 }, fleetWeight: 10,
    fuelKgPerHour: 5100, maintUsdPerBlockHour: 1550,
  },
  {
    id: 'A343', icao: 'A343', manufacturer: 'Airbus', name: 'A340-300', category: 'widebody',
    engines: 'CFM56-5C', eis: 1993, built: [1992, 2008], retired: null,
    seats: { typical: 277, max: 440 }, rangeKm: 13500, cruiseKmh: 880, mtowKg: 276500, takeoffM: 3000,
    etopsMin: 420, listPriceUsdM: 238, lease: { ageYears: 24, usdK: 250 }, fleetWeight: 40,
    fuelKgPerHour: 6800, maintUsdPerBlockHour: 2300,
  },
  {
    id: 'A346', icao: 'A346', manufacturer: 'Airbus', name: 'A340-600', category: 'widebody',
    engines: 'Trent 500', eis: 2002, built: [2002, 2011], retired: null,
    seats: { typical: 326, max: 475 }, rangeKm: 14450, cruiseKmh: 881, mtowKg: 380000, takeoffM: 3100,
    etopsMin: 420, listPriceUsdM: 283, lease: { ageYears: 20, usdK: 300 }, fleetWeight: 20,
    fuelKgPerHour: 8200, maintUsdPerBlockHour: 2600,
  },
  {
    id: 'A388', icao: 'A388', manufacturer: 'Airbus', name: 'A380', category: 'widebody',
    engines: 'Trent 900 / GP7200', eis: 2007, built: [2005, 2021], retired: null,
    seats: { typical: 525, max: 853 }, rangeKm: 15000, cruiseKmh: 903, mtowKg: 575000, takeoffM: 2900,
    etopsMin: 420, listPriceUsdM: 445.6, lease: { ageYears: 12, usdK: 900 }, fleetWeight: 180,
    fuelKgPerHour: 11500, maintUsdPerBlockHour: 3800,
  },
  {
    id: 'B763', icao: 'B763', manufacturer: 'Boeing', name: '767-300ER', category: 'widebody',
    engines: 'CF6-80C2 / PW4000', eis: 1988, built: [1986, 2014], retired: null,
    seats: { typical: 218, max: 351 }, rangeKm: 11070, cruiseKmh: 851, mtowKg: 186880, takeoffM: 2650,
    etopsMin: 207, listPriceUsdM: 217, lease: { ageYears: 22, usdK: 200 }, fleetWeight: 300,
    fuelKgPerHour: 4800, maintUsdPerBlockHour: 1700,
  },
  {
    id: 'B764', icao: 'B764', manufacturer: 'Boeing', name: '767-400ER', category: 'widebody',
    engines: 'CF6-80C2B8F', eis: 2000, built: [1999, 2009], retired: null,
    seats: { typical: 245, max: 375 }, rangeKm: 10415, cruiseKmh: 851, mtowKg: 204120, takeoffM: 3290,
    etopsMin: 180, listPriceUsdM: 230, lease: { ageYears: 22, usdK: 250 }, fleetWeight: 30,
    fuelKgPerHour: 5300, maintUsdPerBlockHour: 1800,
  },
  {
    id: 'B772', icao: 'B772', manufacturer: 'Boeing', name: '777-200ER', category: 'widebody',
    engines: 'GE90 / PW4090 / Trent 800', eis: 1997, built: [1996, 2018], retired: null,
    seats: { typical: 313, max: 440 }, rangeKm: 13080, cruiseKmh: 892, mtowKg: 297550, takeoffM: 3100,
    etopsMin: 330, listPriceUsdM: 306, lease: { ageYears: 20, usdK: 350 }, fleetWeight: 330,
    fuelKgPerHour: 7000, maintUsdPerBlockHour: 2200,
  },
  {
    id: 'B77L', icao: 'B77L', manufacturer: 'Boeing', name: '777-200LR', category: 'widebody',
    engines: 'GE90-110B1', eis: 2006, built: [2005, 2018], retired: null,
    seats: { typical: 317, max: 440 }, rangeKm: 15843, cruiseKmh: 892, mtowKg: 347450, takeoffM: 3200,
    etopsMin: 330, listPriceUsdM: 346.9, lease: { ageYears: 15, usdK: 450 }, fleetWeight: 50,
    fuelKgPerHour: 7700, maintUsdPerBlockHour: 2300,
  },
  {
    id: 'B773', icao: 'B773', manufacturer: 'Boeing', name: '777-300', category: 'widebody',
    engines: 'PW4098 / Trent 892', eis: 1998, built: [1997, 2006], retired: null,
    seats: { typical: 368, max: 550 }, rangeKm: 11135, cruiseKmh: 892, mtowKg: 299370, takeoffM: 3200,
    etopsMin: 330, listPriceUsdM: 320, lease: { ageYears: 24, usdK: 300 }, fleetWeight: 40,
    fuelKgPerHour: 7600, maintUsdPerBlockHour: 2300,
  },
  {
    id: 'B744', icao: 'B744', manufacturer: 'Boeing', name: '747-400', category: 'widebody',
    engines: 'CF6-80C2 / PW4056 / RB211', eis: 1989, built: [1988, 2009], retired: null,
    seats: { typical: 416, max: 660 }, rangeKm: 13450, cruiseKmh: 913, mtowKg: 396890, takeoffM: 3018,
    etopsMin: 420, listPriceUsdM: 266, lease: { ageYears: 28, usdK: 250 }, fleetWeight: 40,
    fuelKgPerHour: 10500, maintUsdPerBlockHour: 3500,
  },
  {
    id: 'B748', icao: 'B748', manufacturer: 'Boeing', name: '747-8 Intercontinental', category: 'widebody',
    engines: 'GEnx-2B67', eis: 2012, built: [2011, 2017], retired: null,
    seats: { typical: 410, max: 605 }, rangeKm: 14320, cruiseKmh: 917, mtowKg: 447700, takeoffM: 3100,
    etopsMin: 420, listPriceUsdM: 418, lease: { ageYears: 10, usdK: 800 }, fleetWeight: 45,
    fuelKgPerHour: 10000, maintUsdPerBlockHour: 3400,
  },
  // ── Older, regional and commuter types (added in Phase 2.1 for real airline fleets) ───────────
  {
    id: 'C208', icao: 'C208', manufacturer: 'Cessna', name: '208B Grand Caravan', category: 'turboprop',
    engines: 'PT6A-114A', eis: 1986, built: [1986, null], retired: null,
    seats: { typical: 9, max: 13 }, rangeKm: 1700, cruiseKmh: 340, mtowKg: 3995, takeoffM: 640,
    etopsMin: 0, listPriceUsdM: 2.6, lease: { ageYears: 10, usdK: 20 }, fleetWeight: 900,
    fuelKgPerHour: 160, maintUsdPerBlockHour: 120,
  },
  {
    id: 'PC12', icao: 'PC12', manufacturer: 'Pilatus', name: 'PC-12', category: 'turboprop',
    engines: 'PT6A-67P', eis: 1994, built: [1994, null], retired: null,
    seats: { typical: 9, max: 9 }, rangeKm: 3400, cruiseKmh: 528, mtowKg: 4740, takeoffM: 790,
    etopsMin: 0, listPriceUsdM: 5.5, lease: { ageYears: 8, usdK: 40 }, fleetWeight: 600,
    fuelKgPerHour: 180, maintUsdPerBlockHour: 150,
  },
  {
    id: 'BN2P', icao: 'BN2P', manufacturer: 'Britten-Norman', name: 'BN-2 Islander', category: 'turboprop',
    engines: 'O-540 / 250-B17C', eis: 1967, built: [1967, null], retired: null,
    seats: { typical: 9, max: 9 }, rangeKm: 1400, cruiseKmh: 270, mtowKg: 2994, takeoffM: 371,
    etopsMin: 0, listPriceUsdM: 1.8, lease: { ageYears: 30, usdK: 10 }, fleetWeight: 300,
    fuelKgPerHour: 110, maintUsdPerBlockHour: 100,
  },
  {
    id: 'BE20', icao: 'BE20', manufacturer: 'Beechcraft', name: 'King Air 200/350', category: 'turboprop',
    engines: 'PT6A-60A', eis: 1974, built: [1974, null], retired: null,
    seats: { typical: 9, max: 11 }, rangeKm: 2800, cruiseKmh: 500, mtowKg: 5670, takeoffM: 1000,
    etopsMin: 0, listPriceUsdM: 7.5, lease: { ageYears: 15, usdK: 40 }, fleetWeight: 400,
    fuelKgPerHour: 280, maintUsdPerBlockHour: 200,
  },
  {
    id: 'C402', icao: 'C402', manufacturer: 'Cessna', name: '402 / 404 / F406', category: 'turboprop',
    engines: 'TSIO-520 / PT6A-112', eis: 1967, built: [1967, 1985], retired: null,
    seats: { typical: 9, max: 9 }, rangeKm: 1600, cruiseKmh: 350, mtowKg: 3107, takeoffM: 850,
    etopsMin: 0, listPriceUsdM: 1.5, lease: { ageYears: 40, usdK: 8 }, fleetWeight: 150,
    fuelKgPerHour: 160, maintUsdPerBlockHour: 120,
  },
  {
    id: 'C408', icao: 'C408', manufacturer: 'Cessna', name: '408 SkyCourier', category: 'turboprop',
    engines: 'PT6A-65SC', eis: 2022, built: [2022, null], retired: null,
    seats: { typical: 19, max: 19 }, rangeKm: 1700, cruiseKmh: 390, mtowKg: 8618, takeoffM: 1100,
    etopsMin: 0, listPriceUsdM: 7, lease: { ageYears: 3, usdK: 50 }, fleetWeight: 50,
    fuelKgPerHour: 300, maintUsdPerBlockHour: 200,
  },
  {
    id: 'JS32', icao: 'JS32', manufacturer: 'BAe', name: 'Jetstream 32', category: 'turboprop',
    engines: 'TPE331-12', eis: 1983, built: [1982, 1997], retired: null,
    seats: { typical: 19, max: 19 }, rangeKm: 1260, cruiseKmh: 482, mtowKg: 7350, takeoffM: 1440,
    etopsMin: 0, listPriceUsdM: 4, lease: { ageYears: 35, usdK: 12 }, fleetWeight: 50,
    fuelKgPerHour: 230, maintUsdPerBlockHour: 200,
  },
  {
    id: 'SW4', icao: 'SW4', manufacturer: 'Fairchild', name: 'Metro III / 23', category: 'turboprop',
    engines: 'TPE331-11', eis: 1970, built: [1970, 2001], retired: null,
    seats: { typical: 19, max: 19 }, rangeKm: 2100, cruiseKmh: 500, mtowKg: 7257, takeoffM: 1300,
    etopsMin: 0, listPriceUsdM: 4, lease: { ageYears: 35, usdK: 12 }, fleetWeight: 150,
    fuelKgPerHour: 260, maintUsdPerBlockHour: 200,
  },
  {
    id: 'AN24', icao: 'AN24', manufacturer: 'Antonov', name: 'An-24 / An-26', category: 'turboprop',
    engines: 'AI-24', eis: 1962, built: [1959, 1979], retired: null,
    seats: { typical: 44, max: 52 }, rangeKm: 2000, cruiseKmh: 450, mtowKg: 21800, takeoffM: 1700,
    etopsMin: 0, listPriceUsdM: 5, lease: { ageYears: 50, usdK: 15 }, fleetWeight: 120,
    fuelKgPerHour: 750, maintUsdPerBlockHour: 600,
  },
  {
    id: 'RJ1H', icao: 'RJ1H', manufacturer: 'Avro', name: 'RJ85 / RJ100', category: 'regional',
    engines: 'LF507', eis: 1994, built: [1993, 2003], retired: null,
    seats: { typical: 100, max: 112 }, rangeKm: 2965, cruiseKmh: 760, mtowKg: 46000, takeoffM: 1680,
    etopsMin: 0, listPriceUsdM: 30, lease: { ageYears: 28, usdK: 40 }, fleetWeight: 40,
    fuelKgPerHour: 2400, maintUsdPerBlockHour: 1000,
  },
  {
    id: 'B732', icao: 'B732', manufacturer: 'Boeing', name: '737-200', category: 'narrowbody',
    engines: 'JT8D', eis: 1968, built: [1967, 1988], retired: null,
    seats: { typical: 120, max: 136 }, rangeKm: 4000, cruiseKmh: 780, mtowKg: 58100, takeoffM: 1830,
    etopsMin: 0, listPriceUsdM: 25, lease: { ageYears: 40, usdK: 25 }, fleetWeight: 60,
    fuelKgPerHour: 2800, maintUsdPerBlockHour: 1000,
  },
  {
    id: 'MD82', icao: 'MD82', manufacturer: 'McDonnell Douglas', name: 'MD-80 series', category: 'narrowbody',
    engines: 'JT8D-200', eis: 1981, built: [1980, 1999], retired: null,
    seats: { typical: 155, max: 172 }, rangeKm: 3800, cruiseKmh: 811, mtowKg: 67800, takeoffM: 2210,
    etopsMin: 0, listPriceUsdM: 40, lease: { ageYears: 35, usdK: 40 }, fleetWeight: 100,
    fuelKgPerHour: 3000, maintUsdPerBlockHour: 1000,
  },
  {
    id: 'T204', icao: 'T204', manufacturer: 'Tupolev', name: 'Tu-204 / Tu-214', category: 'narrowbody',
    engines: 'PS-90A', eis: 1996, built: [1994, null], retired: null,
    seats: { typical: 210, max: 210 }, rangeKm: 6500, cruiseKmh: 830, mtowKg: 110750, takeoffM: 2400,
    etopsMin: 0, listPriceUsdM: 50, lease: { ageYears: 15, usdK: 150 }, fleetWeight: 20,
    fuelKgPerHour: 3300, maintUsdPerBlockHour: 1300,
  },
  {
    id: 'MC21', icao: 'MC23', manufacturer: 'Yakovlev', name: 'MC-21-300', category: 'narrowbody',
    engines: 'PD-14', eis: 2026, built: [2024, null], retired: null,
    seats: { typical: 163, max: 211 }, rangeKm: 6000, cruiseKmh: 850, mtowKg: 79250, takeoffM: 2200,
    etopsMin: 0, listPriceUsdM: 90, lease: { ageYears: 1, usdK: 300 }, fleetWeight: 5,
    fuelKgPerHour: 2300, maintUsdPerBlockHour: 900,
  },
  {
    id: 'A310', icao: 'A310', manufacturer: 'Airbus', name: 'A310-300', category: 'widebody',
    engines: 'CF6-80C2 / PW4000', eis: 1985, built: [1985, 1998], retired: null,
    seats: { typical: 220, max: 280 }, rangeKm: 9600, cruiseKmh: 850, mtowKg: 164000, takeoffM: 2290,
    etopsMin: 180, listPriceUsdM: 90, lease: { ageYears: 33, usdK: 80 }, fleetWeight: 40,
    fuelKgPerHour: 5500, maintUsdPerBlockHour: 1800,
  },
  {
    id: 'A306', icao: 'A306', manufacturer: 'Airbus', name: 'A300-600R', category: 'widebody',
    engines: 'CF6-80C2 / PW4158', eis: 1988, built: [1986, 2002], retired: null,
    seats: { typical: 266, max: 361 }, rangeKm: 7500, cruiseKmh: 875, mtowKg: 171700, takeoffM: 2400,
    etopsMin: 180, listPriceUsdM: 100, lease: { ageYears: 30, usdK: 80 }, fleetWeight: 30,
    fuelKgPerHour: 6000, maintUsdPerBlockHour: 1900,
  },
  {
    id: 'B712', icao: 'B712', manufacturer: 'Boeing', name: '717-200', category: 'narrowbody',
    engines: 'BR715', eis: 1999, built: [1998, 2006], retired: null,
    seats: { typical: 110, max: 134 }, rangeKm: 3820, cruiseKmh: 811, mtowKg: 54885, takeoffM: 1950,
    etopsMin: 0, listPriceUsdM: 40, lease: { ageYears: 23, usdK: 60 }, fleetWeight: 90,
    fuelKgPerHour: 2300, maintUsdPerBlockHour: 850,
  },
  {
    id: 'D228', icao: 'D228', manufacturer: 'Dornier', name: 'Dornier 228', category: 'turboprop',
    engines: 'TPE331-10', eis: 1982, built: [1981, null], retired: null,
    seats: { typical: 19, max: 19 }, rangeKm: 1100, cruiseKmh: 410, mtowKg: 6575, takeoffM: 800,
    etopsMin: 0, listPriceUsdM: 8, lease: { ageYears: 20, usdK: 20 }, fleetWeight: 100,
    fuelKgPerHour: 250, maintUsdPerBlockHour: 200,
  },
  {
    id: 'MA60', icao: 'MA60', manufacturer: 'Xian', name: 'MA60', category: 'turboprop',
    engines: 'PW127J', eis: 2000, built: [2000, null], retired: null,
    seats: { typical: 56, max: 62 }, rangeKm: 1600, cruiseKmh: 514, mtowKg: 21800, takeoffM: 1250,
    etopsMin: 0, listPriceUsdM: 15, lease: { ageYears: 10, usdK: 60 }, fleetWeight: 60,
    fuelKgPerHour: 600, maintUsdPerBlockHour: 450,
  },
  // ── Freighters (added in Phase 2.1) ──────────────────────────────────────────────────
  {
    id: 'B77L-F', icao: 'B77L', manufacturer: 'Boeing', name: '777F', category: 'widebody',
    engines: 'GE90-110B1', eis: 2009, built: [2008, null], retired: null,
    seats: { typical: 0, max: 0 }, rangeKm: 9200, cruiseKmh: 896, mtowKg: 347800, takeoffM: 2830,
    etopsMin: 330, listPriceUsdM: 352.3, lease: { ageYears: 8, usdK: 1100 }, fleetWeight: 280,
    fuelKgPerHour: 7700, maintUsdPerBlockHour: 2300, payloadT: 102,
  },
  {
    id: 'B744-F', icao: 'B744', manufacturer: 'Boeing', name: '747-400F', category: 'widebody',
    engines: 'CF6-80C2 / PW4056', eis: 1993, built: [1993, 2009], retired: null,
    seats: { typical: 0, max: 0 }, rangeKm: 8230, cruiseKmh: 913, mtowKg: 396890, takeoffM: 3100,
    etopsMin: 420, listPriceUsdM: 280, lease: { ageYears: 22, usdK: 500 }, fleetWeight: 200,
    fuelKgPerHour: 10800, maintUsdPerBlockHour: 3600, payloadT: 113,
  },
  {
    id: 'B748-F', icao: 'B748', manufacturer: 'Boeing', name: '747-8F', category: 'widebody',
    engines: 'GEnx-2B67', eis: 2011, built: [2010, 2023], retired: null,
    seats: { typical: 0, max: 0 }, rangeKm: 8130, cruiseKmh: 908, mtowKg: 447700, takeoffM: 3100,
    etopsMin: 420, listPriceUsdM: 419, lease: { ageYears: 8, usdK: 1200 }, fleetWeight: 110,
    fuelKgPerHour: 10200, maintUsdPerBlockHour: 3400, payloadT: 137.7,
  },
  {
    id: 'B763-F', icao: 'B763', manufacturer: 'Boeing', name: '767-300F', category: 'widebody',
    engines: 'CF6-80C2', eis: 1995, built: [1995, null], retired: null,
    seats: { typical: 0, max: 0 }, rangeKm: 6025, cruiseKmh: 851, mtowKg: 186880, takeoffM: 2700,
    etopsMin: 180, listPriceUsdM: 220, lease: { ageYears: 10, usdK: 500 }, fleetWeight: 250,
    fuelKgPerHour: 4900, maintUsdPerBlockHour: 1700, payloadT: 52.4,
  },
  {
    id: 'A332-F', icao: 'A332', manufacturer: 'Airbus', name: 'A330-200F', category: 'widebody',
    engines: 'Trent 700 / PW4000', eis: 2010, built: [2010, 2021], retired: null,
    seats: { typical: 0, max: 0 }, rangeKm: 7400, cruiseKmh: 871, mtowKg: 233000, takeoffM: 2500,
    etopsMin: 240, listPriceUsdM: 241.7, lease: { ageYears: 10, usdK: 600 }, fleetWeight: 40,
    fuelKgPerHour: 5600, maintUsdPerBlockHour: 1650, payloadT: 61,
  },
  {
    id: 'MD11-F', icao: 'MD11', manufacturer: 'McDonnell Douglas', name: 'MD-11F', category: 'widebody',
    engines: 'CF6-80C2 / PW4462', eis: 1991, built: [1990, 2001], retired: null,
    seats: { typical: 0, max: 0 }, rangeKm: 7320, cruiseKmh: 876, mtowKg: 285990, takeoffM: 3100,
    etopsMin: 420, listPriceUsdM: 120, lease: { ageYears: 30, usdK: 400 }, fleetWeight: 100,
    fuelKgPerHour: 8000, maintUsdPerBlockHour: 2800, payloadT: 91,
  },
  {
    id: 'B752-F', icao: 'B752', manufacturer: 'Boeing', name: '757-200F (converted)', category: 'narrowbody',
    engines: 'RB211-535 / PW2000', eis: 1987, built: [1987, 2004], retired: null,
    seats: { typical: 0, max: 0 }, rangeKm: 5834, cruiseKmh: 850, mtowKg: 115680, takeoffM: 2347,
    etopsMin: 180, listPriceUsdM: 70, lease: { ageYears: 30, usdK: 150 }, fleetWeight: 280,
    fuelKgPerHour: 3200, maintUsdPerBlockHour: 1100, payloadT: 36,
  },
  {
    id: 'B738-F', icao: 'B738', manufacturer: 'Boeing', name: '737-800BCF (converted)', category: 'narrowbody',
    engines: 'CFM56-7B', eis: 2018, built: [1998, 2019], retired: null,
    seats: { typical: 0, max: 0 }, rangeKm: 3750, cruiseKmh: 842, mtowKg: 79016, takeoffM: 2300,
    etopsMin: 180, listPriceUsdM: 30, lease: { ageYears: 18, usdK: 200 }, fleetWeight: 200,
    fuelKgPerHour: 2500, maintUsdPerBlockHour: 830, payloadT: 23.9,
  },
  {
    id: 'A321-F', icao: 'A321', manufacturer: 'Airbus', name: 'A321P2F (converted)', category: 'narrowbody',
    engines: 'CFM56-5B / V2500', eis: 2020, built: [1994, 2019], retired: null,
    seats: { typical: 0, max: 0 }, rangeKm: 3700, cruiseKmh: 829, mtowKg: 93500, takeoffM: 2450,
    etopsMin: 180, listPriceUsdM: 35, lease: { ageYears: 18, usdK: 250 }, fleetWeight: 80,
    fuelKgPerHour: 2900, maintUsdPerBlockHour: 900, payloadT: 28,
  },
  {
    id: 'AT76-F', icao: 'AT76', manufacturer: 'ATR', name: 'ATR 72-600F', category: 'turboprop',
    engines: 'PW127M', eis: 2021, built: [2021, null], retired: null,
    seats: { typical: 0, max: 0 }, rangeKm: 1528, cruiseKmh: 510, mtowKg: 23000, takeoffM: 1367,
    etopsMin: 0, listPriceUsdM: 27, lease: { ageYears: 3, usdK: 200 }, fleetWeight: 40,
    fuelKgPerHour: 650, maintUsdPerBlockHour: 340, payloadT: 8.6,
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

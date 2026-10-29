// Slot-coordinated airports (Phase 7.2): IATA "Level 3" airports, where every take-off and landing needs a slot that an
// independent coordinator allocates each season (IATA Worldwide Airport Slot Guidelines; about 215 airports in summer
// 2025, more than half of them in Europe). The game lists the busiest of them, entered by hand (read 2026-10-29).
// `capacity` = declared movements per hour (published by the coordinators: ACL for the UK, FHKD for Germany, SCA for
// Austria …; rounded, partly estimated — "modelled"); `use` = how full the peak hours are today (1 = no free slots,
// Heathrow), estimated from the airports' published capacity reports. Slots can be bought where the law allows trading
// ("secondary trading": the UK, and the US slot-controlled airports); `pairUsd` = price of a daily slot pair at the peak
// (2016 dollars: SAS sold a Heathrow pair for $60 m in 2014, Oman Air paid $75 m in 2016).

export interface SlotAirport {
  id: string;
  capacity: number;
  use: number;
  pairUsd?: number;
}

export const SLOT_PRICE_YEAR = 2016;

export const SLOT_AIRPORTS: readonly SlotAirport[] = [
  // United Kingdom and Ireland (trading allowed in the UK)
  { id: 'EGLL', capacity: 88, use: 1.0, pairUsd: 60_000_000 },
  { id: 'EGKK', capacity: 55, use: 0.97, pairUsd: 6_000_000 },
  { id: 'EGSS', capacity: 50, use: 0.85, pairUsd: 1_500_000 },
  { id: 'EGLC', capacity: 45, use: 0.8, pairUsd: 2_000_000 },
  { id: 'EGCC', capacity: 61, use: 0.75, pairUsd: 1_000_000 },
  { id: 'EIDW', capacity: 48, use: 0.9 },
  // Western and central Europe
  { id: 'LFPG', capacity: 120, use: 0.85 },
  { id: 'LFPO', capacity: 72, use: 0.95 },
  { id: 'EHAM', capacity: 68, use: 0.98 },
  { id: 'EBBR', capacity: 74, use: 0.8 },
  { id: 'EDDF', capacity: 104, use: 0.92 },
  { id: 'EDDM', capacity: 90, use: 0.8 },
  { id: 'EDDL', capacity: 47, use: 0.9 },
  { id: 'EDDH', capacity: 53, use: 0.7 },
  { id: 'EDDB', capacity: 52, use: 0.7 },
  { id: 'EDDS', capacity: 40, use: 0.6 },
  { id: 'LOWW', capacity: 74, use: 0.7 },
  { id: 'LSZH', capacity: 66, use: 0.95 },
  { id: 'LSGG', capacity: 40, use: 0.85 },
  { id: 'LIRF', capacity: 90, use: 0.8 },
  { id: 'LIML', capacity: 18, use: 0.95 },
  { id: 'LIMC', capacity: 70, use: 0.7 },
  { id: 'LEMD', capacity: 100, use: 0.85 },
  { id: 'LEBL', capacity: 78, use: 0.9 },
  { id: 'LEPA', capacity: 66, use: 0.9 },
  { id: 'LPPT', capacity: 40, use: 0.98 },
  { id: 'LGAV', capacity: 64, use: 0.8 },
  { id: 'LTFM', capacity: 120, use: 0.8 },
  { id: 'LTFJ', capacity: 44, use: 0.9 },
  { id: 'EKCH', capacity: 83, use: 0.7 },
  { id: 'ESSA', capacity: 82, use: 0.6 },
  { id: 'ENGM', capacity: 72, use: 0.65 },
  { id: 'EFHK', capacity: 75, use: 0.55 },
  { id: 'EPWA', capacity: 42, use: 0.8 },
  { id: 'LKPR', capacity: 46, use: 0.65 },
  { id: 'LHBP', capacity: 50, use: 0.65 },
  // Middle East and Asia
  { id: 'OMDB', capacity: 70, use: 0.95 },
  { id: 'OTHH', capacity: 70, use: 0.7 },
  { id: 'RJTT', capacity: 90, use: 0.98 },
  { id: 'RJAA', capacity: 68, use: 0.9 },
  { id: 'RJBB', capacity: 60, use: 0.75 },
  { id: 'RKSI', capacity: 90, use: 0.85 },
  { id: 'VHHH', capacity: 68, use: 0.95 },
  { id: 'WSSS', capacity: 68, use: 0.9 },
  { id: 'ZBAA', capacity: 88, use: 0.95 },
  { id: 'ZSPD', capacity: 74, use: 0.9 },
  { id: 'ZGGG', capacity: 65, use: 0.9 },
  { id: 'RCTP', capacity: 50, use: 0.85 },
  { id: 'VTBS', capacity: 68, use: 0.95 },
  { id: 'WMKK', capacity: 78, use: 0.7 },
  { id: 'VIDP', capacity: 80, use: 0.95 },
  { id: 'VABB', capacity: 46, use: 0.98 },
  { id: 'YSSY', capacity: 80, use: 0.95 },
  // Americas (US slot-controlled airports: transfers between airlines allowed)
  { id: 'KJFK', capacity: 81, use: 0.95, pairUsd: 25_000_000 },
  { id: 'KLGA', capacity: 71, use: 0.98, pairUsd: 10_000_000 },
  { id: 'KDCA', capacity: 67, use: 0.98, pairUsd: 10_000_000 },
  { id: 'KEWR', capacity: 79, use: 0.9 },
  { id: 'CYYZ', capacity: 90, use: 0.85 },
  { id: 'MMMX', capacity: 61, use: 0.98 },
  { id: 'SBGR', capacity: 58, use: 0.85 },
];

export const slotAirport = (() => {
  const map = new Map(SLOT_AIRPORTS.map((a) => [a.id, a]));
  return (id: string): SlotAirport | undefined => map.get(id);
})();

/**
 * How busy an hour of the day is compared with the busiest one (local time): hub airports have morning and evening
 * peaks and quiet nights. Fitted roughly to the hourly movement profiles in airports' capacity reports.
 */
export const HOUR_PROFILE: readonly number[] = [
  0.1, 0.05, 0.03, 0.03, 0.05, 0.3, 0.8, 1, 0.95, 0.9, 0.85, 0.8, 0.8, 0.85, 0.85, 0.9, 0.95, 1, 1, 0.95, 0.85, 0.7, 0.5, 0.25,
];

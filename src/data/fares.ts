// Booking classes ("fare buckets"), booking curves and willingness to pay (Phase 9.3). Every cabin sells its seats in
// buckets: cheap ones with conditions that close weeks before departure, expensive flexible ones until the end. The
// airline sets the buckets (names, price relative to the class's fare, flexibility, when they close) and how many seats
// each may sell per route. Travellers arrive over the weeks before departure — holidaymakers early, business travellers
// late — and buy the cheapest open bucket they are willing to pay for; business travellers want flexibility. Modelled
// after the textbook model of airline revenue management (Talluri & van Ryzin, "The Theory and Practice of Revenue
// Management", 2004; booking curves as in IATA/airline presentations: leisure books 6–10 weeks ahead, business within
// 2–3 weeks).

export interface FareBucket {
  /** Stable id (kept when renamed). */
  id: string;
  name: string;
  /** Price relative to the class's fare (1 = the fare set on the route). */
  factor: number;
  /** Free changes and refunds (what business travellers want). */
  flexible: boolean;
  /** Sales stop this many days before departure (advance purchase). */
  closeDays: number;
  /** Default share of the cabin's seats this bucket may sell (null = no limit); routes can set their own. */
  share: number | null;
}

/** The buckets new airlines start with (every class the same steps around its own fare). */
export const DEFAULT_BUCKETS: readonly FareBucket[] = [
  { id: 'saver', name: 'Saver', factor: 0.6, flexible: false, closeDays: 14, share: 0.2 },
  { id: 'basic', name: 'Basic', factor: 0.8, flexible: false, closeDays: 3, share: 0.3 },
  { id: 'classic', name: 'Classic', factor: 1, flexible: false, closeDays: 0, share: null },
  { id: 'flex', name: 'Flex', factor: 1.5, flexible: true, closeDays: 0, share: null },
];
export const MAX_BUCKETS = 6;

/**
 * What travellers would pay at most, relative to the class's fare: log-normal around a median. Business travellers pay
 * more and most of them need a flexible ticket (a fixed one is worth this much less to them).
 */
export const WILLINGNESS = {
  leisure: { median: 0.93, spread: 0.45 },
  business: { median: 1.45, spread: 0.35 },
} as const;
export const BUSINESS_NEEDS_FLEX = 0.6;
export const FIXED_TICKET_PENALTY = 1.4;

/** Typical days before departure by which most travellers have booked (exponential booking curve); long-haul earlier. */
export const BOOKING_DAYS = {
  leisure: { short: 42, long: 70 },
  business: { short: 9, long: 16 },
} as const;
/** Flights open for sale this many days ahead (earlier bookings arrive all on the first day). */
export const SALES_OPEN_DAYS = { short: 60, medium: 75, long: 120 } as const;
export const salesOpenDays = (km: number): number => (km < 1500 ? SALES_OPEN_DAYS.short : km < 4000 ? SALES_OPEN_DAYS.medium : SALES_OPEN_DAYS.long);
/** Booking curve marks (days before departure) kept for the flight page's chart. */
export const CURVE_MARKS = [120, 90, 75, 60, 45, 30, 21, 14, 7, 3, 1, 0] as const;
/** European business: unsold business rows behind the curtain sell as economy (seats of economy per business seat). */
export const CURTAIN_ECONOMY_PER_SEAT = 1.5;

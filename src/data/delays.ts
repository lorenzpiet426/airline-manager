// Delays and punctuality (Phase 9.1). Each flight can be held up by causes with their own chances and typical lengths;
// what is left at the end of a flight carries over to the aircraft's next one (knock-on or "reactionary" delay) unless
// the timetable has buffer. Calibrated to EUROCONTROL CODA "All-Causes Delays to Air Transport in Europe – Annual 2024"
// (read 2026-10-29): 17.5 minutes average departure delay per flight, 72.4 % of flights arriving within 15 minutes,
// reactionary delay 46 % of delay minutes (8.0 min per flight), airline causes 4.3 min, en-route ATFM 2.3 min
// (0.8 of it weather).

export type DelayCause = 'airline' | 'atc' | 'airport' | 'weather' | 'reactionary' | 'curfew';

/** A flight counts as on time if it arrives no more than this late (the industry's "A15"). */
export const ON_TIME_MIN = 15;

/** Primary causes: chance per flight and mean length (minutes, exponentially distributed). */
export const AIRLINE_DELAY = { chance: 0.2, mean: 21 } as const;
/** Tight turnarounds (less than this buffer above the minimum) are late more often. */
export const TIGHT_BUFFER_MIN = 10;
export const TIGHT_EXTRA_CHANCE = 0.12;
/** Air traffic flow management: Europe busiest in summer; elsewhere less (US ground delay programmes at hubs). */
export const ATC_DELAY = { chance: 0.1, mean: 22 } as const;
export const ATC_REGION: Readonly<Record<string, number>> = { EU: 1, NA: 0.6, AS: 0.7, OC: 0.3, SA: 0.4, AF: 0.4 };
/** Airport congestion (taxi queues, stands): coordinated (slot) airports more. */
export const AIRPORT_DELAY = { chance: 0.06, mean: 16, congested: 1.8 } as const;
/** Weather: most days are fine; on a bad day (storm, fog, snow, thunderstorms) many flights are late. */
export const BAD_WEATHER_DAY = 0.04;
export const WEATHER_DELAY = { badChance: 0.35, badMean: 25, goodChance: 0.01, goodMean: 12 } as const;
/** On a very bad day at the destination some flights divert. */
export const WEATHER_DIVERSION = 0.04;
/** Time a schedule's padding lets an aircraft make up in the air (share of block, at most). */
export const PADDING_SHARE = 0.08;
export const MAX_PADDING_MIN = 20;
/** A late aircraft is turned around faster than planned (crews and handlers hurry): this share of the minimum. */
export const QUICK_TURN_SHARE = 0.75;

/** Extra costs of delay to the airline beyond passengers' rights: crew overtime, fuel, maintenance (2025 EUR per minute
 * and 150 seats; order of magnitude of the tactical costs in University of Westminster for EUROCONTROL, "European
 * airline delay cost reference values"; the planned crew and fuel are already in the normal costs). */
export const DELAY_COST_EUR_MIN = 15;
/** Passengers are looked after from two hours of delay; compensation (EU 261, CJEU Sturgeon 2009) from three hours at
 * the final destination, unless caused by extraordinary circumstances (weather, ATC). */
export const CARE_FROM_MIN = 120;
export const COMPENSATION_FROM_MIN = 180;
export const MEAL_EUR = 12;
/** A diversion: buses or a ferry flight, handling at the other airport, care (EUR per passenger). */
export const DIVERSION_EUR_PAX = 90;
/** Delayed flights may still use the first part of a night ban (e.g. Zurich until 23:30, Frankfurt until midnight for
 * delayed flights): minutes of grace. */
export const CURFEW_GRACE_MIN = 30;
/** Transfer passengers miss their connection when the arrival is more than this late, rising to this share at most. */
export const MISS_FROM_MIN = 30;
export const MISS_RANGE_MIN = 150;
export const MISS_MAX_SHARE = 0.8;
/** Missed connections: rebooking and care per passenger. */
export const MISSED_CONNECTION_EUR = 110;

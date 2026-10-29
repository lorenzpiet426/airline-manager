// Crews (Phase 8.1): how many pilots and cabin crew an airline needs, what they cost, how long hiring and training take,
// and how easy they are to find. Modelled from public rules and reports (read 2026-10-29):
//  - EU flight time limitations (Regulation 965/2012, ORO.FTL): at most 900 block hours a year and 100 in 28 days per
//    crew member; airlines plan about 750–800 (leave, training, reserve, standby).
//  - Type ratings: a pilot is licensed per type or family (A320 family incl. neo; 737 NG and MAX with differences
//    training; A330/A350 with cross-crew qualification; E-Jets; 757/767 common type …); a new rating takes about
//    6–8 weeks (ground school, simulator, line training) and costs the airline roughly $25–40k.
//  - Command upgrade (first officer → captain): about 6 weeks of training after enough experience.
//  - Crew market: pilot surpluses after 1991, 2001, 2008 and COVID (2020–22), shortages in the mid-2000s and from
//    2023 (CAE and Boeing pilot outlooks, IATA).
// Wages: the game's existing crew costs per pilot (short-/long-haul) and cabin crew member, Austrian level, scaled by
// the base country's wage level like every other wage; captains earn about twice as much as first officers.

/** The licence family a type belongs to (pilots can fly every type of their family). */
export function ratingFamily(typeId: string): string {
  if (/^(A31[89]|A32[01]|A19N|A20N|A21N)/.test(typeId)) return 'A320';
  if (/^B73[6789]|^B3[789X]M/.test(typeId)) return 'B737NG';
  if (/^B73[345]/.test(typeId)) return 'B737CL';
  if (/^B73[12]$/.test(typeId)) return 'B737OLD';
  if (/^(A33|A34|A35)/.test(typeId)) return 'A330';
  if (/^B7[58]/.test(typeId) || /^B76/.test(typeId)) return /^B78/.test(typeId) ? 'B787' : 'B757';
  if (/^B77/.test(typeId)) return 'B777';
  if (/^B74/.test(typeId)) return 'B747';
  if (/^E29/.test(typeId)) return 'E2';
  if (/^E(17|19)\d/.test(typeId)) return 'EJET';
  if (/^E1[34]5/.test(typeId)) return 'ERJ';
  if (/^CRJ/.test(typeId)) return 'CRJ';
  if (/^AT[47]/.test(typeId)) return 'ATR';
  if (/^DH8/.test(typeId)) return 'DASH8';
  if (/^(DC9|DC93|DC95|MD8|MD9)/.test(typeId)) return 'DC9';
  if (/^F(70|100|28)$/.test(typeId)) return 'F100';
  if (/^BCS/.test(typeId)) return 'A220';
  return typeId;
}

/** Block hours a year a crew member flies on average (planned below the 900-hour EU limit). */
export const PILOT_HOURS_YEAR = { short: 750, long: 800 } as const;
export const CABIN_HOURS_YEAR = 800;
/** Extra crews for sickness, leave and standby. */
export const CREW_RESERVE = 0.1;
/** Pilots per flight by block time: two; long flights need a relief crew (augmented crew). */
export const pilotsPerFlight = (blockMin: number): number => (blockMin > 12 * 60 ? 4 : blockMin > 9 * 60 ? 3 : 2);

/** Pay of a captain / first officer relative to the average pilot cost (equal numbers give the average). */
export const CAPTAIN_PAY = 1.35;
export const FIRST_OFFICER_PAY = 0.65;

/** Weeks until a hire starts flying (notice period, company training) and the extra training. */
export const HIRE_WEEKS = 6;
export const TYPE_RATING_WEEKS = 7;
export const UPGRADE_WEEKS = 6;
export const CABIN_TRAINING_WEEKS = 6;
/** Training costs (2025 USD) paid by the airline. */
export const TYPE_RATING_USD = 35_000;
export const UPGRADE_USD = 25_000;
export const CABIN_TRAINING_USD = 5_000;
/** Letting staff go: about three months' pay. */
export const SEVERANCE_MONTHS = 3;

/**
 * The pilot job market by year: 1 = normal, above 1 = many pilots looking for work, below 1 = shortage (airlines
 * compete for them). Modelled from the industry's boom and bust years.
 */
const PILOT_MARKET: [number, number][] = [
  [1970, 1.0], [1973, 1.0], [1975, 1.2], [1979, 0.9], [1982, 1.3], [1986, 1.0], [1989, 0.85], [1992, 1.4], [1996, 1.0],
  [1999, 0.85], [2002, 1.6], [2005, 1.1], [2007, 0.75], [2009, 1.4], [2012, 1.1], [2016, 0.85], [2019, 0.75],
  [2021, 1.9], [2022, 1.2], [2023, 0.5], [2025, 0.6], [2026, 0.7],
];

export function pilotMarket(year: number): number {
  if (year <= PILOT_MARKET[0]![0]) return PILOT_MARKET[0]![1];
  for (let i = 1; i < PILOT_MARKET.length; i++) {
    const [y1, v1] = PILOT_MARKET[i]!;
    if (year <= y1) {
      const [y0, v0] = PILOT_MARKET[i - 1]!;
      return v0 + ((v1 - v0) * (year - y0)) / (y1 - y0);
    }
  }
  return PILOT_MARKET.at(-1)![1];
}

/** Pilots an airline can hire per month at a base in a normal market: by how many people live around it. */
export const pilotsPerMonth = (marketPop: number): number => Math.max(2, Math.min(25, Math.round(marketPop / 600_000)));
/** Extra applicants per month per pilot the airline already employs at the base (reputation, cadet programmes). */
export const EMPLOYER_PULL = 0.01;
/** Share of the pilots on the market who already hold the rating for a family (the others need a type rating). */
export const RATED_SHARE = 0.4;
/** Share of them experienced enough to be hired as captains. */
export const CAPTAIN_SHARE = 0.3;
/** Cabin crew are much easier to find. */
export const CABIN_PER_PILOT = 4;
/** Staff leaving per month at normal pay in a normal market. */
export const MONTHLY_ATTRITION = 0.005;

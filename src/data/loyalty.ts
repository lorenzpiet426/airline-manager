// Frequent-flyer programmes (Phase 9.4). Modelled on today's revenue-based programmes (points per euro spent, more for
// status members: Miles & More from 2024, Lufthansa Group; British Airways Executive Club; United MileagePlus) and on
// how airlines account for points (IFRS 15: points are a liability until they are redeemed or expire; airlines value a
// point at roughly 0.5–1.5 cents). Numbers below are modelled orders of magnitude, not any one programme's.

export type Tier = 'silver' | 'gold' | 'platinum';
export const TIERS: readonly Tier[] = ['silver', 'gold', 'platinum'];

/** Settings a new own programme starts with. */
export const DEFAULT_PROGRAMME = {
  /** Points per euro of ticket revenue (base members). */
  earn: 4,
  /** Yearly spend (EUR) to reach Silver, Gold, Platinum. */
  thresholds: { silver: 1_500, gold: 4_000, platinum: 10_000 } as Record<Tier, number>,
  /** Share of each flight's seats members may book with points. */
  awardShare: 0.05,
  /** Points expire after this many months without activity (0 = never). */
  expiryMonths: 36,
} as const;
export const LIMITS = { earn: [1, 10], awardShare: [0, 0.15], expiryMonths: [0, 60], threshold: [200, 50_000] } as const;

/** Extra points for status members. */
export const TIER_BONUS: Readonly<Record<Tier, number>> = { silver: 0.25, gold: 0.5, platinum: 1 };
/** Share of member revenue from status members at the default thresholds (nested: gold members are silver too). */
export const TIER_REVENUE_SHARE: Readonly<Record<Tier, number>> = { silver: 0.45, gold: 0.25, platinum: 0.08 };
/** How fast those shares change with the thresholds (EUR: a threshold this much higher has e times fewer members). */
export const TIER_SCALE: Readonly<Record<Tier, number>> = { silver: 3_000, gold: 6_000, platinum: 15_000 };

/** Points needed for an economy award seat: a base plus a distance part (about 20,000 for Vienna–London). */
export const awardPoints = (km: number): number => Math.round((10_000 + 8 * km) / 500) * 500;

/** Value of a point to the airline (EUR): its share of the ticket's worth when redeemed; used for the liability. */
export const POINT_VALUE_EUR = 0.008;
/** Share of members' outstanding points redeemed each week, and of balances that expire unused over their life. */
export const WEEKLY_REDEMPTION = 0.015;
export const BREAKAGE = 0.3;

/** Members: share of passengers who are members (own programmes grow towards it over about a year). */
export const MEMBER_SHARE = { base: 0.1, perValue: 0.4, partner: 0.55 } as const;
export const MEMBER_SHARE_WEEKLY_STEP = 0.02;
/** Members spend more than other passengers (their share of revenue is this much higher, at most all of it). */
export const MEMBER_SPEND = 1.3;
/** Trips a member makes a year on average (to count members from member trips). */
export const TRIPS_PER_MEMBER = 3;

/** Running an own programme (EUR per member and year): IT, statements, call centre, marketing. */
export const ADMIN_EUR_MEMBER_YEAR = 3;
/** Income from selling points to partners (credit cards, hotels, car rental) per member and year. */
export const PARTNER_SALES_EUR_MEMBER_YEAR = 4;
/** Lounge visits of Gold and Platinum members travelling in economy (EUR each); share of their trips that use one. */
export const STATUS_LOUNGE_EUR = 25;
export const STATUS_LOUNGE_USE = 0.25;
/** Members per tier relative to the tier's share of member revenue (status members fly and spend far more). */
export const TIER_MEMBERS: Readonly<Record<Tier, number>> = { silver: 0.2, gold: 0.08, platinum: 0.02 };

/** A group programme (Miles & More): the airline pays per point its passengers earn, the group pays for award seats. */
export const PARTNER_FEE_EUR_POINT = 0.005;
export const partnerAwardEur = (km: number): number => 50 + 0.03 * km;
export const PARTNER_VALUE = 0.9;

/** How much more attractive the airline's flights are with a programme of value 1 (business / holidaymakers). */
export const PULL = { business: 0.12, leisure: 0.03 } as const;

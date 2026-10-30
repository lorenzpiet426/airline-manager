// Frequent-flyer programmes (Phase 9.4). An airline can run its own programme or belong to its group's (Austrian:
// Miles & More). Part of its passengers are members — more of the business travellers, more with a bigger and more
// generous programme — and members prefer its flights. Members earn points per euro spent (status members more) and
// redeem them for award seats on the airline's own flights, which take seats that could have been sold; points not
// redeemed are a liability, part of them expires. Status (Silver, Gold, Platinum) depends on the thresholds the
// airline sets: lower thresholds mean more status members, more loyalty and more cost (bonus points, lounges). In a
// group's programme the airline can't change the rules: it pays the group for the points its passengers earn and is
// paid for the group's award passengers on its flights. Weekly, from the week's accounts.
import {
  ADMIN_EUR_MEMBER_YEAR,
  awardPoints,
  BREAKAGE,
  DEFAULT_PROGRAMME,
  LIMITS,
  MEMBER_SHARE,
  MEMBER_SHARE_WEEKLY_STEP,
  MEMBER_SPEND,
  PARTNER_FEE_EUR_POINT,
  PARTNER_SALES_EUR_MEMBER_YEAR,
  PARTNER_VALUE,
  partnerAwardEur,
  PULL,
  STATUS_LOUNGE_EUR,
  STATUS_LOUNGE_USE,
  TIER_BONUS,
  TIER_REVENUE_SHARE,
  TIER_MEMBERS,
  TIER_SCALE,
  TIERS,
  TRIPS_PER_MEMBER,
  WEEKLY_REDEMPTION,
  type Tier,
} from '../data/loyalty';
import { book, postMessage } from './core';
import { bookPnl } from './fleet';
import { money } from './money';
import type { Airline, GameState, Loyalty } from './state';

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const eurToBook = (state: GameState, currency: string) => (state.fx[currency] ?? 1) / (state.fx.EUR ?? 1);

/** Nested shares of member revenue from Silver (and above), Gold (and above) and Platinum members at these thresholds. */
export function tierShares(thresholds: Record<Tier, number>): Record<Tier, number> {
  const d = DEFAULT_PROGRAMME.thresholds;
  const share = (t: Tier) => Math.min(0.8, TIER_REVENUE_SHARE[t] * Math.exp(-(thresholds[t] - d[t]) / TIER_SCALE[t]));
  const silver = share('silver');
  const gold = Math.min(silver, share('gold'));
  return { silver, gold, platinum: Math.min(gold, share('platinum')) };
}

/** How attractive the programme is (0 … 1): a group's is big; an own one grows with the network and its generosity. */
export function programmeValue(state: GameState, airline: Airline): number {
  const p = airline.loyalty;
  if (!p) return 0;
  if (p.kind === 'partner') return PARTNER_VALUE;
  const routes = Object.values(state.routes).filter((r) => r.airlineId === airline.id).length;
  const network = Math.sqrt(Math.min(1, routes / 60));
  const generous =
    Math.min(1.3, p.earn / DEFAULT_PROGRAMME.earn) ** 0.4 *
    Math.min(1.2, Math.max(0.2, p.awardShare / DEFAULT_PROGRAMME.awardShare) ** 0.2) *
    Math.min(1.2, Math.exp(-(p.thresholds.gold - DEFAULT_PROGRAMME.thresholds.gold) / 8_000)) ** 0.3 *
    (p.expiryMonths === 0 ? 1.05 : p.expiryMonths < 24 ? 0.9 : 1);
  return clamp(0.25 + 0.65 * network * generous, 0, 1);
}

/** Members' preference for the airline's flights (choice multipliers for business travellers and holidaymakers). */
export function loyaltyPull(state: GameState, airline: Airline | undefined): { business: number; leisure: number } | undefined {
  const p = airline?.loyalty;
  if (!airline || !p) return undefined;
  const v = programmeValue(state, airline);
  const target = p.kind === 'partner' ? MEMBER_SHARE.partner : MEMBER_SHARE.base + MEMBER_SHARE.perValue * v;
  const grown = Math.min(1, p.memberShare / Math.max(0.01, target));
  return { business: 1 + PULL.business * v * grown, leisure: 1 + PULL.leisure * v * grown };
}

// ─── Commands ───────────────────────────────────────────────────────────────────

export type LoyaltyError = 'loyaltyExists' | 'loyaltyNone' | 'loyaltyPartner' | 'loyaltyInvalid';

export function startProgramme(state: GameState, airlineId: string, name: string): LoyaltyError | null {
  const airline = state.airlines[airlineId]!;
  if (airline.loyalty) return 'loyaltyExists';
  if (!name.trim() || name.length > 30) return 'loyaltyInvalid';
  airline.loyalty = {
    kind: 'own',
    name: name.trim(),
    startedAt: state.time,
    earn: DEFAULT_PROGRAMME.earn,
    thresholds: { ...DEFAULT_PROGRAMME.thresholds },
    awardShare: DEFAULT_PROGRAMME.awardShare,
    expiryMonths: DEFAULT_PROGRAMME.expiryMonths,
    memberShare: 0,
    points: 0,
    awardRate: 0,
    weeks: [],
  };
  return null;
}

export function joinPartnerProgramme(state: GameState, airlineId: string, name: string): void {
  const airline = state.airlines[airlineId]!;
  airline.loyalty = {
    kind: 'partner',
    name,
    startedAt: state.time,
    earn: DEFAULT_PROGRAMME.earn,
    thresholds: { ...DEFAULT_PROGRAMME.thresholds },
    awardShare: 0.03,
    expiryMonths: 36,
    memberShare: MEMBER_SHARE.partner,
    points: 0,
    awardRate: 0.03,
    weeks: [],
  };
}

export function setProgramme(state: GameState, airlineId: string, s: Pick<Loyalty, 'name' | 'earn' | 'thresholds' | 'awardShare' | 'expiryMonths'>): LoyaltyError | null {
  const p = state.airlines[airlineId]!.loyalty;
  if (!p) return 'loyaltyNone';
  if (p.kind === 'partner') return 'loyaltyPartner';
  const t = s.thresholds;
  const ok =
    s.name.trim().length > 0 &&
    s.name.length <= 30 &&
    s.earn >= LIMITS.earn[0] &&
    s.earn <= LIMITS.earn[1] &&
    s.awardShare >= LIMITS.awardShare[0] &&
    s.awardShare <= LIMITS.awardShare[1] &&
    Number.isInteger(s.expiryMonths) &&
    s.expiryMonths >= LIMITS.expiryMonths[0] &&
    s.expiryMonths <= LIMITS.expiryMonths[1] &&
    TIERS.every((k) => Number.isFinite(t[k]) && t[k] >= LIMITS.threshold[0] && t[k] <= LIMITS.threshold[1]) &&
    t.silver < t.gold &&
    t.gold < t.platinum;
  if (!ok) return 'loyaltyInvalid';
  Object.assign(p, { name: s.name.trim(), earn: Math.round(s.earn * 10) / 10, thresholds: { ...t }, awardShare: s.awardShare, expiryMonths: s.expiryMonths });
  return null;
}

/** Leaving a group's programme (or closing an own one): its members are gone; an own programme's points are paid off. */
export function leaveProgramme(state: GameState, airlineId: string): LoyaltyError | null {
  const airline = state.airlines[airlineId]!;
  const p = airline.loyalty;
  if (!p) return 'loyaltyNone';
  if (p.kind === 'own' && p.points > 0) {
    // Members are given the value of their points (vouchers): the liability is settled.
    const eur = p.points * DEFAULT_POINT_PAYOFF;
    const paid = -book(state, airlineId, 'loyalty', money(-Math.round(eur), 'EUR')).amount;
    bookPnl(state, airlineId, 'loyalty', paid);
  }
  delete airline.loyalty;
  return null;
}
const DEFAULT_POINT_PAYOFF = 0.008;

// ─── The weekly step ────────────────────────────────────────────────────────────

/** Each Monday, from the week just closed: members, points, award seats and the programme's costs. */
export function loyaltyWeeklyStep(state: GameState): void {
  for (const airline of Object.values(state.airlines)) {
    const p = airline.loyalty;
    if (airline.controller !== 'human' || !p) continue;
    const week = state.finance[airline.id]?.history.at(-1);
    if (!week) continue;
    const toEur = 1 / eurToBook(state, airline.currency);
    let pax = 0;
    let seatsY = 0;
    let km = 0;
    for (const [id, s] of Object.entries(week.routes)) {
      pax += s.pax;
      seatsY += s.classes?.Y?.seats ?? s.seats;
      km += (state.routes[id]?.distanceKm ?? 0) * s.pax;
    }
    const revenueEur = week.lines.revenue * toEur;
    const avgKm = pax > 0 ? km / pax : 1_000;
    const v = programmeValue(state, airline);
    const target = p.kind === 'partner' ? MEMBER_SHARE.partner : MEMBER_SHARE.base + MEMBER_SHARE.perValue * v;
    p.memberShare += clamp(target - p.memberShare, -MEMBER_SHARE_WEEKLY_STEP, MEMBER_SHARE_WEEKLY_STEP);
    const memberRevenue = revenueEur * Math.min(1, p.memberShare * MEMBER_SPEND);
    const members = Math.round((pax * p.memberShare * 52) / TRIPS_PER_MEMBER);
    const shares = tierShares(p.thresholds);
    const only = { silver: shares.silver - shares.gold, gold: shares.gold - shares.platinum, platinum: shares.platinum };
    // Status members are few but travel a lot: their share of members is far below their share of revenue.
    const tiers = Object.fromEntries(TIERS.map((t) => [t, Math.round(members * only[t] * TIER_MEMBERS[t])])) as Record<Tier, number>;
    const earned = memberRevenue * p.earn * (1 + TIERS.reduce((n, t) => n + only[t] * TIER_BONUS[t], 0));
    // Gold and Platinum members in economy use the lounges.
    const lounges = pax * p.memberShare * shares.gold * STATUS_LOUNGE_USE * STATUS_LOUNGE_EUR;
    let costEur: number;
    let redeemed = 0;
    let expired = 0;
    let awards: number;
    if (p.kind === 'own') {
      p.points += earned;
      expired = p.expiryMonths > 0 ? (p.points * BREAKAGE) / (p.expiryMonths * 4.33) : 0;
      p.points -= expired;
      // Members redeem part of their points for award seats, as far as the airline gives seats for them.
      const wanted = (p.points * WEEKLY_REDEMPTION) / awardPoints(avgKm);
      awards = Math.min(wanted, p.awardShare * seatsY);
      redeemed = awards * awardPoints(avgKm);
      p.points -= redeemed;
      costEur = ((members * (ADMIN_EUR_MEMBER_YEAR - PARTNER_SALES_EUR_MEMBER_YEAR)) / 52) + lounges;
    } else {
      // The group's members fly on the airline with their points; the group pays for those seats.
      awards = p.awardShare * seatsY;
      costEur = earned * PARTNER_FEE_EUR_POINT + lounges - awards * partnerAwardEur(avgKm);
    }
    p.awardRate = seatsY > 0 ? Math.min(p.awardShare, awards / seatsY) : 0;
    const paid = -book(state, airline.id, 'loyalty', money(-Math.round(costEur), 'EUR')).amount;
    bookPnl(state, airline.id, 'loyalty', paid);
    p.weeks.push({ start: week.start, members, memberShare: p.memberShare, tiers, earned: Math.round(earned), redeemed: Math.round(redeemed), expired: Math.round(expired), awards: Math.round(awards), costEur: Math.round(costEur) });
    if (p.weeks.length > 26) p.weeks.splice(0, p.weeks.length - 26);
    if (p.kind === 'own' && members >= 10_000 && (p.weeks.at(-2)?.members ?? 0) < 10_000) {
      postMessage(state, { airlineId: airline.id, kind: 'loyaltyMilestone', level: 'info', params: { name: p.name, members } });
    }
  }
}

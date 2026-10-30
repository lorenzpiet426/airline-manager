// Other airlines' shares, takeovers and mergers (Phase 10.5). The listed airline companies of the time trade on the
// game's stock market; their value follows their size, their margin in the game (the AI's health) and the market's
// mood. The player's airline can buy stakes with company money (announcing them at the legal thresholds), but crossing
// 30 % needs a takeover offer to all shareholders: governments don't sell, founders and other airlines only for a good
// premium, the free float the more the higher the premium. If enough accept, the competition authority checks the
// routes both fly (in depth when there are any) and may forbid it or make the bought airline give routes up. A company
// controlled by the player becomes a subsidiary — a partner that doesn't compete and passes its result on — or, with
// 75 % of the votes, its airlines can be merged into the player's own (aircraft, routes, crews, slots). Strong AI groups
// now and then buy weak airlines too, and may bid for the player's own listed airline when its shares are cheap.
import { getAircraftType, isFreighter, type AircraftType } from '../data/aircraft';
import { inSingleMarket } from '../data/aviationMarkets';
import { worldDemandIndex } from '../data/economyHistory';
import {
  AI_BID_CHANCE_PER_MONTH,
  AI_TAKEOVERS_PER_YEAR,
  DISCLOSURE,
  foreignCap,
  INTEGRATION_COST,
  LISTED_AIRLINES,
  listedById,
  MANDATORY_BID,
  MAX_WEEKLY_BUY,
  MERGE_MIN_STAKE,
  OFFER_WEEKS,
  PAYOUT,
  PRICE_IMPACT,
  REVIEW_PHASE1_WEEKS,
  REVIEW_PHASE2_WEEKS,
  type BlockHolder,
  type ListedAirline,
} from '../data/listedAirlines';
import { airlineCabin } from './ai';
import { openBase } from './bases';
import { totalSeats } from './cabins';
import { newRegistration } from './commands';
import { book, nextId, postMessage } from './core';
import { grantCrewForNeeds } from './crews';
import { aiRouteKey } from './economics';
import { priceLevelAt } from './era';
import { bookPnl } from './fleet';
import { ensureGates } from './hub';
import { ensureMaint } from './maintenance';
import { typicalRentUsd } from './market';
import { money } from './money';
import type { RealAirline } from './realAirlines';
import { holder } from './shares';
import { grantHistoricSlots } from './slots';
import type { Aircraft, Airline, GameState, Holding, ListedState } from './state';
import { addNetwork, ESTABLISHED_DAYS } from './takeover';
import { fractionalYearOf } from '../data/eras';
import { MINUTES_PER_DAY, MINUTES_PER_WEEK, simTime, startOfDay, toDate, yearOf, type SimTime } from './time';
import { conditionsOf } from './worldEvents';
import type { EngineWorld } from './world';

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const eurToBook = (state: GameState, currency: string) => (state.fx[currency] ?? 1) / (state.fx.EUR ?? 1);
const DAY = MINUTES_PER_DAY;

/** A number in [0, 1) from a text (stable, so the game's other random events stay the same). */
function hash(text: string): number {
  let x = 2166136261;
  for (const ch of text) x = Math.imul(x ^ ch.charCodeAt(0), 16777619);
  x ^= x >>> 15;
  x = Math.imul(x, 2246822507);
  return ((x ^ (x >>> 13)) >>> 0) / 4294967296;
}
const gauss = (text: string) => Math.sqrt(-2 * Math.log(Math.max(1e-9, hash(`${text}a`)))) * Math.cos(2 * Math.PI * hash(`${text}b`));

export type InvestError =
  | 'notListed' | 'ownGroup' | 'shareInvalid' | 'weeklyLimit' | 'ownershipCap' | 'mandatoryBid' | 'notEnoughShares' | 'insufficientCash'
  | 'bidRunning' | 'offerTooLow' | 'stateBlocks' | 'noControl' | 'needMoreShares' | 'cannotMerge' | 'alreadyMerged' | 'noBid';

// ─── The companies ──────────────────────────────────────────────────────────────

const day = (time: SimTime) => toDate(time).toISOString().slice(0, 10);

/** The member airlines a company owns now (and that fly now: they exist in this year's world and aren't bankrupt). */
export function membersNow(state: GameState, world: EngineWorld, x: ListedAirline, time = state.time): RealAirline[] {
  const y = yearOf(time);
  const out: RealAirline[] = [];
  for (const m of x.members) {
    if ((m.from ?? 0) > y || (m.to ?? 9999) < y) continue;
    const real = world.realAirlines?.byId.get(m.id);
    if (!real) continue;
    if (state.ai.airlines[m.id]?.status === 'bankrupt') continue;
    out.push(real);
  }
  return out;
}

/** The company is on the stock exchange now (its years, a member flying, not taken over). */
export function isListed(state: GameState, world: EngineWorld, x: ListedAirline): boolean {
  const y = fractionalYearOf(toDate(state.time));
  if (y < x.listed[0] || (x.listed[1] !== null && y >= x.listed[1] + 1)) return false;
  if (state.stocks?.listed?.[x.id]?.ownedBy) return false;
  return membersNow(state, world, x).length > 0;
}

/** Governments holding a blocking minority (25 %) don't let their flag carrier be taken over (Air France-KLM, Finnair,
 * Turkish, Singapore …): only stakes can be bought. */
export const stateBlocks = (x: ListedAirline, time: SimTime): boolean =>
  blockHolders(x, time).filter((h) => h.kind === 'state').reduce((n, h) => n + h.share, 0) >= 0.25;

/** Governments, founders and other airlines holding big stakes now. */
export const blockHolders = (x: ListedAirline, time: SimTime): BlockHolder[] => {
  const y = yearOf(time);
  return x.holders.filter((h) => h.from <= y && (h.to === undefined || h.to > y));
};

/** Fleet size of a member (its weight in the company). */
const memberWeight = (r: RealAirline) => Math.max(1, r.fleet.reduce((n, f) => n + f.inService, 0), r.registered.length);

/** Share of the company left after members were merged into the player's airline. */
function remainingShare(state: GameState, world: EngineWorld, x: ListedAirline): number {
  const merged = new Set(Object.values(state.airlines).flatMap((a) => a.holdings?.[x.id]?.merged ?? []));
  if (!merged.size) return 1;
  const members = x.members.map((m) => world.realAirlines?.byId.get(m.id)).filter((r): r is RealAirline => !!r);
  const all = members.reduce((n, r) => n + memberWeight(r), 0);
  const left = members.filter((r) => !merged.has(r.id)).reduce((n, r) => n + memberWeight(r), 0);
  return all > 0 ? left / all : 0;
}

/** The company's revenue now (euros a year): its fiscal year's revenue, moved with air travel and prices since then. */
export function revenueNow(state: GameState, world: EngineWorld, x: ListedAirline): number {
  const fyTime = simTime(x.fy, 7, 1);
  const y = fractionalYearOf(toDate(state.time));
  const lastData = Math.min(y, 2025);
  const traffic = (worldDemandIndex(lastData) / Math.max(1e-6, worldDemandIndex(Math.min(x.fy + 0.5, 2025)))) * 1.03 ** Math.max(0, y - Math.max(x.fy + 0.5, 2025));
  const prices = priceLevelAt(state.time) / priceLevelAt(fyTime);
  return x.revenueEur * 1e9 * traffic * prices * remainingShare(state, world, x);
}

/** The company's margin now: its usual margin, plus how its network fares in the game, minus a weak economy. */
export function marginNow(state: GameState, world: EngineWorld, x: ListedAirline): number {
  const members = membersNow(state, world, x);
  if (!members.length) return -0.3;
  const health = members.reduce((n, r) => n + (state.ai.airlines[r.id]?.health ?? 0), 0) / members.length;
  const hub = world.airportById.get(members[0]!.hubs[0] ?? '');
  const economy = hub ? conditionsOf(state, world).demand(hub, hub, 'business') : 1;
  return clamp(x.margin + health + 0.8 * (economy - 1), -0.4, 0.35);
}

/** Enterprise value from revenue and margin: earnings before depreciation and rent times a multiple rising with margin. */
const enterprise = (revenue: number, margin: number) => revenue * Math.max(0, margin + 0.08) * 4 * Math.max(0.5, 1 + 3 * margin);

/** What the company's shares are worth in all (euros), before the market's mood: enterprise value minus its debt (the
 * debt implied by its real market value in its fiscal year). */
export function companyValue(state: GameState, world: EngineWorld, x: ListedAirline): number {
  const rev = revenueNow(state, world, x);
  const debtShare = (enterprise(x.revenueEur * 1e9, x.margin) - x.marketCapEur * 1e9) / (x.revenueEur * 1e9);
  return Math.max(0.05 * rev, enterprise(rev, marginNow(state, world, x)) - debtShare * rev);
}

/** Profit a month (euros) after interest and taxes, roughly. */
export const monthlyProfit = (state: GameState, world: EngineWorld, x: ListedAirline) => (revenueNow(state, world, x) / 12) * marginNow(state, world, x) * 0.7;

const shareCount = (x: ListedAirline) => x.sharesM * 1e6;

/** The company's market state (price per share in euros), created when first needed. */
export function listedState(state: GameState, world: EngineWorld, x: ListedAirline): ListedState {
  const s = (state.stocks ??= { mood: 1, history: [] });
  const all = (s.listed ??= {});
  return (all[x.id] ??= { price: (companyValue(state, world, x) / shareCount(x)) * s.mood, history: [] });
}

/** The listed companies now. */
export const listedNow = (state: GameState, world: EngineWorld): ListedAirline[] => LISTED_AIRLINES.filter((x) => isListed(state, world, x));

// ─── Rules for the player ───────────────────────────────────────────────────────

/** Most of the company the player's airline may own: no limit inside its country or single aviation market. */
export function ownershipCap(state: GameState, world: EngineWorld, airline: Airline, x: ListedAirline): number {
  const hub = world.airportById.get(airline.hubId);
  if (!hub || hub.country === x.country) return 1;
  const d = day(state.time);
  if (inSingleMarket(hub.country, d) && inSingleMarket(x.country, d)) return 1;
  return foreignCap(x.country, yearOf(state.time));
}

/** The company owns the player's airline (Lufthansa for Austrian since 2009): no buying one's own parent. */
const ownGroup = (airline: Airline, x: ListedAirline) => x.members.some((m) => m.id === airline.realId || airline.absorbed?.includes(m.id));

/** Shares not held by governments, founders, other airlines or the player: what trades on the market. */
export function freeFloat(state: GameState, x: ListedAirline, airline?: Airline): number {
  const blocks = blockHolders(x, state.time).reduce((n, h) => n + h.share, 0);
  return Math.max(0, 1 - blocks - (airline?.holdings?.[x.id]?.share ?? 0));
}

export const controls = (airline: Airline, listedId: string) => (airline.holdings?.[listedId]?.share ?? 0) > 0.5;

function holding(state: GameState, airline: Airline, listedId: string): Holding {
  const all = (airline.holdings ??= {});
  return (all[listedId] ??= { share: 0, cost: 0, since: state.time, disclosed: 0 });
}

/** Announces thresholds crossed (up or down): a message to the player and news for the world. */
function disclose(state: GameState, airline: Airline, x: ListedAirline, h: Holding): void {
  const level = [...DISCLOSURE].reverse().find((t) => h.share + 1e-9 >= t) ?? 0;
  if (level === h.disclosed) return;
  h.disclosed = level;
  postMessage(state, { airlineId: airline.id, kind: 'stakeDisclosed', level: 'info', params: { company: x.name, share: Math.round(h.share * 1000) / 10 } });
  postMessage(state, { airlineId: null, kind: 'stakeNews', level: 'normal', params: { airline: airline.name, company: x.name, share: Math.round(level * 100) } });
}

/**
 * Buys (share > 0) or sells (share < 0) a share of a company on the market with the airline's money. Buying pushes the
 * price up, selling down; at most a few per cent a week; crossing 30 % needs a takeover offer.
 */
export function tradeStake(state: GameState, world: EngineWorld, airlineId: string, listedId: string, share: number): InvestError | null {
  const airline = state.airlines[airlineId];
  const x = listedById.get(listedId);
  if (!airline || !x || !isListed(state, world, x)) return 'notListed';
  if (ownGroup(airline, x)) return 'ownGroup';
  if (!Number.isFinite(share) || share === 0 || Math.abs(share) > 1) return 'shareInvalid';
  if (airline.takeover?.listedId === listedId) return 'bidRunning';
  const h = holding(state, airline, listedId);
  const ls = listedState(state, world, x);
  const capEur = ls.price * shareCount(x);
  const rate = eurToBook(state, airline.currency);
  if (share > 0) {
    const week = startOfDay(state.time) - (toDate(state.time).getUTCDay() + 6) % 7 * DAY;
    const thisWeek = h.week && h.week[0] === week ? h.week[1] : 0;
    if (thisWeek + share > MAX_WEEKLY_BUY + 1e-9) return 'weeklyLimit';
    if (share > freeFloat(state, x, airline) + 1e-9) return 'notEnoughShares';
    if (h.share + share > ownershipCap(state, world, airline, x) + 1e-9) return 'ownershipCap';
    if (h.share + share > MANDATORY_BID + 1e-9) return 'mandatoryBid';
    const avg = ls.price * (1 + PRICE_IMPACT * share);
    const cost = Math.round(share * shareCount(x) * avg * rate);
    if (airline.cash.amount < cost) return 'insufficientCash';
    book(state, airline.id, 'investment', money(-cost, airline.currency), listedId);
    h.share += share;
    h.cost += cost;
    h.week = [week, thisWeek + share];
    h.highestPaid = [Math.max(avg, h.highestPaid?.[0] ?? 0), state.time];
    ls.price *= 1 + 2 * PRICE_IMPACT * share;
  } else {
    const sell = -share;
    if (sell > h.share + 1e-9) return 'notEnoughShares';
    const proceeds = Math.round(sell * capEur * (1 - PRICE_IMPACT * sell) * rate);
    book(state, airline.id, 'investment', money(proceeds, airline.currency), listedId);
    // The gain or loss against what the shares cost goes to the result.
    const costShare = h.share > 0 ? (h.cost * sell) / h.share : 0;
    bookPnl(state, airline.id, 'investments', costShare - proceeds);
    h.cost -= costShare;
    h.share = Math.max(0, h.share - sell);
    ls.price *= 1 - 2 * PRICE_IMPACT * sell;
  }
  disclose(state, airline, x, h);
  if (h.share <= 1e-9 && !h.merged?.length) delete airline.holdings![listedId];
  return null;
}

/** The lowest price a takeover offer may have: the highest price paid in the last 6 months and the 3-month average. */
export function minimumOfferPrice(state: GameState, world: EngineWorld, airline: Airline, x: ListedAirline): number {
  const ls = listedState(state, world, x);
  const recent = ls.history.filter(([t]) => t >= state.time - 91 * DAY).map(([, p]) => p);
  const average = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : ls.price;
  const paid = airline.holdings?.[x.id]?.highestPaid;
  return Math.max(average, paid && paid[1] >= state.time - 182 * DAY ? paid[0] : 0);
}

/** The cash needed to pay for every share that could be tendered (book currency). */
export function offerFunds(state: GameState, x: ListedAirline, airline: Airline, price: number): number {
  const state0 = blockHolders(x, state.time).filter((h) => h.kind === 'state').reduce((n, h) => n + h.share, 0);
  const open = Math.max(0, 1 - state0 - (airline.holdings?.[x.id]?.share ?? 0));
  return Math.round(open * shareCount(x) * price * eurToBook(state, airline.currency));
}

/** Makes a takeover offer for all shares at a price per share (euros), going through with at least `minAcceptance`. */
export function offerTakeover(state: GameState, world: EngineWorld, airlineId: string, listedId: string, price: number, minAcceptance: number): InvestError | null {
  const airline = state.airlines[airlineId];
  const x = listedById.get(listedId);
  if (!airline || !x || !isListed(state, world, x)) return 'notListed';
  if (ownGroup(airline, x)) return 'ownGroup';
  if (airline.takeover) return 'bidRunning';
  if (stateBlocks(x, state.time)) return 'stateBlocks';
  if (!(minAcceptance >= 0.5 && minAcceptance <= 0.9)) return 'shareInvalid';
  if (ownershipCap(state, world, airline, x) < minAcceptance) return 'ownershipCap';
  if (!Number.isFinite(price) || price < minimumOfferPrice(state, world, airline, x) * 0.999) return 'offerTooLow';
  if (airline.cash.amount < offerFunds(state, x, airline, price)) return 'insufficientCash';
  airline.takeover = { listedId, price, minAcceptance, stage: 'offer', until: startOfDay(state.time) + OFFER_WEEKS * MINUTES_PER_WEEK };
  // The market prices the offer in.
  const ls = listedState(state, world, x);
  ls.price = Math.max(ls.price, price * 0.97);
  postMessage(state, { airlineId: airline.id, kind: 'takeoverOffered', level: 'info', params: { company: x.name, weeks: OFFER_WEEKS } });
  postMessage(state, { airlineId: null, kind: 'stakeNews', level: 'normal', params: { airline: airline.name, company: x.name, share: -1 } });
  return null;
}

/** Share of all shares tendered at an offer: the free float the more the higher the premium over the value investors
 * see, investors' and airlines' blocks for a good premium, founders for a high one; governments keep theirs. */
export function acceptance(state: GameState, world: EngineWorld, x: ListedAirline, airline: Airline | null, price: number): number {
  const fair = companyValue(state, world, x) / shareCount(x);
  const premium = price / Math.max(1e-9, fair) - 1;
  let total = 0;
  for (const h of blockHolders(x, state.time)) {
    if (h.kind === 'investor' && premium >= 0.25) total += h.share;
    if (h.kind === 'airline' && premium >= 0.35) total += h.share;
    if (h.kind === 'founder' && premium >= 0.4) total += h.share;
  }
  return total + freeFloat(state, x, airline ?? undefined) * clamp(0.15 + 1.6 * premium, 0, 0.95);
}

/** Routes the player's airline and the company's airlines both fly (airport pairs "A|B"). */
export function overlapping(state: GameState, world: EngineWorld, airline: Airline, x: ListedAirline): string[] {
  const members = new Set(membersNow(state, world, x).map((r) => r.id));
  const out = new Set<string>();
  for (const r of Object.values(state.routes)) {
    if (r.airlineId !== airline.id) continue;
    for (const c of world.realAirlines?.on(r.originId, r.destinationId) ?? []) {
      if (!members.has(c.airline.id) || state.ai.routes[aiRouteKey(c.airline.id, r.originId, r.destinationId)]?.closed) continue;
      out.add(r.originId < r.destinationId ? `${r.originId}|${r.destinationId}` : `${r.destinationId}|${r.originId}`);
    }
  }
  return [...out];
}

/** The competition authority forbids a takeover that would take over many of the player's routes' competition. */
function prohibited(state: GameState, airline: Airline, overlaps: number, members: RealAirline[], world: EngineWorld): boolean {
  const mine = Object.values(state.routes).filter((r) => r.airlineId === airline.id).length;
  const theirs = members.reduce((n, r) => n + (world.realAirlines?.routesOf(r.id).length ?? 0), 0);
  return overlaps >= 5 && overlaps >= 0.4 * Math.min(mine, theirs);
}

function stepTakeover(state: GameState, world: EngineWorld, airline: Airline): void {
  const bid = airline.takeover;
  if (!bid || state.time < bid.until) return;
  const x = listedById.get(bid.listedId)!;
  if (!isListed(state, world, x)) {
    delete airline.takeover;
    return;
  }
  const h = holding(state, airline, x.id);
  if (bid.stage === 'offer') {
    const total = h.share + acceptance(state, world, x, airline, bid.price);
    const cap = ownershipCap(state, world, airline, x);
    if (total < bid.minAcceptance) {
      postMessage(state, { airlineId: airline.id, kind: 'offerFailed', level: 'caution', params: { company: x.name, share: Math.round(total * 100), needed: Math.round(bid.minAcceptance * 100) } });
      delete airline.takeover;
      if (h.share <= 0) delete airline.holdings![x.id];
      return;
    }
    bid.accepted = Math.min(cap, total);
    bid.overlaps = overlapping(state, world, airline, x);
    bid.phase2 = bid.overlaps.length > 0;
    bid.stage = 'review';
    bid.until = startOfDay(state.time) + (REVIEW_PHASE1_WEEKS + (bid.phase2 ? REVIEW_PHASE2_WEEKS : 0)) * MINUTES_PER_WEEK;
    if (bid.phase2) postMessage(state, { airlineId: airline.id, kind: 'reviewPhase2', level: 'info', params: { company: x.name, routes: bid.overlaps.length } });
    return;
  }
  // The competition authority's decision.
  const members = membersNow(state, world, x);
  delete airline.takeover;
  if (prohibited(state, airline, bid.overlaps?.length ?? 0, members, world)) {
    postMessage(state, { airlineId: airline.id, kind: 'takeoverProhibited', level: 'warning', params: { company: x.name, routes: bid.overlaps?.length ?? 0 } });
    postMessage(state, { airlineId: null, kind: 'stakeNews', level: 'normal', params: { airline: airline.name, company: x.name, share: -2 } });
    return;
  }
  const bought = Math.max(0, (bid.accepted ?? 0) - h.share);
  const cost = Math.round(bought * shareCount(x) * bid.price * eurToBook(state, airline.currency));
  book(state, airline.id, 'investment', money(-cost, airline.currency), x.id);
  h.share += bought;
  h.cost += cost;
  // Remedies: the bought airlines give up the routes both fly (their slots go to competitors).
  for (const pair of bid.overlaps ?? []) {
    const [a, b] = pair.split('|') as [string, string];
    for (const m of members) {
      const key = aiRouteKey(m.id, a, b);
      const r = (state.ai.routes[key] ??= { weeklyAB: 0, weeklyBA: 0, fare: 1, badReviews: 0, since: state.time });
      r.closed = true;
    }
  }
  disclose(state, airline, x, h);
  postMessage(state, { airlineId: airline.id, kind: 'takeoverDone', level: 'info', params: { company: x.name, share: Math.round(h.share * 100), routes: bid.overlaps?.length ?? 0 } });
  postMessage(state, { airlineId: null, kind: 'stakeNews', level: 'normal', params: { airline: airline.name, company: x.name, share: -3 } });
  refreshSubsidiaries(state, world, airline);
}

/** Airlines of companies the player controls are partners: they leave the player's routes alone and feed passengers. */
export function refreshSubsidiaries(state: GameState, world: EngineWorld, airline: Airline): void {
  const subs = subsidiaryIds(state, world, airline);
  const base = (airline.partners ?? []).filter((p) => !airline.subsidiaryPartners?.includes(p));
  airline.subsidiaryPartners = subs;
  airline.partners = [...new Set([...base, ...subs])];
}

/** Member airlines (not merged) of companies the player controls. */
export function subsidiaryIds(state: GameState, world: EngineWorld, airline: Airline): string[] {
  const out: string[] = [];
  for (const [id, h] of Object.entries(airline.holdings ?? {})) {
    if (h.share <= 0.5) continue;
    const x = listedById.get(id);
    if (!x) continue;
    for (const r of membersNow(state, world, x)) if (!h.merged?.includes(r.id) && state.ai.airlines[r.id]?.status !== 'player') out.push(r.id);
  }
  return out;
}

// ─── Merging ────────────────────────────────────────────────────────────────────

/**
 * Merges one airline of a controlled company into the player's airline: its aircraft (leased, as airlines finance most
 * of their fleet), its routes from its hub (a base of the player's airline unless it is the player's hub), its crews,
 * slots and gates. Needs 75 % of the votes; the first merger pays out the other shareholders at the share price.
 */
export function mergeAirline(state: GameState, world: EngineWorld, airlineId: string, listedId: string, memberId: string): InvestError | null {
  const airline = state.airlines[airlineId];
  const x = listedById.get(listedId);
  const h = airline?.holdings?.[listedId];
  if (!airline || !x || !h || h.share <= 0.5) return 'noControl';
  if (h.share < MERGE_MIN_STAKE - 1e-9) return 'needMoreShares';
  const real = membersNow(state, world, x).find((r) => r.id === memberId);
  if (!real || h.merged?.includes(memberId) || state.ai.airlines[memberId]?.status === 'player') return 'alreadyMerged';
  const hub = world.airportById.get(real.hubs[0] ?? '');
  if (!hub) return 'cannotMerge';
  const rate = eurToBook(state, airline.currency);
  // The other shareholders are paid out at the share price (squeeze-out) the first time.
  const ls = listedState(state, world, x);
  const rest = 1 - h.share;
  const payout = Math.round(rest * shareCount(x) * ls.price * rate);
  const integration = Math.round(INTEGRATION_COST * revenueNow(state, world, x) * (memberWeight(real) / Math.max(1, membersNow(state, world, x).reduce((n, r) => n + memberWeight(r), 0))) * rate);
  if (airline.cash.amount < payout + integration) return 'insufficientCash';
  if (hub.id !== airline.hubId && !(airline.bases ?? []).some((b) => b.airportId === hub.id)) {
    const err = openBase(state, world, airline.id, hub.id);
    if (err) return 'cannotMerge';
  }
  if (rest > 1e-9) {
    book(state, airline.id, 'investment', money(-payout, airline.currency), x.id);
    h.cost += payout;
    h.share = 1;
    ls.ownedBy = airline.id;
    ls.ownedAt = state.time;
    postMessage(state, { airlineId: null, kind: 'delisted', level: 'normal', params: { company: x.name } });
  }
  book(state, airline.id, 'investment', money(-integration, airline.currency), memberId);
  bookPnl(state, airline.id, 'investments', integration);

  // The aircraft: the register's where known, else the fleet table's.
  const year = yearOf(state.time);
  const added = new Set<string>();
  const regs = real.registered.length && !real.era ? real.registered.map(([reg, type, built]) => ({ reg, type, built })) : real.fleet.flatMap((f) => Array.from({ length: f.inService }, () => ({ reg: null as string | null, type: f.type, built: null as number | null })));
  regs.forEach((f, i) => {
    let type: AircraftType;
    try {
      type = getAircraftType(f.type);
    } catch {
      return;
    }
    if (isFreighter(type) || type.eis > year) return;
    const seats = real.fleet.find((l) => l.type === f.type)?.seats ?? type.seats.typical;
    const cabin = airlineCabin(type, real.model, type.category === 'widebody' ? 8000 : 1000, seats);
    const builtYear = f.built ?? Math.max(type.eis, year - 1 - (i % 15));
    const rent = typicalRentUsd(type, Math.max(0, year - builtYear), year);
    const id = nextId(state, 'AC');
    const a: Aircraft = {
      id,
      typeId: f.type,
      airlineId: airline.id,
      registration: f.reg ?? newRegistration(state, real.country ?? hub.country),
      builtYear,
      seats: totalSeats(cabin),
      cabin,
      status: 'active',
      deliveryAt: state.time - ESTABLISHED_DAYS * DAY,
      locationId: hub.id,
      paint: 0,
      lease: {
        lessor: 'Lessors (taken over)',
        monthlyRent: money(Math.round(rent), 'USD'),
        deposit: money(0, 'USD'),
        startAt: state.time,
        endAt: startOfDay(state.time) + Math.round((2 + (i % 9)) * 365.25) * DAY,
      },
    };
    if (hub.id !== airline.hubId) a.baseId = hub.id;
    state.aircraft[id] = a;
    ensureMaint(state, a);
    added.add(id);
  });
  state.ai.airlines[memberId] = { status: 'player', health: 0, since: state.time };
  (h.merged ??= []).push(memberId);
  const result = added.size ? addNetwork(state, world, airline.id, real, hub, added) : { routes: 0 };
  if (state.slots) grantHistoricSlots(state, world, airline.id);
  grantCrewForNeeds(state, world, airline.id);
  ensureGates(state, world, airline.id);
  refreshSubsidiaries(state, world, airline);
  postMessage(state, { airlineId: airline.id, kind: 'airlineMerged', level: 'info', params: { airline: real.name, aircraft: added.size, routes: result.routes } });
  return null;
}

// ─── Every day ──────────────────────────────────────────────────────────────────

function updatePrices(state: GameState, world: EngineWorld): void {
  const mood = state.stocks?.mood ?? 1;
  for (const x of listedNow(state, world)) {
    const ls = listedState(state, world, x);
    const target = (companyValue(state, world, x) / shareCount(x)) * mood;
    // An offer under way holds the price near it.
    const bid = Object.values(state.airlines).find((a) => a.takeover?.listedId === x.id)?.takeover;
    const floor = bid ? bid.price * 0.97 : 0;
    ls.price = Math.max(floor, Math.exp(Math.log(ls.price) + 0.25 * (Math.log(Math.max(1e-6, target)) - Math.log(ls.price)) + 0.04 * gauss(`lx|${x.id}|${state.time}`)));
    ls.history.push([state.time, Math.round(ls.price * 10_000) / 10_000]);
    if (ls.history.length > 104) ls.history.splice(0, ls.history.length - 104);
  }
}

/** Dividends from stakes, and the results of subsidiaries passed on to the owner (a profit transfer agreement). */
function monthlyIncome(state: GameState, world: EngineWorld, airline: Airline): void {
  let total = 0;
  for (const [id, h] of Object.entries(airline.holdings ?? {})) {
    const x = listedById.get(id);
    if (!x || h.share <= 0 || remainingShare(state, world, x) <= 0) continue;
    const profit = monthlyProfit(state, world, x);
    total += h.share > 0.5 ? h.share * profit : h.share * Math.max(0, profit) * PAYOUT;
  }
  if (!total) return;
  const amount = Math.round(total * eurToBook(state, airline.currency));
  book(state, airline.id, 'investment', money(amount, airline.currency));
  bookPnl(state, airline.id, 'investments', -amount);
}

/** Companies leaving the stock exchange on their real date (taken over in reality): stakes are paid out at the price. */
function delistings(state: GameState, world: EngineWorld, airline: Airline): void {
  for (const [id, h] of Object.entries(airline.holdings ?? {})) {
    const x = listedById.get(id);
    if (!x || isListed(state, world, x) || h.share > 0.5 || h.merged?.length) continue;
    const ls = state.stocks?.listed?.[id];
    const value = Math.round(h.share * shareCount(x) * (ls?.price ?? 0) * 1.25 * eurToBook(state, airline.currency));
    book(state, airline.id, 'investment', money(value, airline.currency), id);
    bookPnl(state, airline.id, 'investments', h.cost - value);
    delete airline.holdings![id];
    postMessage(state, { airlineId: airline.id, kind: 'stakeTendered', level: 'info', params: { company: x.name } });
  }
}

/** Now and then a strong group buys a weak airline in its market (Brussels, Swiss, Austrian, ITA by Lufthansa …). */
function aiTakeovers(state: GameState, world: EngineWorld): void {
  if (hash(`aitk|${state.seed}|${state.time}`) >= AI_TAKEOVERS_PER_YEAR / 12) return;
  const listed = listedNow(state, world);
  const busy = new Set(Object.values(state.airlines).flatMap((a) => [a.takeover?.listedId, ...Object.entries(a.holdings ?? {}).filter(([, h]) => h.share > 0.5).map(([k]) => k)]));
  const d = day(state.time);
  const sameMarket = (a: ListedAirline, b: ListedAirline) => a.country === b.country || (inSingleMarket(a.country, d) && inSingleMarket(b.country, d));
  let best: { target: ListedAirline; buyer: ListedAirline; score: number } | null = null;
  for (const target of listed) {
    if (busy.has(target.id)) continue;
    if (stateBlocks(target, state.time)) continue;
    const m = marginNow(state, world, target);
    if (m > -0.02) continue;
    const rev = revenueNow(state, world, target);
    for (const buyer of listed) {
      if (buyer.id === target.id || !sameMarket(buyer, target)) continue;
      if (marginNow(state, world, buyer) < 0.04 || revenueNow(state, world, buyer) < 2 * rev) continue;
      const score = -m;
      if (!best || score > best.score) best = { target, buyer, score };
    }
  }
  if (!best) return;
  const ls = listedState(state, world, best.target);
  const price = ls.price * 1.3;
  // Stakes of the player's airline are tendered at the offer price.
  for (const airline of Object.values(state.airlines)) {
    const h = airline.holdings?.[best.target.id];
    if (!h || h.share > 0.5) continue;
    const value = Math.round(h.share * shareCount(best.target) * price * eurToBook(state, airline.currency));
    book(state, airline.id, 'investment', money(value, airline.currency), best.target.id);
    bookPnl(state, airline.id, 'investments', h.cost - value);
    delete airline.holdings![best.target.id];
    postMessage(state, { airlineId: airline.id, kind: 'stakeTendered', level: 'info', params: { company: best.target.name } });
  }
  ls.ownedBy = best.buyer.id;
  ls.ownedAt = state.time;
  // Rescued: the bought airlines' troubles are over for now.
  for (const r of membersNow(state, world, best.target)) {
    const s = state.ai.airlines[r.id];
    if (s && s.status === 'active') s.health = Math.max(s.health, 0);
  }
  postMessage(state, { airlineId: null, kind: 'aiTakeover', level: 'normal', params: { buyer: best.buyer.name, company: best.target.name } });
}

/** A rival group bids for the player's listed airline when its shares are cheap. */
function hostileBids(state: GameState, world: EngineWorld, airline: Airline, fundamentalPerShare: (a: Airline) => number): void {
  const e = airline.equity;
  if (!e?.listed || e.bid || holder(e, 'group') || holder(e, 'state')) return;
  const playerShare = (holder(e, 'player')?.shares ?? 0) / e.shares;
  if (playerShare > 0.5) return;
  const fair = fundamentalPerShare(airline);
  if (e.price > 0.7 * fair) return;
  if (hash(`hb|${state.seed}|${airline.id}|${state.time}`) >= AI_BID_CHANCE_PER_MONTH) return;
  const hub = world.airportById.get(airline.hubId);
  if (!hub) return;
  const d = day(state.time);
  const bidder = listedNow(state, world)
    .filter((x) => x.country === hub.country || (inSingleMarket(x.country, d) && inSingleMarket(hub.country, d)))
    .filter((x) => !x.members.some((m) => m.id === airline.realId) && marginNow(state, world, x) > 0.03)
    .sort((a, b) => revenueNow(state, world, b) - revenueNow(state, world, a))[0];
  if (!bidder) return;
  e.bid = { bidder: bidder.name, price: Math.round(e.price * 1.3 * 100) / 100, until: startOfDay(state.time) + OFFER_WEEKS * MINUTES_PER_WEEK, tender: false };
  postMessage(state, { airlineId: airline.id, kind: 'bidReceived', level: 'warning', params: { bidder: bidder.name, premium: 30, weeks: OFFER_WEEKS } });
}

/** At the end of a bid for the player's airline: if the bidder gets more than half, it becomes the owner (a group). */
function settleHostileBid(state: GameState, airline: Airline, fundamentalPerShare: (a: Airline) => number): void {
  const e = airline.equity;
  const bid = e?.bid;
  if (!e || !bid || state.time < bid.until) return;
  delete e.bid;
  const premium = bid.price / Math.max(1e-9, fundamentalPerShare(airline)) - 1;
  const accept = clamp(0.15 + 1.6 * premium, 0, 0.95);
  let got = 0;
  for (const h of e.holders) {
    if (h.kind === 'public' || h.kind === 'investors' || h.kind === 'founders') got += Math.round(h.shares * (h.kind === 'public' ? accept : premium >= 0.25 ? 1 : 0));
  }
  const mine = holder(e, 'player')?.shares ?? 0;
  if (bid.tender) got += mine;
  if (got * 2 <= e.shares) {
    postMessage(state, { airlineId: airline.id, kind: 'bidFailed', level: 'info', params: { bidder: bid.bidder, share: Math.round((got / e.shares) * 100) } });
    return;
  }
  // The bidder buys the tendered shares and owns the airline: the player stays CEO under a new owner (Phase 10.4 board).
  for (const h of e.holders) {
    if (h.kind === 'public' || h.kind === 'investors' || h.kind === 'founders') h.shares -= Math.round(h.shares * (h.kind === 'public' ? accept : premium >= 0.25 ? 1 : 0));
  }
  if (bid.tender && mine > 0) {
    e.playerCash += Math.round(mine * bid.price);
    holder(e, 'player')!.shares = 0;
  }
  e.holders = e.holders.filter((h) => h.shares > 0);
  e.holders.push({ kind: 'group', name: bid.bidder, shares: got });
  if (got > e.shares * 0.9) e.listed = false;
  postMessage(state, { airlineId: airline.id, kind: 'airlineSold', level: 'warning', params: { bidder: bid.bidder, share: Math.round((got / e.shares) * 100) } });
}

/** Weekly prices and offers; monthly income, delistings, AI takeovers and bids. */
export function investmentsDailyStep(state: GameState, world: EngineWorld, fundamentalPerShare: (a: Airline) => number): void {
  const d = toDate(state.time);
  if (d.getUTCDay() === 1) updatePrices(state, world);
  const monthStart = d.getUTCDate() === 1;
  for (const airline of Object.values(state.airlines)) {
    if (airline.controller !== 'human') continue;
    stepTakeover(state, world, airline);
    settleHostileBid(state, airline, fundamentalPerShare);
    if (monthStart) {
      monthlyIncome(state, world, airline);
      delistings(state, world, airline);
      hostileBids(state, world, airline, fundamentalPerShare);
      if (airline.holdings) refreshSubsidiaries(state, world, airline);
    }
  }
  if (monthStart) aiTakeovers(state, world);
}

/** The stakes' worth at market prices (book currency), for the balance sheet. */
export function investmentsValue(state: GameState, world: EngineWorld | undefined, airline: Airline): number {
  let total = 0;
  for (const [id, h] of Object.entries(airline.holdings ?? {})) {
    const x = listedById.get(id);
    const ls = state.stocks?.listed?.[id];
    if (!x || !ls) continue;
    // A company the player bought out has no market price any more: its value as the market would see it.
    const price = ls.ownedBy === airline.id && world ? (companyValue(state, world, x) / shareCount(x)) * (state.stocks?.mood ?? 1) : ls.price;
    total += h.share * shareCount(x) * price * (world && ls.ownedBy !== airline.id ? remainingShare(state, world, x) : 1);
  }
  return Math.round(total * eurToBook(state, airline.currency));
}

/** The player answers a bid for their own airline: offer their own shares or keep them. */
export function answerBid(state: GameState, airlineId: string, tender: boolean): InvestError | null {
  const e = state.airlines[airlineId]?.equity;
  if (!e?.bid) return 'noBid';
  e.bid.tender = tender;
  return null;
}

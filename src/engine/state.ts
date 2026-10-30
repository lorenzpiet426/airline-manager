// The complete game state: everything a save game contains. Plain data only (no classes, no Maps),
// so it can be sent to the screen thread, saved as JSON and compared in tests.
import type { StartupAirline } from './startups';
import type { Currency, FxRates, Money } from './money';
import type { SimTime } from './time';
import type { Command } from './commands';
import type { Delegation, Department } from '../data/managers';
import type { DelayCause } from '../data/delays';
import type { FareBucket } from '../data/fares';
import type { Tier } from '../data/loyalty';
import type { HedgePolicy } from '../data/hedging';
import type { HolderKind } from '../data/shares';

/** Bump when the shape of GameState changes, and add a migration for older saves. */
export const SAVE_VERSION = 11;

/** Real-time with speeds, turn-based weeks, or tied to the real clock (Phase 3: 1 game minute = 1 real minute). */
export type TimeMode = 'realtime' | 'weekly' | 'realclock';
export type Realism = 'realistic' | 'hardcore';
export type Controller = 'human' | 'ai';
/** Simple = weekly frequency per route, the game sets the times; Detailed = the player's own timetable. */
export type Scheduling = 'simple' | 'detailed';

export interface GameOptions {
  timeMode: TimeMode;
  realism: Realism;
  scheduling: Scheduling;
  /** Real clock: game time = real UTC time + this many minutes (a game that was ahead of today when it switched). */
  clockOffset?: number;
  /** Historical games (Phase 5.3): the start year. The world then has the airports of each date and modelled carriers
   * instead of today's real airlines; prices, fares and exchange rates are those of the time. Unset = started in 2026. */
  startYear?: number;
}

export interface Airline {
  id: string;
  name: string;
  /** Two-character airline designator, IATA style (e.g. OS). */
  iata: string;
  /** Three-letter ICAO designator (e.g. AUA). */
  icao: string;
  controller: Controller;
  hubId: string;
  colors: { primary: string; secondary: string };
  /** The airline keeps its books in this currency. */
  currency: Currency;
  cash: Money;
  foundedAt: SimTime;
  /**
   * The airline's liveries, oldest first (Phase 4.3): the last one is current; aircraft not repainted yet keep an older
   * one (their `paint`). Old liveries no aircraft wears any more are set to null to keep saves small.
   */
  liveries?: (Livery | null)[];
  /** The real airline the player took over (Phase 6.2), e.g. "AUA": it no longer flies as an AI airline. */
  realId?: string;
  /** Real airlines of the same group (Phase 6.2): they leave this airline's routes alone and feed it passengers. */
  partners?: string[];
  /** Partners that are airlines of companies the player controls (Phase 10.5). */
  subsidiaryPartners?: string[];
  /** Alliance membership, an own alliance and codeshare agreements (Phase 11.1). */
  allianceMembership?: AllianceMembership;
  ownAlliance?: OwnAlliance;
  codeshares?: { partnerId: string; since: SimTime }[];
  /** Subsidiaries at the hub whose aircraft and routes became this airline's (Phase 6.4). */
  absorbed?: string[];
  /** Gates rented at the hub (Phase 7.3): contact gates (jet bridge) and remote stands (bus). */
  gates?: { contact: number; remote: number };
  /** Own lounges (Phase 7.3). */
  lounges?: Lounge[];
  /** Bases away from the hub (Phase 7.4). */
  bases?: Base[];
  /** Pilots and cabin crew (Phase 8.1); absent in games from before until first used. */
  crew?: AirlineCrew;
  /** Collective agreements with the crews' unions (Phase 8.2), keyed "country|group". */
  labour?: Record<string, Agreement>;
  /** Heads of department, what they may decide, their proposals and decisions (Phase 8.3). */
  mgmt?: Management;
  /** Fare buckets per cabin class (Phase 9.3; absent until first used: the default buckets). */
  fares?: Partial<Record<CabinClass, FareBucket[]>>;
  /** Frequent-flyer programme (Phase 9.4): own, a group's (partner), or none. */
  loyalty?: Loyalty;
  /** Loans and bonds (Phase 10.1). */
  loans?: Loan[];
  /** Since when the cash has been below zero (insolvency after a grace period), and when the airline went bankrupt. */
  cashNegativeSince?: SimTime;
  bankruptAt?: SimTime;
  /** Interest owed (or earned, negative) since the last monthly payment. */
  interestDue?: number;
  /** A parent's credit standing lenders count on (a group or the state; Phase 10.1), e.g. 'BBB'. */
  parentRating?: string;
  /** Fuel and currency hedging (Phase 10.2). */
  hedging?: Hedging;
  /** Stakes in other airline companies (Phase 10.5), by listed id; a takeover offer under way. */
  holdings?: Record<string, Holding>;
  takeover?: TakeoverBid;
  /** Shares, shareholders and the share price (Phase 10.3). */
  equity?: Equity;
  /** The board: owners' targets, its confidence in the CEO, reviews (Phase 10.4). */
  board?: Board;
}

export type OwnerKind = 'investors' | 'public' | 'state' | 'group';
export type TargetKind = 'margin' | 'onTime' | 'transfer' | 'sharePrice' | 'jobs' | 'destinations' | 'cash';

/** One of the owners' targets for the year: `goal` null until the board has a baseline (a new CEO's first months). */
export interface BoardTarget {
  kind: TargetKind;
  weight: number;
  goal: number | null;
  /** Starting point for relative targets (share price and market mood, staff, destinations). */
  base?: number;
  base2?: number;
}

export interface BoardReview {
  at: SimTime;
  confidence: number;
  delta: number;
  /** Per target: the value measured and its score (−1 … +1). */
  results: { kind: TargetKind; value: number; goal: number; score: number }[];
  crisis: boolean;
  outcome: 'fine' | 'concern' | 'warning' | 'dismissed';
}

export interface Board {
  owner: OwnerKind;
  /** The player became CEO. */
  since: SimTime;
  /** The year the targets are for. */
  year: number;
  targets: BoardTarget[];
  /** 0–100: the board's confidence in the CEO. */
  confidence: number;
  /** A formal warning was given (lifted when confidence recovers). */
  warnedAt?: SimTime;
  reviews: BoardReview[];
  /** Events between reviews that changed the confidence (strikes, cash below zero). */
  events: { at: SimTime; kind: 'strike' | 'cashNegative' | 'capitalInjection'; delta: number }[];
  dismissedAt?: SimTime;
}

/** A finished job as CEO (Phase 10.4). */
export interface CareerJob {
  airline: string;
  realId?: string;
  from: SimTime;
  to: SimTime;
  reason: 'dismissed' | 'bankrupt';
  /** Profit margin over the whole time in office. */
  margin: number | null;
}

/** The player's career carried from game to game: earlier jobs and personal wealth (EUR, money of `to`). */
export interface Career {
  jobs: CareerJob[];
  wealthEur: number;
}

export interface Shareholder {
  kind: HolderKind;
  name: string;
  shares: number;
}

/** The player's alliance (Phase 11.1): a global one applied for, invited to, joining or joined, or an own one. */
export interface AllianceMembership {
  alliance: 'star' | 'oneworld' | 'skyteam' | 'own';
  status: 'applied' | 'invited' | 'joining' | 'member' | 'rejected';
  /** Since when in this status; when the next step comes (review done, invitation ends, joining done). */
  at: SimTime;
  readyAt?: SimTime;
  /** Points the alliance found missing when it rejected the application. */
  reasons?: string[];
  /** A taken-over airline's real membership (not stored, worked out from history). */
  historic?: boolean;
}

/** An alliance founded by the player (Phase 11.1) with the real airlines that joined. */
export interface OwnAlliance {
  name: string;
  founded: SimTime;
  members: { id: string; since: SimTime }[];
}

/** A stake in another listed airline company (Phase 10.5), as a share of all its shares. */
export interface Holding {
  share: number;
  /** What it cost (book currency), for the gain or loss. */
  cost: number;
  since: SimTime;
  /** The highest announced threshold (EU disclosure rules) and the highest price paid (euros per share, with when). */
  disclosed: number;
  highestPaid?: [number, SimTime];
  /** Bought on the market this week (share; at most a few per cent a week). */
  week?: [SimTime, number];
  /** Member airlines merged into the player's airline (their part of the company is gone from it). */
  merged?: string[];
}

/** A takeover offer for a listed airline company (Phase 10.5): acceptance period, then the competition authority. */
export interface TakeoverBid {
  listedId: string;
  /** Euros per share. */
  price: number;
  /** The offer only goes through with at least this share of all shares (player's own included). */
  minAcceptance: number;
  stage: 'offer' | 'review';
  until: SimTime;
  /** Share the player will own once paid (after the acceptance period). */
  accepted?: number;
  /** Routes both airlines fly ("A|B"), and whether the authority opened an in-depth (phase 2) review. */
  overlaps?: string[];
  phase2?: boolean;
}

/** A takeover offer for the player's own listed airline (Phase 10.5). */
export interface HostileBid {
  bidder: string;
  /** Price per share (book currency). */
  price: number;
  until: SimTime;
  /** The player offers their own shares too. */
  tender: boolean;
}

/** A listed airline company on the game's stock market (Phase 10.5): its price (euros per share) and who bought it. */
export interface ListedState {
  price: number;
  history: [SimTime, number][];
  /** Taken over by another company (listed id) or by the player's airline (airline id), and when. */
  ownedBy?: string;
  ownedAt?: SimTime;
}

export interface Equity {
  bid?: HostileBid;
  shares: number;
  listed: boolean;
  listedAt?: SimTime;
  holders: Shareholder[];
  /** Price per share (book currency) and its weekly history (two years). */
  price: number;
  history: [SimTime, number][];
  /** Money the shareholders have put in (book currency). */
  paidIn: number;
  /** The player's own money (book currency): salary, dividends, sales of shares. */
  playerCash: number;
  dividends: { at: SimTime; perShare: number; total: number }[];
}

/** A hedge contract for one future month (Phase 10.2). */
export interface HedgeContract {
  id: string;
  kind: 'fuelSwap' | 'fuelCall' | 'fxForward';
  /** The month it covers ("YYYY-MM"), settled against that month's average price. */
  month: string;
  /** US gallons of jet fuel, or US dollars bought. */
  amount: number;
  /** Fixed price or strike: USD per gallon, or book currency per US dollar. */
  price: number;
  /** Option premium paid (book currency). */
  premium?: number;
  tradedAt: SimTime;
}

export interface Hedging {
  policy: HedgePolicy;
  contracts: HedgeContract[];
  /** Cash held by the banks as security for open losses. */
  collateral: number;
  /** Prices of the running month (sums of daily prices) and monthly averages (newest last, 13 months). */
  running: { month: string; fuel: number; fx: number; days: number };
  monthly: { month: string; fuel: number; fx: number }[];
  /** Settled months (newest last, 24): result of fuel and currency hedges and option premiums (book currency). */
  settled: { month: string; fuel: number; fx: number; premiums: number }[];
  /** Value of the open contracts at today's prices (book currency) at the last weekly valuation. */
  value: number;
}

/** A loan or bond (Phase 10.1), in the airline's book currency. */
export interface Loan {
  id: string;
  kind: 'bank' | 'aircraft' | 'bond';
  lender: string;
  /** Borrowed and still owed. */
  original: number;
  outstanding: number;
  /** Fixed interest, per cent a year. */
  rate: number;
  startAt: SimTime;
  endAt: SimTime;
  /** Repaid in equal monthly parts (bank and aircraft loans) or all at the end (bonds). */
  amortizing: boolean;
  /** The aircraft securing it (aircraft loans: it can't be sold until the loan is repaid). */
  aircraftId?: string;
}

export interface Loyalty {
  kind: 'own' | 'partner';
  name: string;
  startedAt: SimTime;
  /** Own programmes: points per euro, status thresholds (EUR spend a year), award seats per flight, expiry. */
  earn: number;
  thresholds: Record<Tier, number>;
  awardShare: number;
  expiryMonths: number;
  /** Share of passengers who are members (grows towards its target). */
  memberShare: number;
  /** Members' points not yet redeemed or expired (own programmes). */
  points: number;
  /** Share of economy seats taken by award passengers this week (used when flights open for sale). */
  awardRate: number;
  /** The last 26 weeks (newest last). */
  weeks: LoyaltyWeek[];
}

export interface LoyaltyWeek {
  start: SimTime;
  members: number;
  memberShare: number;
  tiers: Record<Tier, number>;
  earned: number;
  redeemed: number;
  expired: number;
  awards: number;
  /** Net cost of the programme that week (EUR; negative = it earned money). */
  costEur: number;
}

export interface Manager {
  id: string;
  dept: Department;
  name: string;
  /** 1–5 stars. */
  skill: number;
  experience: number;
  specialty: string | null;
  /** Yearly salary in 2025 USD at Austrian wage level (scaled by the hub country and the price level). */
  salaryUsd: number;
  hiredAt?: SimTime;
}

/** Something a manager suggests (or did): the command it runs, the manager's forecast and the true effect. */
export interface Proposal {
  id: string;
  dept: Department;
  kind: string;
  params: Record<string, string | number>;
  /** What is changed (a route, an aircraft …): one open proposal per target. */
  target: string;
  command: Command;
  /** The manager's estimate of the effect (USD a week; null where there is no money effect to estimate). */
  forecastUsd: number | null;
  /** The real effect (USD a week), shown only some weeks after the decision. */
  actualUsd: number | null;
  at: SimTime;
  expiresAt: SimTime;
  /** Advice only (the department may not act): the player does it in the screens. */
  advice: boolean;
}

export interface Decision extends Proposal {
  by: 'manager' | 'player';
  decidedAt: SimTime;
  revealAt: SimTime;
}

export interface Management {
  heads: Partial<Record<Department, Manager>>;
  delegation: Record<Department, Delegation>;
  candidates: Manager[];
  proposals: Proposal[];
  /** The last decisions (newest last). */
  decisions: Decision[];
  /** When each route's fares were last reviewed; since when aircraft have stood idle. */
  reviewed: Record<string, SimTime>;
  idleSince: Record<string, SimTime>;
}

/** A collective agreement with the pilots' or cabin crew's union in one country (Phase 8.2). */
export interface Agreement {
  country: string;
  group: 'pilots' | 'cabin';
  /** Pay level agreed, relative to the market (1 = market pay). */
  pay: number;
  /** The agreed raise for the second year, applied on `at`. */
  step?: { at: SimTime; factor: number };
  /** Runs until (peace obligation until then). */
  until: SimTime;
  /** The crews' mood: −1 angry … 0 neutral … +1 content. */
  mood: number;
  talks?: WageTalks;
  /** Strikes announced or under way. */
  strikes: Strike[];
}

export interface WageTalks {
  opened: SimTime;
  round: number;
  /** The union's demand and the least it will accept (yearly raises, 0.04 = 4 %). */
  demand: number;
  floor: number;
  /** Inflation the talks start from. */
  inflation: number;
  /** The airline's best offer so far. */
  offer?: number;
  /** Strikes and warning strikes called in these talks. */
  actions?: number;
  /** When the next offer can be made. */
  nextRound: SimTime;
  /** Mediation under way until … (peace meanwhile), then the mediator's proposal waits for an answer. */
  mediationUntil?: SimTime;
  proposal?: number;
  proposalUntil?: SimTime;
}

export interface Strike {
  from: SimTime;
  until: SimTime;
  announced: SimTime;
  /** A warning strike (a few hours, part of the day's flights). */
  warning: boolean;
}

export type CrewRole = 'captain' | 'firstOfficer' | 'cabin';

/** Crews hired or retrained who start flying on `readyAt` (paid from now). */
export interface CrewBatch {
  role: CrewRole;
  /** Licence family (null for cabin crew). */
  family: string | null;
  count: number;
  readyAt: SimTime;
  source: 'hire' | 'rating' | 'upgrade';
}

/** The crews of one station (hub or base). */
export interface StationCrew {
  pilots: Record<string, { captains: number; firstOfficers: number }>;
  cabin: number;
  /** Pay on top of the collective agreement (1–1.3; 0.8–1.3 relative to the market before Phase 8.2). */
  pay: number;
  pipeline: CrewBatch[];
}

export interface AirlineCrew {
  stations: Record<string, StationCrew>;
  /** The HR department plans hiring and training automatically. */
  auto: boolean;
  /** Hires this month per station (the job market limits them). */
  hired: Record<string, { month: string; pilots: number; cabin: number; captains: number; rated: number }>;
}

/** A base (Phase 7.4): an airport where aircraft and crews are stationed, with its own gates. */
export interface Base {
  airportId: string;
  openedAt: SimTime;
  gates?: { contact: number; remote: number };
}

export type LoungeQuality = 'standard' | 'premium' | 'flagship';

/** An own lounge: size in seats, quality, open from `readyAt` (built for `builtUsd`, prices of its year). */
export interface Lounge {
  airportId: string;
  seats: number;
  quality: LoungeQuality;
  readyAt: SimTime;
  builtUsd: number;
}

/** Colour of a livery part: one of the three livery colours, white or dark grey. */
export type PaintSlot = 'p' | 's' | 'a' | 'w' | 'k';
export type FuselageStyle = 'plain' | 'cheatline' | 'belly' | 'twoTone' | 'sweep' | 'nose' | 'stripes' | 'full';
export type TailStyle = 'solid' | 'split' | 'stripes' | 'chevron' | 'band' | 'sweep' | 'disc' | 'gradient';
export type LiveryFont = 'sans' | 'bold' | 'italic' | 'serif' | 'mono' | 'wide';

/** A freehand stroke on the side view (coordinates in the 1000 × 320 drawing frame, x and y in turn). */
export interface Stroke {
  color: string;
  width: number;
  points: number[];
}

/** An airline livery (Phase 4.3): patterns and colours for every part, a logo, titles and an optional drawing layer. */
export interface Livery {
  /** Primary, secondary and accent colour (#rrggbb). */
  colors: [string, string, string];
  /** Colour of the fuselage under the patterns. */
  base: 'w' | 'grey' | 'metal' | 'p';
  fuselage: FuselageStyle;
  fuselageColor: PaintSlot;
  tail: TailStyle;
  engines: PaintSlot;
  logo:
    | { kind: 'none' }
    | { kind: 'symbol'; symbol: string; color: PaintSlot }
    | { kind: 'letters'; text: string; font: LiveryFont; color: PaintSlot }
    /** An uploaded picture, as a small data: URL (WebP or PNG). */
    | { kind: 'image'; image: string };
  titles: { text: string; font: LiveryFont; color: PaintSlot; size: 's' | 'm' | 'l'; position: 'front' | 'middle' } | null;
  drawing: Stroke[];
}

export interface Lease {
  lessor: string;
  /** Lease rent is agreed in US dollars, as is usual in the industry. */
  monthlyRent: Money;
  deposit: Money;
  startAt: SimTime;
  endAt: SimTime;
  /** The player was told the lease ends soon. */
  warned?: boolean;
  /** Maintenance reserves paid to the lessor per flight hour (USD), for the airframe checks (Phase 4.2). */
  reserveUsdPerFh?: number;
}

export type AircraftStatus = 'delivering' | 'active';

/** When a check was last done, and the aircraft's flight hours at that time. */
export interface CheckRecord {
  at: SimTime;
  fh: number;
}

/** Maintenance of one aircraft (Phase 4.2): flight hours, last checks, the next planned heavy check, downtime. */
export interface MaintState {
  /** Flight (block) hours since new. */
  fh: number;
  a: CheckRecord;
  c: CheckRecord;
  d: CheckRecord;
  /** The next heavy check, planned by the game (`moved` once the player chose the date). */
  plan?: { kind: 'C' | 'D'; start: SimTime; bookedAt: SimTime; moved?: boolean };
  /** In a check until `until` (flights are cancelled). */
  inCheck?: { kind: 'A' | 'C' | 'D'; until: SimTime; where: 'mro' | 'hangar' };
  /** Grounded by a technical failure (flights departing in this window are cancelled). */
  aog?: { from: SimTime; until: SimTime; hours: number };
  /** Heavy-check costs written off day by day until the next check of the kind (book currency). */
  amort?: { perDay: number; until: SimTime };
  /** Leased aircraft: maintenance reserves the lessor holds for this aircraft (USD). */
  reserves?: number;
}

/** An airline's own maintenance hangar (Phase 4.2). */
export interface Hangar {
  id: string;
  airlineId: string;
  airportId: string;
  size: 'narrow' | 'wide';
  /** Building cost (book currency), written off over its life from `readyAt`. */
  price: number;
  orderedAt: SimTime;
  readyAt: SimTime;
  /** Second payment made and in use. */
  ready?: boolean;
}

/** An aircraft the airline owns (Phase 4.1): bought used or delivered from its own factory order. */
export interface Ownership {
  /** What it cost, in the book currency. */
  price: number;
  boughtAt: SimTime;
  /** Written off in a straight line down to this value (book currency) … */
  residual: number;
  /** … by this time. */
  writtenOffAt: SimTime;
}

/** A payment to the manufacturer for an aircraft on order (USD). */
export interface OrderPayment {
  due: SimTime;
  usd: number;
  kind: 'deposit' | 'predelivery' | 'balance';
  /** Paid amount in the book currency (set when paid). */
  paid?: number;
}

/** An aircraft ordered new from the factory (Phase 4.1). */
export interface FactoryOrder {
  orderedAt: SimTime;
  /** Agreed price (USD). */
  priceUsd: number;
  payments: OrderPayment[];
}

/** Cabin classes: first, business, premium economy, economy. */
export type CabinClass = 'F' | 'J' | 'W' | 'Y';
/** Seat products (see cabins.ts): what a seat is, from an economy seat to a first-class suite. */
export type SeatProduct = 'suite' | 'flat' | 'angled' | 'recliner' | 'euro' | 'premium' | 'economy';

/** One class of a cabin: its seat product, seat pitch in inches and number of seats. */
export interface CabinSection {
  cls: CabinClass;
  product: SeatProduct;
  pitch: number;
  seats: number;
}

/** A cabin layout, front to back (F, J, W, Y; each class at most once). */
export type CabinLayout = CabinSection[];

/** Fares of the premium classes relative to their market fares (economy uses the route's fareFactor). */
export type ClassFares = Record<'W' | 'J' | 'F', number>;

export interface Aircraft {
  /** The base the aircraft is stationed at (Phase 7.4); absent = the hub. */
  baseId?: string;
  id: string;
  typeId: string;
  airlineId: string;
  registration: string;
  builtYear: number;
  /** Total seats (the sum of the cabin's classes). */
  seats: number;
  cabin: CabinLayout;
  status: AircraftStatus;
  deliveryAt: SimTime;
  /** Where the aircraft is (after delivery: the airline's hub). */
  locationId: string;
  /** Leased aircraft (since Phase 4.1 an aircraft is leased, owned or on order). */
  lease?: Lease;
  /** Owned aircraft. */
  owned?: Ownership;
  /** Ordered from the factory and not delivered yet (becomes `owned` on delivery). */
  order?: FactoryOrder;
  /** In the hangar for a cabin refit until this time (flights are cancelled). */
  refitUntil?: SimTime;
  /** Refit costs written off day by day (book currency), until `until`. */
  cabinDepreciation?: { perDay: number; until: SimTime };
  /** Checks, failures and reserves (Phase 4.2; set when the aircraft enters service). */
  maint?: MaintState;
  /** The airline livery (index into `Airline.liveries`) the aircraft wears (Phase 4.3; set on delivery). */
  paint?: number;
  /** In the paint hangar until this time (flights are cancelled). */
  paintUntil?: SimTime;
  /** Repaint into the current livery during the next C- or D-check (no extra days). */
  repaintAtCheck?: boolean;
}

/** A used aircraft for sale (Phase 4.1). */
export interface SaleOffer {
  id: string;
  typeId: string;
  seller: string;
  builtYear: number;
  seats: number;
  cabin: CabinLayout;
  priceUsd: number;
  /** Days for the inspection, paperwork and repaint until it flies for you. */
  deliveryDays: number;
  expiresAt: SimTime;
}

export interface LeaseOffer {
  id: string;
  typeId: string;
  lessor: string;
  builtYear: number;
  seats: number;
  /** The layout of the aircraft's previous operator (can be changed for free before delivery). */
  cabin: CabinLayout;
  monthlyRent: Money;
  deposit: Money;
  termMonths: number;
  /** Days from signing until the aircraft arrives in your colours. */
  deliveryDays: number;
  /** The offer is withdrawn at this time. */
  expiresAt: SimTime;
}

/** A scheduled connection from the hub, flown as round trips by one aircraft. */
export interface Route {
  id: string;
  airlineId: string;
  originId: string;
  destinationId: string;
  distanceKm: number;
  aircraftId: string;
  /** Round trips per week. */
  frequency: number;
  /** Economy fare relative to the market fare (1 = market fare, 0.8 = 20 % cheaper). */
  fareFactor: number;
  /** Premium classes' fares relative to their market fares. */
  classFares: ClassFares;
  /** Outbound flight number (odd, e.g. 101); the return flight is the next number. */
  flightNumber: number;
  openedAt: SimTime;
  /** Seats each fare bucket may sell, as a share of the cabin (Phase 9.3; per class and bucket id; null = no limit). */
  bucketLimits?: Partial<Record<CabinClass, Record<string, number | null>>>;
}

/**
 * One round trip in the timetable: outbound from the hub at a local time on some weekdays, a ground time at the
 * destination, and the return flight (flight number + 1).
 */
export interface FlightPair {
  id: string;
  airlineId: string;
  routeId: string;
  aircraftId: string;
  /** Outbound flight number (odd); the return flight is the next number. */
  flightNumber: number;
  /** Outbound departure, minutes after midnight hub local time. */
  dep: number;
  /** Weekdays of the outbound departure, bit 0 = Monday … bit 6 = Sunday. */
  days: number;
  /** Minutes on the ground at the destination before the return flight. */
  groundMin: number;
  /** Fares of the outbound and the return flight relative to the route's fares (1 = route fare): airlines price each
   * flight by its time, e.g. a Friday-evening or early business flight dearer, a late or very early one cheaper. */
  fares?: [number, number];
}

/** Profit-and-loss lines in the airline's book currency (costs are positive numbers). */
export interface PnlLines {
  revenue: number;
  fuel: number;
  crew: number;
  maintenance: number;
  airport: number;
  handling: number;
  navigation: number;
  distribution: number;
  lease: number;
  /** Head office, IT, marketing, insurance. */
  overhead: number;
  /** Catering, amenities and lounges (Phase 2 cabins). */
  service: number;
  /** Write-off of investments: owned aircraft and cabin refits. */
  depreciation: number;
  /** Losses on selling or scrapping aircraft (gains are negative). */
  disposals: number;
  /** Compensation and care for passengers of cancelled flights (Phase 4.2). */
  disruption: number;
  /** Frequent-flyer programme: running costs, status perks, group fees, minus partner income (Phase 9.4). */
  loyalty?: number;
  /** Interest paid on loans and bonds minus interest earned on cash (Phase 10.1). */
  interest?: number;
  /** Losses minus gains on fuel and currency hedges, including option premiums (Phase 10.2). */
  hedging?: number;
  /** Other airlines: dividends and subsidiaries' results (income negative), integration costs (Phase 10.5). */
  investments?: number;
}

/** One flight of the day as it really goes (Phase 9.1): scheduled UTC times, delays, what happened. */
export interface OpsFlight {
  airlineId: string;
  routeId: string;
  pairId: string;
  dir: 0 | 1;
  aircraftId: string;
  flightNumber: number;
  fromId: string;
  toId: string;
  /** Scheduled departure and arrival (UTC). */
  dep: SimTime;
  arr: SimTime;
  /** Minutes late at departure and arrival (arrival can be negative: early). */
  depDelay: number;
  arrDelay: number;
  cause: DelayCause | null;
  status: 'ok' | 'diverted' | 'cancelled';
  /** Why it was cancelled (maintenance, technical, closure, crew, strike, curfew). */
  reason?: string;
  divertedTo?: string;
  /** Passengers and transfer passengers expected (last week's average per flight). */
  pax: number;
  transfer: number;
  /** How bad the weather was at departure and arrival (0 fine … 1 very bad). */
  weather?: [number, number];
  /** What the flight really carried and earned (book currency; Phase 9.2), known after the day. */
  econ?: FlightEcon;
  /** Its delay costs, care, compensation, diversion and missed connections (book currency), known after the day. */
  disruption?: number;
}

export interface FlightEcon {
  seats: number;
  pax: number;
  transfer: number;
  revenue: number;
  classes: Partial<Record<CabinClass, ClassStats>>;
  /** Costs caused by the flight (fuel, maintenance, airport, handling, navigation, distribution, service). */
  costs: Record<string, number>;
  /** Seats sold per class and fare bucket, and the booking curve (days before departure → seats; Phase 9.3). */
  buckets?: Partial<Record<CabinClass, Record<string, number>>>;
  curve?: Record<string, number>;
}

export interface OpsState {
  /** The UTC day of `flights`. */
  day: SimTime;
  flights: OpsFlight[];
  /** The day before (for the screens). */
  prev: OpsFlight[];
  /** The last seven days' flights, settled (Phase 9.2; newest last). */
  history?: OpsFlight[];
  /** When each aircraft is ready again after its last flight of the day (delays carried into the next morning). */
  ready: Record<string, SimTime>;
}

export interface RouteStats {
  flights: number;
  seats: number;
  pax: number;
  revenue: number;
  /** Costs caused by flying the route (fuel, maintenance, fees, handling, sales); no crew or lease. */
  directCosts: number;
  /** Available seat-km (seats × distance) and revenue passenger-km (Phase 1.5; missing in older periods). */
  ask?: number;
  rpk?: number;
  /** Block hours flown. */
  blockHours?: number;
  /** Passengers who changed planes at the hub (Phase 6.1; missing in older periods). */
  transfer?: number;
  /** Seats, passengers and revenue per cabin class (Phase 2 cabins; missing in older periods). */
  classes?: Partial<Record<CabinClass, ClassStats>>;
  /** Punctuality (Phase 9.1): flights operated with a known arrival, of them within 15 minutes, minutes late in all,
   * diverted flights, delay minutes by cause. */
  opsFlights?: number;
  onTime?: number;
  delayMin?: number;
  diverted?: number;
  causes?: Partial<Record<DelayCause, number>>;
}

export interface ClassStats {
  seats: number;
  pax: number;
  revenue: number;
}

/**
 * Passengers' experience summed over a week (each value × passengers): their seat compared with what the class
 * normally offers, the aircraft's age, value for money and how crowded the cabin was. 60 = as expected.
 */
export interface ExperienceSums {
  pax: number;
  product: number;
  age: number;
  value: number;
  crowd: number;
  /** Cancelled flights (Phase 4.2; missing in older weeks). */
  disruption?: number;
  /** On the ground (Phase 7.3): gate or bus, lounge (missing in older weeks). */
  ground?: number;
}

/** What passengers think of an airline (Phase 2): reputation from experience, awareness from being seen. */
export interface Reputation {
  /** Brand reputation 0–100 (60 = neutral). */
  score: number;
  /** Ratings per class 0–100 (missing until somebody flew it). */
  classes: Partial<Record<CabinClass, number>>;
  /** How well known the airline is in its markets (0–1). */
  awareness: number;
  /** The running week and the last complete week. */
  week: Partial<Record<CabinClass, ExperienceSums>>;
  lastWeek: Partial<Record<CabinClass, ExperienceSums>>;
  /** Weekly values, oldest first (two years). */
  history: { start: SimTime; score: number; awareness: number }[];
}

/** One week (Monday to Sunday, UTC) of an airline's accounts. */
export interface PnlWeek {
  start: SimTime;
  lines: PnlLines;
  routes: Record<string, RouteStats>;
}

export interface AirlineFinance {
  week: PnlWeek;
  /** Completed weeks, oldest first (the last two years). */
  history: PnlWeek[];
  /** The running calendar month (UTC). */
  month: PnlWeek;
  /** Completed months, oldest first (kept for the whole game: quarters and years are built from them). */
  months: PnlWeek[];
}

/**
 * What the AI airlines have changed compared with the real-world data (Phase 2.1b). Only changes are stored:
 * the unchanged networks stay in the read-only data files, so saves stay small.
 */
export interface AiRouteState {
  weeklyAB: number;
  weeklyBA: number;
  /** Fare relative to the market fare. */
  fare: number;
  /** The airline stopped flying this route. */
  closed?: boolean;
  /** A route the airline opened during the game (not in the real-world data). */
  added?: boolean;
  /** Monthly reviews in a row with losses (the airline gives up after a few, depending on its type). */
  badReviews: number;
  /** The airline already added flights to defend this route against the player. */
  defended?: boolean;
  since: SimTime;
}

export interface AiAirlineState {
  /** 'player': taken over by the player (Phase 6.2), flown by them instead of the AI. */
  status: 'active' | 'bankrupt' | 'player';
  /** Rolling profit margin of the airline's network (−1 … +1). */
  health: number;
  since?: SimTime;
}

/** Slots held at one coordinated airport (Phase 7.2), per hour of the week (local time, Monday 00–01 = 0). */
export interface SlotHolding {
  held: number[];
  /** Slots of each hour used, added up week by week this season (use it or lose it). */
  used: number[];
  weeks: number;
  /** Slots asked for in the next season's allocation. */
  requests: number[];
}

export interface AiState {
  /** Key: "airline|A|B" with A < B (airport ids). */
  routes: Record<string, AiRouteState>;
  /** Routes opened during the game, by airport pair "A|B": airline ids. */
  added: Record<string, string[]>;
  airlines: Record<string, AiAirlineState>;
  /** Fictional airlines founded during the game (Phase 6.4), by id ("*S1" …). */
  startups?: Record<string, StartupAirline>;
}

export const emptyAi = (): AiState => ({ routes: {}, added: {}, airlines: {} });

export type WorldEventKind =
  | 'recession' | 'fuelShock' | 'pandemic' | 'pandemicSevere'
  | 'volcano' | 'airspace' | 'atcStrike' | 'airportStrike' | 'winterStorm' | 'hurricane' | 'typhoon'
  // Real history (Phase 5.2): travellers staying away, flight bans between countries, other airport closures, milestones.
  | 'crisis' | 'flightBan' | 'disruption' | 'milestone';

/** Something happening in the world (Phase 5.1): where, from when until when, and how strong. */
export interface WorldEvent {
  id: string;
  kind: WorldEventKind;
  start: SimTime;
  end: SimTime;
  /** Economy and health events: the continents hit (all = worldwide). */
  continents?: string[];
  /** Closures: whole countries … */
  countries?: string[];
  /** … or single airports. */
  airports?: string[];
  /** Strength 0–1: the demand drop at its worst, the fuel price rise, or the share of flights cancelled. */
  depth: number;
  /** A name for the news (e.g. the volcano). */
  label?: string;
  /** Real events (Phase 5.2): the id in the history data (its name and text are translated under `hist.<id>`). */
  historic?: string;
  /** Strength over time as [time, 0–1] points instead of the standard shape. */
  profile?: [SimTime, number][];
  /** Flight bans: only flights to/from these countries. */
  pairWith?: string[];
  /** Demand effect only inside the area (no global spill-over). */
  local?: boolean;
  /** Still going on when the real data ends: its end date in this game is not shown to the player. */
  openEnded?: boolean;
}

/** The simulated world after the real data ends (Phase 5.1). */
export interface WorldState {
  /** Jet fuel spot price (USD per gallon). */
  fuel: number;
  /** Weekly fuel prices, oldest first (ten years). */
  fuelHistory: [SimTime, number][];
  /** Exchange rates against the US dollar when the simulation started (currencies drift back towards them). */
  fxBase: Record<string, number>;
  /** US dollars per euro at each month start, oldest first. */
  fxHistory: [SimTime, number][];
  /** Events running now and those of the last two years. */
  events: WorldEvent[];
}

/** Things that will happen at a fixed time. Processed in time order by advance(). */
export type ScheduledEvent =
  | { at: SimTime; seq: number; kind: 'monthStart' }
  | { at: SimTime; seq: number; kind: 'dayStart' }
  | { at: SimTime; seq: number; kind: 'delivery'; aircraftId: string }
  | { at: SimTime; seq: number; kind: 'refitDone'; aircraftId: string }
  | { at: SimTime; seq: number; kind: 'checkDone'; aircraftId: string }
  | { at: SimTime; seq: number; kind: 'failure'; aircraftId: string }
  | { at: SimTime; seq: number; kind: 'hangarReady'; hangarId: string }
  | { at: SimTime; seq: number; kind: 'repaintDone'; aircraftId: string }
  | { at: SimTime; seq: number; kind: 'loungeReady'; airlineId: string; airportId: string };

/** A line in the ops message log. The screen translates `kind` and fills in `params`. */
export interface GameMessage {
  id: number;
  at: SimTime;
  airlineId: string | null;
  kind:
    | 'founded' | 'takenOver' | 'takeoverRoutes' | 'subsidiaryJoined' | 'startupFounded' | 'slotsBought' | 'slotSeason' | 'gatesRented' | 'loungeOrdered' | 'loungeReady' | 'baseOpened' | 'crewReady' | 'crewLeft' | 'crewCancellations' | 'flightDiverted' | 'loyaltyMilestone' | 'loanTaken' | 'loanRepaid' | 'insolvencyWarning' | 'bankrupt' | 'saleLeaseback' | 'hedgeSettled' | 'marginCall' | 'ipoDone' | 'sharesIssued' | 'dividendPaid' | 'sharesBoughtBack' | 'ceoGrant' | 'ownTrade' | 'allianceApplied' | 'allianceInvited' | 'allianceRejected' | 'allianceJoining' | 'allianceJoined' | 'allianceLeft' | 'ownAllianceFounded' | 'ownAllianceJoined' | 'codeshareSigned' | 'stakeDisclosed' | 'stakeNews' | 'takeoverOffered' | 'offerFailed' | 'reviewPhase2' | 'takeoverProhibited' | 'takeoverDone' | 'airlineMerged' | 'investmentIncome' | 'aiTakeover' | 'stakeTendered' | 'delisted' | 'bidReceived' | 'bidFailed' | 'airlineSold' | 'boardReview' | 'boardWarning' | 'boardTargets' | 'ceoDismissed' | 'capitalInjection' | 'talksOpened' | 'unionAnswer' | 'agreementSigned' | 'hrOffer' | 'strikeAnnounced' | 'strikeCancellations' | 'mediationStarted' | 'mediationProposal' | 'mediationRejected' | 'managerHired' | 'managerLeft' | 'managerActions' | 'proposalsWaiting' | 'leaseSigned' | 'delivered' | 'rentPaid' | 'cashNegative' | 'routeOpened' | 'routeClosed' | 'weekReport'
    // AI airlines (2.1b): reactions on the player's routes and world news (airlineId null).
    | 'aiFare' | 'aiFrequency' | 'aiEnter' | 'aiExit' | 'aiNewRoute' | 'aiBankrupt'
    // Cabins (Phase 2).
    | 'cabinChanged' | 'refitStarted' | 'refitDone'
    // Buying and selling (Phase 4.1).
    | 'ordered' | 'orderPayment' | 'orderCancelled' | 'bought' | 'sold' | 'scrapped' | 'leaseEnding' | 'leaseEnded' | 'leaseExtended'
    | 'leaseReturned'
    // Historical games (Phase 5.3): the euro or a re-based currency, an airport closing.
    | 'currencyChanged' | 'airportMoved'
    // Real airlines starting and stopping on their real dates (Phase 6.3).
    | 'airlineFounded' | 'airlineCeased'
    // Maintenance (Phase 4.2).
    | 'checkPlanned' | 'checkMoved' | 'checkStarted' | 'checkDone' | 'aCheckGrounded' | 'failure' | 'hangarOrdered' | 'hangarReady'
    // Liveries (Phase 4.3).
    | 'liveryChanged' | 'repaintStarted' | 'repaintDone'
    // World events (Phase 5.1).
    | 'worldEvent' | 'eventAffects' | 'eventCancellations';
  level: 'normal' | 'info' | 'caution' | 'warning';
  params: Record<string, string | number>;
}

export type LedgerKind =
  | 'capital' | 'leaseDeposit' | 'leaseRent' | 'refit'
  | 'orderPayment' | 'purchase' | 'sale' | 'leaseReturnFee' | 'depositBack'
  | 'check' | 'repair' | 'compensation' | 'hangar' | 'repaint'
  // Slots bought at airports where trading is allowed (Phase 7.2): an asset, not a cost of the year.
  | 'slotPurchase'
  // Building an own lounge (Phase 7.3).
  | 'lounge'
  // Setting up a base (Phase 7.4).
  | 'base'
  // Type ratings, upgrades, cabin training, severance (Phase 8.1).
  | 'training'
  // Managers' salaries and severance (Phase 8.3).
  | 'management'
  // Frequent-flyer programme (Phase 9.4).
  | 'loyalty'
  // Loans and bonds: money borrowed, interest, repayments; sale-and-leaseback (Phase 10.1).
  | 'loan'
  | 'interest'
  | 'repayment'
  | 'saleLeaseback'
  // Hedging: option premiums, settlements, collateral (Phase 10.2).
  | 'hedge'
  // Shares of other airlines: buying, selling, dividends, takeovers, integration (Phase 10.5).
  | 'investment'
  // Alliance fees, own alliance, codeshare set-up and running costs (Phase 11.1).
  | 'alliance'
  | 'collateral'
  // Shares: money raised, dividends, buybacks (Phase 10.3).
  | 'shares'
  | 'dividend';

/** One booking in an airline's accounts, in its book currency (and the original if converted). */
export interface LedgerEntry {
  at: SimTime;
  airlineId: string;
  kind: LedgerKind;
  amount: Money;
  original?: Money;
  ref?: string;
}

/** One upcoming flight's bookings (Phase 9.3), kept from the day it opens for sale until it has flown. */
export interface BookingRecord {
  airlineId: string;
  routeId: string;
  /** "pairId:dir" and the scheduled departure (UTC). */
  key: string;
  dep: SimTime;
  /** Seats per class (F, J, W, Y) when sales opened (economy includes the curtain's spare business rows). */
  cap: number[];
  /** Seats sold per class and bucket (bucket ids as in the airline's fares). */
  sold: Partial<Record<CabinClass, Record<string, number>>>;
  /** Of them transfer passengers, per class. */
  transfer: Partial<Record<CabinClass, number>>;
  /** Economy seats kept for award passengers (frequent flyers paying with points; Phase 9.4). */
  awards?: number;
  /** Seats sold × the bucket's price factor at the time of sale, per class (revenue = this × the class's fare). */
  value: Partial<Record<CabinClass, number>>;
  /** Total sold at the booking-curve marks (days before departure → seats). */
  curve: Record<string, number>;
  /** The last day processed. */
  last: SimTime;
}

export interface GameState {
  /** The player's earlier jobs and wealth brought into this game (Phase 10.4). */
  career?: Career;
  /** The player was dismissed (or the airline went bankrupt): the game stands still from here. */
  dismissed?: SimTime;
  /** The stock market's mood (1 = normal) and its weekly history (Phase 10.3). */
  stocks?: { mood: number; history: [SimTime, number][]; listed?: Record<string, ListedState> };
  /** Upcoming flights' bookings by "pairId:dir:dep" (Phase 9.3; absent in older games until used). */
  bookings?: Record<string, BookingRecord>;
  /** Today's and yesterday's flights of the player with their delays (Phase 9.1; absent in older games until used). */
  ops?: OpsState;
  version: number;
  seed: number;
  /** Current state of the random number generator (see rng.ts). */
  rng: number;
  time: SimTime;
  startTime: SimTime;
  options: GameOptions;
  fx: FxRates;
  fxDate: string;
  airlines: Record<string, Airline>;
  aircraft: Record<string, Aircraft>;
  market: { offers: LeaseOffer[]; sales: SaleOffer[] };
  routes: Record<string, Route>;
  /** The timetable: flight pairs of all routes (Phase 2.2). */
  flights: Record<string, FlightPair>;
  finance: Record<string, AirlineFinance>;
  /** Changes made by the real airlines' AI (2.1b). */
  ai: AiState;
  /** The player's slots at coordinated airports (Phase 7.2), by airport; absent in games from before 7.2 until first used. */
  slots?: Record<string, SlotHolding>;
  /** Economy, fuel, exchange rates and events after the real data ends (Phase 5.1). */
  world: WorldState;
  /** Own maintenance hangars (Phase 4.2). */
  hangars: Record<string, Hangar>;
  /** Reputation of the player's airlines (real airlines use a value by airline type). */
  reputation: Record<string, Reputation>;
  queue: ScheduledEvent[];
  messages: GameMessage[];
  ledger: LedgerEntry[];
  /** Counter for unique ids. */
  nextId: number;
}

export const MAX_MESSAGES = 200;
export const MAX_PNL_WEEKS = 104;

export const emptyPnl = (): PnlLines => ({
  revenue: 0, fuel: 0, crew: 0, maintenance: 0, airport: 0, handling: 0, navigation: 0, distribution: 0, lease: 0, overhead: 0,
  service: 0, depreciation: 0, disposals: 0, disruption: 0, loyalty: 0, interest: 0, hedging: 0,
});

export const pnlCosts = (l: PnlLines): number =>
  l.fuel + l.crew + l.maintenance + l.airport + l.handling + l.navigation + l.distribution + l.lease + l.overhead +
  (l.service ?? 0) + (l.depreciation ?? 0) + (l.disposals ?? 0) + (l.disruption ?? 0) + (l.loyalty ?? 0) + (l.interest ?? 0) + (l.hedging ?? 0) + (l.investments ?? 0);

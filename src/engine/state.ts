// The complete game state: everything a save game contains. Plain data only (no classes, no Maps),
// so it can be sent to the screen thread, saved as JSON and compared in tests.
import type { Currency, FxRates, Money } from './money';
import type { SimTime } from './time';

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
  /** Seats, passengers and revenue per cabin class (Phase 2 cabins; missing in older periods). */
  classes?: Partial<Record<CabinClass, ClassStats>>;
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
  status: 'active' | 'bankrupt';
  /** Rolling profit margin of the airline's network (−1 … +1). */
  health: number;
  since?: SimTime;
}

export interface AiState {
  /** Key: "airline|A|B" with A < B (airport ids). */
  routes: Record<string, AiRouteState>;
  /** Routes opened during the game, by airport pair "A|B": airline ids. */
  added: Record<string, string[]>;
  airlines: Record<string, AiAirlineState>;
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
  | { at: SimTime; seq: number; kind: 'repaintDone'; aircraftId: string };

/** A line in the ops message log. The screen translates `kind` and fills in `params`. */
export interface GameMessage {
  id: number;
  at: SimTime;
  airlineId: string | null;
  kind:
    | 'founded' | 'leaseSigned' | 'delivered' | 'rentPaid' | 'cashNegative' | 'routeOpened' | 'routeClosed' | 'weekReport'
    // AI airlines (2.1b): reactions on the player's routes and world news (airlineId null).
    | 'aiFare' | 'aiFrequency' | 'aiEnter' | 'aiExit' | 'aiNewRoute' | 'aiBankrupt'
    // Cabins (Phase 2).
    | 'cabinChanged' | 'refitStarted' | 'refitDone'
    // Buying and selling (Phase 4.1).
    | 'ordered' | 'orderPayment' | 'orderCancelled' | 'bought' | 'sold' | 'scrapped' | 'leaseEnding' | 'leaseEnded' | 'leaseExtended'
    | 'leaseReturned'
    // Historical games (Phase 5.3): the euro or a re-based currency, an airport closing.
    | 'currencyChanged' | 'airportMoved'
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
  | 'check' | 'repair' | 'compensation' | 'hangar' | 'repaint';

/** One booking in an airline's accounts, in its book currency (and the original if converted). */
export interface LedgerEntry {
  at: SimTime;
  airlineId: string;
  kind: LedgerKind;
  amount: Money;
  original?: Money;
  ref?: string;
}

export interface GameState {
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
  service: 0, depreciation: 0, disposals: 0, disruption: 0,
});

export const pnlCosts = (l: PnlLines): number =>
  l.fuel + l.crew + l.maintenance + l.airport + l.handling + l.navigation + l.distribution + l.lease + l.overhead +
  (l.service ?? 0) + (l.depreciation ?? 0) + (l.disposals ?? 0) + (l.disruption ?? 0);

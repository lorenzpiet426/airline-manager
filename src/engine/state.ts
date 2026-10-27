// The complete game state: everything a save game contains. Plain data only (no classes, no Maps),
// so it can be sent to the screen thread, saved as JSON and compared in tests.
import type { Currency, FxRates, Money } from './money';
import type { SimTime } from './time';

/** Bump when the shape of GameState changes, and add a migration for older saves. */
export const SAVE_VERSION = 7;

export type TimeMode = 'realtime' | 'weekly';
export type Realism = 'realistic' | 'hardcore';
export type Controller = 'human' | 'ai';
/** Simple = weekly frequency per route, the game sets the times; Detailed = the player's own timetable. */
export type Scheduling = 'simple' | 'detailed';

export interface GameOptions {
  timeMode: TimeMode;
  realism: Realism;
  scheduling: Scheduling;
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
}

export interface Lease {
  lessor: string;
  /** Lease rent is agreed in US dollars, as is usual in the industry. */
  monthlyRent: Money;
  deposit: Money;
  startAt: SimTime;
  endAt: SimTime;
}

export type AircraftStatus = 'delivering' | 'active';

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
  lease: Lease;
  /** In the hangar for a cabin refit until this time (flights are cancelled). */
  refitUntil?: SimTime;
  /** Refit costs written off day by day (book currency), until `until`. */
  cabinDepreciation?: { perDay: number; until: SimTime };
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
  /** Write-off of investments such as cabin refits. */
  depreciation: number;
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

/** Things that will happen at a fixed time. Processed in time order by advance(). */
export type ScheduledEvent =
  | { at: SimTime; seq: number; kind: 'monthStart' }
  | { at: SimTime; seq: number; kind: 'dayStart' }
  | { at: SimTime; seq: number; kind: 'delivery'; aircraftId: string }
  | { at: SimTime; seq: number; kind: 'refitDone'; aircraftId: string };

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
    | 'cabinChanged' | 'refitStarted' | 'refitDone';
  level: 'normal' | 'info' | 'caution' | 'warning';
  params: Record<string, string | number>;
}

export type LedgerKind = 'capital' | 'leaseDeposit' | 'leaseRent' | 'refit';

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
  market: { offers: LeaseOffer[] };
  routes: Record<string, Route>;
  /** The timetable: flight pairs of all routes (Phase 2.2). */
  flights: Record<string, FlightPair>;
  finance: Record<string, AirlineFinance>;
  /** Changes made by the real airlines' AI (2.1b). */
  ai: AiState;
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
  service: 0, depreciation: 0,
});

export const pnlCosts = (l: PnlLines): number =>
  l.fuel + l.crew + l.maintenance + l.airport + l.handling + l.navigation + l.distribution + l.lease + l.overhead +
  (l.service ?? 0) + (l.depreciation ?? 0);

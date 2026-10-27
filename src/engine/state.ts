// The complete game state: everything a save game contains. Plain data only (no classes, no Maps),
// so it can be sent to the screen thread, saved as JSON and compared in tests.
import type { Currency, FxRates, Money } from './money';
import type { SimTime } from './time';

/** Bump when the shape of GameState changes, and add a migration for older saves. */
export const SAVE_VERSION = 4;

export type TimeMode = 'realtime' | 'weekly';
export type Realism = 'realistic' | 'hardcore';
export type Controller = 'human' | 'ai';

export interface GameOptions {
  timeMode: TimeMode;
  realism: Realism;
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

export interface Aircraft {
  id: string;
  typeId: string;
  airlineId: string;
  registration: string;
  builtYear: number;
  seats: number;
  status: AircraftStatus;
  deliveryAt: SimTime;
  /** Where the aircraft is (after delivery: the airline's hub). */
  locationId: string;
  lease: Lease;
}

export interface LeaseOffer {
  id: string;
  typeId: string;
  lessor: string;
  builtYear: number;
  seats: number;
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
  /** Fare relative to the market fare (1 = market fare, 0.8 = 20 % cheaper). */
  fareFactor: number;
  /** Outbound flight number (odd, e.g. 101); the return flight is the next number. */
  flightNumber: number;
  openedAt: SimTime;
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
}

export interface RouteStats {
  flights: number;
  seats: number;
  pax: number;
  revenue: number;
  /** Costs caused by flying the route (fuel, maintenance, fees, handling, sales); no crew or lease. */
  directCosts: number;
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

/** Things that will happen at a fixed time. Processed in time order by advance(). */
export type ScheduledEvent =
  | { at: SimTime; seq: number; kind: 'monthStart' }
  | { at: SimTime; seq: number; kind: 'dayStart' }
  | { at: SimTime; seq: number; kind: 'delivery'; aircraftId: string };

/** A line in the ops message log. The screen translates `kind` and fills in `params`. */
export interface GameMessage {
  id: number;
  at: SimTime;
  airlineId: string | null;
  kind: 'founded' | 'leaseSigned' | 'delivered' | 'rentPaid' | 'cashNegative' | 'routeOpened' | 'routeClosed' | 'weekReport';
  level: 'normal' | 'info' | 'caution' | 'warning';
  params: Record<string, string | number>;
}

export type LedgerKind = 'capital' | 'leaseDeposit' | 'leaseRent';

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
  finance: Record<string, AirlineFinance>;
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
});

export const pnlCosts = (l: PnlLines): number =>
  l.fuel + l.crew + l.maintenance + l.airport + l.handling + l.navigation + l.distribution + l.lease + l.overhead;

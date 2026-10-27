// The complete game state: everything a save game contains. Plain data only (no classes, no Maps),
// so it can be sent to the screen thread, saved as JSON and compared in tests.
import type { Currency, FxRates, Money } from './money';
import type { SimTime } from './time';

/** Bump when the shape of GameState changes, and add a migration for older saves. */
export const SAVE_VERSION = 1;

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

/** Things that will happen at a fixed time. Processed in time order by advance(). */
export type ScheduledEvent =
  | { at: SimTime; seq: number; kind: 'monthStart' }
  | { at: SimTime; seq: number; kind: 'delivery'; aircraftId: string };

/** A line in the ops message log. The screen translates `kind` and fills in `params`. */
export interface GameMessage {
  id: number;
  at: SimTime;
  airlineId: string | null;
  kind: 'founded' | 'leaseSigned' | 'delivered' | 'rentPaid' | 'cashNegative';
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
  queue: ScheduledEvent[];
  messages: GameMessage[];
  ledger: LedgerEntry[];
  /** Counter for unique ids. */
  nextId: number;
}

export const MAX_MESSAGES = 200;

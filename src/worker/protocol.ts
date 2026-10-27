// Shared between the screen thread and the engine worker (constants and types only).
import type { Money } from '../engine/money';
import type { GameMessage, GameState } from '../engine/state';
import type { SimTime } from '../engine/time';

/** Game minutes per real second for each speed setting (0 = paused): 1 min, 10 min, 1 h, 1 day. */
export const SPEEDS = [0, 1, 10, 60, 1440] as const;
export type Speed = (typeof SPEEDS)[number];

/** Real-clock games: what happened while the player was away (Phase 3). */
export interface AwayReport {
  from: SimTime;
  to: SimTime;
  cashBefore: Money;
  cashAfter: Money;
  revenue: number;
  result: number;
  pax: number;
  flights: number;
  /** The player's messages from that time (newest first, at most 40). */
  messages: GameMessage[];
}

export interface EngineSnapshot {
  /** Increases with every snapshot, so the screen can ignore copies that arrive late. */
  rev: number;
  state: GameState | null;
  speed: Speed;
  /** Real clock: the game is catching up the time it was closed (up to `to`). */
  catchingUp?: { from: SimTime; to: SimTime };
  /** Real clock: report after a catch-up of an hour or more. */
  away?: AwayReport;
}

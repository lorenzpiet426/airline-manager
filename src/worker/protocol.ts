// Shared between the screen thread and the engine worker (constants and types only).
import type { GameState } from '../engine/state';

/** Game minutes per real second for each speed setting (0 = paused): 1 min, 10 min, 1 h, 1 day. */
export const SPEEDS = [0, 1, 10, 60, 1440] as const;
export type Speed = (typeof SPEEDS)[number];

export interface EngineSnapshot {
  /** Increases with every snapshot, so the screen can ignore copies that arrive late. */
  rev: number;
  state: GameState | null;
  speed: Speed;
}

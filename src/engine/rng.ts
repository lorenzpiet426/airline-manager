// Seeded random numbers ("Mulberry32"). The generator's state is a single number stored in the
// save game, so the same save plus the same commands always gives the same result.

export interface RngHolder {
  rng: number;
}

/** A random number in [0, 1); advances the generator stored in `holder`. */
export function random(holder: RngHolder): number {
  let t = (holder.rng = (holder.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Whole number between min and max (both included). */
export const randomInt = (holder: RngHolder, min: number, max: number): number =>
  min + Math.floor(random(holder) * (max - min + 1));

/** Picks one item; with weights, heavier items are picked more often. */
export function pick<T>(holder: RngHolder, items: readonly T[], weights?: readonly number[]): T {
  if (!items.length) throw new Error('pick() from an empty list');
  if (!weights) return items[Math.floor(random(holder) * items.length)]!;
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = random(holder) * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i]!;
    if (roll < 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

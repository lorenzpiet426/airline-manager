import { useMemo } from 'react';
import { useWorld } from '../../data/world';
import { buildEngineWorld, type EngineWorld } from '../../engine/world';

/** The world data in the form the engine's functions need (for forecasts and checks on screen). */
export function useEngineWorld(): EngineWorld | null {
  const world = useWorld();
  return useMemo(() => (world ? buildEngineWorld(world.airports, world.countries) : null), [world]);
}

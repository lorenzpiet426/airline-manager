import { useEffect, useMemo, useState } from 'react';
import { useWorld } from '../../data/world';
import { loadRealAirlines } from '../../data/realAirlinesData';
import type { RealAirlines } from '../../engine/realAirlines';
import { buildEngineWorld, type EngineWorld } from '../../engine/world';

/** The real airlines (null while loading). */
export function useRealAirlines(): RealAirlines | null {
  const [real, setReal] = useState<RealAirlines | null>(null);
  useEffect(() => {
    let alive = true;
    void loadRealAirlines().then((r) => alive && setReal(r));
    return () => {
      alive = false;
    };
  }, []);
  return real;
}

/** The world data in the form the engine's functions need (for forecasts and checks on screen). */
export function useEngineWorld(): EngineWorld | null {
  const world = useWorld();
  const real = useRealAirlines();
  return useMemo(() => (world && real ? buildEngineWorld(world.airports, world.countries, real) : null), [world, real]);
}

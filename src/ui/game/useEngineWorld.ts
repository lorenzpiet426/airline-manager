import { useEffect, useMemo, useState } from 'react';
import { useWorld, type World } from '../../data/world';
import { loadRealAirlines } from '../../data/realAirlinesData';
import { loadFxHistory } from '../../data/fxHistory';
import { loadAirportHistory } from '../../data/airportHistory';
import type { RealAirlines } from '../../engine/realAirlines';
import { worldCache, type EngineWorld } from '../../engine/world';
import { toDate } from '../../engine/time';
import { withStartups } from '../../engine/startups';
import { useGame } from '../../game/store';

type WorldAt = (startYear: number | undefined, date: Date) => EngineWorld;

let cachePromise: Promise<WorldAt> | null = null;

/** The worlds of every date (built once; today's world for games started in 2026). */
function useWorldAtFn(): WorldAt | null {
  const world = useWorld();
  const [at, setAt] = useState<WorldAt | null>(null);
  useEffect(() => {
    if (!world) return;
    let alive = true;
    cachePromise ??= Promise.all([loadRealAirlines(), loadFxHistory(), loadAirportHistory()]).then(([realAirlines, fxHistory, airportHistory]) =>
      worldCache({ airports: world.airports, countries: world.countries, realAirlines, fxHistory, airportHistory }),
    );
    void cachePromise.then((fn) => alive && setAt(() => fn));
    return () => {
      alive = false;
    };
  }, [world]);
  return at;
}

/** The world of a start year on a date (the new-game wizard; screens of a running game use useEngineWorld). */
export function useEngineWorldAt(startYear: number | undefined, date: Date): EngineWorld | null {
  const at = useWorldAtFn();
  const day = date.toISOString().slice(0, 10);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (at ? at(startYear, new Date(`${day}T00:00:00Z`)) : null), [at, startYear, day]);
}

/** The world data in the form the engine's functions need, as the running game sees it on its current date. */
export function useEngineWorld(): EngineWorld | null {
  const game = useGame();
  const at = useWorldAtFn();
  if (!at) return null;
  return game ? withStartups(at(game.options.startYear, toDate(game.time)), game) : at(undefined, new Date());
}

/** The airlines of the running game's world: today's real airlines, or the modelled carriers of a historical game. */
export function useRealAirlines(): RealAirlines | null {
  return useEngineWorld()?.realAirlines ?? null;
}

const screenWorlds = new WeakMap<EngineWorld, World>();

/** The world data for screens (airport lists, map), with the airports of the running game's date. */
export function useGameWorld(): World | null {
  const base = useWorld();
  const engine = useEngineWorld();
  if (!base || !engine) return null;
  return screenWorld(base, engine);
}

/** The screens' view of an engine world (same airports, plus the base map). */
export function screenWorld(base: World, engine: EngineWorld): World {
  let w = screenWorlds.get(engine);
  if (!w) {
    w = { ...base, airports: [...engine.airportById.values()], airportById: engine.airportById as Map<string, (typeof base.airports)[number]> };
    screenWorlds.set(engine, w);
  }
  return w;
}

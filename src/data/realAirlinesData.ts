// Loads the real airline data files on demand (≈ 7 MB, ≈ 1.3 MB compressed) and builds the engine's view of them.
// Used by the engine worker (competition) and by the screens (route planner, airline pages).
import { buildRealAirlines, type RealAirlines } from '../engine/realAirlines';

let promise: Promise<RealAirlines> | null = null;

export function loadRealAirlines(): Promise<RealAirlines> {
  promise ??= Promise.all([
    import('./generated/airlines.json'),
    import('./generated/networks.json'),
    import('./generated/airline-details.json'),
    import('./generated/registers.json'),
    import('./generated/routes-eurostat.json'),
    import('./generated/airline-history.json'),
  ]).then(([airlines, networks, details, registers, eurostat, history]) =>
    buildRealAirlines(
      airlines.default as never,
      networks.default as never,
      details.default as never,
      registers.default as never,
      eurostat.default,
      history.default as never,
    ),
  );
  return promise;
}

// Airports that close during a historical game (Phase 5.3), e.g. Berlin Tempelhof (2008) and Schönefeld (2020): the
// player's hub, routes and hangars move to the airport that took over the flights, as the airlines did then.
import { airportOnDate } from './era';
import { postMessage } from './core';
import { distanceKm } from './geo';
import type { GameState } from './state';
import { toDate } from './time';
import type { EngineWorld } from './world';

/** Daily: moves everything at airports that no longer exist to their successor. */
export function moveFromClosedAirports(state: GameState, world: EngineWorld): void {
  const h = world.airportHistory;
  if (!h || state.options.startYear === undefined) return;
  const date = toDate(state.time);
  const moves = new Map<string, string>();
  const target = (id: string) => {
    if (world.airportById.has(id)) return null;
    if (!moves.has(id)) {
      const to = airportOnDate(h, id, date);
      if (to && to !== id && world.airportById.has(to)) moves.set(id, to);
    }
    return moves.get(id) ?? null;
  };
  for (const airline of Object.values(state.airlines)) {
    const to = target(airline.hubId);
    if (to) airline.hubId = to;
  }
  for (const r of Object.values(state.routes)) {
    const o = target(r.originId) ?? r.originId;
    const d = target(r.destinationId) ?? r.destinationId;
    if (o === r.originId && d === r.destinationId) continue;
    r.originId = o;
    r.destinationId = d;
    const A = world.airportById.get(o);
    const B = world.airportById.get(d);
    if (A && B) r.distanceKm = Math.round(distanceKm(A, B));
  }
  for (const hangar of Object.values(state.hangars)) {
    const to = target(hangar.airportId);
    if (to) hangar.airportId = to;
  }
  for (const [from, to] of moves) {
    const old = h.closed.find((c) => c.airport.id === from)?.airport;
    for (const airline of Object.values(state.airlines)) {
      if (airline.controller !== 'human') continue;
      if (airline.hubId === to || Object.values(state.routes).some((r) => r.airlineId === airline.id && (r.originId === to || r.destinationId === to))) {
        postMessage(state, { airlineId: airline.id, kind: 'airportMoved', level: 'info', params: { from: old?.iata ?? from, to: world.airportById.get(to)?.iata ?? to } });
      }
    }
  }
}

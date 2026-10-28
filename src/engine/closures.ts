// Flights cancelled by world events (Phase 5.1): volcanic ash, airspace closures, strikes and storms close airports;
// a pair whose outbound departure falls into a closure is cancelled (both legs), partial closures cancel a stable share
// of flights. These are "extraordinary circumstances" under EU 261/2004: no compensation, but passengers must be cared
// for (meals, calls, hotels) and the airline loses the revenue.
import { careEur } from '../data/maintenance';
import { postMessage } from './core';
import { bookPnl } from './fleet';
import { convert, money } from './money';
import { pairDepartureUtc, pairsOfAircraft } from './schedule';
import type { FlightPair, GameState, Route } from './state';
import { MINUTES_PER_DAY, startOfDay, type SimTime } from './time';
import { closureCancels } from './worldEvents';
import type { EngineWorld } from './world';

/** Is this pair cancelled on the day of `time` by a closure or strike? */
export function closureCancelsPair(state: GameState, world: EngineWorld, route: Route, pair: FlightPair, time: SimTime): boolean {
  if (!state.world?.events.length) return false;
  const dep = pairDepartureUtc(world, route, pair, startOfDay(time));
  return dep !== null && closureCancels(state, world, route.originId, route.destinationId, dep, pair.id) !== null;
}

/** 00:00 UTC: the player's flights of yesterday that closures cancelled → care for the passengers, one message. */
export function bookClosures(state: GameState, world: EngineWorld): void {
  if (!state.world?.events.length) return;
  const day = state.time - MINUTES_PER_DAY;
  for (const airline of Object.values(state.airlines)) {
    if (airline.controller !== 'human') continue;
    const last = state.finance[airline.id]?.history.at(-1);
    let flights = 0;
    let pax = 0;
    let eur = 0;
    const kinds = new Set<string>();
    for (const a of Object.values(state.aircraft)) {
      if (a.airlineId !== airline.id || a.status !== 'active') continue;
      for (const pair of pairsOfAircraft(state, a.id)) {
        const route = state.routes[pair.routeId];
        const dep = route ? pairDepartureUtc(world, route, pair, day) : null;
        if (!route || dep === null) continue;
        const event = closureCancels(state, world, route.originId, route.destinationId, dep, pair.id);
        if (!event) continue;
        const stats = last?.routes[route.id];
        const lf = stats && stats.seats > 0 ? stats.pax / stats.seats : 0.8;
        const people = Math.round(a.seats * Math.min(1, lf));
        const hours = (event.end - event.start) / 60;
        flights += 2;
        pax += 2 * people;
        eur += 2 * people * careEur(hours);
        kinds.add(event.kind);
      }
    }
    if (!flights) continue;
    const cost = convert(money(eur, 'EUR'), airline.currency, state.fx).amount;
    bookPnl(state, airline.id, 'disruption', cost);
    airline.cash = { amount: airline.cash.amount - Math.round(cost), currency: airline.currency };
    postMessage(state, {
      airlineId: airline.id,
      kind: 'eventCancellations',
      level: 'caution',
      params: { flights, pax, amount: Math.round(cost), currency: airline.currency, events: [...kinds].join(',') },
    });
  }
}

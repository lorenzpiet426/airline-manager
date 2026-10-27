// Daily operations and accounting: every day at 00:00 UTC each route earns its ticket revenue and
// pays its costs, crews are paid and lease costs accrue. Monday closes last week's profit-and-loss report.
import { getAircraftType } from '../data/aircraft';
import { postMessage } from './core';
import { crewCostPerDayUsd, overheadPerDayUsd, routeWeek, totalCosts, type RoutePlan } from './economics';
import type { FxRates } from './money';
import { emptyPnl, MAX_PNL_WEEKS, pnlCosts, type AirlineFinance, type GameState, type Route, type RouteStats } from './state';
import { daysInMonth, MINUTES_PER_DAY, startOfWeek, toDate, yearOf, type SimTime } from './time';
import type { EngineWorld } from './world';

/** New routes start with 60 % of their passengers and reach 100 % after 8 weeks of flying. */
export const rampUp = (firstFlight: SimTime, now: SimTime): number =>
  Math.min(1, 0.6 + (0.4 * Math.max(0, now - firstFlight)) / (56 * MINUTES_PER_DAY));

export function newFinance(now: SimTime): AirlineFinance {
  return { week: { start: startOfWeek(now), lines: emptyPnl(), routes: {} }, history: [] };
}

/** The plan the economics model needs for an existing route. */
export function planFor(state: GameState, route: Route, now = state.time): RoutePlan {
  const aircraft = state.aircraft[route.aircraftId]!;
  return {
    type: getAircraftType(aircraft.typeId),
    seats: aircraft.seats,
    frequency: route.frequency,
    fareFactor: route.fareFactor,
    ageYears: yearOf(now) - aircraft.builtYear,
    // A route planned before its aircraft arrives starts its ramp-up with the first flight.
    rampUp: rampUp(Math.max(route.openedAt, aircraft.deliveryAt), now),
  };
}

const usdTo = (fx: FxRates, currency: string) => (fx[currency] ?? 1) / (fx.USD ?? 1);

/** Called at 00:00 UTC every day: books the day that just ended, and closes the week on Mondays. */
export function dailyStep(state: GameState, world: EngineWorld): void {
  bookDay(state, world);
  if (startOfWeek(state.time) === state.time) closeWeek(state);
}

function bookDay(state: GameState, world: EngineWorld): void {
  const date = toDate(state.time - 1); // prices of the day that just ended
  const cashChange: Record<string, number> = {};

  for (const route of Object.values(state.routes)) {
    const aircraft = state.aircraft[route.aircraftId];
    const airline = state.airlines[route.airlineId];
    const from = world.airportById.get(route.originId);
    const to = world.airportById.get(route.destinationId);
    if (!aircraft || aircraft.status !== 'active' || !airline || !from || !to) continue;
    const week = routeWeek(world, from, to, planFor(state, route), date);
    const k = usdTo(state.fx, airline.currency) / 7; // one day, in book currency
    const fin = (state.finance[airline.id] ??= newFinance(state.time));
    const lines = fin.week.lines;
    lines.revenue += week.revenue * k;
    lines.fuel += week.costs.fuel * k;
    lines.maintenance += week.costs.maintenance * k;
    lines.airport += week.costs.airport * k;
    lines.handling += week.costs.handling * k;
    lines.navigation += week.costs.navigation * k;
    lines.distribution += week.costs.distribution * k;
    const stats: RouteStats = (fin.week.routes[route.id] ??= { flights: 0, seats: 0, pax: 0, revenue: 0, directCosts: 0 });
    stats.flights += week.flights / 7;
    stats.seats += week.seats / 7;
    stats.pax += week.pax / 7;
    stats.revenue += week.revenue * k;
    stats.directCosts += totalCosts(week.costs) * k;
    cashChange[airline.id] = (cashChange[airline.id] ?? 0) + (week.revenue - totalCosts(week.costs)) * k;
  }

  // Aircraft costs that don't depend on flying: crews are paid, the lease rent accrues
  // (the cash for the rent goes out on the 1st of the month, see advance.ts).
  for (const aircraft of Object.values(state.aircraft)) {
    if (aircraft.status !== 'active') continue;
    const airline = state.airlines[aircraft.airlineId];
    const hub = airline && world.airportById.get(airline.hubId);
    if (!airline || !hub) continue;
    const k = usdTo(state.fx, airline.currency);
    const fin = (state.finance[airline.id] ??= newFinance(state.time));
    const crew = crewCostPerDayUsd(world, getAircraftType(aircraft.typeId), aircraft.seats, hub.country) * k;
    fin.week.lines.crew += crew;
    fin.week.lines.lease += (aircraft.lease.monthlyRent.amount * k) / daysInMonth(state.time - 1);
    cashChange[airline.id] = (cashChange[airline.id] ?? 0) - crew;
  }

  // Overheads: running the airline itself (head office, IT, marketing, insurance), from the day it is founded.
  for (const airline of Object.values(state.airlines)) {
    const hub = world.airportById.get(airline.hubId);
    if (!hub) continue;
    const active = Object.values(state.aircraft).filter((a) => a.airlineId === airline.id && a.status === 'active').length;
    const overhead = overheadPerDayUsd(world, hub.country, active) * usdTo(state.fx, airline.currency);
    const fin = (state.finance[airline.id] ??= newFinance(state.time));
    fin.week.lines.overhead += overhead;
    cashChange[airline.id] = (cashChange[airline.id] ?? 0) - overhead;
  }

  for (const [airlineId, change] of Object.entries(cashChange)) {
    const airline = state.airlines[airlineId]!;
    const wasPositive = airline.cash.amount >= 0;
    airline.cash = { amount: airline.cash.amount + Math.round(change), currency: airline.currency };
    if (wasPositive && airline.cash.amount < 0) postMessage(state, { airlineId, kind: 'cashNegative', level: 'warning', params: {} });
  }
}

/** Monday 00:00: file last week's report and start a new one. */
function closeWeek(state: GameState): void {
  for (const [airlineId, fin] of Object.entries(state.finance)) {
    if (fin.week.start >= state.time) continue;
    const airline = state.airlines[airlineId];
    fin.history.push(fin.week);
    if (fin.history.length > MAX_PNL_WEEKS) fin.history.splice(0, fin.history.length - MAX_PNL_WEEKS);
    const profit = fin.week.lines.revenue - pnlCosts(fin.week.lines);
    if (airline && (fin.week.lines.revenue > 0 || pnlCosts(fin.week.lines) > 0)) {
      postMessage(state, {
        airlineId,
        kind: 'weekReport',
        level: profit >= 0 ? 'normal' : 'caution',
        params: { profit: Math.round(profit), revenue: Math.round(fin.week.lines.revenue), currency: airline.currency },
      });
    }
    fin.week = { start: state.time, lines: emptyPnl(), routes: {} };
  }
}

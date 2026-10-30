// Daily operations and accounting: every day at 00:00 UTC each route earns its ticket revenue and
// pays its costs, crews are paid and lease costs accrue. Monday closes last week's profit-and-loss report.
import { ensureSlots, isSeasonStart, recordSlotUse, seasonChange } from './slots';
import { ensureHubFacilities, gateRentPerDayUsd, groundContext, loungeRunPerDayUsd } from './hub';
import { baseRunPerDayUsd, stationOf } from './bases';
import { crewDailyStep, crewPayPerDayUsd, ensureCrew } from './crews';
import { ensureLabour, labourDailyStep } from './unions';
import { ensureMgmt, managersDailyStep } from './managers';
import { opsDailyStep } from './delays';
import { applyBookings, bookingsDailyStep } from './bookings';
import { loyaltyPull, loyaltyWeeklyStep } from './loyalty';
import { debtDailyStep } from './debt';
import { hedgingDailyStep } from './hedging';
import { fundamentalValue, sharesDailyStep } from './shares';
import { investmentsDailyStep } from './investments';
import { boardDailyStep } from './board';
import { routeTransfers } from './transfers';
import { bookClosures } from './closures';
import { conditionsOf, worldDailyStep } from './worldEvents';
import { currencyChangeStep } from './books';
import { moveFromClosedAirports } from './airportMoves';
import { getAircraftType } from '../data/aircraft';
import { aiDailyStep } from './ai';
import { postMessage } from './core';
import { crewCostPerDayUsd, overheadPerDayUsd, routeWeek, totalCosts, type ClassResult, type RoutePlan } from './economics';
import { pairsOfRoute, plannedFlights } from './schedule';
import { dayBit } from './timetable';
import { mergePnl, newPeriod, type PnlPeriod } from './finance';
import type { FxRates } from './money';
import { MAX_PNL_WEEKS, pnlCosts, type AirlineFinance, type CabinClass, type GameState, type OpsFlight, type Route, type RouteStats } from './state';
import { addExperience, closeReputationWeek } from './reputation';
import { dailyDepreciation, dailyFleetStep } from './fleet';
import { maintenanceDailyStep } from './maintenance';
import { daysInMonth, MINUTES_PER_DAY, startOfDay, startOfMonth, startOfWeek, toDate, utcOffsetMin, weekdayOf, type SimTime } from './time';
import type { Airport } from '../data/types';
import type { EngineWorld } from './world';

/** New routes start with 60 % of their passengers and reach 100 % after 8 weeks of flying. */
export const rampUp = (firstFlight: SimTime, now: SimTime): number =>
  Math.min(1, 0.6 + (0.4 * Math.max(0, now - firstFlight)) / (56 * MINUTES_PER_DAY));

export function newFinance(now: SimTime): AirlineFinance {
  return { week: newPeriod(startOfWeek(now)), history: [], month: newPeriod(startOfMonth(now)), months: [] };
}

/** The plan the economics model needs for an existing route: its timetable (aircraft already flying only). */
export function planFor(state: GameState, world: EngineWorld, route: Route, now = state.time, includeDelivering = false): RoutePlan | null {
  const flights = plannedFlights(state, world, route, now, includeDelivering);
  if (!flights.length) return null;
  // A route planned before its aircraft arrives starts its ramp-up with the first flight.
  const firstDelivery = Math.min(...pairsOfRoute(state, route.id).map((p) => state.aircraft[p.aircraftId]?.deliveryAt ?? Infinity));
  return {
    type: flights[0]!.type,
    seats: flights[0]!.seats,
    cabin: flights[0]!.cabin,
    frequency: route.frequency,
    fareFactor: route.fareFactor,
    classFares: route.classFares,
    ageYears: flights[0]!.ageYears,
    rampUp: rampUp(Math.max(route.openedAt, Number.isFinite(firstDelivery) ? firstDelivery : route.openedAt), now),
    flights,
  };
}

const usdTo = (fx: FxRates, currency: string) => (fx[currency] ?? 1) / (fx.USD ?? 1);

/** Copies each flight's passengers, revenue and costs (book currency) to its record of the day. */
function recordFlightEcon(ops: Map<string, OpsFlight[]>, week: ReturnType<typeof routeWeek>, k: number, day: SimTime, ends: [Airport, Airport]): void {
  week.timetable.forEach((f, i) => {
    const r = week.byFlight[i];
    if (!r || !r.flights || !f.key) return;
    // The operation that departed on this day: its UTC departure is the local time minus the airport's offset.
    const from = ends[f.dir];
    const expected = startOfDay(day) + f.dep - utcOffsetMin(from.tz, day);
    const o = (ops.get(f.key) ?? []).find((x) => Math.abs(x.dep - expected) < 6 * 60);
    if (!o) return;
    o.econ = {
      seats: r.seats,
      pax: r.pax,
      transfer: r.transferPax,
      revenue: r.revenue * k,
      classes: Object.fromEntries(Object.entries(r.classes).map(([c, x]) => [c, { seats: x.seats, pax: x.pax, revenue: x.revenue * k }])),
      costs: Object.fromEntries(Object.entries(r.costs).map(([c, x]) => [c, x * k])),
      ...(r.bookings ? { buckets: r.bookings.sold, curve: r.bookings.curve } : {}),
    };
  });
}

/** Called at 00:00 UTC every day: books the day that just ended, and closes the week on Mondays. */
export function dailyStep(state: GameState, world: EngineWorld): void {
  // Games from before slots and gates existed (Phases 7.2, 7.3): today's timetable keeps its slots and gates.
  ensureSlots(state, world);
  ensureHubFacilities(state, world);
  ensureCrew(state, world);
  ensureLabour(state, world);
  ensureMgmt(state, world);
  bookDay(state, world);
  // Historical games: the euro and re-based currencies arrive, closed airports hand over to their successors.
  currencyChangeStep(state);
  moveFromClosedAirports(state, world);
  // Payments to manufacturers, lease reminders and leases that end.
  dailyFleetStep(state, world);
  // Flight hours, checks, maintenance reserves, hangars and today's technical failures.
  maintenanceDailyStep(state, world);
  // Flights cancelled yesterday by closures and strikes (care for passengers), then today's fuel price and new events.
  bookClosures(state, world);
  worldDailyStep(state, world);
  // The real airlines review their networks (a share of them each day) and react to the player.
  aiDailyStep(state, world);
  // Crews start or leave, the HR department plans, yesterday's flights without crew are paid for (Phase 8.1).
  crewDailyStep(state, world);
  labourDailyStep(state, world);
  // Heads of department review, propose and decide (Phase 8.3).
  managersDailyStep(state, world);
  // Yesterday's flights settled (delays, diversions, missed connections), today's played through (Phase 9.1).
  opsDailyStep(state, world);
  // Interest, repayments, insolvency (Phase 10.1).
  debtDailyStep(state);
  // Fuel and currency hedges: settlement, ladder, collateral (Phase 10.2).
  hedgingDailyStep(state, world);
  // Owners, share price, CEO pay (Phase 10.3).
  sharesDailyStep(state, world);
  // Other airlines' shares, takeover offers, subsidiaries, AI takeovers (Phase 10.5).
  investmentsDailyStep(state, world, (a) => fundamentalValue(state, a) / Math.max(1, a.equity?.shares ?? 1));
  // Flights open for sale and today's bookings (Phase 9.3).
  bookingsDailyStep(state, world);
  if (startOfWeek(state.time) === state.time) {
    closeWeek(state);
    recordSlotUse(state, world);
    // Frequent-flyer programmes: members, points, award seats, costs (Phase 9.4).
    loyaltyWeeklyStep(state);
  }
  // A new IATA season: use it or lose it, and the slots asked for.
  if (isSeasonStart(state.time)) seasonChange(state, world);
  if (startOfMonth(state.time) === state.time) closeMonth(state);
  // The board: targets, confidence, quarterly reviews with last month filed, dismissal (Phase 10.4).
  boardDailyStep(state, world);
}

function bookDay(state: GameState, world: EngineWorld): void {
  const date = toDate(state.time - 1); // prices of the day that just ended
  const yesterday = conditionsOf(state, world, state.time - 1);
  const levels = yesterday.levels;
  const cashChange: Record<string, number> = {};
  // The day's figures per airline, added to the running week and month at the end.
  const days: Record<string, PnlPeriod> = {};
  const dayOf = (airlineId: string) => (days[airlineId] ??= newPeriod(state.time - MINUTES_PER_DAY));

  // The flights of the weekday that just ended, with that day's demand (Fridays are busier than Tuesdays).
  // Yesterday's flights as they went (Phase 9.1), to attach what each one carried and earned.
  // (Return legs after midnight belong to the day before's list, so both days are searched by departure time.)
  const opsByKey = new Map<string, OpsFlight[]>();
  for (const f of [...(state.ops?.prev ?? []), ...(state.ops?.flights ?? [])]) (opsByKey.get(`${f.pairId}:${f.dir}`) ?? opsByKey.set(`${f.pairId}:${f.dir}`, []).get(`${f.pairId}:${f.dir}`)!).push(f);
  const weekday = dayBit(weekdayOf(state.time - 1));
  for (const route of Object.values(state.routes)) {
    const airline = state.airlines[route.airlineId];
    const from = world.airportById.get(route.originId);
    const to = world.airportById.get(route.destinationId);
    const plan = airline && from && to ? planFor(state, world, route, state.time - 1) : null;
    if (!plan || !from || !to || !airline) continue;
    const rep = state.reputation[airline.id];
    const brand = rep ? { reputation: rep.score, awareness: rep.awareness } : undefined;
    const transfer = routeTransfers(world, state, route);
    const ground = groundContext(state, world, airline.id);
    const loyalty = loyaltyPull(state, airline);
    const week = routeWeek(world, from, to, plan, date, { ai: state.ai, days: weekday, brand, checksSeparate: true, conditions: yesterday, transfer, ...(ground ? { ground } : {}), ...(loyalty ? { loyalty } : {}) });
    // The player's flights carried what was really booked (Phase 9.3).
    if (airline.controller === 'human') applyBookings(state, world, route, week, state.time - 1);
    if (rep) addExperience(rep, week.experience);
    const k = usdTo(state.fx, airline.currency); // in book currency
    // Each flight's own result, for the flight pages (Phase 9.2).
    if (opsByKey.size) recordFlightEcon(opsByKey, week, k, state.time - 1, [from, to]);
    const lines = dayOf(airline.id).lines;
    lines.revenue += week.revenue * k;
    lines.fuel += week.costs.fuel * k;
    lines.maintenance += week.costs.maintenance * k;
    lines.airport += week.costs.airport * k;
    lines.handling += week.costs.handling * k;
    lines.navigation += week.costs.navigation * k;
    lines.distribution += week.costs.distribution * k;
    lines.service += week.costs.service * k;
    const stats: RouteStats = (dayOf(airline.id).routes[route.id] ??= { flights: 0, seats: 0, pax: 0, revenue: 0, directCosts: 0 });
    stats.flights += week.flights;
    stats.seats += week.seats;
    stats.pax += week.pax;
    stats.ask = (stats.ask ?? 0) + week.seats * route.distanceKm;
    stats.rpk = (stats.rpk ?? 0) + week.pax * route.distanceKm;
    stats.blockHours = (stats.blockHours ?? 0) + week.blockHours;
    stats.transfer = (stats.transfer ?? 0) + week.transferPax;
    stats.revenue += week.revenue * k;
    for (const [cls, c] of Object.entries(week.byClass) as [CabinClass, ClassResult][]) {
      const sc = ((stats.classes ??= {})[cls] ??= { seats: 0, pax: 0, revenue: 0 });
      sc.seats += c.seats;
      sc.pax += c.pax;
      sc.revenue += c.revenue * k;
    }
    stats.directCosts += totalCosts(week.costs) * k;
    cashChange[airline.id] = (cashChange[airline.id] ?? 0) + (week.revenue - totalCosts(week.costs)) * k;
  }

  // Owned aircraft are written off day by day (also while being delivered or refitted).
  for (const aircraft of Object.values(state.aircraft)) {
    if (!aircraft.owned || !state.airlines[aircraft.airlineId]) continue;
    dayOf(aircraft.airlineId).lines.depreciation += dailyDepreciation(aircraft.owned, state.time - 1);
  }

  // Aircraft costs that don't depend on flying: crews are paid, the lease rent accrues
  // (the cash for the rent goes out on the 1st of the month, see advance.ts).
  for (const aircraft of Object.values(state.aircraft)) {
    if (aircraft.status !== 'active') continue;
    const airline = state.airlines[aircraft.airlineId];
    // Crews are paid at the wages of the country where the aircraft is stationed (hub or base, Phase 7.4).
    const station = airline && world.airportById.get(stationOf(airline, aircraft));
    if (!airline || !station) continue;
    const k = usdTo(state.fx, airline.currency);
    const day = dayOf(airline.id);
    // Airlines with their own crews (Phase 8.1) pay their staff below; the formula is for the others.
    const crew = airline.crew ? 0 : crewCostPerDayUsd(world, getAircraftType(aircraft.typeId), aircraft.seats, station.country, aircraft.cabin) * k * levels.costs;
    day.lines.crew += crew;
    if (aircraft.lease) day.lines.lease += (aircraft.lease.monthlyRent.amount * k) / daysInMonth(state.time - 1);
    // Refits were paid in cash; the accounts write them off day by day.
    const dep = aircraft.cabinDepreciation;
    if (dep && dep.until >= state.time) day.lines.depreciation += dep.perDay;
    cashChange[airline.id] = (cashChange[airline.id] ?? 0) - crew;
  }

  // Overheads: running the airline itself (head office, IT, marketing, insurance), from the day it is founded.
  for (const airline of Object.values(state.airlines)) {
    const hub = world.airportById.get(airline.hubId);
    if (!hub) continue;
    const active = Object.values(state.aircraft).filter((a) => a.airlineId === airline.id && a.status === 'active').length;
    // Running the bases (Phase 7.4) is part of the overheads.
    const overhead = (overheadPerDayUsd(world, hub.country, active) * levels.costs + baseRunPerDayUsd(airline, state.time - 1)) * usdTo(state.fx, airline.currency);
    dayOf(airline.id).lines.overhead += overhead;
    // Pilots and cabin crew employed (Phase 8.1), incl. those still in training.
    if (airline.crew) {
      const pay = crewPayPerDayUsd(state, world, airline) * levels.costs * usdTo(state.fx, airline.currency);
      dayOf(airline.id).lines.crew += pay;
      cashChange[airline.id] = (cashChange[airline.id] ?? 0) - pay;
    }
    // Gates rented at the hub and own lounges (Phase 7.3).
    const gates = gateRentPerDayUsd(airline, state.time - 1) * usdTo(state.fx, airline.currency);
    const lounges = loungeRunPerDayUsd(airline, state.time - 1) * usdTo(state.fx, airline.currency);
    dayOf(airline.id).lines.airport += gates;
    dayOf(airline.id).lines.service += lounges;
    cashChange[airline.id] = (cashChange[airline.id] ?? 0) - overhead - gates - lounges;
  }

  for (const [airlineId, day] of Object.entries(days)) {
    const fin = (state.finance[airlineId] ??= newFinance(state.time - MINUTES_PER_DAY));
    mergePnl(fin.week, day);
    mergePnl(fin.month, day);
  }

  for (const [airlineId, change] of Object.entries(cashChange)) {
    const airline = state.airlines[airlineId]!;
    const wasPositive = airline.cash.amount >= 0;
    airline.cash = { amount: airline.cash.amount + Math.round(change), currency: airline.currency };
    if (wasPositive && airline.cash.amount < 0) postMessage(state, { airlineId, kind: 'cashNegative', level: 'warning', params: {} });
  }
}

/** 1st of the month 00:00: file last month and start a new one. */
function closeMonth(state: GameState): void {
  for (const fin of Object.values(state.finance)) {
    if (fin.month.start >= state.time) continue;
    fin.months.push(fin.month);
    fin.month = newPeriod(state.time);
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
    fin.week = newPeriod(state.time);
  }
  for (const rep of Object.values(state.reputation)) closeReputationWeek(rep, state.time - 7 * MINUTES_PER_DAY);
}

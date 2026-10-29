// Commands: the only way to change the game. The player (and later AI airlines and other players)
// send a command; the engine checks it against the rules and either applies it or explains why not.
import { defaultLivery, repaint, setLivery, type LiveryError, type RepaintError } from './livery';
import { getAircraftType } from '../data/aircraft';
import { ECB_RATES } from '../data/currencies';
import { regulatedRange } from '../data/eras';
import { currencyAt } from '../data/fxHistory';
import { priceLevelAt } from './era';
import { registrationPattern } from '../data/registrations';
import { book, nextId, postMessage, schedule } from './core';
import { checkRoute, roundTripHours, WEEKLY_AVAILABLE_HOURS } from './economics';
import { aircraftHours, autoPlanAircraft, grounded, inRefit, makeDetailed, pairsOfRoute, setRoutePairs, validateSpecs, type FlightSpec, type ScheduleError } from './schedule';
import { distanceKm } from './geo';
import { convert, money, roundNice, type FxRates, type Money } from './money';
import { newFinance } from './operations';
import { randomInt } from './rng';
import { cabinCode, DEFAULT_CLASS_FARES, REFIT_DEPRECIATION_YEARS, refitQuote, totalSeats, validateCabin, type CabinError } from './cabins';
import { newReputation } from './reputation';
import { buyAircraft, cancelOrder, disposeAircraft, extendLease, orderAircraft, returnLeased, type FleetError } from './fleet';
import type { CabinStyle } from './cabins';
import type { HangarSize } from '../data/maintenance';
import { buildHangar, moveCheck, type MaintError } from './maintenance';
import type { Livery, CabinLayout, ClassFares, Controller, GameState, Route } from './state';
import { MINUTES_PER_DAY, simTime, startOfDay, toDate, type SimTime } from './time';
import type { EngineWorld } from './world';

export type { EngineWorld } from './world';
export { aircraftHours } from './schedule';
export type { FlightSpec } from './schedule';

/** Starting capital choices for a startup, in euros (converted into the hub's currency). */
export const CAPITAL_OPTIONS_EUR = [25_000_000, 75_000_000, 200_000_000] as const;

export interface FoundAirline {
  type: 'FoundAirline';
  payload: {
    name: string;
    iata: string;
    icao: string;
    primary: string;
    secondary: string;
    hubId: string;
    capitalEur: number;
    controller: Controller;
  };
}

export interface LeaseAircraft {
  type: 'LeaseAircraft';
  airlineId: string;
  payload: { offerId: string };
}

export interface RouteSettings {
  aircraftId: string;
  /** Round trips per week. */
  frequency: number;
  /** Economy fare relative to the market fare, 0.5 … 1.5. */
  fareFactor: number;
  /** Premium classes' fares relative to their market fares, 0.5 … 1.5 (default: market fare). */
  classFares?: ClassFares;
  /** Detailed scheduling: the route's complete timetable (aircraftId/frequency are then taken from it). */
  flights?: FlightSpec[];
}

export interface OpenRoute {
  type: 'OpenRoute';
  airlineId: string;
  payload: RouteSettings & { destinationId: string };
}

export interface UpdateRoute {
  type: 'UpdateRoute';
  airlineId: string;
  payload: RouteSettings & { routeId: string };
}

export interface CloseRoute {
  type: 'CloseRoute';
  airlineId: string;
  payload: { routeId: string };
}

/** Switches the game from Simple to Detailed scheduling (one way: the timetable is kept and becomes editable). */
export interface SetScheduling {
  type: 'SetScheduling';
  airlineId: string;
  payload: { scheduling: 'detailed' };
}

/** Changes an aircraft's cabin: free before delivery, otherwise a refit in the hangar (money and days). */
export interface RefitCabin {
  type: 'RefitCabin';
  airlineId: string;
  payload: { aircraftId: string; cabin: CabinLayout };
}

/**
 * Ties the game to the real clock (one way). `now` is the real time when the player switched (commands carry their
 * time, the engine never reads the clock itself). A game behind today catches up to now; a game ahead of today keeps
 * its date and runs on at real speed.
 */
export interface SetTimeMode {
  type: 'SetTimeMode';
  airlineId: string;
  payload: { timeMode: 'realclock'; now: SimTime };
}

/** Fleet ownership (Phase 4.1). */
export interface OrderAircraft {
  type: 'OrderAircraft';
  airlineId: string;
  payload: { typeId: string; count: number; cabin: CabinStyle };
}
export interface CancelOrder {
  type: 'CancelOrder';
  airlineId: string;
  payload: { aircraftId: string };
}
export interface BuyAircraft {
  type: 'BuyAircraft';
  airlineId: string;
  payload: { offerId: string };
}
export interface SellAircraft {
  type: 'SellAircraft';
  airlineId: string;
  payload: { aircraftId: string; scrap?: boolean };
}
export interface ReturnLease {
  type: 'ReturnLease';
  airlineId: string;
  payload: { aircraftId: string };
}
export interface ExtendLease {
  type: 'ExtendLease';
  airlineId: string;
  payload: { aircraftId: string; years: number };
}

/** Liveries (Phase 4.3): a new livery for the airline, repainting an aircraft now or with its next heavy check. */
export interface SetLivery {
  type: 'SetLivery';
  airlineId: string;
  payload: { livery: Livery };
}
export interface Repaint {
  type: 'Repaint';
  airlineId: string;
  payload: { aircraftId: string; atCheck: boolean };
}

/** Maintenance (Phase 4.2): move the next heavy check, build an own hangar at the hub. */
export interface MoveCheck {
  type: 'MoveCheck';
  airlineId: string;
  payload: { aircraftId: string; start: SimTime };
}
export interface BuildHangar {
  type: 'BuildHangar';
  airlineId: string;
  payload: { size: HangarSize };
}

export type Command = SetLivery | Repaint | MoveCheck | BuildHangar | OrderAircraft | CancelOrder | BuyAircraft | SellAircraft | ReturnLease | ExtendLease | SetTimeMode | FoundAirline | LeaseAircraft | OpenRoute | UpdateRoute | CloseRoute | SetScheduling | RefitCabin;

export const FARE_FACTOR_RANGE = [0.5, 1.5] as const;

/** The fare factors allowed between two airports now: before deregulation only small deviations (Phase 5.3). */
export function fareRange(state: GameState, from: { country: string }, to: { country: string }): readonly [number, number] {
  return regulatedRange(from.country, to.country, toDate(state.time)) ?? FARE_FACTOR_RANGE;
}
export const MAX_FREQUENCY = 84;

export type CommandError =
  | 'nameLength'
  | 'iataFormat'
  | 'icaoFormat'
  | 'codeTaken'
  | 'colorFormat'
  | 'hubUnknown'
  | 'capitalInvalid'
  | 'airlineUnknown'
  | 'offerGone'
  | 'insufficientCash'
  | 'airportUnknown'
  | 'sameAirport'
  | 'routeExists'
  | 'routeUnknown'
  | 'aircraftUnknown'
  | 'frequencyInvalid'
  | 'fareInvalid'
  | 'range'
  | 'runwayOrigin'
  | 'runwayDestination'
  | 'etops'
  | 'aircraftBusy'
  | 'alreadyDetailed'
  | 'alreadyRealClock'
  | 'inRefit'
  | 'cabinUnchanged'
  | CabinError
  | FleetError
  | MaintError
  | LiveryError
  | RepaintError
  | ScheduleError;

export type CommandResult = { ok: true; id?: string } | { ok: false; error: CommandError };

const fail = (error: CommandError): CommandResult => ({ ok: false, error });

export function applyCommand(state: GameState, world: EngineWorld, command: Command): CommandResult {
  switch (command.type) {
    case 'FoundAirline':
      return foundAirline(state, world, command.payload);
    case 'LeaseAircraft':
      return leaseAircraft(state, world, command.airlineId, command.payload.offerId);
    case 'OpenRoute':
      return openRoute(state, world, command.airlineId, command.payload);
    case 'UpdateRoute':
      return updateRoute(state, world, command.airlineId, command.payload);
    case 'CloseRoute':
      return closeRoute(state, world, command.airlineId, command.payload.routeId);
    case 'SetScheduling':
      if (state.options.scheduling === 'detailed') return fail('alreadyDetailed');
      if (!state.airlines[command.airlineId]) return fail('airlineUnknown');
      makeDetailed(state);
      return { ok: true };
    case 'OrderAircraft':
    case 'BuyAircraft': {
      const airline = state.airlines[command.airlineId];
      const country = world.airportById.get(airline?.hubId ?? '')?.country ?? 'XX';
      const reg = (c: string) => newRegistration(state, c);
      return command.type === 'OrderAircraft'
        ? orderAircraft(state, command.airlineId, command.payload, reg, country)
        : buyAircraft(state, command.airlineId, command.payload.offerId, reg, country);
    }
    case 'CancelOrder':
      return cancelOrder(state, world, command.airlineId, command.payload.aircraftId);
    case 'SellAircraft':
      return disposeAircraft(state, world, command.airlineId, command.payload.aircraftId, command.payload.scrap ? 'scrap' : 'sell');
    case 'ReturnLease':
      return returnLeased(state, world, command.airlineId, command.payload.aircraftId, true);
    case 'ExtendLease':
      return extendLease(state, command.airlineId, command.payload.aircraftId, command.payload.years);
    case 'SetTimeMode':
      if (state.options.timeMode === 'realclock') return fail('alreadyRealClock');
      if (!state.airlines[command.airlineId]) return fail('airlineUnknown');
      state.options.timeMode = 'realclock';
      state.options.clockOffset = Math.max(0, state.time - command.payload.now);
      return { ok: true };
    case 'SetLivery':
      return setLivery(state, command.airlineId, command.payload.livery);
    case 'Repaint':
      return repaint(state, command.airlineId, command.payload.aircraftId, command.payload.atCheck);
    case 'MoveCheck':
      return moveCheck(state, world, command.airlineId, command.payload.aircraftId, command.payload.start);
    case 'BuildHangar':
      return buildHangar(state, command.airlineId, command.payload.size);
    case 'RefitCabin':
      return refitCabin(state, command.airlineId, command.payload.aircraftId, command.payload.cabin);
  }
}

/**
 * Starting capital for a startup, in the hub country's currency, rounded to a headline figure. The choices are in
 * today's euros; a historical game gets the same buying power in the money of its year (`priceLevel` = then-year
 * dollars per today's dollar).
 */
export function startingCapital(fx: FxRates, capitalEur: number, currency: string, priceLevel = 1): Money {
  if (priceLevel === 1) return money(roundNice(convert(money(capitalEur, 'EUR'), currency, fx).amount), currency);
  const usd = capitalEur * (ECB_RATES.USD ?? 1) * priceLevel;
  return money(roundNice(convert(money(usd, 'USD'), currency, fx).amount), currency);
}

/** The currency a new airline keeps its books in: the hub country's money of the time (if its rate is known). */
export function bookCurrencyAt(state: GameState, country: string): string {
  const currency = currencyAt(country, toDate(state.time));
  return state.fx[currency] ? currency : 'USD';
}

function foundAirline(state: GameState, world: EngineWorld, p: FoundAirline['payload']): CommandResult {
  const name = p.name.trim();
  if (name.length < 2 || name.length > 40) return fail('nameLength');
  // Designators: IATA style = 2 characters (letters/digits, not two digits); ICAO = 3 letters.
  const iata = p.iata.trim().toUpperCase();
  const icao = p.icao.trim().toUpperCase();
  if (!/^[A-Z0-9]{2}$/.test(iata) || /^\d\d$/.test(iata)) return fail('iataFormat');
  if (!/^[A-Z]{3}$/.test(icao)) return fail('icaoFormat');
  const airlines = Object.values(state.airlines);
  if (airlines.some((a) => a.iata === iata || a.icao === icao)) return fail('codeTaken');
  if (![p.primary, p.secondary].every((c) => /^#[0-9a-f]{6}$/i.test(c))) return fail('colorFormat');
  const hub = world.airportById.get(p.hubId);
  if (!hub) return fail('hubUnknown');
  if (!(CAPITAL_OPTIONS_EUR as readonly number[]).includes(p.capitalEur)) return fail('capitalInvalid');

  const id = nextId(state, 'AL');
  const currency = bookCurrencyAt(state, hub.country);
  state.airlines[id] = {
    id,
    name,
    iata,
    icao,
    controller: p.controller,
    hubId: hub.id,
    colors: { primary: p.primary.toLowerCase(), secondary: p.secondary.toLowerCase() },
    currency,
    cash: money(0, currency),
    foundedAt: state.time,
  };
  state.finance[id] = newFinance(state.time);
  if (p.controller === 'human') state.reputation[id] = newReputation();
  state.airlines[id]!.liveries = [defaultLivery(state.airlines[id]!.colors, name, p.iata.toUpperCase())];
  const capital = book(state, id, 'capital', startingCapital(state.fx, p.capitalEur, currency, state.options.startYear !== undefined ? priceLevelAt(state.time) : 1));
  postMessage(state, {
    airlineId: id,
    kind: 'founded',
    level: 'info',
    params: { name, hub: hub.iata ?? hub.icao ?? hub.id, capital: capital.amount, currency },
  });
  return { ok: true, id };
}

function leaseAircraft(state: GameState, world: EngineWorld, airlineId: string, offerId: string): CommandResult {
  const airline = state.airlines[airlineId];
  if (!airline) return fail('airlineUnknown');
  const index = state.market.offers.findIndex((o) => o.id === offerId && o.expiresAt > state.time);
  if (index < 0) return fail('offerGone');
  const offer = state.market.offers[index]!;
  // The lessor wants the security deposit in cash on signing.
  if (airline.cash.amount < convert(offer.deposit, airline.currency, state.fx).amount) return fail('insufficientCash');

  state.market.offers.splice(index, 1);
  const hub = world.airportById.get(airline.hubId);
  const deliveryAt = startOfDay(state.time) + offer.deliveryDays * MINUTES_PER_DAY + 9 * 60;
  const d = toDate(deliveryAt);
  const id = nextId(state, 'AC');
  const registration = newRegistration(state, hub?.country ?? 'XX');
  state.aircraft[id] = {
    id,
    typeId: offer.typeId,
    airlineId,
    registration,
    builtYear: offer.builtYear,
    seats: offer.seats,
    cabin: offer.cabin,
    status: 'delivering',
    deliveryAt,
    locationId: airline.hubId,
    lease: {
      lessor: offer.lessor,
      monthlyRent: offer.monthlyRent,
      deposit: offer.deposit,
      startAt: deliveryAt,
      endAt: simTime(d.getUTCFullYear(), d.getUTCMonth() + 1 + offer.termMonths, d.getUTCDate()),
    },
  };
  book(state, airlineId, 'leaseDeposit', money(-offer.deposit.amount, offer.deposit.currency), id);
  schedule(state, { at: deliveryAt, kind: 'delivery', aircraftId: id });
  postMessage(state, {
    airlineId,
    kind: 'leaseSigned',
    level: 'info',
    params: { registration, type: getAircraftType(offer.typeId).name, lessor: offer.lessor, deliveryAt },
  });
  return { ok: true, id };
}

/** Checks route settings against all rules; shared by opening and changing a route (and by the planner screen). */
export function validateRoute(
  state: GameState,
  world: EngineWorld,
  airlineId: string,
  destinationId: string,
  settings: RouteSettings,
  exceptRouteId?: string,
): CommandError | null {
  const airline = state.airlines[airlineId];
  if (!airline) return 'airlineUnknown';
  const from = world.airportById.get(airline.hubId);
  const to = world.airportById.get(destinationId);
  if (!from || !to) return 'airportUnknown';
  if (from.id === to.id) return 'sameAirport';
  const fares = [settings.fareFactor, ...Object.values(settings.classFares ?? {})];
  const [low, high] = fareRange(state, from, to);
  if (!fares.every((f) => f >= low - 1e-9 && f <= high + 1e-9)) return 'fareInvalid';
  if (state.options.scheduling === 'detailed') {
    const existing = exceptRouteId ? state.routes[exceptRouteId] : undefined;
    const route: Route = existing ?? { ...draftRoute(airlineId, from, to), id: '' };
    return validateSpecs(state, world, route, settings.flights ?? [])?.error ?? null;
  }
  const aircraft = state.aircraft[settings.aircraftId];
  if (!aircraft || aircraft.airlineId !== airlineId) return 'aircraftUnknown';
  if (!Number.isInteger(settings.frequency) || settings.frequency < 1 || settings.frequency > MAX_FREQUENCY) return 'frequencyInvalid';
  const type = getAircraftType(aircraft.typeId);
  const problem = checkRoute(world, type, from, to);
  if (problem) return problem;
  const hours = aircraftHours(state, aircraft.id, exceptRouteId) + roundTripHours(type, distanceKm(from, to)) * settings.frequency;
  if (hours > WEEKLY_AVAILABLE_HOURS[type.category] + 1e-9) return 'aircraftBusy';
  return null;
}

/** A route that is not saved yet (for checks and forecasts in the planner). */
export function draftRoute(airlineId: string, from: { id: string; lat: number; lon: number }, to: { id: string; lat: number; lon: number }): Route {
  return {
    id: 'draft',
    airlineId,
    originId: from.id,
    destinationId: to.id,
    distanceKm: Math.round(distanceKm(from, to)),
    aircraftId: '',
    frequency: 0,
    fareFactor: 1,
    classFares: { ...DEFAULT_CLASS_FARES },
    flightNumber: 0,
    openedAt: 0,
  };
}

function openRoute(state: GameState, world: EngineWorld, airlineId: string, p: OpenRoute['payload']): CommandResult {
  const error = validateRoute(state, world, airlineId, p.destinationId, p);
  if (error) return fail(error);
  const airline = state.airlines[airlineId]!;
  const routes = Object.values(state.routes).filter((r) => r.airlineId === airlineId);
  if (routes.some((r) => r.destinationId === p.destinationId)) return fail('routeExists');
  const from = world.airportById.get(airline.hubId)!;
  const to = world.airportById.get(p.destinationId)!;
  // Flight numbers: outbound odd (101, 103 …), return = outbound + 1, like most airlines.
  const used = new Set(routes.map((r) => r.flightNumber));
  let flightNumber = 101;
  while (used.has(flightNumber)) flightNumber += 2;
  const route: Route = {
    ...draftRoute(airlineId, from, to),
    id: nextId(state, 'R'),
    aircraftId: p.aircraftId,
    frequency: p.frequency,
    fareFactor: p.fareFactor,
    classFares: { ...DEFAULT_CLASS_FARES, ...p.classFares },
    flightNumber,
    openedAt: state.time,
  };
  state.routes[route.id] = route;
  if (state.options.scheduling === 'detailed') setRoutePairs(state, route, p.flights ?? []);
  else autoPlanAircraft(state, world, route.aircraftId);
  postMessage(state, {
    airlineId,
    kind: 'routeOpened',
    level: 'info',
    params: { flight: `${airline.iata} ${flightNumber}`, from: from.iata ?? from.id, to: to.iata ?? to.id, frequency: route.frequency },
  });
  return { ok: true, id: route.id };
}

function updateRoute(state: GameState, world: EngineWorld, airlineId: string, p: UpdateRoute['payload']): CommandResult {
  const route = state.routes[p.routeId];
  if (!route || route.airlineId !== airlineId) return fail('routeUnknown');
  const error = validateRoute(state, world, airlineId, route.destinationId, p, route.id);
  if (error) return fail(error);
  route.fareFactor = p.fareFactor;
  if (p.classFares) route.classFares = { ...route.classFares, ...p.classFares };
  if (state.options.scheduling === 'detailed') {
    setRoutePairs(state, route, p.flights ?? []);
  } else {
    const before = route.aircraftId;
    route.aircraftId = p.aircraftId;
    route.frequency = p.frequency;
    autoPlanAircraft(state, world, route.aircraftId);
    if (before !== route.aircraftId) autoPlanAircraft(state, world, before);
  }
  return { ok: true, id: route.id };
}

function closeRoute(state: GameState, world: EngineWorld, airlineId: string, routeId: string): CommandResult {
  const route = state.routes[routeId];
  if (!route || route.airlineId !== airlineId) return fail('routeUnknown');
  delete state.routes[routeId];
  const aircraftIds = new Set(pairsOfRoute(state, routeId).map((p) => p.aircraftId));
  for (const pair of pairsOfRoute(state, routeId)) delete state.flights[pair.id];
  if (state.options.scheduling === 'simple') for (const id of aircraftIds) autoPlanAircraft(state, world, id);
  const airline = state.airlines[airlineId]!;
  const to = world.airportById.get(route.destinationId);
  postMessage(state, {
    airlineId,
    kind: 'routeClosed',
    level: 'info',
    params: { flight: `${airline.iata} ${route.flightNumber}`, to: to?.iata ?? route.destinationId },
  });
  return { ok: true, id: routeId };
}

function refitCabin(state: GameState, airlineId: string, aircraftId: string, cabin: CabinLayout): CommandResult {
  const airline = state.airlines[airlineId];
  const aircraft = state.aircraft[aircraftId];
  if (!airline) return fail('airlineUnknown');
  if (!aircraft || aircraft.airlineId !== airlineId) return fail('aircraftUnknown');
  if (inRefit(aircraft, state.time)) return fail('inRefit');
  if (grounded(aircraft, state.time)) return fail('inCheck');
  const type = getAircraftType(aircraft.typeId);
  const error = validateCabin(type, cabin);
  if (error) return fail(error);
  const quote = refitQuote(type, aircraft.cabin, cabin, priceLevelAt(state.time));
  if (quote.costUsd === 0 && quote.days === 0) return fail('cabinUnchanged');
  const layout = cabin.map((s) => ({ cls: s.cls, product: s.product, pitch: s.pitch, seats: s.seats }));

  // Before delivery the new layout is part of the transition work (repaint, paperwork) the lessor does anyway.
  if (aircraft.status === 'delivering') {
    aircraft.cabin = layout;
    aircraft.seats = totalSeats(layout);
    postMessage(state, { airlineId, kind: 'cabinChanged', level: 'info', params: { registration: aircraft.registration, cabin: cabinCode(layout) } });
    return { ok: true, id: aircraft.id };
  }

  const cost = convert(money(quote.costUsd, 'USD'), airline.currency, state.fx);
  if (airline.cash.amount < cost.amount) return fail('insufficientCash');
  book(state, airlineId, 'refit', money(-quote.costUsd, 'USD'), aircraft.id);
  // The investment is written off over six years (or until the lease ends), together with what is left of older refits.
  const today = startOfDay(state.time);
  const left = aircraft.cabinDepreciation && aircraft.cabinDepreciation.until > today ? (aircraft.cabinDepreciation.perDay * (aircraft.cabinDepreciation.until - today)) / MINUTES_PER_DAY : 0;
  const until = Math.min(aircraft.lease?.endAt ?? Infinity, today + REFIT_DEPRECIATION_YEARS * 365 * MINUTES_PER_DAY);
  const days = Math.max(1, (until - today) / MINUTES_PER_DAY);
  aircraft.cabinDepreciation = { perDay: (cost.amount + left) / days, until };
  aircraft.cabin = layout;
  aircraft.seats = totalSeats(layout);
  aircraft.refitUntil = today + (quote.days + 1) * MINUTES_PER_DAY;
  schedule(state, { at: aircraft.refitUntil, kind: 'refitDone', aircraftId: aircraft.id });
  postMessage(state, {
    airlineId,
    kind: 'refitStarted',
    level: 'caution',
    params: { registration: aircraft.registration, cabin: cabinCode(layout), days: quote.days, amount: cost.amount, currency: airline.currency, until: aircraft.refitUntil },
  });
  return { ok: true, id: aircraft.id };
}

/** A registration that follows the country's pattern and is not used yet in this game. */
export function newRegistration(state: GameState, country: string): string {
  const pattern = registrationPattern(country);
  const taken = new Set(Object.values(state.aircraft).map((a) => a.registration));
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let attempt = 0; attempt < 1000; attempt++) {
    const reg = pattern.replace(/[?#%]/g, (ch) =>
      ch === '?' ? letters[randomInt(state, 0, 25)]! : String(ch === '#' ? randomInt(state, 0, 9) : randomInt(state, 1, 9)),
    );
    if (!taken.has(reg)) return reg;
  }
  throw new Error(`No free registration for ${country}`);
}

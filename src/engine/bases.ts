// Bases (Phase 7.4): airports other than the hub where the airline stations aircraft and crews. Its aircraft fly routes
// from their base and spend the nights there; crews are paid at the base country's wages; a base costs money to set up
// and to run (station office, crew rooms, line maintenance). Passengers can change planes at a base like at the hub
// (Phase 7.1), and gates and a lounge can be rented there (7.3).
// Where: in the airline's own country (the state of the time in historical games), and for an airline of the European
// single aviation market anywhere in it (see aviationMarkets.ts).
import { inSingleMarket } from '../data/aviationMarkets';
import { stateOf } from '../data/eras';
import { book, postMessage } from './core';
import { priceLevelAt } from './era';
import { convert, money } from './money';
import { pairsOfAircraft } from './schedule';
import type { Aircraft, Airline, GameState } from './state';
import { toDate, type SimTime } from './time';
import type { EngineWorld } from './world';

/** Setting up a base: station office, crew rooms, recruiting, ground equipment (2025 USD; modelled). */
export const BASE_SETUP_USD = 2_000_000;
/** Running a base per year: station management, crew planning, line maintenance staff (2025 USD; modelled). */
export const BASE_RUN_USD_YEAR = 3_000_000;

export type BaseError = 'baseNotAllowed' | 'baseExists' | 'baseUnknown' | 'baseInUse' | 'airportUnknown' | 'insufficientCash' | 'aircraftHasFlights' | 'aircraftUnknown';

/** The airline's airports with stationed aircraft: the hub first, then its bases. */
export const stationsOf = (airline: Airline): string[] => [airline.hubId, ...(airline.bases ?? []).map((b) => b.airportId)];

/** Where an aircraft is stationed (its base, else the hub). */
export const stationOf = (airline: Airline | undefined, aircraft: Pick<Aircraft, 'baseId'>): string => aircraft.baseId ?? airline?.hubId ?? '';

/** May the airline open a base at this airport on this day? (null = yes, else why not) */
export function baseRight(state: GameState, world: EngineWorld, airline: Airline, airportId: string, time: SimTime = state.time): 'baseNotAllowed' | 'airportUnknown' | null {
  const hub = world.airportById.get(airline.hubId);
  const target = world.airportById.get(airportId);
  if (!hub || !target) return 'airportUnknown';
  const date = toDate(time);
  if (stateOf(hub.country, hub.id, date) === stateOf(target.country, target.id, date)) return null;
  const day = date.toISOString().slice(0, 10);
  return inSingleMarket(hub.country, day) && inSingleMarket(target.country, day) ? null : 'baseNotAllowed';
}

export function openBase(state: GameState, world: EngineWorld, airlineId: string, airportId: string): BaseError | null {
  const airline = state.airlines[airlineId]!;
  const right = baseRight(state, world, airline, airportId);
  if (right) return right;
  if (stationsOf(airline).includes(airportId)) return 'baseExists';
  const usd = BASE_SETUP_USD * priceLevelAt(state.time);
  if (airline.cash.amount < convert(money(usd, 'USD'), airline.currency, state.fx).amount) return 'insufficientCash';
  book(state, airlineId, 'base', money(-usd, 'USD'));
  (airline.bases ??= []).push({ airportId, openedAt: state.time });
  postMessage(state, { airlineId, kind: 'baseOpened', level: 'info', params: { airport: world.airportById.get(airportId)?.iata ?? airportId } });
  return null;
}

/** Closing a base: only without routes from it and without aircraft stationed there. */
export function closeBase(state: GameState, airlineId: string, airportId: string): BaseError | null {
  const airline = state.airlines[airlineId]!;
  if (!airline.bases?.some((b) => b.airportId === airportId)) return 'baseUnknown';
  const used =
    Object.values(state.routes).some((r) => r.airlineId === airlineId && r.originId === airportId) ||
    Object.values(state.aircraft).some((a) => a.airlineId === airlineId && a.baseId === airportId);
  if (used) return 'baseInUse';
  airline.bases = airline.bases.filter((b) => b.airportId !== airportId);
  airline.lounges = airline.lounges?.filter((l) => l.airportId !== airportId);
  return null;
}

/** Stationing an aircraft at the hub or a base (only while it has no flights planned). */
export function stationAircraft(state: GameState, airlineId: string, aircraftId: string, airportId: string): BaseError | null {
  const airline = state.airlines[airlineId]!;
  const aircraft = state.aircraft[aircraftId];
  if (!aircraft || aircraft.airlineId !== airlineId) return 'aircraftUnknown';
  if (!stationsOf(airline).includes(airportId)) return 'baseUnknown';
  if (pairsOfAircraft(state, aircraftId).length) return 'aircraftHasFlights';
  if (airportId === airline.hubId) delete aircraft.baseId;
  else aircraft.baseId = airportId;
  aircraft.locationId = airportId;
  return null;
}

/** Running the airline's bases, per day (USD, prices of the year). */
export const baseRunPerDayUsd = (airline: Airline, time: SimTime): number => ((airline.bases?.length ?? 0) * BASE_RUN_USD_YEAR * priceLevelAt(time)) / 365;

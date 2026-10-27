// Commands: the only way to change the game. The player (and later AI airlines and other players)
// send a command; the engine checks it against the rules and either applies it or explains why not.
import { getAircraftType } from '../data/aircraft';
import { bookCurrencyFor } from '../data/currencies';
import { registrationPattern } from '../data/registrations';
import type { Airport } from '../data/types';
import { book, nextId, postMessage, schedule } from './core';
import { convert, money, roundNice, type FxRates, type Money } from './money';
import { randomInt } from './rng';
import type { Controller, GameState } from './state';
import { MINUTES_PER_DAY, simTime, startOfDay, toDate } from './time';

/** Static world data the engine needs to check commands. */
export interface EngineWorld {
  airportById: ReadonlyMap<string, Airport>;
}

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

export type Command = FoundAirline | LeaseAircraft;

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
  | 'insufficientCash';

export type CommandResult = { ok: true; id?: string } | { ok: false; error: CommandError };

const fail = (error: CommandError): CommandResult => ({ ok: false, error });

export function applyCommand(state: GameState, world: EngineWorld, command: Command): CommandResult {
  switch (command.type) {
    case 'FoundAirline':
      return foundAirline(state, world, command.payload);
    case 'LeaseAircraft':
      return leaseAircraft(state, world, command.airlineId, command.payload.offerId);
  }
}

/** Starting capital for a startup, in the hub country's currency, rounded to a headline figure. */
export function startingCapital(fx: FxRates, capitalEur: number, currency: string): Money {
  return money(roundNice(convert(money(capitalEur, 'EUR'), currency, fx).amount), currency);
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
  const currency = bookCurrencyFor(hub.country);
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
  const capital = book(state, id, 'capital', startingCapital(state.fx, p.capitalEur, currency));
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

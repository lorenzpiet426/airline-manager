// Airport slots (Phase 7.2): at slot-coordinated airports (IATA Level 3) every take-off and landing of the player needs a
// slot — here a weekly series: one movement in one hour of the week (local time). How it works, simplified from the IATA
// Worldwide Airport Slot Guidelines:
//  - Flights the airline already flies keep their slots ("historic rights", grandfathered).
//  - A new or moved flight gets its slots at once if the coordinator still has free capacity in that hour; otherwise it
//    can't be planned. Slots can then be requested for the next season (new entrants — fewer than 5 slots a day at the
//    airport — get priority for half of the slots that come free), or bought where trading is allowed (UK, US).
//  - Use it or lose it: a slot series used less than 80 % of the weeks of a season goes back to the pool.
// The other airlines don't hold explicit slots: the airport's `use` (how full its peak hours are) stands for them.
import { demandIndex } from '../data/economyHistory';
import { fractionalYearOf } from '../data/eras';
import { cpiOf } from '../data/inflation';
import { HOUR_PROFILE, SLOT_PRICE_YEAR, slotAirport } from '../data/slots';
import { book, postMessage } from './core';
import { priceLevelAt } from './era';
import { convert, money } from './money';
import { random } from './rng';
import { pairTimes } from './schedule';
import type { GameState, SlotHolding } from './state';
import { MINUTES_PER_DAY, simTime, toDate, type SimTime } from './time';
import { hasDay } from './timetable';
import { REAL_DATA_END } from './worldEvents';
import type { EngineWorld } from './world';

export const HOURS_OF_WEEK = 168;
/** Use it or lose it: the share of a season's weeks a slot series must be used. */
export const USE_IT_OR_LOSE_IT = 0.8;
/** EU slot regulation: an airline holding fewer than this many slots a day at an airport counts as a new entrant. */
const NEW_ENTRANT_SLOTS_PER_DAY = 5;
/** Chance per requested slot at a full hour that the season's pool (slots returned, new capacity) yields it. */
const POOL_CHANCE_NEW_ENTRANT = 0.35;
const POOL_CHANCE_INCUMBENT = 0.1;
/** After the real data ends the airports fill up with the traffic trend (3 % a year). */
const TRAFFIC_GROWTH = 0.03;

/** Slots held at an airport: `perHour` in every hour of the week (tests and grandfathered rights). */
export const slotHolding = (perHour = 0): SlotHolding => ({ ...emptyHolding(), held: new Array(HOURS_OF_WEEK).fill(perHour) });

const emptyHolding = (): SlotHolding => ({ held: new Array(HOURS_OF_WEEK).fill(0), used: new Array(HOURS_OF_WEEK).fill(0), weeks: 0, requests: new Array(HOURS_OF_WEEK).fill(0) });

/** How full the airport's peak hours are at `time` (today's value scaled with the air travel of the year). */
export function slotUse(world: EngineWorld, airportId: string, time: SimTime): number {
  const a = slotAirport(airportId);
  const airport = world.airportById.get(airportId);
  if (!a || !airport) return 0;
  const date = toDate(time);
  if (time >= REAL_DATA_END) return Math.min(1, a.use * (1 + TRAFFIC_GROWTH) ** ((time - REAL_DATA_END) / (365 * MINUTES_PER_DAY)));
  const now = demandIndex(airport.country, 2024.5);
  const then = demandIndex(airport.country, fractionalYearOf(date));
  return Math.min(1, a.use * Math.min(1, then / Math.max(1e-9, now)) ** 0.8);
}

/**
 * How busy an hour is compared with the peak. At saturated airports (Heathrow, Lisbon) demand fills every daytime hour,
 * not just the peaks: the daytime profile flattens out as the airport's peak use goes from 85 % to 100 %.
 */
function hourFill(use: number, hour: number): number {
  const flat = Math.min(1, Math.max(0, (use - 0.85) / 0.15));
  return hour >= 6 && hour < 23 ? Math.max(HOUR_PROFILE[hour]!, flat) : HOUR_PROFILE[hour]!;
}

/** Slots the coordinator can still give out in an hour of the week (beyond what the player holds). */
export function freeSlots(state: GameState, world: EngineWorld, airportId: string, hourOfWeek: number): number {
  const a = slotAirport(airportId);
  if (!a) return Infinity;
  const total = Math.floor(a.capacity * (1 - slotUse(world, airportId, state.time) * hourFill(a.use, hourOfWeek % 24)));
  return Math.max(0, total - (state.slots?.[airportId]?.held[hourOfWeek] ?? 0));
}

/** Movements (take-offs and landings) of an airline's timetable per coordinated airport and hour of the week, local. */
export function slotNeeds(state: GameState, world: EngineWorld, airlineId: string): Map<string, number[]> {
  const needs = new Map<string, number[]>();
  const add = (airportId: string, minuteOfWeek: number) => {
    if (!slotAirport(airportId)) return;
    const list = needs.get(airportId) ?? needs.set(airportId, new Array(HOURS_OF_WEEK).fill(0)).get(airportId)!;
    const h = Math.floor((((minuteOfWeek % 10080) + 10080) % 10080) / 60);
    list[h]!++;
  };
  for (const pair of Object.values(state.flights)) {
    if (pair.airlineId !== airlineId) continue;
    const route = state.routes[pair.routeId];
    const aircraft = state.aircraft[pair.aircraftId];
    if (!route || !aircraft) continue;
    const t = pairTimes(world, aircraft.typeId, route, pair, state.time);
    for (let d = 0; d < 7; d++) {
      if (!hasDay(pair.days, d)) continue;
      const base = d * 1440;
      add(route.originId, base + t.outDep);
      add(route.originId, base + t.backArr);
      add(route.destinationId, base + t.outArr);
      add(route.destinationId, base + t.backDep);
    }
  }
  return needs;
}

/** First use (old saves, a takeover): the flights the airline flies already keep their slots. */
export function grantHistoricSlots(state: GameState, world: EngineWorld, airlineId: string): void {
  state.slots ??= {};
  for (const [airportId, need] of slotNeeds(state, world, airlineId)) {
    const h = (state.slots[airportId] ??= emptyHolding());
    need.forEach((n, i) => (h.held[i] = Math.max(h.held[i]!, n)));
  }
}

/** Slots games started before Phase 7.2 never had: everybody's current timetable is grandfathered once. */
export function ensureSlots(state: GameState, world: EngineWorld): void {
  if (state.slots) return;
  state.slots = {};
  for (const airline of Object.values(state.airlines)) if (airline.controller === 'human') grantHistoricSlots(state, world, airline.id);
}

export interface SlotShortfall {
  airportId: string;
  /** Hours of the week with a missing slot (repeated when several are missing). */
  hours: number[];
}

/**
 * After a timetable change: takes the free slots the new flights need. Returns the first airport where the coordinator
 * has none left (and changes nothing then).
 */
/** Whether the airline's timetable fits the slots it holds plus the free ones (nothing is granted). */
export function slotsFit(state: GameState, world: EngineWorld, airlineId: string): boolean {
  if (!state.slots) return true;
  for (const [airportId, need] of slotNeeds(state, world, airlineId)) {
    for (let h = 0; h < need.length; h++) {
      const short = need[h]! - (state.slots[airportId]?.held[h] ?? 0);
      if (short > 0 && freeSlots(state, world, airportId, h) < short) return false;
    }
  }
  return true;
}

export function acquireSlots(state: GameState, world: EngineWorld, airlineId: string): SlotShortfall | null {
  ensureSlots(state, world);
  const needs = slotNeeds(state, world, airlineId);
  const grants: [string, number, number][] = [];
  for (const [airportId, need] of needs) {
    const missing: number[] = [];
    need.forEach((n, h) => {
      const short = n - (state.slots![airportId]?.held[h] ?? 0);
      if (short <= 0) return;
      const free = freeSlots(state, world, airportId, h);
      if (free >= short) grants.push([airportId, h, short]);
      else for (let k = 0; k < short - free; k++) missing.push(h);
    });
    if (missing.length) return { airportId, hours: missing };
  }
  for (const [airportId, h, n] of grants) (state.slots![airportId] ??= emptyHolding()).held[h]! += n;
  return null;
}

/** Price of one slot (one movement a week, for good) in USD of the game's year: a pair = 14 of them, cheaper off-peak. */
export function slotPriceUsd(airportId: string, hourOfWeek: number, time: SimTime): number | null {
  const a = slotAirport(airportId);
  if (!a?.pairUsd) return null;
  const peak = 0.3 + 0.7 * HOUR_PROFILE[hourOfWeek % 24]!;
  // Prices of 2016 in the money of the game's year (CPI, as for aircraft).
  const toYear = (cpiOf(2025) / cpiOf(SLOT_PRICE_YEAR)) * priceLevelAt(time);
  return Math.round((a.pairUsd / 14) * peak * toYear);
}

/** Buys slots from other airlines where trading is allowed (they become the player's for good). */
export function buySlots(state: GameState, world: EngineWorld, airlineId: string, airportId: string, hours: readonly number[]): 'notTradable' | 'insufficientCash' | null {
  ensureSlots(state, world);
  const prices = hours.map((h) => slotPriceUsd(airportId, h, state.time));
  if (!hours.length || prices.some((p) => p === null)) return 'notTradable';
  const usd = prices.reduce((s: number, p) => s + p!, 0);
  const airline = state.airlines[airlineId]!;
  if (airline.cash.amount < convert(money(usd, 'USD'), airline.currency, state.fx).amount) return 'insufficientCash';
  book(state, airlineId, 'slotPurchase', money(-usd, 'USD'));
  const h = (state.slots![airportId] ??= emptyHolding());
  for (const x of hours) h.held[x]!++;
  postMessage(state, { airlineId, kind: 'slotsBought', level: 'info', params: { airport: world.airportById.get(airportId)?.iata ?? airportId, count: hours.length } });
  return null;
}

/** Asks the coordinator for slots in the next season's allocation. */
export function requestSlots(state: GameState, world: EngineWorld, airportId: string, hours: readonly number[]): void {
  ensureSlots(state, world);
  const h = (state.slots![airportId] ??= emptyHolding());
  for (const x of hours) h.requests[x]!++;
}

/** Weekly (Monday): how many of the held slots the timetable used last week. */
export function recordSlotUse(state: GameState, world: EngineWorld): void {
  if (!state.slots) return;
  const player = Object.values(state.airlines).find((a) => a.controller === 'human');
  if (!player) return;
  const needs = slotNeeds(state, world, player.id);
  for (const [airportId, h] of Object.entries(state.slots)) {
    const need = needs.get(airportId);
    h.held.forEach((n, i) => (h.used[i]! += Math.min(n, need?.[i] ?? 0)));
    h.weeks++;
  }
}

/** IATA seasons: summer from the last Sunday of March, winter from the last Sunday of October. */
export function seasonStarts(year: number): [SimTime, SimTime] {
  const lastSunday = (month: number) => {
    const end = new Date(Date.UTC(year, month, 0));
    return simTime(year, month, end.getUTCDate() - end.getUTCDay());
  };
  return [lastSunday(3), lastSunday(10)];
}

export const isSeasonStart = (time: SimTime): boolean => seasonStarts(toDate(time).getUTCFullYear()).includes(time);

/** The next season start after `time`. */
export function nextSeasonStart(time: SimTime): SimTime {
  const y = toDate(time).getUTCFullYear();
  return [...seasonStarts(y), ...seasonStarts(y + 1)].find((t) => t > time)!;
}

/** Season start (00:00 UTC): use it or lose it for the season that ended, then the new season's allocation. */
export function seasonChange(state: GameState, world: EngineWorld): void {
  if (!state.slots) return;
  const player = Object.values(state.airlines).find((a) => a.controller === 'human');
  for (const [airportId, h] of Object.entries(state.slots)) {
    let lost = 0;
    if (h.weeks > 0) {
      h.held.forEach((n, i) => {
        if (n <= 0) return;
        const usedWeeks = h.used[i]! / h.weeks; // average slots of this hour used per week
        const keep = usedWeeks >= n * USE_IT_OR_LOSE_IT ? n : Math.round(usedWeeks);
        lost += n - keep;
        h.held[i] = keep;
      });
    }
    h.used.fill(0);
    h.weeks = 0;
    const asked = h.requests.reduce((s, n) => s + n, 0);
    let granted = 0;
    const perDay = h.held.reduce((s, n) => s + n, 0) / 7;
    const chance = perDay < NEW_ENTRANT_SLOTS_PER_DAY ? POOL_CHANCE_NEW_ENTRANT : POOL_CHANCE_INCUMBENT;
    h.requests.forEach((n, i) => {
      for (let k = 0; k < n; k++) {
        if (freeSlots(state, world, airportId, i) > 0 || random(state) < chance) {
          h.held[i]!++;
          granted++;
        }
      }
    });
    h.requests.fill(0);
    if (player && (lost || asked)) {
      postMessage(state, {
        airlineId: player.id,
        kind: 'slotSeason',
        level: lost ? 'caution' : 'info',
        params: { airport: world.airportById.get(airportId)?.iata ?? airportId, granted, asked, lost },
      });
    }
  }
}

/** Slots held at an airport per day (for the screens). */
export const slotsPerDay = (h: SlotHolding | undefined): number => (h ? h.held.reduce((s, n) => s + n, 0) / 7 : 0);

// Fleet ownership (Phase 4.1): ordering new aircraft from the factory (delivery slots, payments in stages), buying and
// selling used aircraft, scrapping, and the end of leases (return, extension, early return). Owned aircraft are
// written off over their useful life; selling below or above that book value is a loss or gain in the accounts.
import { getAircraftType } from '../data/aircraft';
import {
  backlogYears,
  DELIVERIES_PER_MONTH,
  EARLY_RETURN_SHARE,
  EXTEND_WINDOW_MONTHS,
  marketValueUsd,
  MIN_DEPRECIATION_YEARS,
  newPriceUsd,
  orderBlock,
  partsValueUsd,
  PAYMENT_PLAN,
  RESIDUAL_SHARE,
  USEFUL_LIFE_YEARS,
} from '../data/factory';
import { standardCabin, totalSeats, type CabinStyle } from './cabins';
import { book, nextId, postMessage, schedule } from './core';
import { convert, money } from './money';
import { typicalRentUsd } from './market';
import { initialMaint } from './maintenance';
import { autoPlanAircraft, pairsOfAircraft } from './schedule';
import type { Aircraft, GameState, Ownership, PnlLines } from './state';
import { addMonths, MINUTES_PER_DAY, simTime, startOfDay, yearOf, type SimTime } from './time';
import type { EngineWorld } from './world';

const YEAR_MIN = 365.25 * MINUTES_PER_DAY;

export const ageOf = (aircraft: Pick<Aircraft, 'builtYear'>, time: SimTime): number => Math.max(0, yearOf(time) - aircraft.builtYear);

/** What the aircraft would sell for today (USD). */
export function aircraftMarketValueUsd(aircraft: Pick<Aircraft, 'typeId' | 'builtYear'>, time: SimTime): number {
  return marketValueUsd(getAircraftType(aircraft.typeId), ageOf(aircraft, time), yearOf(time));
}

/** Value in the accounts today (book currency): the price written off in a straight line. */
export function bookValue(o: Ownership, time: SimTime): number {
  const span = Math.max(1, o.writtenOffAt - o.boughtAt);
  const done = Math.min(1, Math.max(0, (time - o.boughtAt) / span));
  return o.price - (o.price - o.residual) * done;
}

/** Depreciation of an owned aircraft for one day (book currency). */
export function dailyDepreciation(o: Ownership, time: SimTime): number {
  if (time > o.writtenOffAt) return 0;
  return ((o.price - o.residual) / Math.max(1, o.writtenOffAt - o.boughtAt)) * MINUTES_PER_DAY;
}

/** Ownership for a price paid now (book currency): written off to 10 % of the new value over its remaining life. */
export function newOwnership(state: GameState, aircraft: Pick<Aircraft, 'typeId' | 'builtYear'>, price: number, currency: string): Ownership {
  const type = getAircraftType(aircraft.typeId);
  const residual = Math.min(price, convert(money(newPriceUsd(type, 1, yearOf(state.time)) * RESIDUAL_SHARE, 'USD'), currency, state.fx).amount);
  const years = Math.max(MIN_DEPRECIATION_YEARS, USEFUL_LIFE_YEARS - ageOf(aircraft, state.time));
  return { price, boughtAt: state.time, residual, writtenOffAt: state.time + Math.round(years * YEAR_MIN) };
}

/** Adds an amount to a profit-and-loss line of the running week and month (for things not booked by the daily step). */
export function bookPnl(state: GameState, airlineId: string, line: keyof PnlLines, amount: number): void {
  const fin = state.finance[airlineId];
  if (!fin) return;
  fin.week.lines[line] = (fin.week.lines[line] ?? 0) + amount;
  fin.month.lines[line] = (fin.month.lines[line] ?? 0) + amount;
}

/**
 * Takes an aircraft out of the fleet: its flights are cancelled (routes in Simple scheduling keep their settings and
 * wait for another aircraft). Returns the ids of the routes that lost flights.
 */
export function removeAircraft(state: GameState, world: EngineWorld, aircraftId: string): string[] {
  const routes = [...new Set(pairsOfAircraft(state, aircraftId).map((p) => p.routeId))];
  for (const p of pairsOfAircraft(state, aircraftId)) delete state.flights[p.id];
  for (const r of Object.values(state.routes)) if (r.aircraftId === aircraftId) r.aircraftId = '';
  delete state.aircraft[aircraftId];
  if (state.options.scheduling === 'simple') {
    const others = new Set(routes.flatMap((id) => Object.values(state.flights).filter((p) => p.routeId === id).map((p) => p.aircraftId)));
    for (const id of others) autoPlanAircraft(state, world, id);
  }
  return routes;
}

// ─── Factory orders ────────────────────────────────────────────────────────────

/** Delivery dates for `count` new aircraft ordered now (after the airline's own earlier orders of the type). */
export function deliverySlots(state: GameState, airlineId: string, typeId: string, count: number): SimTime[] {
  const type = getAircraftType(typeId);
  const now = state.time;
  // A type that hasn't flown yet can't come before it enters service.
  let first = Math.max(addMonths(startOfDay(now), Math.round(backlogYears(type, yearOf(now)) * 12)), simTime(type.eis, 7, 1));
  // Earlier orders of the same type for this airline come first.
  const earlier = Object.values(state.aircraft).filter((a) => a.airlineId === airlineId && a.typeId === typeId && a.order).map((a) => a.deliveryAt);
  if (earlier.length) first = Math.max(first, addMonths(Math.max(...earlier), 1));
  const perMonth = DELIVERIES_PER_MONTH[type.category];
  return Array.from({ length: count }, (_, k) => startOfDay(addMonths(first, Math.floor(k / perMonth))) + 9 * 60);
}

export type FleetError =
  | 'notOrderable'
  | 'countInvalid'
  | 'notOwned'
  | 'notLeased'
  | 'notOnOrder'
  | 'notDelivered'
  | 'yearsInvalid'
  | 'extendTooEarly'
  | 'offerGone'
  | 'insufficientCash'
  | 'aircraftUnknown'
  | 'airlineUnknown'
  | 'inRefit'
  | 'inCheck';

type Result = { ok: true; id?: string } | { ok: false; error: FleetError };
const fail = (error: FleetError): Result => ({ ok: false, error });

export function orderAircraft(
  state: GameState,
  airlineId: string,
  p: { typeId: string; count: number; cabin: CabinStyle },
  newRegistration: (country: string) => string,
  hubCountry: string,
): Result {
  const airline = state.airlines[airlineId];
  if (!airline) return fail('airlineUnknown');
  const type = getAircraftType(p.typeId);
  if (orderBlock(type, yearOf(state.time))) return fail('notOrderable');
  if (!Number.isInteger(p.count) || p.count < 1 || p.count > 20) return fail('countInvalid');
  const priceUsd = newPriceUsd(type, p.count, yearOf(state.time));
  const slots = deliverySlots(state, airlineId, p.typeId, p.count);
  // Payments due on signing (deposit, and pre-delivery payments already due for early slots).
  const plans = slots.map((at) =>
    PAYMENT_PLAN.map((step) => ({
      due: step.monthsBefore === 'signing' ? state.time : step.monthsBefore === 'delivery' ? at : Math.max(state.time, addMonths(at, -step.monthsBefore)),
      usd: Math.round(priceUsd * step.share),
      kind: (step.monthsBefore === 'signing' ? 'deposit' : step.monthsBefore === 'delivery' ? 'balance' : 'predelivery') as 'deposit' | 'predelivery' | 'balance',
    })),
  );
  const dueNow = plans.flat().filter((x) => x.due <= state.time && x.kind !== 'balance').reduce((s, x) => s + x.usd, 0);
  if (airline.cash.amount < convert(money(dueNow, 'USD'), airline.currency, state.fx).amount) return fail('insufficientCash');
  let firstId = '';
  const cabin = standardCabin(type, p.cabin);
  slots.forEach((at, k) => {
    const id = nextId(state, 'AC');
    firstId ||= id;
    state.aircraft[id] = {
      id,
      typeId: type.id,
      airlineId,
      registration: newRegistration(hubCountry),
      builtYear: yearOf(at),
      seats: totalSeats(cabin),
      cabin,
      status: 'delivering',
      deliveryAt: at,
      locationId: airline.hubId,
      order: { orderedAt: state.time, priceUsd, payments: plans[k]! },
    };
    schedule(state, { at, kind: 'delivery', aircraftId: id });
  });
  postMessage(state, {
    airlineId,
    kind: 'ordered',
    level: 'info',
    params: { count: p.count, type: type.name, amount: priceUsd, currency: 'USD', first: slots[0]!, last: slots.at(-1)! },
  });
  payDueOrders(state, airlineId);
  return { ok: true, id: firstId };
}

/** Pays the manufacturer what is due (daily; the balance is paid on delivery). */
export function payDueOrders(state: GameState, onlyAirline?: string): void {
  const totals = new Map<string, number>();
  for (const a of Object.values(state.aircraft)) {
    if (!a.order || (onlyAirline && a.airlineId !== onlyAirline)) continue;
    for (const pay of a.order.payments) {
      if (pay.paid !== undefined || pay.due > state.time || pay.kind === 'balance') continue;
      pay.paid = -book(state, a.airlineId, 'orderPayment', money(-pay.usd, 'USD'), a.id).amount;
      totals.set(a.airlineId, (totals.get(a.airlineId) ?? 0) + pay.paid);
    }
  }
  for (const [airlineId, amount] of totals) {
    const airline = state.airlines[airlineId]!;
    postMessage(state, { airlineId, kind: 'orderPayment', level: 'info', params: { amount: Math.round(amount), currency: airline.currency } });
  }
}

/** On delivery of an ordered aircraft: the balance is paid and the aircraft is owned. */
export function completeOrder(state: GameState, aircraft: Aircraft): void {
  const order = aircraft.order;
  const airline = state.airlines[aircraft.airlineId];
  if (!order || !airline) return;
  for (const pay of order.payments) {
    if (pay.paid === undefined) pay.paid = -book(state, aircraft.airlineId, 'orderPayment', money(-pay.usd, 'USD'), aircraft.id).amount;
  }
  const price = order.payments.reduce((s, x) => s + (x.paid ?? 0), 0);
  aircraft.owned = newOwnership(state, aircraft, price, airline.currency);
  delete aircraft.order;
}

/** Cancelling an order: the aircraft is gone, and so are the deposit and pre-delivery payments already made. */
export function cancelOrder(state: GameState, world: EngineWorld, airlineId: string, aircraftId: string): Result {
  const a = state.aircraft[aircraftId];
  if (!a || a.airlineId !== airlineId) return fail('aircraftUnknown');
  if (!a.order) return fail('notOnOrder');
  const lost = a.order.payments.reduce((s, x) => s + (x.paid ?? 0), 0);
  bookPnl(state, airlineId, 'disposals', lost);
  const type = getAircraftType(a.typeId);
  removeAircraft(state, world, aircraftId);
  const airline = state.airlines[airlineId]!;
  postMessage(state, { airlineId, kind: 'orderCancelled', level: 'caution', params: { type: type.name, registration: a.registration, amount: Math.round(lost), currency: airline.currency } });
  return { ok: true, id: aircraftId };
}

// ─── Used aircraft ─────────────────────────────────────────────────────────────

export function buyAircraft(state: GameState, airlineId: string, offerId: string, newRegistration: (country: string) => string, hubCountry: string): Result {
  const airline = state.airlines[airlineId];
  if (!airline) return fail('airlineUnknown');
  const index = state.market.sales.findIndex((o) => o.id === offerId && o.expiresAt > state.time);
  if (index < 0) return fail('offerGone');
  const offer = state.market.sales[index]!;
  const price = convert(money(offer.priceUsd, 'USD'), airline.currency, state.fx).amount;
  if (airline.cash.amount < price) return fail('insufficientCash');
  state.market.sales.splice(index, 1);
  const id = nextId(state, 'AC');
  const deliveryAt = startOfDay(state.time) + offer.deliveryDays * MINUTES_PER_DAY + 9 * 60;
  const paid = -book(state, airlineId, 'purchase', money(-offer.priceUsd, 'USD'), id).amount;
  const registration = newRegistration(hubCountry);
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
    owned: newOwnership(state, offer, paid, airline.currency),
    // Its checks are where the seller's records say (the sale offer shows the next one).
    maint: initialMaint(offer.id, getAircraftType(offer.typeId), offer.builtYear, deliveryAt, 'used'),
  };
  schedule(state, { at: deliveryAt, kind: 'delivery', aircraftId: id });
  postMessage(state, {
    airlineId,
    kind: 'bought',
    level: 'info',
    params: { type: getAircraftType(offer.typeId).name, registration, amount: Math.round(paid), currency: airline.currency, deliveryAt, seller: offer.seller },
  });
  return { ok: true, id };
}

/** Selling (to a lessor or another airline: market value less a broker's fee) or scrapping (parts value). */
export function disposeAircraft(state: GameState, world: EngineWorld, airlineId: string, aircraftId: string, how: 'sell' | 'scrap'): Result {
  const a = state.aircraft[aircraftId];
  const airline = state.airlines[airlineId];
  if (!a || !airline || a.airlineId !== airlineId) return fail('aircraftUnknown');
  if (!a.owned) return fail('notOwned');
  if (a.status !== 'active') return fail('notDelivered');
  if ((a.refitUntil ?? 0) > state.time) return fail('inRefit');
  if ((a.maint?.inCheck?.until ?? 0) > state.time) return fail('inCheck');
  const type = getAircraftType(a.typeId);
  const usd = how === 'sell' ? Math.round(aircraftMarketValueUsd(a, state.time) * 0.97) : partsValueUsd(type, yearOf(state.time));
  const got = book(state, airlineId, 'sale', money(usd, 'USD'), a.id).amount;
  bookPnl(state, airlineId, 'disposals', bookValue(a.owned, state.time) - got);
  removeAircraft(state, world, aircraftId);
  postMessage(state, {
    airlineId,
    kind: how === 'sell' ? 'sold' : 'scrapped',
    level: 'info',
    params: { type: type.name, registration: a.registration, amount: Math.round(got), currency: airline.currency },
  });
  return { ok: true, id: aircraftId };
}

// ─── Leases ───────────────────────────────────────────────────────────────────

/** Rent still owed until the lease ends (USD), and what the lessor wants for an early return. */
export function earlyReturnFeeUsd(a: Aircraft, time: SimTime): number {
  if (!a.lease) return 0;
  const months = Math.max(0, (a.lease.endAt - time) / (YEAR_MIN / 12));
  return Math.round(a.lease.monthlyRent.amount * months * EARLY_RETURN_SHARE);
}

/** The aircraft goes back to the lessor: the deposit comes back (and for an early return, a fee is paid). */
export function returnLeased(state: GameState, world: EngineWorld, airlineId: string, aircraftId: string, early: boolean): Result {
  const a = state.aircraft[aircraftId];
  const airline = state.airlines[airlineId];
  if (!a || !airline || a.airlineId !== airlineId) return fail('aircraftUnknown');
  if (!a.lease) return fail('notLeased');
  const fee = early ? earlyReturnFeeUsd(a, state.time) : 0;
  if (early && airline.cash.amount + convert(a.lease.deposit, airline.currency, state.fx).amount < convert(money(fee, 'USD'), airline.currency, state.fx).amount) {
    return fail('insufficientCash');
  }
  if (fee > 0) {
    const paid = -book(state, airlineId, 'leaseReturnFee', money(-fee, 'USD'), a.id).amount;
    bookPnl(state, airlineId, 'disposals', paid);
  }
  book(state, airlineId, 'depositBack', a.lease.deposit, a.id);
  const routes = removeAircraft(state, world, aircraftId);
  postMessage(state, {
    airlineId,
    kind: early ? 'leaseReturned' : 'leaseEnded',
    level: routes.length ? 'caution' : 'info',
    params: { registration: a.registration, type: getAircraftType(a.typeId).name, lessor: a.lease.lessor, routes: routes.length, amount: fee, currency: 'USD' },
  });
  return { ok: true, id: aircraftId };
}

/** Rent for an extension: what the market pays today for an aircraft of this age. */
export const extensionRentUsd = (a: Aircraft, time: SimTime): number =>
  Math.round(typicalRentUsd(getAircraftType(a.typeId), ageOf(a, time), yearOf(time)) / 1000) * 1000;

export function extendLease(state: GameState, airlineId: string, aircraftId: string, years: number): Result {
  const a = state.aircraft[aircraftId];
  if (!a || a.airlineId !== airlineId) return fail('aircraftUnknown');
  if (!a.lease) return fail('notLeased');
  if (!Number.isInteger(years) || years < 1 || years > 6) return fail('yearsInvalid');
  if (a.lease.endAt > addMonths(state.time, EXTEND_WINDOW_MONTHS)) return fail('extendTooEarly');
  a.lease.monthlyRent = money(extensionRentUsd(a, state.time), 'USD');
  a.lease.endAt = addMonths(a.lease.endAt, years * 12);
  a.lease.warned = false;
  postMessage(state, {
    airlineId,
    kind: 'leaseExtended',
    level: 'info',
    params: { registration: a.registration, endAt: a.lease.endAt, amount: a.lease.monthlyRent.amount, currency: 'USD' },
  });
  return { ok: true, id: aircraftId };
}

/** Days before the end of a lease when the player is reminded. */
const LEASE_WARNING_DAYS = 90;

/** Daily: payments to manufacturers, lease reminders and leases that end today. */
export function dailyFleetStep(state: GameState, world: EngineWorld): void {
  payDueOrders(state);
  for (const a of Object.values(state.aircraft)) {
    if (!a.lease) continue;
    if (a.lease.endAt <= state.time) {
      returnLeased(state, world, a.airlineId, a.id, false);
    } else if (!a.lease.warned && a.lease.endAt - state.time <= LEASE_WARNING_DAYS * MINUTES_PER_DAY) {
      a.lease.warned = true;
      postMessage(state, {
        airlineId: a.airlineId,
        kind: 'leaseEnding',
        level: 'caution',
        params: { registration: a.registration, type: getAircraftType(a.typeId).name, endAt: a.lease.endAt },
      });
    }
  }
}

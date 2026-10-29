// Moves the world forward in time. All three time modes use this one function:
// real-time calls it in small steps, turn-based mode a week at a time, real-clock mode catches up.
import { worldMonthlyStep } from './worldEvents';
import { refreshPartners } from './takeover';
import { startupsMonthly, withStartups } from './startups';
import { paintOnDelivery, repaintDone } from './livery';
import { getAircraftType } from '../data/aircraft';
import { book, postMessage, schedule } from './core';
import { refreshMarket } from './market';
import { completeOrder } from './fleet';
import { failureStarts, finishCheck, hangarReady } from './maintenance';
import { money } from './money';
import { dailyStep } from './operations';
import type { GameState, ScheduledEvent } from './state';
import { daysInMonth, MINUTES_PER_DAY, startOfNextMonth, type SimTime } from './time';
import type { EngineWorld } from './world';

/** The world a game sees at its current time (historical games: the airports and carriers of that date). */
export type WorldProvider = (state: GameState) => EngineWorld;

/** Processes every scheduled event up to `until` (in time order), then sets the clock to `until`. */
export function advance(state: GameState, world: EngineWorld | WorldProvider, until: SimTime): void {
  while (state.queue.length && state.queue[0]!.at <= until) {
    const event = state.queue.shift()!;
    state.time = Math.max(state.time, event.at);
    // Fictional startups founded in this game fly alongside the real airlines (Phase 6.4).
    handle(state, withStartups(typeof world === 'function' ? world(state) : world, state), event);
  }
  state.time = Math.max(state.time, until);
}

function handle(state: GameState, world: EngineWorld, event: ScheduledEvent): void {
  switch (event.kind) {
    case 'dayStart':
      dailyStep(state, world);
      schedule(state, { at: state.time + MINUTES_PER_DAY, kind: 'dayStart' });
      break;
    case 'monthStart':
      worldMonthlyStep(state, world);
      refreshPartners(state, world);
      startupsMonthly(state, world);
      payMonthlyRents(state);
      refreshMarket(state);
      schedule(state, { at: startOfNextMonth(state.time), kind: 'monthStart' });
      break;
    case 'delivery':
      deliver(state, event.aircraftId);
      break;
    case 'refitDone': {
      const aircraft = state.aircraft[event.aircraftId];
      if (aircraft?.refitUntil === state.time) {
        delete aircraft.refitUntil;
        postMessage(state, { airlineId: aircraft.airlineId, kind: 'refitDone', level: 'normal', params: { registration: aircraft.registration } });
      }
      break;
    }
    case 'checkDone':
      finishCheck(state, event.aircraftId);
      break;
    case 'failure':
      failureStarts(state, world, event.aircraftId);
      break;
    case 'hangarReady':
      hangarReady(state, event.hangarId);
      break;
    case 'repaintDone':
      repaintDone(state, event.aircraftId);
      break;
    case 'loungeReady':
      if (state.airlines[event.airlineId]?.lounges?.some((l) => l.airportId === event.airportId)) {
        postMessage(state, { airlineId: event.airlineId, kind: 'loungeReady', level: 'info', params: { airport: world.airportById.get(event.airportId)?.iata ?? event.airportId } });
      }
      break;
  }
}

function deliver(state: GameState, aircraftId: string): void {
  const aircraft = state.aircraft[aircraftId];
  if (!aircraft || aircraft.status !== 'delivering') return;
  aircraft.status = 'active';
  paintOnDelivery(state, aircraft);
  // A factory order: the balance is paid now and the aircraft is owned.
  if (aircraft.order) completeOrder(state, aircraft);
  if (aircraft.lease) {
    // Rent runs from delivery: pay the rest of this month now, full months from the 1st.
    const daysLeft = (startOfNextMonth(state.time) - state.time) / 1440;
    const share = Math.min(1, daysLeft / daysInMonth(state.time));
    const rent = money(-aircraft.lease.monthlyRent.amount * share, aircraft.lease.monthlyRent.currency);
    book(state, aircraft.airlineId, 'leaseRent', rent, aircraft.id);
  }
  postMessage(state, {
    airlineId: aircraft.airlineId,
    kind: 'delivered',
    level: 'normal',
    params: { registration: aircraft.registration, type: getAircraftType(aircraft.typeId).name, airport: aircraft.locationId },
  });
}

function payMonthlyRents(state: GameState): void {
  const totals = new Map<string, number>();
  for (const aircraft of Object.values(state.aircraft)) {
    if (aircraft.status !== 'active' || !aircraft.lease) continue;
    const paid = book(
      state,
      aircraft.airlineId,
      'leaseRent',
      money(-aircraft.lease.monthlyRent.amount, aircraft.lease.monthlyRent.currency),
      aircraft.id,
    );
    totals.set(aircraft.airlineId, (totals.get(aircraft.airlineId) ?? 0) + paid.amount);
  }
  for (const [airlineId, total] of totals) {
    const airline = state.airlines[airlineId]!;
    postMessage(state, { airlineId, kind: 'rentPaid', level: 'info', params: { amount: -total, currency: airline.currency } });
  }
}

// Small building blocks shared by all engine systems: ids, the event queue, messages and bookings.
import { convert, type Money } from './money';
import { MAX_MESSAGES, type GameMessage, type GameState, type LedgerKind, type ScheduledEvent } from './state';
import type { SimTime } from './time';

export function nextId(state: GameState, prefix: string): string {
  return `${prefix}${state.nextId++}`;
}

/** Adds an event to the queue, keeping it sorted by time (ties keep insertion order). */
export function schedule(state: GameState, event: DistributiveOmit<ScheduledEvent, 'seq'>): void {
  const entry = { ...event, seq: state.nextId++ } as ScheduledEvent;
  let i = state.queue.length;
  while (i > 0 && state.queue[i - 1]!.at > entry.at) i--;
  state.queue.splice(i, 0, entry);
}

export function postMessage(
  state: GameState,
  message: Omit<GameMessage, 'id' | 'at'> & { at?: SimTime },
): void {
  state.messages.push({ ...message, id: state.nextId++, at: message.at ?? state.time });
  if (state.messages.length > MAX_MESSAGES) state.messages.splice(0, state.messages.length - MAX_MESSAGES);
}

/**
 * Books money in or out of an airline's cash (negative = payment), converting into its
 * book currency at today's exchange rate. Returns the booked amount.
 */
export function book(state: GameState, airlineId: string, kind: LedgerKind, value: Money, ref?: string): Money {
  const airline = state.airlines[airlineId];
  if (!airline) throw new Error(`Unknown airline ${airlineId}`);
  const amount = convert(value, airline.currency, state.fx);
  const wasPositive = airline.cash.amount >= 0;
  airline.cash = { amount: airline.cash.amount + amount.amount, currency: airline.currency };
  state.ledger.push({
    at: state.time,
    airlineId,
    kind,
    amount,
    ...(value.currency !== amount.currency ? { original: value } : {}),
    ...(ref ? { ref } : {}),
  });
  if (wasPositive && airline.cash.amount < 0) {
    postMessage(state, { airlineId, kind: 'cashNegative', level: 'warning', params: {} });
  }
  return amount;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

// Changes of an airline's book currency (Phase 5.3): the euro replacing the schilling, mark, lira … (1 Jan 1999 and
// later for newer members) and re-based currencies (new Turkish lira 2005 …). Like real companies, the airline restates
// everything — cash, assets and its past accounts — at the fixed conversion rate, so the history stays comparable.
import { nextCurrencyChange } from '../data/fxHistory';
import { postMessage } from './core';
import type { GameState, PnlWeek } from './state';
import { toDate } from './time';

/** Daily: switches airlines whose currency ends today to the new one. */
export function currencyChangeStep(state: GameState): void {
  const today = toDate(state.time).toISOString().slice(0, 10);
  for (const airline of Object.values(state.airlines)) {
    for (let change = nextCurrencyChange(airline.currency); change && change.on <= today && state.fx[change.to]; change = nextCurrencyChange(airline.currency)) {
      const from = airline.currency;
      restate(state, airline.id, change.to, 1 / change.perNew);
      postMessage(state, { airlineId: airline.id, kind: 'currencyChanged', level: 'info', params: { from, to: change.to, rate: change.perNew } });
    }
  }
}

/** Converts everything an airline holds in its book currency into `to` (multiplying by `factor`). */
export function restate(state: GameState, airlineId: string, to: string, factor: number): void {
  const airline = state.airlines[airlineId]!;
  const from = airline.currency;
  const scale = (n: number) => n * factor;
  airline.currency = to;
  airline.cash = { amount: Math.round(scale(airline.cash.amount)), currency: to };
  for (const entry of state.ledger) {
    if (entry.airlineId === airlineId && entry.amount.currency === from) entry.amount = { amount: Math.round(scale(entry.amount.amount)), currency: to };
  }
  const fin = state.finance[airlineId];
  if (fin) for (const p of [fin.week, fin.month, ...fin.history, ...fin.months]) restatePeriod(p, factor);
  for (const a of Object.values(state.aircraft)) {
    if (a.airlineId !== airlineId) continue;
    if (a.owned) {
      a.owned.price = scale(a.owned.price);
      a.owned.residual = scale(a.owned.residual);
    }
    if (a.cabinDepreciation) a.cabinDepreciation.perDay = scale(a.cabinDepreciation.perDay);
    if (a.maint?.amort) a.maint.amort.perDay = scale(a.maint.amort.perDay);
    for (const pay of a.order?.payments ?? []) if (pay.paid !== undefined) pay.paid = scale(pay.paid);
  }
  for (const h of Object.values(state.hangars)) if (h.airlineId === airlineId) h.price = scale(h.price);
}

function restatePeriod(p: PnlWeek, factor: number): void {
  for (const key of Object.keys(p.lines) as (keyof PnlWeek['lines'])[]) p.lines[key] *= factor;
  for (const r of Object.values(p.routes)) {
    r.revenue *= factor;
    r.directCosts *= factor;
    for (const c of Object.values(r.classes ?? {})) c.revenue *= factor;
  }
}

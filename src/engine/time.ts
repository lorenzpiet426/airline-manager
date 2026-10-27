// Simulation time is one number: whole minutes since 1 January 1950, 00:00 UTC.
// A number is easy to save, compare and add to; airports' time zones turn it into local time.

export type SimTime = number;

const EPOCH_MS = Date.UTC(1950, 0, 1);
export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = 1440;

export const fromDate = (date: Date): SimTime => Math.floor((date.getTime() - EPOCH_MS) / 60_000);
export const toDate = (time: SimTime): Date => new Date(EPOCH_MS + time * 60_000);

/** Simulation time for a UTC calendar date (month 1–12; overflowing months roll into the next year). */
export function simTime(year: number, month: number, day = 1, hour = 0, minute = 0): SimTime {
  return fromDate(new Date(Date.UTC(year, month - 1, day, hour, minute)));
}

export const yearOf = (time: SimTime): number => toDate(time).getUTCFullYear();

export const startOfDay = (time: SimTime): SimTime => Math.floor(time / MINUTES_PER_DAY) * MINUTES_PER_DAY;

export function startOfNextMonth(time: SimTime): SimTime {
  const d = toDate(time);
  return simTime(d.getUTCFullYear(), d.getUTCMonth() + 2, 1);
}

export function daysInMonth(time: SimTime): number {
  const d = toDate(time);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

export const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

/** Monday 00:00 UTC of the week containing `time` (1 January 1950 was a Sunday). */
export function startOfWeek(time: SimTime): SimTime {
  const day = Math.floor(time / MINUTES_PER_DAY);
  return (day - ((day + 6) % 7)) * MINUTES_PER_DAY;
}

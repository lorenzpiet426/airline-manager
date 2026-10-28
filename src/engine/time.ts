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

export function startOfMonth(time: SimTime): SimTime {
  const d = toDate(time);
  return simTime(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

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

const offsetCache = new Map<string, number>();
const offsetFormats = new Map<string, Intl.DateTimeFormat>();

/** Offset of a time zone from UTC in minutes on the day of `time` (Vienna: +60 in winter, +120 in summer). */
export function utcOffsetMin(timeZone: string, time: SimTime): number {
  const day = Math.floor(time / MINUTES_PER_DAY);
  const key = `${timeZone}|${day}`;
  let offset = offsetCache.get(key);
  if (offset !== undefined) return offset;
  let format = offsetFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
    offsetFormats.set(timeZone, format);
  }
  // Noon UTC of that day, read as local wall-clock time; the difference is the offset.
  const at = toDate(day * MINUTES_PER_DAY + 720);
  const p = Object.fromEntries(format.formatToParts(at).map((x) => [x.type, x.value]));
  const local = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
  offset = Math.round((local - at.getTime()) / 60_000);
  if (offsetCache.size > 50_000) offsetCache.clear();
  offsetCache.set(key, offset);
  return offset;
}

/** Day of the week, 0 = Monday … 6 = Sunday. */
export const weekdayOf = (time: SimTime): number => (Math.floor(time / MINUTES_PER_DAY) + 6) % 7;

/** The same day and time `months` calendar months later (or earlier); a missing day becomes the month's last day. */
export function addMonths(time: SimTime, months: number): SimTime {
  const d = toDate(time);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, d.getUTCHours(), d.getUTCMinutes()));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), last));
  return fromDate(target);
}

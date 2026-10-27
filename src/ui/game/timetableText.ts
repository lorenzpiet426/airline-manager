// Timetable notation as airlines publish it: local times "07:05", "+1" for the next day, days of operation "12345··".
import { localeFor } from '../../i18n/format';
import type { Language } from '../../settings/settings';

/** "07:05", with "+1" / "−1" when the time falls on another day. */
export function hhmm(minutes: number): { time: string; dayShift: string } {
  const shift = Math.floor(minutes / 1440);
  const m = minutes - shift * 1440;
  const time = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return { time, dayShift: shift > 0 ? `+${shift}` : shift < 0 ? `−${-shift}` : '' };
}

export const hhmmText = (minutes: number) => {
  const { time, dayShift } = hhmm(minutes);
  return dayShift ? `${time}${dayShift}` : time;
};

/** "07:05" → 425 (null if not a time). */
export function parseHhmm(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** Days of operation as in airline timetables: 1 = Monday … 7 = Sunday, "·" for days without the flight. */
export const daysText = (days: number) => [0, 1, 2, 3, 4, 5, 6].map((d) => (days & (1 << d) ? String(d + 1) : '·')).join('');

/** Short weekday names, Monday first ("Mo", "Di" …). 5 January 2026 is a Monday. */
export function weekdayNames(language: Language, width: 'short' | 'narrow' = 'short'): string[] {
  const format = new Intl.DateTimeFormat(localeFor(language), { weekday: width, timeZone: 'UTC' });
  return [0, 1, 2, 3, 4, 5, 6].map((d) => format.format(new Date(Date.UTC(2026, 0, 5 + d))));
}

/** "2 h 05" */
export const durationText = (minutes: number) => `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;

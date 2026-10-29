// Night flying restrictions (Phase 7.2), entered by hand from Wikipedia ("Night flying restrictions" and the airports'
// articles, read 2026-10-29) and the airports' published rules. Times are local. A "ban" closes the airport to scheduled
// flights (no departures or arrivals may be planned); a "quota" period allows flights but each costs a night noise
// charge (the noisiest types are banned, the number is capped). Among the world's ~100 busiest airports the others have
// no general night restriction (Vienna, Madrid, Dubai, Singapore, Hong Kong, Haneda, the big US hubs …).

export interface Curfew {
  /** Airport id (ICAO). */
  id: string;
  kind: 'ban' | 'quota';
  /** Local times "HH:MM": from (inclusive) until (exclusive), across midnight. */
  from: string;
  until: string;
  /** First year with this rule (absent = for as long as the game goes back). */
  since?: number;
  note: string;
}

export const CURFEWS: readonly Curfew[] = [
  // Germany: night bans at the big airports (federal courts, state permits).
  { id: 'EDDF', kind: 'ban', from: '23:00', until: '05:00', since: 2011, note: 'Frankfurt: night flight ban since Oct 2011 (Federal Administrative Court 2012)' },
  { id: 'EDDF', kind: 'quota', from: '22:00', until: '23:00', since: 2011, note: 'Frankfurt: limited flights 22–23 and 05–06' },
  { id: 'EDDF', kind: 'quota', from: '05:00', until: '06:00', since: 2011, note: 'Frankfurt: limited flights 22–23 and 05–06' },
  { id: 'EDDM', kind: 'ban', from: '00:00', until: '05:00', note: 'Munich: core night without scheduled flights' },
  { id: 'EDDL', kind: 'ban', from: '23:00', until: '06:00', note: 'Düsseldorf: night restrictions (home-based carriers until 23:30 only when delayed)' },
  { id: 'EDDH', kind: 'ban', from: '23:00', until: '06:00', note: 'Hamburg: night flight restrictions' },
  { id: 'EDDB', kind: 'ban', from: '00:00', until: '05:00', since: 2020, note: 'Berlin Brandenburg: core night 00–05' },
  { id: 'EDDS', kind: 'ban', from: '23:30', until: '06:00', note: 'Stuttgart: night flight restrictions' },
  // Switzerland
  { id: 'LSZH', kind: 'ban', from: '23:30', until: '06:00', since: 2010, note: 'Zurich: curfew since July 2010 (23:00–23:30 only to clear delays)' },
  { id: 'LSGG', kind: 'ban', from: '00:00', until: '06:00', note: 'Geneva: no scheduled flights after midnight' },
  // France, Benelux, Italy
  { id: 'LFPO', kind: 'ban', from: '23:30', until: '06:00', since: 1968, note: 'Paris-Orly: curfew 23:30–06:00' },
  { id: 'EHAM', kind: 'quota', from: '23:00', until: '07:00', note: 'Amsterdam: night period with a capped number of flights' },
  { id: 'EBBR', kind: 'quota', from: '23:00', until: '06:00', note: 'Brussels: night quota and noise limits' },
  { id: 'LIML', kind: 'ban', from: '23:00', until: '06:00', note: 'Milan Linate: closed at night' },
  // United Kingdom: night quota period (Heathrow: practically no scheduled flights before 04:30)
  { id: 'EGLL', kind: 'ban', from: '23:30', until: '04:30', note: 'Heathrow: night quota period 23:30–06:00, first scheduled arrivals ≈ 04:30' },
  { id: 'EGLL', kind: 'quota', from: '04:30', until: '06:00', note: 'Heathrow: early-morning quota arrivals' },
  { id: 'EGKK', kind: 'quota', from: '23:30', until: '06:00', note: 'Gatwick: night quota period' },
  { id: 'EGSS', kind: 'quota', from: '23:30', until: '06:00', note: 'Stansted: night quota period' },
  { id: 'EGLC', kind: 'ban', from: '22:30', until: '06:30', since: 1987, note: 'London City: closed at night (and most of the weekend)' },
  { id: 'EIDW', kind: 'quota', from: '23:00', until: '07:00', since: 2022, note: 'Dublin: night limits on the north runway' },
  // Asia and Oceania
  { id: 'RJAA', kind: 'ban', from: '00:00', until: '06:00', since: 1978, note: 'Tokyo Narita: curfew (from opening in 1978)' },
  { id: 'RJOO', kind: 'ban', from: '21:00', until: '07:00', note: 'Osaka Itami: domestic airport closed at night' },
  { id: 'RKSS', kind: 'ban', from: '23:00', until: '06:00', note: 'Seoul Gimpo: curfew 23–06' },
  { id: 'RCSS', kind: 'ban', from: '23:00', until: '06:00', note: 'Taipei Songshan: curfew' },
  { id: 'YSSY', kind: 'ban', from: '23:00', until: '06:00', since: 1995, note: 'Sydney: Sydney Airport Curfew Act 1995' },
  { id: 'YPAD', kind: 'ban', from: '23:00', until: '06:00', note: 'Adelaide: curfew' },
  // Americas
  { id: 'KSNA', kind: 'ban', from: '22:00', until: '07:00', since: 1985, note: 'Orange County John Wayne: departures banned at night' },
  { id: 'KSAN', kind: 'ban', from: '23:30', until: '06:30', note: 'San Diego: no departures 23:30–06:30' },
  { id: 'KLGB', kind: 'ban', from: '23:00', until: '07:00', note: 'Long Beach: noise curfew' },
  { id: 'CYTZ', kind: 'ban', from: '23:00', until: '06:45', note: 'Toronto Billy Bishop: curfew' },
];

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

const byAirport = new Map<string, Curfew[]>();
for (const c of CURFEWS) byAirport.set(c.id, [...(byAirport.get(c.id) ?? []), c]);

/** The airport's restrictions in force in `year`. */
export const curfewsAt = (airportId: string, year: number): Curfew[] => (byAirport.get(airportId) ?? []).filter((c) => !c.since || year >= c.since);

/** The restriction a local time (minutes after midnight) falls into, if any. */
export function curfewAtTime(airportId: string, localMinute: number, year: number): Curfew | null {
  const m = ((localMinute % 1440) + 1440) % 1440;
  for (const c of curfewsAt(airportId, year)) {
    const a = minutes(c.from);
    const b = minutes(c.until);
    if (a < b ? m >= a && m < b : m >= a || m < b) return c;
  }
  return null;
}

/** Does the airport have any night restriction (in any year)? (A quick test before working out times.) */
export const hasCurfews = (airportId: string): boolean => byAirport.has(airportId);

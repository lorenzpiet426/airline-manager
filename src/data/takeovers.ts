// Takeover scenarios (Phase 6.2, past years 6.4): real airlines the player can run as CEO, with what open data doesn't
// say filled in as "modelled" facts (see docs/DATA_SOURCES.md). Today's fleet registrations come from the official
// registers, the routes from Wikipedia + Eurostat (networks.json); the rest is here.
import { QUALIFLYER, STAR_ALLIANCE, type Membership } from './alliances';

/**
 * A fleet line of a past year: `count` aircraft of a type from `from` until `until` (the year it left; null = still
 * flying). New aircraft arrive over the first three years, old ones leave over the last two, unless `atOnce` (a whole
 * fleet taken over from another airline). `series` = the registration series (OE-L + letter).
 */
export interface FleetEra {
  type: string;
  from: number;
  until: number | null;
  count: number;
  series: string;
  atOnce?: boolean;
  /** "wikipedia" when the count is stated there, else "modelled". */
  source: 'wikipedia' | 'modelled';
}

export interface TakeoverScenario {
  /** The real airline's id in airlines.json. */
  realId: string;
  /** Cash at the start (euro): the airline's own balance sheet isn't published, ≈ 15 % of yearly revenue. */
  cashEur: number;
  /** First and last build year per type (the registers give no years for these aircraft): spread over the fleet. */
  builtYears: Record<string, [number, number]>;
  /** Types flown on lease: the lessor and the years until the leases end (spread over the aircraft). */
  leased: Record<string, { lessor: string; endYears: [number, number] }>;
  /** Aircraft allocated by the group and still to come: leased from the group on delivery, one a month. */
  incoming: { typeId: string; count: number; seats: number }[];
  /** Months from the start until the first incoming aircraft arrives. */
  firstIncomingMonths: number;
  /** The group whose airlines are partners (by the `parent` field), plus partners outside that field. */
  group: string;
  extraPartners: string[];
  /** Approximate livery (no logo): the airline's real colours. */
  livery: { tail: 'solid' | 'band' | 'split'; titles: string };
  /** The day the airline joined `group` (before: no group partners). */
  groupFrom: string;
  /** Subsidiaries and partners outside the group's parent field, with their periods. */
  ownGroup: readonly Membership[];
  /** Alliances: the airline's partners are the other members while it is a member itself. */
  alliances: readonly (readonly Membership[])[];
  /** Phase 6.4: the airline's own fleet over the years (takeovers in past years). */
  fleetHistory: readonly FleetEra[];
  /** Phase 7.3: its own lounges at the hub today (seats in all of them, quality); past years scaled with the fleet. */
  hubLounge: { seats: number; quality: 'standard' | 'premium' | 'flagship' };
  /** The group's frequent-flyer programme the airline belongs to, from a year (Phase 9.4). */
  loyalty?: { name: string; from: number };
}

export const TAKEOVERS: Record<string, TakeoverScenario> = {
  AUA: {
    realId: 'AUA',
    // Revenue 2024: €2,457 m (Lufthansa Group annual report 2024).
    cashEur: 350_000_000,
    builtYears: {
      A320: [1999, 2016],
      A20N: [2017, 2024],
      A321: [1998, 2008],
      B763: [1991, 2004],
      B772: [1997, 2007],
      B789: [2018, 2023],
      E195: [2008, 2012],
    },
    leased: {
      // The Embraer 195s leave the fleet by 2028 (Austrian's fleet plan); here as leases ending 2027–2028.
      E195: { lessor: 'Lufthansa Group', endYears: [0.6, 1.7] },
      A20N: { lessor: 'Lufthansa Group', endYears: [8, 12] },
      B789: { lessor: 'Lufthansa Group', endYears: [8, 12] },
    },
    // A320neo-family allocation for the European fleet renewal (Wikipedia fleet table: 11 A320neo + 6 A321neo on order).
    incoming: [
      { typeId: 'A20N', count: 11, seats: 180 },
      { typeId: 'A21N', count: 6, seats: 215 },
    ],
    firstIncomingMonths: 2,
    group: 'Lufthansa Group',
    // Lufthansa City Airlines (2024) and ITA Airways (Lufthansa share since 2025); Edelweiss via SWISS.
    extraPartners: ['LHX', 'ITY'],
    livery: { tail: 'band', titles: 'Austrian' },
    // Lufthansa took over Austrian in September 2009 (EU approval 28 Aug 2009, closing 3 Sep 2009).
    groupFrom: '2009-09-03',
    ownGroup: [
      // Tyrolean: 85.7 % from December 1997, wholly owned from 1999; merged into Austrian on 1 April 2015 (here from
      // 1 January 2015, when its fleet lines below begin).
      { id: 'Q660191', from: '1997-12-01', until: '2015-01-01' },
      // Lauda Air: 35 % from March 1997, majority from January 2001; flights integrated October 2004, merged 2012.
      { id: 'Q1807298', from: '2001-01-01', until: '2013-04-15' },
    ],
    alliances: [QUALIFLYER, STAR_ALLIANCE],
    // Austrian's business and Senator lounges at Vienna (several, ≈ 600 seats in all; modelled from the airport's plans).
    hubLounge: { seats: 600, quality: 'premium' },
    // Austrian's passengers earn and burn Miles & More (the Lufthansa Group's programme; certain at least since Austrian
    // joined the group in 2009).
    loyalty: { name: 'Miles & More', from: 2009 },
    // Wikipedia (EN "Austrian Airlines" history + historical fleet table, DE "Austrian Airlines" Geschichte/Flotte):
    // years from the historical fleet table, counts where the text states them, otherwise modelled.
    fleetHistory: [
      { type: 'VISC', from: 1960, until: 1971, count: 6, series: 'A', source: 'wikipedia' }, // six Viscount 837
      { type: 'S210', from: 1963, until: 1973, count: 4, series: 'C', source: 'modelled' }, // Caravelle until 1973
      { type: 'A748', from: 1966, until: 1969, count: 2, series: 'H', source: 'wikipedia' }, // two HS 748
      { type: 'DC93', from: 1971, until: 1990, count: 9, series: 'D', source: 'wikipedia' }, // nine DC-9-32
      { type: 'DC95', from: 1975, until: 1985, count: 5, series: 'D', source: 'wikipedia' }, // five DC-9-51
      { type: 'MD82', from: 1980, until: 2005, count: 13, series: 'D', source: 'wikipedia' }, // 13 MD-81 (6 → MD-82)
      { type: 'MD82', from: 1990, until: 2005, count: 2, series: 'M', source: 'modelled' }, // MD-83
      { type: 'MD87', from: 1987, until: 2005, count: 5, series: 'M', source: 'modelled' },
      { type: 'A310', from: 1988, until: 2004, count: 4, series: 'A', source: 'modelled' }, // first long-haul, JFK 1989
      { type: 'F50', from: 1988, until: 1996, count: 3, series: 'F', source: 'modelled' },
      { type: 'F70', from: 1995, until: 2004, count: 6, series: 'F', source: 'modelled' }, // the last three went to Tyrolean
      { type: 'A342', from: 1995, until: 2007, count: 2, series: 'A', source: 'modelled' },
      { type: 'A343', from: 1997, until: 2007, count: 2, series: 'A', source: 'wikipedia' }, // four A340 in all
      { type: 'A332', from: 1998, until: 2007, count: 4, series: 'A', source: 'wikipedia' }, // four A330
      { type: 'A321', from: 1995, until: null, count: 3, series: 'B', source: 'wikipedia' }, // A321-100 (DE fleet table)
      { type: 'A321', from: 1999, until: null, count: 3, series: 'B', source: 'wikipedia' }, // A321-200
      { type: 'A320', from: 1995, until: null, count: 7, series: 'B', source: 'modelled' },
      { type: 'A320', from: 2012, until: null, count: 8, series: 'B', source: 'wikipedia' }, // replaced the 737s
      { type: 'A320', from: 2017, until: null, count: 5, series: 'X', source: 'wikipedia', atOnce: true }, // ex Air Berlin
      { type: 'A320', from: 2019, until: null, count: 9, series: 'B', source: 'modelled' }, // 29 in 2026
      { type: 'A319', from: 2004, until: 2022, count: 7, series: 'D', source: 'modelled' },
      // Lauda Air's flights became Austrian's in October 2004: its Boeings joined the fleet at once.
      { type: 'B738', from: 2004, until: 2013, count: 7, series: 'N', source: 'modelled', atOnce: true },
      { type: 'B737', from: 2004, until: 2013, count: 2, series: 'N', source: 'modelled', atOnce: true },
      { type: 'B736', from: 2004, until: 2012, count: 2, series: 'N', source: 'modelled', atOnce: true }, // 11 Boeing 737
      { type: 'B763', from: 2004, until: 2020, count: 3, series: 'A', source: 'modelled', atOnce: true },
      { type: 'B763', from: 2004, until: 2025, count: 1, series: 'A', source: 'modelled', atOnce: true },
      { type: 'B763', from: 2004, until: null, count: 2, series: 'A', source: 'wikipedia', atOnce: true }, // 2 left in 2026
      { type: 'B772', from: 2004, until: null, count: 4, series: 'P', source: 'modelled', atOnce: true },
      { type: 'B772', from: 2014, until: null, count: 1, series: 'P', source: 'wikipedia' }, // fifth 777 in 2014
      { type: 'B772', from: 2018, until: null, count: 1, series: 'P', source: 'wikipedia' }, // sixth in 2018
      // Tyrolean merged into Austrian on 1 April 2015: its Dash 8 and Fokker fleets (23 Fokker), replaced by 17 E195.
      { type: 'DH8D', from: 2015, until: 2021, count: 18, series: 'G', source: 'modelled', atOnce: true },
      { type: 'F70', from: 2015, until: 2017, count: 9, series: 'F', source: 'modelled', atOnce: true },
      { type: 'F100', from: 2015, until: 2018, count: 15, series: 'V', source: 'modelled', atOnce: true },
      { type: 'E195', from: 2016, until: null, count: 13, series: 'W', source: 'wikipedia' },
      { type: 'E195', from: 2016, until: 2025, count: 4, series: 'W', source: 'wikipedia' }, // 17, 13 left in 2026
      { type: 'A20N', from: 2023, until: null, count: 7, series: 'Z', source: 'wikipedia' },
      { type: 'B789', from: 2024, until: null, count: 4, series: 'P', source: 'wikipedia' },
    ],
  },
};

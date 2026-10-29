// Takeover scenarios (Phase 6.2): real airlines the player can run as CEO, with what open data doesn't say filled in
// as "modelled" facts (see docs/DATA_SOURCES.md). The fleet's registrations come from the official registers, the routes
// from Wikipedia + Eurostat (networks.json); the rest is here.

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
  },
};

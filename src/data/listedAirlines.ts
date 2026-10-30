// Listed airlines and airline groups (Phase 10.5): which real airlines have shares on a stock exchange, from when to when,
// which airlines belong to them, how big they are and who their big shareholders are. Revenue, margin and market value
// are rounded figures of one fiscal year from the companies' annual reports and stock exchange prices of that time
// (approximate; the game moves them with its own economy afterwards). Big shareholders: governments, founders' families
// and other airlines, which don't sell their stakes on the market (see docs/DATA_SOURCES.md).

export type BlockHolderKind = 'state' | 'airline' | 'founder' | 'investor';

export interface BlockHolder {
  kind: BlockHolderKind;
  name: string;
  share: number;
  from: number;
  to?: number;
}

export interface ListedAirline {
  id: string;
  name: string;
  /** The airlines (ids in airlines.json) the company owns, with the years it owned them. */
  members: { id: string; from?: number; to?: number }[];
  /** Country whose ownership rules apply (where the main airline is licensed). */
  country: string;
  /** Years on the stock exchange: first and last (null = still listed). */
  listed: [number, number | null];
  /** The fiscal year of the figures below. */
  fy: number;
  /** Revenue and market value in billion euros, operating margin (share of revenue), shares in millions. */
  revenueEur: number;
  marketCapEur: number;
  margin: number;
  sharesM: number;
  holders: BlockHolder[];
}

const L = (x: ListedAirline) => x;

export const LISTED_AIRLINES: readonly ListedAirline[] = [
  // ─── Europe ───
  L({ id: 'LHA', name: 'Deutsche Lufthansa AG', country: 'DE', listed: [1966, null], fy: 2024, revenueEur: 37.6, marketCapEur: 8.5, margin: 0.045, sharesM: 1196,
    members: [{ id: 'DLH' }, { id: 'CLH' }, { id: 'SWR', from: 2005 }, { id: 'EDW', from: 2005 }, { id: 'AUA', from: 2009 }, { id: 'BEL', from: 2017 }, { id: 'EWG', from: 2011 }, { id: 'DLA', from: 2003 }],
    holders: [
      { kind: 'state', name: 'Federal Republic of Germany', share: 0.52, from: 1966, to: 1994 },
      { kind: 'state', name: 'Federal Republic of Germany', share: 0.36, from: 1994, to: 1997 },
      { kind: 'state', name: 'Economic Stabilisation Fund (WSF)', share: 0.2, from: 2020, to: 2022 },
    ] }),
  L({ id: 'AF', name: 'Air France', country: 'FR', listed: [1999, 2004], fy: 2003, revenueEur: 12.3, marketCapEur: 3.0, margin: 0.02, sharesM: 219,
    members: [{ id: 'AFR' }],
    holders: [{ kind: 'state', name: 'French Republic', share: 0.54, from: 1999 }] }),
  L({ id: 'KLM', name: 'KLM Royal Dutch Airlines', country: 'NL', listed: [1970, 2004], fy: 2003, revenueEur: 6.5, marketCapEur: 0.8, margin: 0.01, sharesM: 47,
    members: [{ id: 'KLM' }, { id: 'TRA', from: 1991 }],
    holders: [{ kind: 'state', name: 'Kingdom of the Netherlands', share: 0.25, from: 1970, to: 1998 }, { kind: 'state', name: 'Kingdom of the Netherlands', share: 0.14, from: 1998 }] }),
  L({ id: 'AFKL', name: 'Air France-KLM', country: 'FR', listed: [2004, null], fy: 2024, revenueEur: 31.5, marketCapEur: 3.0, margin: 0.05, sharesM: 263,
    members: [{ id: 'AFR' }, { id: 'KLM' }, { id: 'TRA' }, { id: 'TVF', from: 2007 }],
    holders: [
      { kind: 'state', name: 'French Republic', share: 0.18, from: 2004, to: 2021 },
      { kind: 'state', name: 'French Republic', share: 0.28, from: 2021 },
      { kind: 'state', name: 'Kingdom of the Netherlands', share: 0.093, from: 2019 },
      { kind: 'investor', name: 'CMA CGM', share: 0.09, from: 2022 },
      { kind: 'airline', name: 'China Eastern Airlines', share: 0.047, from: 2017 },
      { kind: 'airline', name: 'Delta Air Lines', share: 0.029, from: 2017 },
    ] }),
  L({ id: 'BA', name: 'British Airways plc', country: 'GB', listed: [1987, 2010], fy: 2010, revenueEur: 9.6, marketCapEur: 3.5, margin: 0.03, sharesM: 1150,
    members: [{ id: 'BAW' }], holders: [] }),
  L({ id: 'IB', name: 'Iberia', country: 'ES', listed: [2001, 2010], fy: 2010, revenueEur: 4.6, marketCapEur: 3.0, margin: 0.02, sharesM: 950,
    members: [{ id: 'IBE' }, { id: 'IBS' }],
    holders: [{ kind: 'investor', name: 'Caja Madrid', share: 0.23, from: 2001 }, { kind: 'airline', name: 'British Airways', share: 0.13, from: 2001 }] }),
  L({ id: 'IAG', name: 'International Airlines Group', country: 'ES', listed: [2011, null], fy: 2024, revenueEur: 32.1, marketCapEur: 20, margin: 0.11, sharesM: 4900,
    members: [{ id: 'BAW' }, { id: 'IBE' }, { id: 'IBS' }, { id: 'VLG', from: 2013 }, { id: 'EIN', from: 2015 }],
    holders: [{ kind: 'airline', name: 'Qatar Airways', share: 0.25, from: 2016 }] }),
  L({ id: 'VLG', name: 'Vueling Airlines', country: 'ES', listed: [2006, 2012], fy: 2012, revenueEur: 1.4, marketCapEur: 0.25, margin: 0.05, sharesM: 30,
    members: [{ id: 'VLG' }], holders: [{ kind: 'airline', name: 'Iberia', share: 0.45, from: 2009 }] }),
  L({ id: 'EIN', name: 'Aer Lingus Group', country: 'IE', listed: [2006, 2014], fy: 2014, revenueEur: 1.6, marketCapEur: 0.9, margin: 0.05, sharesM: 534,
    members: [{ id: 'EIN' }],
    holders: [{ kind: 'state', name: 'Ireland', share: 0.25, from: 2006 }, { kind: 'airline', name: 'Ryanair', share: 0.298, from: 2006 }] }),
  L({ id: 'RYA', name: 'Ryanair Holdings', country: 'IE', listed: [1997, null], fy: 2025, revenueEur: 13.95, marketCapEur: 28, margin: 0.12, sharesM: 1063,
    members: [{ id: 'RYR' }, { id: 'LDA', from: 2019 }, { id: 'RYS', from: 2019 }, { id: 'MAY', from: 2019 }],
    holders: [{ kind: 'founder', name: "Michael O'Leary", share: 0.04, from: 1997 }] }),
  L({ id: 'EZJ', name: 'easyJet plc', country: 'GB', listed: [2000, null], fy: 2024, revenueEur: 11.0, marketCapEur: 4.2, margin: 0.07, sharesM: 757,
    members: [{ id: 'EZY' }, { id: 'EZS' }, { id: 'EJU', from: 2017 }],
    holders: [{ kind: 'founder', name: 'Stelios Haji-Ioannou and family', share: 0.15, from: 2000 }] }),
  L({ id: 'WIZZ', name: 'Wizz Air Holdings', country: 'HU', listed: [2015, null], fy: 2025, revenueEur: 5.3, marketCapEur: 1.6, margin: 0.04, sharesM: 103,
    members: [{ id: 'WZZ' }, { id: 'WUK', from: 2017 }, { id: 'WMT', from: 2022 }],
    holders: [{ kind: 'investor', name: 'Indigo Partners', share: 0.18, from: 2015 }] }),
  L({ id: 'NAS', name: 'Norwegian Air Shuttle', country: 'NO', listed: [2003, null], fy: 2024, revenueEur: 3.0, marketCapEur: 1.2, margin: 0.06, sharesM: 1000,
    members: [{ id: 'NOZ' }, { id: 'NSZ', from: 2013 }, { id: 'WIF', from: 2024 }], holders: [] }),
  L({ id: 'FIA', name: 'Finnair', country: 'FI', listed: [1989, null], fy: 2024, revenueEur: 3.07, marketCapEur: 0.5, margin: 0.04, sharesM: 205,
    members: [{ id: 'FIN' }],
    holders: [{ kind: 'state', name: 'Republic of Finland', share: 0.7, from: 1989, to: 2005 }, { kind: 'state', name: 'Republic of Finland', share: 0.56, from: 2005 }] }),
  L({ id: 'SAS', name: 'SAS AB', country: 'SE', listed: [2001, 2024], fy: 2023, revenueEur: 4.1, marketCapEur: 0.3, margin: -0.02, sharesM: 380,
    members: [{ id: 'SAS' }],
    holders: [{ kind: 'state', name: 'Governments of Sweden, Denmark and Norway', share: 0.5, from: 2001, to: 2018 }, { kind: 'state', name: 'Governments of Sweden and Denmark', share: 0.43, from: 2018 }] }),
  L({ id: 'AEG', name: 'Aegean Airlines', country: 'GR', listed: [2007, null], fy: 2024, revenueEur: 1.7, marketCapEur: 1.2, margin: 0.1, sharesM: 90,
    members: [{ id: 'AEE' }, { id: 'OAL', from: 2013 }],
    holders: [{ kind: 'founder', name: 'Vassilakis family', share: 0.33, from: 2007 }] }),
  L({ id: 'ICE', name: 'Icelandair Group', country: 'IS', listed: [2005, null], fy: 2024, revenueEur: 1.5, marketCapEur: 0.3, margin: 0.02, sharesM: 41000,
    members: [{ id: 'ICE' }], holders: [] }),
  L({ id: 'JET2', name: 'Jet2 plc', country: 'GB', listed: [1988, null], fy: 2025, revenueEur: 8.4, marketCapEur: 3.5, margin: 0.07, sharesM: 215,
    members: [{ id: 'EXS', from: 2003 }],
    holders: [{ kind: 'founder', name: 'Philip Meeson', share: 0.17, from: 1988 }] }),
  L({ id: 'THY', name: 'Turkish Airlines', country: 'TR', listed: [1990, null], fy: 2024, revenueEur: 21, marketCapEur: 10, margin: 0.09, sharesM: 1380,
    members: [{ id: 'THY' }],
    holders: [
      { kind: 'state', name: 'Republic of Türkiye', share: 0.98, from: 1990, to: 2004 },
      { kind: 'state', name: 'Republic of Türkiye', share: 0.75, from: 2004, to: 2006 },
      { kind: 'state', name: 'Türkiye Wealth Fund', share: 0.49, from: 2006 },
    ] }),
  L({ id: 'PGS', name: 'Pegasus Airlines', country: 'TR', listed: [2013, null], fy: 2024, revenueEur: 3.1, marketCapEur: 2.5, margin: 0.12, sharesM: 500,
    members: [{ id: 'PGT' }], holders: [{ kind: 'founder', name: 'Esas Holding', share: 0.63, from: 2013 }] }),
  // ─── Americas ───
  L({ id: 'DAL', name: 'Delta Air Lines', country: 'US', listed: [1970, null], fy: 2024, revenueEur: 57, marketCapEur: 33, margin: 0.1, sharesM: 645, members: [{ id: 'DAL' }], holders: [] }),
  L({ id: 'UAL', name: 'United Airlines Holdings', country: 'US', listed: [1970, null], fy: 2024, revenueEur: 53, marketCapEur: 28, margin: 0.09, sharesM: 328, members: [{ id: 'UAL' }], holders: [] }),
  L({ id: 'AAL', name: 'American Airlines Group', country: 'US', listed: [1970, null], fy: 2024, revenueEur: 50, marketCapEur: 8, margin: 0.05, sharesM: 657, members: [{ id: 'AAL' }], holders: [] }),
  L({ id: 'LUV', name: 'Southwest Airlines', country: 'US', listed: [1971, null], fy: 2024, revenueEur: 25.5, marketCapEur: 15, margin: 0.02, sharesM: 600, members: [{ id: 'SWA' }], holders: [] }),
  L({ id: 'ALK', name: 'Alaska Air Group', country: 'US', listed: [1970, null], fy: 2024, revenueEur: 10.8, marketCapEur: 5, margin: 0.07, sharesM: 125, members: [{ id: 'ASA' }], holders: [] }),
  L({ id: 'JBLU', name: 'JetBlue Airways', country: 'US', listed: [2002, null], fy: 2024, revenueEur: 8.6, marketCapEur: 1.5, margin: -0.02, sharesM: 350, members: [{ id: 'JBU' }], holders: [] }),
  L({ id: 'AC', name: 'Air Canada', country: 'CA', listed: [1988, null], fy: 2024, revenueEur: 15, marketCapEur: 4, margin: 0.08, sharesM: 358, members: [{ id: 'ACA' }], holders: [] }),
  L({ id: 'LTM', name: 'LATAM Airlines Group', country: 'CL', listed: [1997, null], fy: 2024, revenueEur: 11.8, marketCapEur: 10, margin: 0.11, sharesM: 604000,
    members: [{ id: 'LAN' }], holders: [{ kind: 'airline', name: 'Delta Air Lines', share: 0.1, from: 2020 }] }),
  L({ id: 'COPA', name: 'Copa Holdings', country: 'PA', listed: [2005, null], fy: 2024, revenueEur: 3.2, marketCapEur: 4, margin: 0.18, sharesM: 41, members: [{ id: 'CMP' }], holders: [] }),
  // ─── Asia-Pacific, Middle East ───
  L({ id: 'QAN', name: 'Qantas Airways', country: 'AU', listed: [1995, null], fy: 2025, revenueEur: 13.4, marketCapEur: 9.5, margin: 0.11, sharesM: 1520,
    members: [{ id: 'QFA' }, { id: 'JST', from: 2004 }], holders: [] }),
  L({ id: 'SIA', name: 'Singapore Airlines', country: 'SG', listed: [1985, null], fy: 2025, revenueEur: 13.4, marketCapEur: 13.5, margin: 0.12, sharesM: 2970,
    members: [{ id: 'SIA' }], holders: [{ kind: 'state', name: 'Temasek Holdings', share: 0.53, from: 1985 }] }),
  L({ id: 'CX', name: 'Cathay Pacific Airways', country: 'HK', listed: [1986, null], fy: 2024, revenueEur: 12.3, marketCapEur: 8, margin: 0.08, sharesM: 6440,
    members: [{ id: 'CPA' }],
    holders: [{ kind: 'investor', name: 'Swire Pacific', share: 0.45, from: 1986 }, { kind: 'airline', name: 'Air China', share: 0.3, from: 2006 }] }),
  L({ id: 'ANA', name: 'ANA Holdings', country: 'JP', listed: [1970, null], fy: 2024, revenueEur: 13.9, marketCapEur: 8.5, margin: 0.09, sharesM: 470, members: [{ id: 'ANA' }], holders: [] }),
  L({ id: 'JAL', name: 'Japan Airlines', country: 'JP', listed: [2012, null], fy: 2024, revenueEur: 11.3, marketCapEur: 7.5, margin: 0.09, sharesM: 437, members: [{ id: 'JAL' }], holders: [] }),
  L({ id: 'KAL', name: 'Korean Air', country: 'KR', listed: [1970, null], fy: 2024, revenueEur: 10.9, marketCapEur: 5, margin: 0.12, sharesM: 368,
    members: [{ id: 'KAL' }], holders: [{ kind: 'founder', name: 'Hanjin KAL', share: 0.26, from: 1970 }] }),
  L({ id: 'IGO', name: 'InterGlobe Aviation (IndiGo)', country: 'IN', listed: [2015, null], fy: 2025, revenueEur: 8.8, marketCapEur: 22, margin: 0.1, sharesM: 386,
    members: [{ id: 'IGO' }], holders: [{ kind: 'founder', name: 'InterGlobe Enterprises (Bhatia)', share: 0.38, from: 2015 }] }),
  L({ id: 'CCA', name: 'Air China', country: 'CN', listed: [2004, null], fy: 2024, revenueEur: 21, marketCapEur: 12, margin: 0.01, sharesM: 17450,
    members: [{ id: 'CCA' }], holders: [{ kind: 'state', name: 'China National Aviation Holding', share: 0.53, from: 2004 }] }),
  L({ id: 'CEA', name: 'China Eastern Airlines', country: 'CN', listed: [1997, null], fy: 2024, revenueEur: 17, marketCapEur: 11, margin: -0.03, sharesM: 22300,
    members: [{ id: 'CES' }], holders: [{ kind: 'state', name: 'China Eastern Air Holding', share: 0.6, from: 1997 }] }),
  L({ id: 'CSA', name: 'China Southern Airlines', country: 'CN', listed: [1997, null], fy: 2024, revenueEur: 22, marketCapEur: 11, margin: 0.0, sharesM: 18100,
    members: [{ id: 'CSN' }], holders: [{ kind: 'state', name: 'China Southern Air Holding', share: 0.65, from: 1997 }] }),
  L({ id: 'EVA', name: 'EVA Airways', country: 'TW', listed: [2001, null], fy: 2024, revenueEur: 6.3, marketCapEur: 5.5, margin: 0.12, sharesM: 5400,
    members: [{ id: 'EVA' }], holders: [{ kind: 'founder', name: 'Evergreen Group', share: 0.4, from: 2001 }] }),
  L({ id: 'CAL', name: 'China Airlines', country: 'TW', listed: [1993, null], fy: 2024, revenueEur: 6.0, marketCapEur: 3.8, margin: 0.08, sharesM: 6000,
    members: [{ id: 'CAL' }], holders: [{ kind: 'state', name: 'China Aviation Development Foundation', share: 0.35, from: 1993 }] }),
  L({ id: 'CAPA', name: 'Capital A (AirAsia)', country: 'MY', listed: [2004, null], fy: 2024, revenueEur: 2.6, marketCapEur: 1.0, margin: 0.03, sharesM: 4300,
    members: [{ id: 'AXM' }], holders: [{ kind: 'founder', name: 'Tune Group', share: 0.3, from: 2004 }] }),
  L({ id: 'GIAA', name: 'Garuda Indonesia', country: 'ID', listed: [2011, null], fy: 2024, revenueEur: 3.1, marketCapEur: 0.4, margin: 0.0, sharesM: 91000,
    members: [{ id: 'GIA' }], holders: [{ kind: 'state', name: 'Republic of Indonesia', share: 0.65, from: 2011 }] }),
  L({ id: 'AIRARABIA', name: 'Air Arabia', country: 'AE', listed: [2007, null], fy: 2024, revenueEur: 1.7, marketCapEur: 3.6, margin: 0.25, sharesM: 4670, members: [{ id: 'ABY' }], holders: [] }),
  L({ id: 'JAZEERA', name: 'Jazeera Airways', country: 'KW', listed: [2008, null], fy: 2024, revenueEur: 0.55, marketCapEur: 0.8, margin: 0.05, sharesM: 220, members: [{ id: 'JZR' }], holders: [] }),
];

export const listedById = new Map(LISTED_AIRLINES.map((x) => [x.id, x]));

/** Foreign ownership limits for an investor from outside the country (and outside its single aviation market): the US
 * 25 % of the votes (49 USC 40102), Japan one third (Civil Aeronautics Act), Canada 25 % until 2018 then 49 %, most
 * others 49 %. Inside the EU single market (EU Regulation 1008/2008) there is no limit for EU-owned airlines. */
export function foreignCap(country: string, year: number): number {
  if (country === 'US') return 0.25;
  if (country === 'JP') return 1 / 3;
  if (country === 'CA') return year >= 2018 ? 0.49 : 0.25;
  return 0.49;
}

/** Buying on the market: at most this share of a company in a week (what trades without moving the price too far). */
export const MAX_WEEKLY_BUY = 0.03;
/** Price impact: buying (selling) a share x of the company in one go costs on average this × x more (less). */
export const PRICE_IMPACT = 1.5;
/** Holdings that must be announced (EU Transparency Directive 2004/109/EC). */
export const DISCLOSURE = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.5, 0.75];
/** Crossing 30 % of the votes obliges a takeover offer to all shareholders (EU Takeover Directive; Austria and
 * Germany 30 %). */
export const MANDATORY_BID = 0.3;
/** A takeover offer's acceptance period (weeks) and the competition authority's first and second phase (weeks;
 * EU Merger Regulation: 25 working days, then up to 90 more). */
export const OFFER_WEEKS = 4;
export const REVIEW_PHASE1_WEEKS = 5;
export const REVIEW_PHASE2_WEEKS = 18;
/** Merging an airline into one's own needs 75 % of its votes (a merger resolution); the other shareholders are paid out
 * at the share price. Integration costs: a share of its yearly revenue. */
export const MERGE_MIN_STAKE = 0.75;
export const INTEGRATION_COST = 0.03;
/** Dividends: share of a year's profit paid out. */
export const PAYOUT = 0.35;
/** AI takeovers: chance a year that a strong group buys a weak airline in its market; a bid for the player's listed
 * airline when its shares are cheap. */
export const AI_TAKEOVERS_PER_YEAR = 0.4;
export const AI_BID_CHANCE_PER_MONTH = 0.04;

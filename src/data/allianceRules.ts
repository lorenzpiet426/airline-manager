// Alliances and codeshares (Phase 11.1): the three global alliances with their founding days, what they ask of a new
// member, what joining and membership cost, and what membership and codeshares bring. Member lists: Star Alliance by
// date (alliances.ts); oneworld and SkyTeam today's members from Wikidata (airlines.json), counted from their founding
// day (modelled for past years). Requirements, costs and effects are modelled from how real airlines joined (e.g. Croatia
// Airlines and Adria with about 12–15 aircraft, Aegean after years of talks; joining took 12–18 months of IT and
// procedure work; airlines report fees of a few million dollars).
import { STAR_ALLIANCE, type Membership } from './alliances';

export type RealAllianceId = 'star' | 'oneworld' | 'skyteam';

export interface RealAlliance {
  id: RealAllianceId;
  name: string;
  founded: string;
  /** The name in airlines.json's alliance field (today's members). */
  dataName: string;
  /** Members by date where entered by hand. */
  dated?: readonly Membership[];
}

export const REAL_ALLIANCES: readonly RealAlliance[] = [
  { id: 'star', name: 'Star Alliance', founded: '1997-05-14', dataName: 'Star Alliance', dated: STAR_ALLIANCE },
  { id: 'oneworld', name: 'oneworld', founded: '1999-02-01', dataName: 'Oneworld' },
  { id: 'skyteam', name: 'SkyTeam', founded: '2000-06-22', dataName: 'SkyTeam' },
];

/** What a global alliance asks of a new member. */
export const REQUIREMENTS = {
  aircraft: 15,
  destinations: 20,
  weeklyDepartures: 150,
  reputation: 58,
};

/** The alliance's review of an application, the invitation's validity, the joining period (months, from-to), the wait
 * after a rejection. */
export const REVIEW_WEEKS = 8;
export const INVITATION_MONTHS = 3;
export const JOINING_MONTHS: [number, number] = [12, 18];
export const REAPPLY_MONTHS = 12;

/** Costs in today's US dollars (scaled by the size of the airline: aircraft / 25, square root, 0.5…3). */
export const JOIN_FEE_USD = 5_000_000;
export const ANNUAL_FEE_USD = 2_000_000;
export const OWN_ALLIANCE_FOUND_USD = 1_500_000;
export const OWN_ALLIANCE_ANNUAL_USD = 600_000;
export const CODESHARE_SETUP_USD = 400_000;
export const CODESHARE_ANNUAL_USD = 150_000;

/** Sales and loyalty: alliance members sell each other's flights and their frequent flyers earn and keep status on all
 * members — travellers prefer the airline a little more (business travellers more). An own small alliance less, growing
 * with its members (full at 5). */
export const ALLIANCE_PULL = { business: 0.06, leisure: 0.02 };
export const OWN_ALLIANCE_PULL_SHARE = 0.5;
export const OWN_ALLIANCE_FULL_MEMBERS = 5;

/** Connecting passengers from a codeshare partner count more (shown as one airline's connection in booking systems). */
export const CODESHARE_FEED = 1.25;

/** Who agrees to a codeshare or to joining an own alliance: a minimum reputation, and an own alliance's members not much
 * bigger than the founder (fleet). */
export const CODESHARE_MIN_REPUTATION = 52;
export const OWN_ALLIANCE_MIN_REPUTATION = 55;
export const OWN_ALLIANCE_MAX_SIZE = 4;
/** A codeshare is refused when more than this share of the player's routes are also flown by the partner (competitors). */
export const CODESHARE_MAX_OVERLAP = 0.5;

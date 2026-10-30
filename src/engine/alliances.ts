// Alliances and codeshares (Phase 11.1). The global alliances (Star Alliance, oneworld, SkyTeam) invite an airline only
// when it is big enough, has a frequent-flyer programme and a good name, fits their network (no member based at its hub)
// and a member flying to its hub sponsors it; after the alliance's review, joining takes 12–18 months and costs fees.
// The player can also found an own alliance with airlines that belong to none, and sign codeshares with single
// airlines. Members and codeshare partners become partners: they leave the player's routes alone, feed connecting
// passengers (codeshare partners more), share lounges; membership also helps sales and the frequent-flyer programme.
import {
  ALLIANCE_PULL,
  ANNUAL_FEE_USD,
  CODESHARE_ANNUAL_USD,
  CODESHARE_MAX_OVERLAP,
  CODESHARE_MIN_REPUTATION,
  CODESHARE_SETUP_USD,
  INVITATION_MONTHS,
  JOIN_FEE_USD,
  JOINING_MONTHS,
  OWN_ALLIANCE_ANNUAL_USD,
  OWN_ALLIANCE_FOUND_USD,
  OWN_ALLIANCE_FULL_MEMBERS,
  OWN_ALLIANCE_MAX_SIZE,
  OWN_ALLIANCE_MIN_REPUTATION,
  OWN_ALLIANCE_PULL_SHARE,
  REAL_ALLIANCES,
  REAPPLY_MONTHS,
  REQUIREMENTS,
  REVIEW_WEEKS,
  type RealAlliance,
  type RealAllianceId,
} from '../data/allianceRules';
import { membersOn } from '../data/alliances';
import { stationsOf } from './bases';
import { book, postMessage } from './core';
import { priceLevelAt } from './era';
import { bookPnl } from './fleet';
import { convert, money } from './money';
import type { RealAirline } from './realAirlines';
import type { Airline, AllianceMembership, GameState } from './state';
import { partnersAt, takeoverScenario } from './takeover';
import { addMonths, MINUTES_PER_WEEK, toDate, type SimTime } from './time';
import type { EngineWorld } from './world';

const day = (time: SimTime) => toDate(time).toISOString().slice(0, 10);
export const allianceById = (id: string): RealAlliance | undefined => REAL_ALLIANCES.find((a) => a.id === id);

export type AllianceError =
  | 'allianceUnknown' | 'notYetFounded' | 'alreadyMember' | 'applicationRunning' | 'waitAfterRejection' | 'noInvitation'
  | 'notMember' | 'insufficientCash' | 'airlineUnknown' | 'ownAirline' | 'alreadyPartner' | 'rivalAlliance' | 'competitor'
  | 'noConnection' | 'reputationLow' | 'tooMuchOverlap' | 'inAlliance' | 'tooBig' | 'noOwnAlliance' | 'nameInvalid' | 'notInOwnAlliance' | 'lowCost';

// ─── Members ────────────────────────────────────────────────────────────────────

/** Is the real airline flying (in this year's world, not bankrupt or taken over by the player)? */
const flying = (state: GameState, world: EngineWorld, id: string) => !!world.realAirlines?.byId.get(id) && (state.ai.airlines[id]?.status ?? 'active') === 'active';

/** The members of a global alliance on a day (its own dated list, else today's members from its founding day). */
export function allianceMembers(state: GameState, world: EngineWorld, alliance: RealAlliance, time = state.time): string[] {
  return listedMembers(world, alliance, time).filter((id) => flying(state, world, id));
}

/** The alliance's member list on a day, whether they fly as AI airlines or not (a taken-over airline is run by the player). */
function listedMembers(world: EngineWorld, alliance: RealAlliance, time: SimTime): string[] {
  const d = day(time);
  if (d < alliance.founded) return [];
  return alliance.dated
    ? membersOn(alliance.dated, d)
    : [...(world.realAirlines?.byId.values() ?? [])].filter((a) => a.alliance === alliance.dataName).map((a) => a.id);
}

/** The global alliance a real airline belongs to on a day (null = none). */
export function realAllianceOf(state: GameState, world: EngineWorld, id: string): RealAllianceId | null {
  for (const a of REAL_ALLIANCES) if (allianceMembers(state, world, a).includes(id)) return a.id;
  return null;
}

/** The player's alliance: what they applied for or joined, or — for a taken-over airline — its real membership. */
export function membershipOf(state: GameState, world: EngineWorld, airline: Airline): AllianceMembership | null {
  if (airline.allianceMembership) return airline.allianceMembership;
  if (airline.realId && takeoverScenario(airline.realId)) {
    const real = REAL_ALLIANCES.find((a) => listedMembers(world, a, state.time).includes(airline.realId!));
    if (real) return { alliance: real.id, status: 'member', at: state.time, historic: true };
  }
  return null;
}

const fleetOf = (r: RealAirline) => Math.max(1, r.fleet.reduce((n, f) => n + f.inService, 0), r.registered.length);
const reputationOf = (state: GameState, airline: Airline) => state.reputation[airline.id]?.score ?? 0;

/** The player's size: aircraft in service, destinations, weekly departures. */
export function sizeOf(state: GameState, airline: Airline): { aircraft: number; destinations: number; departures: number } {
  const routes = Object.values(state.routes).filter((r) => r.airlineId === airline.id);
  return {
    aircraft: Object.values(state.aircraft).filter((a) => a.airlineId === airline.id && a.status === 'active').length,
    destinations: new Set(routes.map((r) => r.destinationId)).size,
    departures: routes.reduce((n, r) => n + 2 * r.frequency, 0),
  };
}

/** Real airlines flying to one of the player's stations, or whose hub the player flies to. */
function connects(state: GameState, world: EngineWorld, airline: Airline, partner: RealAirline): boolean {
  const stations = new Set(stationsOf(airline));
  if (world.realAirlines?.routesOf(partner.id).some((r) => stations.has(r.a) || stations.has(r.b))) return true;
  const hubs = new Set(partner.hubs);
  return Object.values(state.routes).some((r) => r.airlineId === airline.id && (hubs.has(r.destinationId) || hubs.has(r.originId)));
}

// ─── Global alliances ───────────────────────────────────────────────────────────

export type Check = 'size' | 'destinations' | 'departures' | 'reputation' | 'loyalty' | 'hubFree' | 'sponsor';

/** What the alliance checks, with the result of each point (and who would sponsor, who sits at the hub). */
export function allianceChecks(state: GameState, world: EngineWorld, airline: Airline, alliance: RealAlliance): { checks: Record<Check, boolean>; sponsor: string | null; hubMember: string | null } {
  const size = sizeOf(state, airline);
  const members = allianceMembers(state, world, alliance).filter((id) => id !== airline.realId);
  const real = world.realAirlines!;
  const hubMember = members.find((id) => real.byId.get(id)?.hubs.includes(airline.hubId)) ?? null;
  const sponsor = members.find((id) => real.routesOf(id).some((r) => r.a === airline.hubId || r.b === airline.hubId)) ?? null;
  return {
    checks: {
      size: size.aircraft >= REQUIREMENTS.aircraft,
      destinations: size.destinations >= REQUIREMENTS.destinations,
      departures: size.departures >= REQUIREMENTS.weeklyDepartures,
      reputation: reputationOf(state, airline) >= REQUIREMENTS.reputation,
      loyalty: !!airline.loyalty,
      hubFree: !hubMember,
      sponsor: !!sponsor,
    },
    sponsor: sponsor ? (real.byId.get(sponsor)?.name ?? sponsor) : null,
    hubMember: hubMember ? (real.byId.get(hubMember)?.name ?? hubMember) : null,
  };
}

/** Fees scale with the airline's size: (aircraft / 25)^0.5, between 0.5 and 3 times. */
const sizeFactor = (state: GameState, airline: Airline) => Math.min(3, Math.max(0.5, Math.sqrt(sizeOf(state, airline).aircraft / 25)));
export const joinFeeUsd = (state: GameState, airline: Airline) => JOIN_FEE_USD * sizeFactor(state, airline) * priceLevelAt(state.time);
export const annualFeeUsd = (state: GameState, airline: Airline) => ANNUAL_FEE_USD * sizeFactor(state, airline) * priceLevelAt(state.time);

export function applyToAlliance(state: GameState, world: EngineWorld, airlineId: string, allianceId: string): AllianceError | null {
  const airline = state.airlines[airlineId];
  const alliance = allianceById(allianceId);
  if (!airline) return 'airlineUnknown';
  if (!alliance) return 'allianceUnknown';
  if (day(state.time) < alliance.founded) return 'notYetFounded';
  const m = membershipOf(state, world, airline);
  if (m && m.status !== 'rejected') return m.status === 'applied' ? 'applicationRunning' : 'alreadyMember';
  if (m?.status === 'rejected' && state.time < addMonths(m.at, REAPPLY_MONTHS)) return 'waitAfterRejection';
  airline.allianceMembership = { alliance: alliance.id, status: 'applied', at: state.time, readyAt: state.time + REVIEW_WEEKS * MINUTES_PER_WEEK };
  postMessage(state, { airlineId, kind: 'allianceApplied', level: 'info', params: { alliance: alliance.name, weeks: REVIEW_WEEKS } });
  return null;
}

/** Accepting the invitation: the joining fee is paid, the joining work starts. */
export function acceptInvitation(state: GameState, airlineId: string): AllianceError | null {
  const airline = state.airlines[airlineId];
  const m = airline?.allianceMembership;
  if (!airline || !m || m.status !== 'invited') return 'noInvitation';
  const alliance = allianceById(m.alliance)!;
  if (!pay(state, airline, joinFeeUsd(state, airline))) return 'insufficientCash';
  const [lo, hi] = JOINING_MONTHS;
  const months = lo + Math.round(((hi - lo) * (hashOf(`${state.seed}|${airlineId}|${alliance.id}`) % 1000)) / 1000);
  airline.allianceMembership = { alliance: alliance.id, status: 'joining', at: state.time, readyAt: addMonths(state.time, months) };
  postMessage(state, { airlineId, kind: 'allianceJoining', level: 'info', params: { alliance: alliance.name, months } });
  return null;
}

export function leaveAlliance(state: GameState, world: EngineWorld, airlineId: string): AllianceError | null {
  const airline = state.airlines[airlineId];
  const m = airline ? membershipOf(state, world, airline) : null;
  if (!airline || !m || m.historic || m.alliance === 'own') return 'notMember';
  const name = allianceById(m.alliance)?.name ?? m.alliance;
  delete airline.allianceMembership;
  composePartners(state, world, airline);
  postMessage(state, { airlineId, kind: 'allianceLeft', level: 'caution', params: { alliance: name } });
  return null;
}

/** Pays a one-off cost (US dollars) from the airline's cash into its overheads; false when the cash isn't there. */
function pay(state: GameState, airline: Airline, usd: number): boolean {
  if (airline.cash.amount < convert(money(usd, 'USD'), airline.currency, state.fx).amount) return false;
  const cost = -book(state, airline.id, 'alliance', money(-Math.round(usd), 'USD')).amount;
  bookPnl(state, airline.id, 'overhead', cost);
  return true;
}

function hashOf(text: string): number {
  let x = 2166136261;
  for (const ch of text) x = Math.imul(x ^ ch.charCodeAt(0), 16777619);
  return x >>> 0;
}

// ─── Own alliance ───────────────────────────────────────────────────────────────

export function foundAlliance(state: GameState, world: EngineWorld, airlineId: string, name: string): AllianceError | null {
  const airline = state.airlines[airlineId];
  if (!airline) return 'airlineUnknown';
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 40) return 'nameInvalid';
  const m = membershipOf(state, world, airline);
  if (m && m.status !== 'rejected') return 'inAlliance';
  if (!pay(state, airline, OWN_ALLIANCE_FOUND_USD * priceLevelAt(state.time))) return 'insufficientCash';
  airline.ownAlliance = { name: trimmed, founded: state.time, members: [] };
  airline.allianceMembership = { alliance: 'own', status: 'member', at: state.time };
  postMessage(state, { airlineId, kind: 'ownAllianceFounded', level: 'info', params: { alliance: trimmed } });
  return null;
}

/** Why a real airline would refuse a codeshare (null = it agrees). */
export function codeshareRefusal(state: GameState, world: EngineWorld, airline: Airline, partnerId: string): AllianceError | null {
  const partner = world.realAirlines?.byId.get(partnerId);
  if (!partner || !flying(state, world, partnerId)) return 'airlineUnknown';
  if (partnerId === airline.realId) return 'ownAirline';
  if (airline.codeshares?.some((c) => c.partnerId === partnerId) || airline.partners?.includes(partnerId)) return 'alreadyPartner';
  // Low-cost airlines sell only their own point-to-point flights: no codeshares, no alliances.
  if (partner.model === 'lowcost') return 'lowCost';
  const m = membershipOf(state, world, airline);
  const theirs = realAllianceOf(state, world, partnerId);
  // Airlines of a rival alliance don't codeshare with the player's alliance.
  if (theirs && m && m.status === 'member' && m.alliance !== theirs) return 'rivalAlliance';
  // The big airline at the player's hub sees a competitor, not a partner (unless they are in the same alliance).
  if (partner.hubs.includes(airline.hubId) && !(m?.status === 'member' && m.alliance === theirs)) return 'competitor';
  if (!connects(state, world, airline, partner)) return 'noConnection';
  if (reputationOf(state, airline) < CODESHARE_MIN_REPUTATION) return 'reputationLow';
  const mine = Object.values(state.routes).filter((r) => r.airlineId === airline.id);
  const overlap = mine.filter((r) => world.realAirlines!.on(r.originId, r.destinationId).some((c) => c.airline.id === partnerId)).length;
  if (mine.length >= 4 && overlap / mine.length > CODESHARE_MAX_OVERLAP) return 'tooMuchOverlap';
  return null;
}

/** Why a non-aligned airline would refuse to join the player's own alliance (null = it joins). */
export function ownAllianceRefusal(state: GameState, world: EngineWorld, airline: Airline, partnerId: string): AllianceError | null {
  if (!airline.ownAlliance) return 'noOwnAlliance';
  const partner = world.realAirlines?.byId.get(partnerId);
  if (!partner || !flying(state, world, partnerId)) return 'airlineUnknown';
  if (partnerId === airline.realId) return 'ownAirline';
  if (airline.ownAlliance.members.some((x) => x.id === partnerId)) return 'alreadyPartner';
  if (partner.model === 'lowcost') return 'lowCost';
  if (realAllianceOf(state, world, partnerId)) return 'inAlliance';
  if (partner.hubs.includes(airline.hubId)) return 'competitor';
  if (!connects(state, world, airline, partner)) return 'noConnection';
  if (reputationOf(state, airline) < OWN_ALLIANCE_MIN_REPUTATION) return 'reputationLow';
  if (fleetOf(partner) > OWN_ALLIANCE_MAX_SIZE * Math.max(1, sizeOf(state, airline).aircraft)) return 'tooBig';
  return null;
}

export function inviteToAlliance(state: GameState, world: EngineWorld, airlineId: string, partnerId: string): AllianceError | null {
  const airline = state.airlines[airlineId];
  if (!airline) return 'airlineUnknown';
  const refusal = ownAllianceRefusal(state, world, airline, partnerId);
  const name = world.realAirlines?.byId.get(partnerId)?.name ?? partnerId;
  if (refusal) return refusal;
  airline.ownAlliance!.members.push({ id: partnerId, since: state.time });
  composePartners(state, world, airline);
  postMessage(state, { airlineId, kind: 'ownAllianceJoined', level: 'info', params: { airline: name, alliance: airline.ownAlliance!.name } });
  return null;
}

export function removeFromAlliance(state: GameState, world: EngineWorld, airlineId: string, partnerId: string): AllianceError | null {
  const airline = state.airlines[airlineId];
  if (!airline?.ownAlliance) return 'noOwnAlliance';
  const before = airline.ownAlliance.members.length;
  airline.ownAlliance.members = airline.ownAlliance.members.filter((x) => x.id !== partnerId);
  if (airline.ownAlliance.members.length === before) return 'notInOwnAlliance';
  composePartners(state, world, airline);
  return null;
}

// ─── Codeshares ─────────────────────────────────────────────────────────────────

export function signCodeshare(state: GameState, world: EngineWorld, airlineId: string, partnerId: string): AllianceError | null {
  const airline = state.airlines[airlineId];
  if (!airline) return 'airlineUnknown';
  const refusal = codeshareRefusal(state, world, airline, partnerId);
  if (refusal) return refusal;
  if (!pay(state, airline, CODESHARE_SETUP_USD * priceLevelAt(state.time))) return 'insufficientCash';
  (airline.codeshares ??= []).push({ partnerId, since: state.time });
  composePartners(state, world, airline);
  postMessage(state, { airlineId, kind: 'codeshareSigned', level: 'info', params: { airline: world.realAirlines?.byId.get(partnerId)?.name ?? partnerId } });
  return null;
}

export function endCodeshare(state: GameState, world: EngineWorld, airlineId: string, partnerId: string): AllianceError | null {
  const airline = state.airlines[airlineId];
  if (!airline?.codeshares?.some((c) => c.partnerId === partnerId)) return 'notMember';
  airline.codeshares = airline.codeshares.filter((c) => c.partnerId !== partnerId);
  composePartners(state, world, airline);
  return null;
}

// ─── Partners and effects ───────────────────────────────────────────────────────

/**
 * The player's partners: a taken-over airline's group and alliance of the time, the airlines of companies the player
 * controls (Phase 10.5), the members of the alliance it belongs to (or founded), and its codeshare partners.
 */
export function composePartners(state: GameState, world: EngineWorld, airline: Airline): void {
  const ids = new Set<string>();
  const scenario = airline.realId ? takeoverScenario(airline.realId) : undefined;
  if (scenario) for (const id of partnersAt(world, scenario, toDate(state.time))) ids.add(id);
  for (const id of airline.subsidiaryPartners ?? []) ids.add(id);
  const m = airline.allianceMembership;
  if (m?.status === 'member' && m.alliance !== 'own') for (const id of allianceMembers(state, world, allianceById(m.alliance)!)) ids.add(id);
  for (const x of airline.ownAlliance?.members ?? []) ids.add(x.id);
  for (const c of airline.codeshares ?? []) ids.add(c.partnerId);
  if (airline.realId) ids.delete(airline.realId);
  airline.partners = [...ids].filter((id) => flying(state, world, id)).sort();
}

/** Sales and loyalty help from an alliance (multipliers on travellers' preference for the airline). */
export function alliancePull(state: GameState, world: EngineWorld | undefined, airline: Airline): { business: number; leisure: number } {
  const m = airline.allianceMembership ?? (world ? membershipOf(state, world, airline) : null);
  if (!m || m.status !== 'member') return { business: 1, leisure: 1 };
  const share = m.alliance === 'own' ? OWN_ALLIANCE_PULL_SHARE * Math.min(1, (airline.ownAlliance?.members.length ?? 0) / OWN_ALLIANCE_FULL_MEMBERS) : 1;
  return { business: 1 + ALLIANCE_PULL.business * share, leisure: 1 + ALLIANCE_PULL.leisure * share };
}

/** Every day: the alliance's review, invitations running out, joining done; on the 1st the fees and the partner list. */
export function alliancesDailyStep(state: GameState, world: EngineWorld): void {
  const first = toDate(state.time).getUTCDate() === 1;
  for (const airline of Object.values(state.airlines)) {
    if (airline.controller !== 'human') continue;
    const m = airline.allianceMembership;
    if (m && m.readyAt !== undefined && state.time >= m.readyAt && m.alliance !== 'own') {
      const alliance = allianceById(m.alliance)!;
      if (m.status === 'applied') {
        const { checks } = allianceChecks(state, world, airline, alliance);
        const failed = (Object.keys(checks) as Check[]).filter((k) => !checks[k]);
        if (failed.length) {
          airline.allianceMembership = { alliance: m.alliance, status: 'rejected', at: state.time, reasons: failed };
          postMessage(state, { airlineId: airline.id, kind: 'allianceRejected', level: 'caution', params: { alliance: alliance.name, count: failed.length } });
        } else {
          airline.allianceMembership = { alliance: m.alliance, status: 'invited', at: state.time, readyAt: addMonths(state.time, INVITATION_MONTHS) };
          postMessage(state, { airlineId: airline.id, kind: 'allianceInvited', level: 'info', params: { alliance: alliance.name, months: INVITATION_MONTHS } });
        }
      } else if (m.status === 'invited') {
        delete airline.allianceMembership;
      } else if (m.status === 'joining') {
        airline.allianceMembership = { alliance: m.alliance, status: 'member', at: state.time };
        composePartners(state, world, airline);
        postMessage(state, { airlineId: airline.id, kind: 'allianceJoined', level: 'info', params: { alliance: alliance.name, members: airline.partners?.length ?? 0 } });
      }
    }
    if (!first) continue;
    // Fees: the alliance's yearly fee (also while joining), the own alliance's office, codeshares' IT and sales.
    let usd = 0;
    const now = airline.allianceMembership;
    if (now && (now.status === 'member' || now.status === 'joining') && now.alliance !== 'own') usd += annualFeeUsd(state, airline) / 12;
    if (airline.ownAlliance) usd += (OWN_ALLIANCE_ANNUAL_USD * priceLevelAt(state.time)) / 12;
    usd += ((airline.codeshares?.length ?? 0) * CODESHARE_ANNUAL_USD * priceLevelAt(state.time)) / 12;
    if (usd > 0) {
      const cost = -book(state, airline.id, 'alliance', money(-Math.round(usd), 'USD')).amount;
      bookPnl(state, airline.id, 'overhead', cost);
    }
    composePartners(state, world, airline);
  }
}

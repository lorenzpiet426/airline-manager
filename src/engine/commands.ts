// Commands: the only way to change the game. The player (and later AI airlines and other players)
// send a command; the engine checks it against the rules and either applies it or explains why not.
import type { CrewRole, LoungeQuality } from './state';
import { setBucketLimits, setFareBuckets, type FareError } from './bookings';
import { leaveProgramme, setProgramme, startProgramme, type LoyaltyError } from './loyalty';
import { repayLoan, saleLeaseback, takeLoan, type DebtError } from './debt';
import { hedgeDeal, setHedgePolicy, type HedgeError } from './hedging';
import { acceptInvitation, applyToAlliance, endCodeshare, foundAlliance, inviteToAlliance, leaveAlliance, removeFromAlliance, signCodeshare, type AllianceError } from './alliances';
import { applyPackage } from './networkPlanning';
import { answerBid, mergeAirline, offerTakeover, tradeStake, type InvestError } from './investments';
import { buyBack, ensureEquity, goPublic, issueShares, payDividend, tradeOwnShares, type ShareError } from './shares';
import { ensureBoard } from './board';
import type { HedgePolicy } from '../data/hedging';
import type { Tier } from '../data/loyalty';
import { FLIGHT_FARE_RANGE, type FareBucket } from '../data/fares';
import { approveProposal, declineProposal, ensureMgmt, fireManager, hireManager, setDelegation, type ManagerError } from './managers';
import type { Delegation, Department } from '../data/managers';
import { acceptDemand, answerProposal, callMediation, ensureLabour, offerWage, type UnionError } from './unions';
import { ensureCrew, hireCrew, planCrew, releaseCrew, setCrewPay, trainCrew, type CrewError } from './crews';
import { closeBase, openBase, stationAircraft, stationOf, stationsOf, type BaseError } from './bases';
import { buildLounge, closeLounge, ensureGates, ensureHubFacilities, setGates } from './hub';
import { acquireSlots, buySlots, ensureSlots, requestSlots, type SlotShortfall } from './slots';
import { takeOver, type TakeoverError } from './takeover';
import { defaultLivery, repaint, setLivery, type LiveryError, type RepaintError } from './livery';
import { getAircraftType } from '../data/aircraft';
import { ECB_RATES } from '../data/currencies';
import { regulatedRange } from '../data/eras';
import { currencyAt } from '../data/fxHistory';
import { priceLevelAt } from './era';
import { registrationPattern } from '../data/registrations';
import { book, nextId, postMessage, schedule } from './core';
import { checkRoute, roundTripHours, WEEKLY_AVAILABLE_HOURS } from './economics';
import { aircraftHours, autoPlanAircraft, grounded, inRefit, makeDetailed, pairsOfRoute, setRoutePairs, validateSpecs, type FlightSpec, type ScheduleError } from './schedule';
import { distanceKm } from './geo';
import { convert, money, roundNice, type FxRates, type Money } from './money';
import { newFinance } from './operations';
import { randomInt } from './rng';
import { cabinCode, DEFAULT_CLASS_FARES, REFIT_DEPRECIATION_YEARS, refitQuote, totalSeats, validateCabin, type CabinError } from './cabins';
import { newReputation } from './reputation';
import { buyAircraft, cancelOrder, disposeAircraft, extendLease, orderAircraft, returnLeased, type FleetError } from './fleet';
import type { CabinStyle } from './cabins';
import type { HangarSize } from '../data/maintenance';
import { buildHangar, moveCheck, type MaintError } from './maintenance';
import type { Livery, CabinClass, CabinLayout, ClassFares, Controller, GameState, Route } from './state';
import { MINUTES_PER_DAY, simTime, startOfDay, toDate, type SimTime } from './time';
import type { EngineWorld } from './world';

export type { EngineWorld } from './world';
export { aircraftHours } from './schedule';
export type { FlightSpec } from './schedule';

/** Starting capital choices for a startup, in euros (converted into the hub's currency). */
export const CAPITAL_OPTIONS_EUR = [25_000_000, 75_000_000, 200_000_000] as const;

export interface FoundAirline {
  type: 'FoundAirline';
  payload: {
    name: string;
    iata: string;
    icao: string;
    primary: string;
    secondary: string;
    hubId: string;
    capitalEur: number;
    controller: Controller;
  };
}

/** Takes over a real airline as its CEO (Phase 6.2): its fleet, routes and a planned timetable become the player's. */
export interface TakeOverAirline {
  type: 'TakeOverAirline';
  payload: { realId: string };
}

export interface LeaseAircraft {
  type: 'LeaseAircraft';
  airlineId: string;
  payload: { offerId: string };
}

export interface RouteSettings {
  /** Where the route starts (Phase 7.4): the hub (default) or a base. Fixed once the route is open. */
  originId?: string;
  aircraftId: string;
  /** Round trips per week. */
  frequency: number;
  /** Economy fare relative to the market fare, 0.5 … 1.5. */
  fareFactor: number;
  /** Premium classes' fares relative to their market fares, 0.5 … 1.5 (default: market fare). */
  classFares?: ClassFares;
  /** Detailed scheduling: the route's complete timetable (aircraftId/frequency are then taken from it). */
  flights?: FlightSpec[];
}

export interface OpenRoute {
  type: 'OpenRoute';
  airlineId: string;
  payload: RouteSettings & { destinationId: string };
}

export interface UpdateRoute {
  type: 'UpdateRoute';
  airlineId: string;
  payload: RouteSettings & { routeId: string };
}

export interface CloseRoute {
  type: 'CloseRoute';
  airlineId: string;
  payload: { routeId: string };
}

/** Switches the game from Simple to Detailed scheduling (one way: the timetable is kept and becomes editable). */
export interface SetScheduling {
  type: 'SetScheduling';
  airlineId: string;
  payload: { scheduling: 'detailed' };
}

/** Changes an aircraft's cabin: free before delivery, otherwise a refit in the hangar (money and days). */
export interface RefitCabin {
  type: 'RefitCabin';
  airlineId: string;
  payload: { aircraftId: string; cabin: CabinLayout };
}

/**
 * Ties the game to the real clock (one way). `now` is the real time when the player switched (commands carry their
 * time, the engine never reads the clock itself). A game behind today catches up to now; a game ahead of today keeps
 * its date and runs on at real speed.
 */
export interface SetTimeMode {
  type: 'SetTimeMode';
  airlineId: string;
  payload: { timeMode: 'realclock'; now: SimTime };
}

/** Fleet ownership (Phase 4.1). */
export interface OrderAircraft {
  type: 'OrderAircraft';
  airlineId: string;
  payload: { typeId: string; count: number; cabin: CabinStyle };
}
export interface CancelOrder {
  type: 'CancelOrder';
  airlineId: string;
  payload: { aircraftId: string };
}
export interface BuyAircraft {
  type: 'BuyAircraft';
  airlineId: string;
  payload: { offerId: string };
}
export interface SellAircraft {
  type: 'SellAircraft';
  airlineId: string;
  payload: { aircraftId: string; scrap?: boolean };
}
export interface ReturnLease {
  type: 'ReturnLease';
  airlineId: string;
  payload: { aircraftId: string };
}
export interface ExtendLease {
  type: 'ExtendLease';
  airlineId: string;
  payload: { aircraftId: string; years: number };
}

/** Liveries (Phase 4.3): a new livery for the airline, repainting an aircraft now or with its next heavy check. */
export interface SetLivery {
  type: 'SetLivery';
  airlineId: string;
  payload: { livery: Livery };
}
export interface Repaint {
  type: 'Repaint';
  airlineId: string;
  payload: { aircraftId: string; atCheck: boolean };
}

/** Maintenance (Phase 4.2): move the next heavy check, build an own hangar at the hub. */
export interface MoveCheck {
  type: 'MoveCheck';
  airlineId: string;
  payload: { aircraftId: string; start: SimTime };
}
export interface BuildHangar {
  type: 'BuildHangar';
  airlineId: string;
  payload: { size: HangarSize };
}

/** Slots (Phase 7.2): buy them where trading is allowed, or ask for them in the next season's allocation. */
export interface BuySlots {
  type: 'BuySlots';
  airlineId: string;
  payload: { airportId: string; hours: number[] };
}
export interface RequestSlots {
  type: 'RequestSlots';
  airlineId: string;
  payload: { airportId: string; hours: number[] };
}

/** The hub on the ground (Phase 7.3): gates rented (totals), building or closing the hub lounge. */
export interface RentGates {
  type: 'RentGates';
  airlineId: string;
  /** At the hub (default) or a base. */
  payload: { contact: number; remote: number; airportId?: string };
}
export interface BuildLounge {
  type: 'BuildLounge';
  airlineId: string;
  /** At the hub (default) or a base. */
  payload: { seats: number; quality: LoungeQuality; airportId?: string };
}
export interface CloseLounge {
  type: 'CloseLounge';
  airlineId: string;
  payload: { airportId: string };
}

/** Bases (Phase 7.4): open or close one, station an aircraft at the hub or a base. */
export interface OpenBase {
  type: 'OpenBase';
  airlineId: string;
  payload: { airportId: string };
}
export interface CloseBase {
  type: 'CloseBase';
  airlineId: string;
  payload: { airportId: string };
}
export interface StationAircraft {
  type: 'StationAircraft';
  airlineId: string;
  payload: { aircraftId: string; airportId: string };
}

/** Crews (Phase 8.1): hiring, training (upgrade or another type rating), letting go, pay, automatic planning. */
export interface HireCrew {
  type: 'HireCrew';
  airlineId: string;
  payload: { station: string; role: CrewRole; family: string | null; count: number };
}
export interface TrainCrew {
  type: 'TrainCrew';
  airlineId: string;
  payload: { station: string; kind: 'upgrade' | 'rating'; family: string; count: number; from?: { family: string; role: 'captain' | 'firstOfficer' } };
}
export interface ReleaseCrew {
  type: 'ReleaseCrew';
  airlineId: string;
  payload: { station: string; role: CrewRole; family: string | null; count: number };
}
export interface SetCrewPay {
  type: 'SetCrewPay';
  airlineId: string;
  payload: { station: string; pay: number };
}
export interface SetCrewAuto {
  type: 'SetCrewAuto';
  airlineId: string;
  payload: { auto: boolean };
}

/** Wage talks (Phase 8.2): an offer (yearly raise), accepting the union's demand, mediation and its proposal. */
export interface OfferWage {
  type: 'OfferWage';
  airlineId: string;
  payload: { key: string; raise: number };
}
export interface AcceptDemand {
  type: 'AcceptDemand';
  airlineId: string;
  payload: { key: string };
}
export interface CallMediation {
  type: 'CallMediation';
  airlineId: string;
  payload: { key: string };
}
export interface AnswerProposal {
  type: 'AnswerProposal';
  airlineId: string;
  payload: { key: string; accept: boolean };
}

/** Managers (Phase 8.3): hiring and letting go heads of department, what they may decide, their proposals. */
export interface HireManager {
  type: 'HireManager';
  airlineId: string;
  payload: { candidateId: string };
}
export interface FireManager {
  type: 'FireManager';
  airlineId: string;
  payload: { dept: Department };
}
export interface SetDelegation {
  type: 'SetDelegation';
  airlineId: string;
  payload: { dept: Department; level: Delegation };
}
export interface ApproveProposal {
  type: 'ApproveProposal';
  airlineId: string;
  payload: { id: string };
}
export interface DeclineProposal {
  type: 'DeclineProposal';
  airlineId: string;
  payload: { id: string };
}
/** New fares on a route (economy factor and premium classes), e.g. from the head of revenue management. */
export interface SetFares {
  type: 'SetFares';
  airlineId: string;
  /** `flightFares`: per pair id, the outbound and return flight's fares relative to the route's (1 = route fare). */
  payload: { routeId: string; fareFactor: number; classFares?: ClassFares; flightFares?: Record<string, [number, number]> };
}
/** The HR department's crew plan (hiring and training for the timetable). */
export interface RunCrewPlan {
  type: 'RunCrewPlan';
  airlineId: string;
  payload: Record<string, never>;
}

/** Fare buckets and seat limits (Phase 9.3). */
export interface SetFareBuckets {
  type: 'SetFareBuckets';
  airlineId: string;
  payload: { cls: CabinClass; buckets: FareBucket[] };
}
export interface SetBucketLimits {
  type: 'SetBucketLimits';
  airlineId: string;
  payload: { routeId: string; cls: CabinClass; limits: Record<string, number | null> };
}

/** Frequent-flyer programme (Phase 9.4): start an own one, change its rules, leave or close it. */
export interface StartLoyalty {
  type: 'StartLoyalty';
  airlineId: string;
  payload: { name: string };
}
export interface SetLoyalty {
  type: 'SetLoyalty';
  airlineId: string;
  payload: { name: string; earn: number; thresholds: Record<Tier, number>; awardShare: number; expiryMonths: number };
}
export interface LeaveLoyalty {
  type: 'LeaveLoyalty';
  airlineId: string;
  payload: Record<string, never>;
}

/** Loans, bonds and sale-and-leaseback (Phase 10.1). */
export interface TakeLoan {
  type: 'TakeLoan';
  airlineId: string;
  payload: { kind: 'bank' | 'aircraft' | 'bond'; amount: number; years: number; aircraftId?: string };
}
export interface RepayLoan {
  type: 'RepayLoan';
  airlineId: string;
  payload: { loanId: string };
}
export interface SaleLeaseback {
  type: 'SaleLeaseback';
  airlineId: string;
  payload: { aircraftId: string };
}

/** Hedging (Phase 10.2): the ladder policy, or a single deal by hand. */
export interface SetHedgePolicy {
  type: 'SetHedgePolicy';
  airlineId: string;
  payload: { policy: HedgePolicy };
}
export interface HedgeDeal {
  type: 'HedgeDeal';
  airlineId: string;
  payload: { kind: 'fuelSwap' | 'fuelCall' | 'fxForward'; monthsAhead: number; amount: number };
}

/** Shares (Phase 10.3): going public, new shares, dividends, buybacks, the player's own shares. */
export interface GoPublic {
  type: 'GoPublic';
  airlineId: string;
  payload: { share: number };
}
export interface IssueShares {
  type: 'IssueShares';
  airlineId: string;
  payload: { share: number };
}
export interface PayDividend {
  type: 'PayDividend';
  airlineId: string;
  payload: { total: number };
}
export interface BuyBack {
  type: 'BuyBack';
  airlineId: string;
  payload: { share: number };
}
export interface TradeOwnShares {
  type: 'TradeOwnShares';
  airlineId: string;
  payload: { shares: number };
}
/** Other airlines (Phase 10.5): buy (+) or sell (−) a share of a listed company; a takeover offer (euros per share);
 * merge one of a controlled company's airlines; answer a bid for the player's own airline. */
export interface TradeStake {
  type: 'TradeStake';
  airlineId: string;
  payload: { listedId: string; share: number };
}
export interface OfferTakeover {
  type: 'OfferTakeover';
  airlineId: string;
  payload: { listedId: string; price: number; minAcceptance: number };
}
export interface MergeAirline {
  type: 'MergeAirline';
  airlineId: string;
  payload: { listedId: string; memberId: string };
}
/** Alliances and codeshares (Phase 11.1). */
export interface AllianceCommand {
  type: 'ApplyAlliance' | 'AcceptAlliance' | 'LeaveAlliance' | 'FoundAlliance' | 'InviteToAlliance' | 'RemoveFromAlliance' | 'SignCodeshare' | 'EndCodeshare';
  airlineId: string;
  payload: { alliance?: string; name?: string; partnerId?: string };
}
/** A timetable package (network planning): several routes' flights at once; with `effectiveAt`, from that day (season). */
export interface UpdateTimetable {
  type: 'UpdateTimetable';
  airlineId: string;
  payload: { routes: { routeId: string; flights: FlightSpec[] }[]; effectiveAt?: SimTime; label?: string };
}
export interface AnswerBid {
  type: 'AnswerBid';
  airlineId: string;
  payload: { tender: boolean };
}

export type Command = UpdateTimetable | AllianceCommand | TradeStake | OfferTakeover | MergeAirline | AnswerBid | GoPublic | IssueShares | PayDividend | BuyBack | TradeOwnShares | SetHedgePolicy | HedgeDeal | TakeLoan | RepayLoan | SaleLeaseback | StartLoyalty | SetLoyalty | LeaveLoyalty | SetFareBuckets | SetBucketLimits | HireManager | FireManager | SetDelegation | ApproveProposal | DeclineProposal | SetFares | RunCrewPlan | OfferWage | AcceptDemand | CallMediation | AnswerProposal | HireCrew | TrainCrew | ReleaseCrew | SetCrewPay | SetCrewAuto | OpenBase | CloseBase | StationAircraft | RentGates | BuildLounge | CloseLounge | BuySlots | RequestSlots | TakeOverAirline | SetLivery | Repaint | MoveCheck | BuildHangar | OrderAircraft | CancelOrder | BuyAircraft | SellAircraft | ReturnLease | ExtendLease | SetTimeMode | FoundAirline | LeaseAircraft | OpenRoute | UpdateRoute | CloseRoute | SetScheduling | RefitCabin;

export const FARE_FACTOR_RANGE = [0.5, 1.5] as const;

/** The fare factors allowed between two airports now: before deregulation only small deviations (Phase 5.3). */
export function fareRange(state: GameState, from: { country: string }, to: { country: string }): readonly [number, number] {
  return regulatedRange(from.country, to.country, toDate(state.time)) ?? FARE_FACTOR_RANGE;
}
export const MAX_FREQUENCY = 84;

export type CommandError =
  | 'dismissed'
  | 'notDetailed'
  | 'nameLength'
  | 'iataFormat'
  | 'icaoFormat'
  | 'codeTaken'
  | 'colorFormat'
  | 'hubUnknown'
  | 'capitalInvalid'
  | 'airlineUnknown'
  | 'offerGone'
  | 'insufficientCash'
  | 'airportUnknown'
  | 'sameAirport'
  | 'routeExists'
  | 'routeUnknown'
  | 'aircraftUnknown'
  | 'frequencyInvalid'
  | 'fareInvalid'
  | 'range'
  | 'runwayOrigin'
  | 'runwayDestination'
  | 'etops'
  | 'aircraftBusy'
  | 'alreadyDetailed'
  | 'alreadyRealClock'
  | 'inRefit'
  | 'cabinUnchanged'
  | CabinError
  | FleetError
  | MaintError
  | LiveryError
  | RepaintError
  | ScheduleError
  | TakeoverError
  | 'noSlot'
  | 'notTradable'
  | 'noGate'
  | 'gatesUnavailable'
  | 'gatesNeeded'
  | 'loungeInvalid'
  | 'loungeExists'
  | 'loungeUnknown'
  | 'originNotBase'
  | 'aircraftElsewhere'
  | BaseError
  | CrewError
  | UnionError
  | ManagerError
  | FareError
  | LoyaltyError
  | DebtError
  | HedgeError
  | ShareError
  | InvestError
  | AllianceError;

/** A failed command can say more: the airport and hours without a free slot (Phase 7.2). */
export type CommandResult = { ok: true; id?: string } | { ok: false; error: CommandError; slots?: SlotShortfall };

const fail = (error: CommandError): CommandResult => ({ ok: false, error });

/**
 * Applies a timetable change, then takes the slots it needs (Phase 7.2). Without free slots at a coordinated airport
 * the change is undone and the result names the airport and the hours.
 */
function withSlots(state: GameState, world: EngineWorld, airlineId: string, change: () => CommandResult): CommandResult {
  ensureSlots(state, world);
  ensureHubFacilities(state, world);
  const airline = state.airlines[airlineId];
  const before = {
    routes: structuredClone(state.routes),
    flights: structuredClone(state.flights),
    slots: structuredClone(state.slots),
    gates: airline?.gates ? { ...airline.gates } : undefined,
    messages: state.messages.length,
    next: state.nextId,
  };
  const undo = (result: CommandResult): CommandResult => {
    state.routes = before.routes;
    state.flights = before.flights;
    state.slots = before.slots;
    if (airline && before.gates) airline.gates = before.gates;
    state.messages.length = before.messages;
    state.nextId = before.next;
    return result;
  };
  const result = change();
  if (!result.ok) return result;
  const shortfall = acquireSlots(state, world, airlineId);
  if (shortfall) return undo({ ok: false, error: 'noSlot', slots: shortfall });
  // Enough gates at the hub for the busiest moment (remote stands are rented as needed, Phase 7.3).
  if (!ensureGates(state, world, airlineId)) return undo(fail('noGate'));
  // The HR department starts hiring for the new flights at once (Phase 8.1).
  ensureCrew(state, world);
  if (airline?.crew?.auto) planCrew(state, world, airlineId);
  return result;
}

/** A new aircraft on its way: the HR department starts hiring and training its crews at once (they take up to 13 weeks). */
function planCrewsAhead(state: GameState, world: EngineWorld, airlineId: string, result: CommandResult): CommandResult {
  if (!result.ok) return result;
  ensureCrew(state, world);
  if (state.airlines[airlineId]?.crew?.auto) planCrew(state, world, airlineId);
  return result;
}

export function applyCommand(state: GameState, world: EngineWorld, command: Command): CommandResult {
  // A dismissed CEO decides nothing any more (Phase 10.4).
  if (state.dismissed) return fail('dismissed');
  switch (command.type) {
    case 'FoundAirline': {
      const r = foundAirline(state, world, command.payload);
      // Its owners: the founder and the investors (Phase 10.3), and their board (Phase 10.4).
      if (r.ok) {
        ensureEquity(state);
        ensureBoard(state);
      }
      return r;
    }
    case 'TakeOverAirline': {
      const r = takeOver(state, world, command.payload.realId);
      if (r.ok) {
        ensureEquity(state);
        ensureBoard(state);
      }
      return r.ok ? { ok: true, id: r.result.airlineId } : fail(r.error);
    }
    case 'LeaseAircraft':
      return planCrewsAhead(state, world, command.airlineId, leaseAircraft(state, world, command.airlineId, command.payload.offerId));
    case 'OpenRoute':
      return withSlots(state, world, command.airlineId, () => openRoute(state, world, command.airlineId, command.payload));
    case 'UpdateTimetable': {
      const airline = state.airlines[command.airlineId];
      if (!airline) return fail('airlineUnknown');
      const { routes, effectiveAt, label } = command.payload;
      if (effectiveAt !== undefined && effectiveAt > state.time) {
        if (routes.some((r) => state.routes[r.routeId]?.airlineId !== airline.id)) return fail('routeUnknown');
        (airline.plannedTimetables ??= []).push({ at: effectiveAt, routes, label: label ?? '' });
        return { ok: true };
      }
      return withSlots(state, world, command.airlineId, () => applyPackage(state, world, command.airlineId, routes));
    }
    case 'UpdateRoute':
      return withSlots(state, world, command.airlineId, () => updateRoute(state, world, command.airlineId, command.payload));
    case 'BuySlots': {
      if (!state.airlines[command.airlineId]) return fail('airlineUnknown');
      const error = buySlots(state, world, command.airlineId, command.payload.airportId, command.payload.hours);
      return error ? fail(error) : { ok: true };
    }
    case 'HireCrew':
    case 'TrainCrew':
    case 'ReleaseCrew':
    case 'SetCrewPay':
    case 'SetCrewAuto': {
      const airline = state.airlines[command.airlineId];
      if (!airline) return fail('airlineUnknown');
      ensureCrew(state, world);
      const error =
        command.type === 'HireCrew'
          ? hireCrew(state, world, command.airlineId, command.payload.station, command.payload.role, command.payload.family, command.payload.count)
          : command.type === 'TrainCrew'
            ? trainCrew(state, command.airlineId, command.payload.station, command.payload.kind, command.payload.family, command.payload.count, command.payload.from)
            : command.type === 'ReleaseCrew'
              ? releaseCrew(state, world, command.airlineId, command.payload.station, command.payload.role, command.payload.family, command.payload.count)
              : command.type === 'SetCrewPay'
                ? setCrewPay(state, command.airlineId, command.payload.station, command.payload.pay)
                : ((airline.crew!.auto = command.payload.auto),
                  airline.mgmt && (airline.mgmt.delegation.hr = command.payload.auto ? 'auto' : 'approve'),
                  command.payload.auto && planCrew(state, world, command.airlineId),
                  null);
      return error ? fail(error) : { ok: true };
    }
    case 'HireManager':
    case 'FireManager':
    case 'SetDelegation':
    case 'ApproveProposal':
    case 'DeclineProposal': {
      const airline = state.airlines[command.airlineId];
      if (!airline) return fail('airlineUnknown');
      ensureMgmt(state, world);
      if (command.type === 'ApproveProposal') {
        const r = approveProposal(state, world, command.airlineId, command.payload.id);
        return r ? fail(r.error as CommandError) : { ok: true };
      }
      const error =
        command.type === 'HireManager'
          ? hireManager(state, world, command.airlineId, command.payload.candidateId)
          : command.type === 'FireManager'
            ? fireManager(state, world, command.airlineId, command.payload.dept)
            : command.type === 'SetDelegation'
              ? (setDelegation(state, command.airlineId, command.payload.dept, command.payload.level) ??
                (command.payload.dept === 'hr' && command.payload.level === 'auto' && airline.crew ? (planCrew(state, world, command.airlineId), null) : null))
              : declineProposal(state, command.airlineId, command.payload.id);
      return error ? fail(error) : { ok: true };
    }
    case 'ApplyAlliance':
    case 'AcceptAlliance':
    case 'LeaveAlliance':
    case 'FoundAlliance':
    case 'InviteToAlliance':
    case 'RemoveFromAlliance':
    case 'SignCodeshare':
    case 'EndCodeshare': {
      if (!state.airlines[command.airlineId]) return fail('airlineUnknown');
      const id = command.airlineId;
      const p = command.payload;
      const error =
        command.type === 'ApplyAlliance'
          ? applyToAlliance(state, world, id, p.alliance ?? '')
          : command.type === 'AcceptAlliance'
            ? acceptInvitation(state, id)
            : command.type === 'LeaveAlliance'
              ? leaveAlliance(state, world, id)
              : command.type === 'FoundAlliance'
                ? foundAlliance(state, world, id, p.name ?? '')
                : command.type === 'InviteToAlliance'
                  ? inviteToAlliance(state, world, id, p.partnerId ?? '')
                  : command.type === 'RemoveFromAlliance'
                    ? removeFromAlliance(state, world, id, p.partnerId ?? '')
                    : command.type === 'SignCodeshare'
                      ? signCodeshare(state, world, id, p.partnerId ?? '')
                      : endCodeshare(state, world, id, p.partnerId ?? '');
      return error ? fail(error) : { ok: true };
    }
    case 'TradeStake':
    case 'OfferTakeover':
    case 'MergeAirline':
    case 'AnswerBid': {
      if (!state.airlines[command.airlineId]) return fail('airlineUnknown');
      const error =
        command.type === 'TradeStake'
          ? tradeStake(state, world, command.airlineId, command.payload.listedId, command.payload.share)
          : command.type === 'OfferTakeover'
            ? offerTakeover(state, world, command.airlineId, command.payload.listedId, command.payload.price, command.payload.minAcceptance)
            : command.type === 'MergeAirline'
              ? mergeAirline(state, world, command.airlineId, command.payload.listedId, command.payload.memberId)
              : answerBid(state, command.airlineId, command.payload.tender);
      return error ? fail(error) : { ok: true };
    }
    case 'GoPublic':
    case 'IssueShares':
    case 'PayDividend':
    case 'BuyBack':
    case 'TradeOwnShares': {
      if (!state.airlines[command.airlineId]) return fail('airlineUnknown');
      ensureEquity(state);
      const p = command.payload as { share?: number; total?: number; shares?: number };
      const error =
        command.type === 'GoPublic'
          ? goPublic(state, command.airlineId, p.share!)
          : command.type === 'IssueShares'
            ? issueShares(state, command.airlineId, p.share!)
            : command.type === 'PayDividend'
              ? payDividend(state, command.airlineId, p.total!)
              : command.type === 'BuyBack'
                ? buyBack(state, command.airlineId, p.share!)
                : tradeOwnShares(state, command.airlineId, p.shares!);
      return error ? fail(error) : { ok: true };
    }
    case 'SetHedgePolicy':
    case 'HedgeDeal': {
      if (!state.airlines[command.airlineId]) return fail('airlineUnknown');
      const error =
        command.type === 'SetHedgePolicy'
          ? setHedgePolicy(state, world, command.airlineId, command.payload.policy)
          : hedgeDeal(state, world, command.airlineId, command.payload.kind, command.payload.monthsAhead, command.payload.amount);
      return error ? fail(error) : { ok: true };
    }
    case 'TakeLoan':
    case 'RepayLoan':
    case 'SaleLeaseback': {
      if (!state.airlines[command.airlineId]) return fail('airlineUnknown');
      const error =
        command.type === 'TakeLoan'
          ? takeLoan(state, command.airlineId, command.payload.kind, command.payload.amount, command.payload.years, command.payload.aircraftId)
          : command.type === 'RepayLoan'
            ? repayLoan(state, command.airlineId, command.payload.loanId)
            : saleLeaseback(state, command.airlineId, command.payload.aircraftId);
      return error ? fail(error) : { ok: true };
    }
    case 'StartLoyalty':
    case 'SetLoyalty':
    case 'LeaveLoyalty': {
      if (!state.airlines[command.airlineId]) return fail('airlineUnknown');
      const error =
        command.type === 'StartLoyalty'
          ? startProgramme(state, command.airlineId, command.payload.name)
          : command.type === 'SetLoyalty'
            ? setProgramme(state, command.airlineId, command.payload)
            : leaveProgramme(state, command.airlineId);
      return error ? fail(error) : { ok: true };
    }
    case 'SetFareBuckets':
    case 'SetBucketLimits': {
      if (!state.airlines[command.airlineId]) return fail('airlineUnknown');
      const error =
        command.type === 'SetFareBuckets'
          ? setFareBuckets(state, command.airlineId, command.payload.cls, command.payload.buckets)
          : setBucketLimits(state, command.airlineId, command.payload.routeId, command.payload.cls, command.payload.limits);
      return error ? fail(error) : { ok: true };
    }
    case 'SetFares': {
      const route = state.routes[command.payload.routeId];
      if (!route || route.airlineId !== command.airlineId) return fail('routeUnknown');
      const from = world.airportById.get(route.originId);
      const to = world.airportById.get(route.destinationId);
      if (!from || !to) return fail('airportUnknown');
      const [low, high] = fareRange(state, from, to);
      const fares = [command.payload.fareFactor, ...Object.values(command.payload.classFares ?? {})];
      if (!fares.every((f) => Number.isFinite(f) && f >= Math.max(0.5, low) - 1e-9 && f <= Math.min(1.5, high) + 1e-9)) return fail('fareInvalid');
      // Each flight's own level: −30 … +30 % (before deregulation only within the official band).
      const flightFares = Object.entries(command.payload.flightFares ?? {});
      const [fLow, fHigh] = [Math.max(FLIGHT_FARE_RANGE[0], low), Math.min(FLIGHT_FARE_RANGE[1], high)];
      for (const [pairId, pf] of flightFares) {
        if (state.flights[pairId]?.routeId !== route.id) return fail('routeUnknown');
        if (!pf.every((f) => Number.isFinite(f) && f >= fLow - 1e-9 && f <= fHigh + 1e-9)) return fail('fareInvalid');
      }
      route.fareFactor = command.payload.fareFactor;
      if (command.payload.classFares) route.classFares = { ...route.classFares, ...command.payload.classFares };
      for (const [pairId, pf] of flightFares) {
        const pair = state.flights[pairId]!;
        if (pf[0] === 1 && pf[1] === 1) delete pair.fares;
        else pair.fares = [pf[0], pf[1]];
      }
      return { ok: true, id: route.id };
    }
    case 'RunCrewPlan': {
      if (!state.airlines[command.airlineId]?.crew) return fail('airlineUnknown');
      planCrew(state, world, command.airlineId);
      return { ok: true };
    }
    case 'OfferWage':
    case 'AcceptDemand':
    case 'CallMediation':
    case 'AnswerProposal': {
      if (!state.airlines[command.airlineId]) return fail('airlineUnknown');
      ensureLabour(state, world);
      const key = command.payload.key;
      const error =
        command.type === 'OfferWage'
          ? offerWage(state, command.airlineId, key, command.payload.raise)
          : command.type === 'AcceptDemand'
            ? acceptDemand(state, command.airlineId, key)
            : command.type === 'CallMediation'
              ? callMediation(state, command.airlineId, key)
              : answerProposal(state, command.airlineId, key, command.payload.accept);
      return error ? fail(error) : { ok: true };
    }
    case 'OpenBase':
    case 'CloseBase':
    case 'StationAircraft': {
      if (!state.airlines[command.airlineId]) return fail('airlineUnknown');
      const error =
        command.type === 'OpenBase'
          ? openBase(state, world, command.airlineId, command.payload.airportId)
          : command.type === 'CloseBase'
            ? closeBase(state, command.airlineId, command.payload.airportId)
            : stationAircraft(state, command.airlineId, command.payload.aircraftId, command.payload.airportId);
      return error ? fail(error) : { ok: true };
    }
    case 'RentGates': {
      if (!state.airlines[command.airlineId]) return fail('airlineUnknown');
      ensureHubFacilities(state, world);
      const error = setGates(state, world, command.airlineId, command.payload.contact, command.payload.remote, command.payload.airportId);
      return error ? fail(error) : { ok: true };
    }
    case 'BuildLounge': {
      if (!state.airlines[command.airlineId]) return fail('airlineUnknown');
      const error = buildLounge(state, world, command.airlineId, command.payload.seats, command.payload.quality, command.payload.airportId);
      return error ? fail(error) : { ok: true };
    }
    case 'CloseLounge': {
      if (!state.airlines[command.airlineId]) return fail('airlineUnknown');
      const error = closeLounge(state, command.airlineId, command.payload.airportId);
      return error ? fail(error) : { ok: true };
    }
    case 'RequestSlots':
      if (!state.airlines[command.airlineId]) return fail('airlineUnknown');
      requestSlots(state, world, command.payload.airportId, command.payload.hours);
      return { ok: true };
    case 'CloseRoute':
      return closeRoute(state, world, command.airlineId, command.payload.routeId);
    case 'SetScheduling':
      if (state.options.scheduling === 'detailed') return fail('alreadyDetailed');
      if (!state.airlines[command.airlineId]) return fail('airlineUnknown');
      makeDetailed(state);
      return { ok: true };
    case 'OrderAircraft':
    case 'BuyAircraft': {
      const airline = state.airlines[command.airlineId];
      const country = world.airportById.get(airline?.hubId ?? '')?.country ?? 'XX';
      const reg = (c: string) => newRegistration(state, c);
      return planCrewsAhead(
        state,
        world,
        command.airlineId,
        command.type === 'OrderAircraft' ? orderAircraft(state, command.airlineId, command.payload, reg, country) : buyAircraft(state, command.airlineId, command.payload.offerId, reg, country),
      );
    }
    case 'CancelOrder':
      return cancelOrder(state, world, command.airlineId, command.payload.aircraftId);
    case 'SellAircraft':
      // An aircraft securing a loan can't be sold until the loan is repaid (Phase 10.1).
      if (state.airlines[command.airlineId]?.loans?.some((l) => l.aircraftId === command.payload.aircraftId)) return fail('aircraftPledged');
      return disposeAircraft(state, world, command.airlineId, command.payload.aircraftId, command.payload.scrap ? 'scrap' : 'sell');
    case 'ReturnLease':
      return returnLeased(state, world, command.airlineId, command.payload.aircraftId, true);
    case 'ExtendLease':
      return extendLease(state, command.airlineId, command.payload.aircraftId, command.payload.years);
    case 'SetTimeMode':
      if (state.options.timeMode === 'realclock') return fail('alreadyRealClock');
      if (!state.airlines[command.airlineId]) return fail('airlineUnknown');
      state.options.timeMode = 'realclock';
      state.options.clockOffset = Math.max(0, state.time - command.payload.now);
      return { ok: true };
    case 'SetLivery':
      return setLivery(state, command.airlineId, command.payload.livery);
    case 'Repaint':
      return repaint(state, command.airlineId, command.payload.aircraftId, command.payload.atCheck);
    case 'MoveCheck':
      return moveCheck(state, world, command.airlineId, command.payload.aircraftId, command.payload.start);
    case 'BuildHangar':
      return buildHangar(state, command.airlineId, command.payload.size);
    case 'RefitCabin':
      return refitCabin(state, command.airlineId, command.payload.aircraftId, command.payload.cabin);
  }
}

/**
 * Starting capital for a startup, in the hub country's currency, rounded to a headline figure. The choices are in
 * today's euros; a historical game gets the same buying power in the money of its year (`priceLevel` = then-year
 * dollars per today's dollar).
 */
export function startingCapital(fx: FxRates, capitalEur: number, currency: string, priceLevel = 1): Money {
  if (priceLevel === 1) return money(roundNice(convert(money(capitalEur, 'EUR'), currency, fx).amount), currency);
  const usd = capitalEur * (ECB_RATES.USD ?? 1) * priceLevel;
  return money(roundNice(convert(money(usd, 'USD'), currency, fx).amount), currency);
}

/** The currency a new airline keeps its books in: the hub country's money of the time (if its rate is known). */
export function bookCurrencyAt(state: GameState, country: string): string {
  const currency = currencyAt(country, toDate(state.time));
  return state.fx[currency] ? currency : 'USD';
}

function foundAirline(state: GameState, world: EngineWorld, p: FoundAirline['payload']): CommandResult {
  const name = p.name.trim();
  if (name.length < 2 || name.length > 40) return fail('nameLength');
  // Designators: IATA style = 2 characters (letters/digits, not two digits); ICAO = 3 letters.
  const iata = p.iata.trim().toUpperCase();
  const icao = p.icao.trim().toUpperCase();
  if (!/^[A-Z0-9]{2}$/.test(iata) || /^\d\d$/.test(iata)) return fail('iataFormat');
  if (!/^[A-Z]{3}$/.test(icao)) return fail('icaoFormat');
  const airlines = Object.values(state.airlines);
  if (airlines.some((a) => a.iata === iata || a.icao === icao)) return fail('codeTaken');
  if (![p.primary, p.secondary].every((c) => /^#[0-9a-f]{6}$/i.test(c))) return fail('colorFormat');
  const hub = world.airportById.get(p.hubId);
  if (!hub) return fail('hubUnknown');
  if (!(CAPITAL_OPTIONS_EUR as readonly number[]).includes(p.capitalEur)) return fail('capitalInvalid');

  const id = nextId(state, 'AL');
  const currency = bookCurrencyAt(state, hub.country);
  state.airlines[id] = {
    id,
    name,
    iata,
    icao,
    controller: p.controller,
    hubId: hub.id,
    colors: { primary: p.primary.toLowerCase(), secondary: p.secondary.toLowerCase() },
    currency,
    cash: money(0, currency),
    foundedAt: state.time,
    // A new airline has no crews yet: it hires them (Phase 8.1; the HR department plans automatically).
    ...(p.controller === 'human' ? { crew: { stations: {}, auto: true, hired: {} } } : {}),
  };
  state.finance[id] = newFinance(state.time);
  if (p.controller === 'human') state.reputation[id] = newReputation();
  state.airlines[id]!.liveries = [defaultLivery(state.airlines[id]!.colors, name, p.iata.toUpperCase())];
  const capital = book(state, id, 'capital', startingCapital(state.fx, p.capitalEur, currency, state.options.startYear !== undefined ? priceLevelAt(state.time) : 1));
  postMessage(state, {
    airlineId: id,
    kind: 'founded',
    level: 'info',
    params: { name, hub: hub.iata ?? hub.icao ?? hub.id, capital: capital.amount, currency },
  });
  return { ok: true, id };
}

function leaseAircraft(state: GameState, world: EngineWorld, airlineId: string, offerId: string): CommandResult {
  const airline = state.airlines[airlineId];
  if (!airline) return fail('airlineUnknown');
  const index = state.market.offers.findIndex((o) => o.id === offerId && o.expiresAt > state.time);
  if (index < 0) return fail('offerGone');
  const offer = state.market.offers[index]!;
  // The lessor wants the security deposit in cash on signing.
  if (airline.cash.amount < convert(offer.deposit, airline.currency, state.fx).amount) return fail('insufficientCash');

  state.market.offers.splice(index, 1);
  const hub = world.airportById.get(airline.hubId);
  const deliveryAt = startOfDay(state.time) + offer.deliveryDays * MINUTES_PER_DAY + 9 * 60;
  const d = toDate(deliveryAt);
  const id = nextId(state, 'AC');
  const registration = newRegistration(state, hub?.country ?? 'XX');
  state.aircraft[id] = {
    id,
    typeId: offer.typeId,
    airlineId,
    registration,
    builtYear: offer.builtYear,
    seats: offer.seats,
    cabin: offer.cabin,
    status: 'delivering',
    deliveryAt,
    locationId: airline.hubId,
    lease: {
      lessor: offer.lessor,
      monthlyRent: offer.monthlyRent,
      deposit: offer.deposit,
      startAt: deliveryAt,
      endAt: simTime(d.getUTCFullYear(), d.getUTCMonth() + 1 + offer.termMonths, d.getUTCDate()),
    },
  };
  book(state, airlineId, 'leaseDeposit', money(-offer.deposit.amount, offer.deposit.currency), id);
  schedule(state, { at: deliveryAt, kind: 'delivery', aircraftId: id });
  postMessage(state, {
    airlineId,
    kind: 'leaseSigned',
    level: 'info',
    params: { registration, type: getAircraftType(offer.typeId).name, lessor: offer.lessor, deliveryAt },
  });
  return { ok: true, id };
}

/** Checks route settings against all rules; shared by opening and changing a route (and by the planner screen). */
export function validateRoute(
  state: GameState,
  world: EngineWorld,
  airlineId: string,
  destinationId: string,
  settings: RouteSettings,
  exceptRouteId?: string,
): CommandError | null {
  const airline = state.airlines[airlineId];
  if (!airline) return 'airlineUnknown';
  const originId = (exceptRouteId ? state.routes[exceptRouteId]?.originId : settings.originId) ?? airline.hubId;
  if (!stationsOf(airline).includes(originId)) return 'originNotBase';
  const from = world.airportById.get(originId);
  const to = world.airportById.get(destinationId);
  if (!from || !to) return 'airportUnknown';
  if (from.id === to.id) return 'sameAirport';
  const fares = [settings.fareFactor, ...Object.values(settings.classFares ?? {})];
  const [low, high] = fareRange(state, from, to);
  if (!fares.every((f) => f >= low - 1e-9 && f <= high + 1e-9)) return 'fareInvalid';
  if (state.options.scheduling === 'detailed') {
    const existing = exceptRouteId ? state.routes[exceptRouteId] : undefined;
    const route: Route = existing ?? { ...draftRoute(airlineId, from, to), id: '' };
    return validateSpecs(state, world, route, settings.flights ?? [])?.error ?? null;
  }
  const aircraft = state.aircraft[settings.aircraftId];
  if (!aircraft || aircraft.airlineId !== airlineId) return 'aircraftUnknown';
  if (stationOf(airline, aircraft) !== originId) return 'aircraftElsewhere';
  if (!Number.isInteger(settings.frequency) || settings.frequency < 1 || settings.frequency > MAX_FREQUENCY) return 'frequencyInvalid';
  const type = getAircraftType(aircraft.typeId);
  const problem = checkRoute(world, type, from, to);
  if (problem) return problem;
  const hours = aircraftHours(state, aircraft.id, exceptRouteId) + roundTripHours(type, distanceKm(from, to)) * settings.frequency;
  if (hours > WEEKLY_AVAILABLE_HOURS[type.category] + 1e-9) return 'aircraftBusy';
  return null;
}

/** A route that is not saved yet (for checks and forecasts in the planner). */
export function draftRoute(airlineId: string, from: { id: string; lat: number; lon: number }, to: { id: string; lat: number; lon: number }): Route {
  return {
    id: 'draft',
    airlineId,
    originId: from.id,
    destinationId: to.id,
    distanceKm: Math.round(distanceKm(from, to)),
    aircraftId: '',
    frequency: 0,
    fareFactor: 1,
    classFares: { ...DEFAULT_CLASS_FARES },
    flightNumber: 0,
    openedAt: 0,
  };
}

function openRoute(state: GameState, world: EngineWorld, airlineId: string, p: OpenRoute['payload']): CommandResult {
  const error = validateRoute(state, world, airlineId, p.destinationId, p);
  if (error) return fail(error);
  const airline = state.airlines[airlineId]!;
  const routes = Object.values(state.routes).filter((r) => r.airlineId === airlineId);
  const originId = p.originId ?? airline.hubId;
  // One route per pair of airports (either way round).
  if (routes.some((r) => (r.originId === originId && r.destinationId === p.destinationId) || (r.originId === p.destinationId && r.destinationId === originId))) {
    return fail('routeExists');
  }
  const from = world.airportById.get(originId)!;
  const to = world.airportById.get(p.destinationId)!;
  // Flight numbers: outbound odd (101, 103 …), return = outbound + 1, like most airlines.
  const used = new Set(routes.map((r) => r.flightNumber));
  let flightNumber = 101;
  while (used.has(flightNumber)) flightNumber += 2;
  const route: Route = {
    ...draftRoute(airlineId, from, to),
    id: nextId(state, 'R'),
    aircraftId: p.aircraftId,
    frequency: p.frequency,
    fareFactor: p.fareFactor,
    classFares: { ...DEFAULT_CLASS_FARES, ...p.classFares },
    flightNumber,
    openedAt: state.time,
  };
  state.routes[route.id] = route;
  if (state.options.scheduling === 'detailed') setRoutePairs(state, route, p.flights ?? []);
  else autoPlanAircraft(state, world, route.aircraftId);
  postMessage(state, {
    airlineId,
    kind: 'routeOpened',
    level: 'info',
    params: { flight: `${airline.iata} ${flightNumber}`, from: from.iata ?? from.id, to: to.iata ?? to.id, frequency: route.frequency },
  });
  return { ok: true, id: route.id };
}

function updateRoute(state: GameState, world: EngineWorld, airlineId: string, p: UpdateRoute['payload']): CommandResult {
  const route = state.routes[p.routeId];
  if (!route || route.airlineId !== airlineId) return fail('routeUnknown');
  const error = validateRoute(state, world, airlineId, route.destinationId, p, route.id);
  if (error) return fail(error);
  route.fareFactor = p.fareFactor;
  if (p.classFares) route.classFares = { ...route.classFares, ...p.classFares };
  if (state.options.scheduling === 'detailed') {
    setRoutePairs(state, route, p.flights ?? []);
  } else {
    const before = route.aircraftId;
    route.aircraftId = p.aircraftId;
    route.frequency = p.frequency;
    autoPlanAircraft(state, world, route.aircraftId);
    if (before !== route.aircraftId) autoPlanAircraft(state, world, before);
  }
  return { ok: true, id: route.id };
}

function closeRoute(state: GameState, world: EngineWorld, airlineId: string, routeId: string): CommandResult {
  const route = state.routes[routeId];
  if (!route || route.airlineId !== airlineId) return fail('routeUnknown');
  delete state.routes[routeId];
  const aircraftIds = new Set(pairsOfRoute(state, routeId).map((p) => p.aircraftId));
  for (const pair of pairsOfRoute(state, routeId)) delete state.flights[pair.id];
  if (state.options.scheduling === 'simple') for (const id of aircraftIds) autoPlanAircraft(state, world, id);
  const airline = state.airlines[airlineId]!;
  const to = world.airportById.get(route.destinationId);
  postMessage(state, {
    airlineId,
    kind: 'routeClosed',
    level: 'info',
    params: { flight: `${airline.iata} ${route.flightNumber}`, to: to?.iata ?? route.destinationId },
  });
  return { ok: true, id: routeId };
}

function refitCabin(state: GameState, airlineId: string, aircraftId: string, cabin: CabinLayout): CommandResult {
  const airline = state.airlines[airlineId];
  const aircraft = state.aircraft[aircraftId];
  if (!airline) return fail('airlineUnknown');
  if (!aircraft || aircraft.airlineId !== airlineId) return fail('aircraftUnknown');
  if (inRefit(aircraft, state.time)) return fail('inRefit');
  if (grounded(aircraft, state.time)) return fail('inCheck');
  const type = getAircraftType(aircraft.typeId);
  const error = validateCabin(type, cabin);
  if (error) return fail(error);
  const quote = refitQuote(type, aircraft.cabin, cabin, priceLevelAt(state.time));
  if (quote.costUsd === 0 && quote.days === 0) return fail('cabinUnchanged');
  const layout = cabin.map((s) => ({ cls: s.cls, product: s.product, pitch: s.pitch, seats: s.seats }));

  // Before delivery the new layout is part of the transition work (repaint, paperwork) the lessor does anyway.
  if (aircraft.status === 'delivering') {
    aircraft.cabin = layout;
    aircraft.seats = totalSeats(layout);
    postMessage(state, { airlineId, kind: 'cabinChanged', level: 'info', params: { registration: aircraft.registration, cabin: cabinCode(layout) } });
    return { ok: true, id: aircraft.id };
  }

  const cost = convert(money(quote.costUsd, 'USD'), airline.currency, state.fx);
  if (airline.cash.amount < cost.amount) return fail('insufficientCash');
  book(state, airlineId, 'refit', money(-quote.costUsd, 'USD'), aircraft.id);
  // The investment is written off over six years (or until the lease ends), together with what is left of older refits.
  const today = startOfDay(state.time);
  const left = aircraft.cabinDepreciation && aircraft.cabinDepreciation.until > today ? (aircraft.cabinDepreciation.perDay * (aircraft.cabinDepreciation.until - today)) / MINUTES_PER_DAY : 0;
  const until = Math.min(aircraft.lease?.endAt ?? Infinity, today + REFIT_DEPRECIATION_YEARS * 365 * MINUTES_PER_DAY);
  const days = Math.max(1, (until - today) / MINUTES_PER_DAY);
  aircraft.cabinDepreciation = { perDay: (cost.amount + left) / days, until };
  aircraft.cabin = layout;
  aircraft.seats = totalSeats(layout);
  aircraft.refitUntil = today + (quote.days + 1) * MINUTES_PER_DAY;
  schedule(state, { at: aircraft.refitUntil, kind: 'refitDone', aircraftId: aircraft.id });
  postMessage(state, {
    airlineId,
    kind: 'refitStarted',
    level: 'caution',
    params: { registration: aircraft.registration, cabin: cabinCode(layout), days: quote.days, amount: cost.amount, currency: airline.currency, until: aircraft.refitUntil },
  });
  return { ok: true, id: aircraft.id };
}

/** A registration that follows the country's pattern and is not used yet in this game. */
export function newRegistration(state: GameState, country: string): string {
  const pattern = registrationPattern(country);
  const taken = new Set(Object.values(state.aircraft).map((a) => a.registration));
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let attempt = 0; attempt < 1000; attempt++) {
    const reg = pattern.replace(/[?#%]/g, (ch) =>
      ch === '?' ? letters[randomInt(state, 0, 25)]! : String(ch === '#' ? randomInt(state, 0, 9) : randomInt(state, 1, 9)),
    );
    if (!taken.has(reg)) return reg;
  }
  throw new Error(`No free registration for ${country}`);
}

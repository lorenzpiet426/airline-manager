// The airline economics model (Realistic mode): how many people want to fly between two airports,
// what they pay, how long the flight takes and what it costs to operate. All amounts in US dollars;
// they are converted into the airline's book currency when booked.
// Calibration notes and sources: docs/DATA_SOURCES.md ("Economics model").
import { CHECK_SHARE } from '../data/maintenance';
import { getAircraftType, TURNAROUND_MIN, type AircraftCategory, type AircraftType } from '../data/aircraft';
import { fuelUsdPerKg, INTO_PLANE_USD_PER_GAL, jetFuelSpot, KG_PER_GALLON } from '../data/fuel';
import type { Conditions } from './worldEvents';
import type { Airport } from '../data/types';
import { distanceKm, greatCirclePoints } from './geo';
import type { BusinessModel, SourceTag } from './realAirlines';
import {
  abreast,
  brandAppeal,
  classDemandShare,
  classFareRatio,
  classFit,
  CLASSES,
  economyCabin,
  expectedScore,
  fareFactorOf,
  haul,
  MODEL_REPUTATION,
  modelCabin,
  premiumCrew,
  seatAppeal,
  seatScore,
  serviceCostUsd,
  START_REPUTATION,
  type Segment,
} from './cabins';
import type { AiState, CabinClass, CabinLayout, CabinSection, ClassFares, ExperienceSums } from './state';
import { fromDate, utcOffsetMin, type SimTime } from './time';
import {
  BLOCK_OVERHEAD_H,
  blockMinutes,
  dailyWeights,
  DAYS_ALL,
  dayShares,
  hasDay,
  homeDepartures,
  isEastbound,
  LONG_HAUL_MIN,
  ROUTING_FACTOR,
  seedOf,
  shiftDays,
  spreadDays,
  weekdayFactor,
  wrapDay,
  type DayOption,
} from './timetable';
import { longestHardRunwayM, type EngineWorld } from './world';

// ─── Flight times ──────────────────────────────────────────────────────────────


/** Gate-to-gate time ("block time") in hours. */
export const blockHours = (type: AircraftType, km: number): number =>
  BLOCK_OVERHEAD_H + (km * ROUTING_FACTOR) / type.cruiseKmh;

/** Time one round trip occupies an aircraft: two flights plus two turnarounds (hours). */
export const roundTripHours = (type: AircraftType, km: number): number =>
  2 * (blockHours(type, km) + TURNAROUND_MIN[type.category] / 60);

/** Hours per week an aircraft can be scheduled (the rest: night stops, checks, buffers). Long-haul jets fly through the night. */
export const WEEKLY_AVAILABLE_HOURS: Record<AircraftCategory, number> = {
  turboprop: 112,
  regional: 119,
  narrowbody: 126,
  widebody: 154,
};

// ─── Route checks: range, runway, ETOPS ─────────────────────────────────────────

export type RouteProblem = 'range' | 'runwayOrigin' | 'runwayDestination' | 'etops';

/** Runway needed to take off for a flight of `km`: full length only at maximum range (less fuel = lighter). */
export function runwayNeededM(type: AircraftType, km: number): number {
  return Math.round(type.takeoffM * (0.6 + 0.4 * Math.min(1, km / type.rangeKm)));
}

/**
 * Twin-engine jets must always stay within a set flying time (on one engine) of a suitable airport:
 * 60 minutes without ETOPS approval, otherwise the type's ETOPS time (e.g. 180 min for an A321neo).
 */
export function diversionRadiusKm(type: AircraftType): number {
  const minutes = type.etopsMin || 60;
  return 0.8 * type.cruiseKmh * (minutes / 60);
}

/** The first rule a route breaks for this aircraft type, or null if it can be flown. */
export function checkRoute(world: EngineWorld, type: AircraftType, from: Airport, to: Airport): RouteProblem | null {
  const km = distanceKm(from, to);
  if (km > type.rangeKm) return 'range';
  const needed = runwayNeededM(type, km);
  if (longestHardRunwayM(from) < needed) return 'runwayOrigin';
  if (longestHardRunwayM(to) < needed) return 'runwayDestination';
  const radius = diversionRadiusKm(type);
  if (km > radius) {
    for (const point of greatCirclePoints(from, to, 150)) {
      if (!world.diversionAirports.some((a) => Math.abs(a.lat - point.lat) * 111 <= radius && distanceKm(a, point) <= radius)) {
        return 'etops';
      }
    }
  }
  return null;
}

// ─── Demand ────────────────────────────────────────────────────────────────────

// Gravity model, fitted to Eurostat 2019 passenger totals on 46 routes from Austrian airports
// (error about ×1.9 on average; hub-transfer and holiday traffic are underestimated).
const DEMAND_K = 44_253;
const POP_EXP = 0.7;
const WEALTH_EXP = 0.2;
const DISTANCE_EXP = 0.8;
const TOURISM_EXP = 0.3;
/** Below this distance (km) trains and cars take most travellers (VIE–BUD, 214 km: hardly anyone flies). */
const GROUND_KM = 400;
const GROUND_EXP = 4;
/** Share of a price cut the existing airlines match. */
const INCUMBENT_PRICE_MATCH = 0.5;
/** Big airports draw passengers from far away (tourism, transfers): at least this many "market people". */
const LARGE_AIRPORT_FLOOR = 500_000;

export interface Market {
  distanceKm: number;
  /** Passengers per year, both directions together, at the market fare. */
  annualPax: number;
  /** Passengers per week in each direction. */
  weeklyPax: number;
  /** True when the passenger numbers were measured (Eurostat) rather than estimated by the gravity model. */
  observed: boolean;
  /** Share of business travellers (pay more, care less about price). */
  businessShare: number;
  /** One-way flights per week by the airlines already flying here (not yet shown as AI airlines). */
  incumbentFlights: number;
  /**
   * The one-stop alternative (e.g. via Frankfurt or New York), counted as if it were this many
   * non-stop flights per week: slower, but there are many of them and they are often cheap.
   */
  connectingFlights: number;
}

/** One-stop connections compete more on long routes (a stop costs little extra time) than on short ones. */
const connectingEquivalent = (km: number) => 2 + 4 * Math.min(1, km / 3000);

const wealth = (world: EngineWorld, a: Airport) =>
  Math.min(2.5, Math.max(0.05, (world.countries[a.country]?.gdpPerCapitaUsd ?? 10_000) / 40_000));

const marketPeople = (a: Airport) => Math.max(a.marketPop, a.size === 'large' ? LARGE_AIRPORT_FLOOR : 0) / 1e6;

export function market(world: EngineWorld, a: Airport, b: Airport): Market {
  const km = Math.max(distanceKm(a, b), 50);
  const tourism = ((1 + world.tourismIntensity(a.country)) * (1 + world.tourismIntensity(b.country))) ** TOURISM_EXP;
  const annualPax =
    DEMAND_K *
    (marketPeople(a) * marketPeople(b) * tourism) ** POP_EXP *
    (wealth(world, a) * wealth(world, b)) ** WEALTH_EXP *
    (km / 1000) ** -DISTANCE_EXP /
    (1 + (GROUND_KM / km) ** GROUND_EXP);
  // Where real passenger numbers were measured (Eurostat, summer), they replace the model's estimate: they include
  // package holidays and transfer passengers the model misses. Summer weeks are busier than the yearly average.
  const observed = world.realAirlines?.observedWeeklyPax(a.id, b.id) ?? null;
  // About a quarter of them change planes at a hub on the way: a point-to-point airline can't win those (until hub
  // connections arrive in Phase 7), so only the local share counts.
  const weeklyPax = observed !== null ? (observed * LOCAL_SHARE) / SUMMER_AVERAGE_SEASON : annualPax / 52 / 2;
  const businessShare = Math.min(0.4, Math.max(0.1, 0.1 + 0.15 * Math.min(wealth(world, a), wealth(world, b))));
  // Who serves this market today? Typical aircraft size grows with distance; ~80 % of seats filled.
  const typicalSeats = km < 1500 ? 150 : km < 4000 ? 190 : 280;
  const flights = weeklyPax / (typicalSeats * 0.8);
  return {
    distanceKm: km,
    annualPax: observed !== null ? weeklyPax * 2 * 52 : annualPax,
    weeklyPax,
    observed: observed !== null,
    businessShare,
    incumbentFlights: flights >= 3 ? Math.round(flights) : 0,
    connectingFlights: connectingEquivalent(km),
  };
}

// ─── Seasons ───────────────────────────────────────────────────────────────────

// Monthly demand relative to the yearly average (northern hemisphere), from typical European airport
// traffic patterns: holidaymakers peak in July/August, business travellers dip in August and at Christmas.
/** Average season factor of the months April–September (the Eurostat S24 window), to turn summer numbers into a yearly average. */
const SUMMER_AVERAGE_SEASON = 1.12;
/** Share of measured route passengers who travel only this route (the rest are hub transfers). */
const LOCAL_SHARE = 0.75;
const LEISURE_SEASON = [0.75, 0.8, 0.9, 1.0, 1.05, 1.15, 1.3, 1.3, 1.1, 1.0, 0.8, 0.85];
const BUSINESS_SEASON = [0.95, 1.05, 1.1, 1.05, 1.05, 1.0, 0.85, 0.75, 1.05, 1.1, 1.1, 0.9];

/** How busy a month is at this airport for holidaymakers: southern hemisphere reversed, tropics flatter. */
function leisureSeason(a: Airport, month: number): number {
  const shifted = a.lat < -10 ? (month + 6) % 12 : month;
  const tropics = Math.abs(a.lat) < 15 ? 0.5 : 1;
  return 1 + (LEISURE_SEASON[shifted]! - 1) * tropics;
}

/** Demand this month relative to the yearly average (1 = average month). */
export function seasonFactor(a: Airport, b: Airport, businessShare: number, date: Date): number {
  const month = date.getUTCMonth();
  const leisure = (leisureSeason(a, month) + leisureSeason(b, month)) / 2;
  return businessShare * BUSINESS_SEASON[month]! + (1 - businessShare) * leisure;
}

// ─── Real competitors (Phase 2.1a) ───────────────────────────────────────────────

/** Typical fare level of each airline type relative to the market fare. */
export const MODEL_FARE: Record<BusinessModel, number> = { legacy: 1.05, lowcost: 0.75, regional: 1.0, charter: 0.85 };

export interface Competitor {
  airlineId: string;
  name: string;
  model: BusinessModel;
  /** Flights per week in this direction. */
  weekly: number;
  /** Where the weekly number comes from: official totals split between airlines, or the demand model. */
  source: SourceTag;
  fareFactor: number;
  seasonal: boolean;
  /** The AI changed this route in this game (frequency, fare, or it is new). */
  changed: boolean;
}

/** A non-stop offer on a route from the passengers' point of view (for the market share calculation). */
export interface Supplier {
  /** Flights per week in this direction. */
  weekly: number;
  /** Fare relative to the market fare. */
  fareFactor: number;
  /** 0…1: slow aircraft (turboprops on long routes) attract fewer travellers. */
  speed?: number;
}

/** Key of an AI route in the save: "airline|A|B" with A < B. */
export const aiRouteKey = (airline: string, x: string, y: string) => (x < y ? `${airline}|${x}|${y}` : `${airline}|${y}|${x}`);

/**
 * The real airlines on a route (in this direction), including the AI's changes in this game (2.1b): new and closed
 * routes, changed frequencies and fares, bankrupt airlines. Routes without official numbers get frequencies from the
 * demand model: the flights the market needs at ~80 % load, shared between the airlines listed for the route.
 * Returns null when the game runs without real airline data.
 */
export function competitorsOn(
  world: EngineWorld,
  from: Airport,
  to: Airport,
  m = market(world, from, to),
  ai?: AiState,
): Competitor[] | null {
  const real = world.realAirlines;
  if (!real) return null;
  const base = real.on(from.id, to.id);
  const [a] = from.id < to.id ? [from.id, to.id] : [to.id, from.id];
  const forward = from.id === a;
  const added = (ai?.added[from.id < to.id ? `${from.id}|${to.id}` : `${to.id}|${from.id}`] ?? [])
    .filter((id) => !base.some((b) => b.airline.id === id))
    .flatMap((id) => {
      const airline = real.byId.get(id);
      return airline ? [{ airline, weekly: null as number | null, seasonal: false, charter: false }] : [];
    });
  const list = [...base, ...added];
  if (!list.length) return [];
  const typicalSeats = m.distanceKm < 1500 ? 150 : m.distanceKm < 4000 ? 190 : 280;
  const needed = m.weeklyPax / (typicalSeats * 0.8);
  const modelled = (seasonal: boolean, charter: boolean) =>
    Math.max(1, Math.round(((needed / list.length) * (seasonal ? 0.5 : 1) * (charter ? 0.5 : 1)) * 2) / 2);
  const result: Competitor[] = [];
  for (const c of list) {
    if (ai?.airlines[c.airline.id]?.status === 'bankrupt') continue;
    const change = ai?.routes[aiRouteKey(c.airline.id, from.id, to.id)];
    if (change?.closed) continue;
    const weekly = change ? (forward ? change.weeklyAB : change.weeklyBA) : (c.weekly ?? modelled(c.seasonal, c.charter));
    result.push({
      airlineId: c.airline.id,
      name: c.airline.name,
      model: c.airline.model,
      weekly,
      // Official only if unchanged and the airline is alone on the route; a split of the route total is an estimate.
      source: !change && c.weekly !== null && list.length === 1 ? 'official' : 'modelled',
      fareFactor: change?.fare ?? MODEL_FARE[c.airline.model],
      seasonal: c.seasonal,
      changed: !!change,
    });
  }
  return result;
}

/** Fuel price at which fares were calibrated; fares follow fuel partly (fuel surcharges). */
const FARE_FUEL_REFERENCE = 2.2;

/** Average one-way fare in USD on this market (all passengers, economy and business mixed). */
export function marketFareUsd(world: EngineWorld, a: Airport, b: Airport, date: Date, fuelSpot = jetFuelSpot(date)): number {
  const km = Math.max(distanceKm(a, b), 50);
  const meanWealth = (wealth(world, a) + wealth(world, b)) / 2;
  const fuelIndex = 1 + 0.35 * (fuelSpot / FARE_FUEL_REFERENCE - 1);
  return (55 + 0.13 * km ** 0.92) * Math.min(1.25, Math.max(0.6, meanWealth ** 0.25)) * fuelIndex;
}

// ─── Costs ─────────────────────────────────────────────────────────────────────

/** Salary level of a country relative to Austria (where our salary figures come from). */
export function wageFactor(world: EngineWorld, country: string): number {
  const gdp = world.countries[country]?.gdpPerCapitaUsd ?? 10_000;
  return Math.min(1.25, Math.max(0.35, Math.sqrt(gdp / 62_930)));
}

/** Airport fee level: big, rich airports charge more. */
function airportFactor(world: EngineWorld, a: Airport): number {
  const size = { large: 1, medium: 0.65, small: 0.45 }[a.size];
  const gdp = world.countries[a.country]?.gdpPerCapitaUsd ?? 10_000;
  return size * Math.min(1.4, Math.max(0.4, (gdp / 40_000) ** 0.4));
}

/** Employer cost per year (USD) at Austrian salary level. */
const PILOT_COST_USD = { short: 135_000, long: 175_000 };
const CABIN_CREW_COST_USD = 45_000;

/** Crew needed to keep one aircraft flying all week (several crews take turns). */
export function crewPerAircraft(type: AircraftType, seats: number, cabin?: CabinLayout) {
  const wide = type.category === 'widebody';
  // EU rules: at least one cabin crew member per 50 seats; long-haul service needs more, premium cabins even more.
  const cabinPerFlight = Math.max(1, Math.ceil(seats / (wide ? 35 : 50))) + (cabin ? premiumCrew(type, cabin) : 0);
  return { pilots: wide ? 18 : 10, cabin: cabinPerFlight * (wide ? 8 : 5) };
}

/** Crew salaries for one aircraft per day (USD), paid whether it flies or not. */
export function crewCostPerDayUsd(world: EngineWorld, type: AircraftType, seats: number, hubCountry: string, cabin?: CabinLayout): number {
  const crew = crewPerAircraft(type, seats, cabin);
  const pilot = type.category === 'widebody' ? PILOT_COST_USD.long : PILOT_COST_USD.short;
  return ((crew.pilots * pilot + crew.cabin * CABIN_CREW_COST_USD) * wageFactor(world, hubCountry)) / 365;
}

/**
 * Overheads ("G&A"): head office, IT, marketing, insurance. A base for running an airline at all
 * plus an amount per aircraft in service (USD per year, Austrian salary level).
 */
const OVERHEAD_BASE_USD = 1_500_000;
const OVERHEAD_PER_AIRCRAFT_USD = 900_000;

export function overheadPerDayUsd(world: EngineWorld, hubCountry: string, activeAircraft: number): number {
  return ((OVERHEAD_BASE_USD + OVERHEAD_PER_AIRCRAFT_USD * activeAircraft) * wageFactor(world, hubCountry)) / 365;
}

/** EUROCONTROL-style en-route charge per flight: distance × weight factor × unit rate. */
function navigationChargeUsd(world: EngineWorld, type: AircraftType, from: Airport, to: Airport, km: number): number {
  // European unit rates (~€70–100) are among the world's highest; elsewhere charges are lower.
  const europe = world.countries[from.country]?.continent === 'EU' || world.countries[to.country]?.continent === 'EU';
  const unitRate = europe ? 80 : 45;
  return unitRate * (km / 100) * Math.sqrt(type.mtowKg / 1000 / 50);
}

// ─── A route week ──────────────────────────────────────────────────────────────

/** One flight of a timetable on this route, as the economics model sees it. */
export interface PlannedFlight {
  /** 0 = outbound (from → to), 1 = return. */
  dir: 0 | 1;
  /** Weekdays it departs (local time at its departure airport), bit 0 = Monday. */
  days: number;
  /** Local departure, minutes after midnight. */
  dep: number;
  type: AircraftType;
  seats: number;
  /** The aircraft's cabin (seats per class, products, pitch). */
  cabin: CabinLayout;
  ageYears: number;
}

export interface RoutePlan {
  type: AircraftType;
  seats: number;
  /** Cabin of the assumed aircraft (default: all economy). */
  cabin?: CabinLayout;
  /** Round trips per week. */
  frequency: number;
  /** Your economy fare relative to the market fare (1 = market fare). */
  fareFactor: number;
  /** Premium classes' fares relative to their market fares (default: market fare). */
  classFares?: ClassFares;
  ageYears: number;
  /** New routes take a few weeks until everybody knows them (0…1). */
  rampUp: number;
  /** The timetable; without it, a typical timetable for `frequency` round trips of `type` is assumed. */
  flights?: PlannedFlight[];
}

export interface RouteCosts {
  fuel: number;
  maintenance: number;
  airport: number;
  handling: number;
  navigation: number;
  distribution: number;
  /** Catering, amenities and lounges. */
  service: number;
}

/** Result per timetable flight (summed over its weekdays). */
export interface FlightResult {
  flights: number;
  seats: number;
  pax: number;
  /** Local arrival time, minutes after the departure day's midnight at the arrival airport. */
  arr: number;
  blockMin: number;
}

export interface ClassResult {
  seats: number;
  pax: number;
  demand: number;
  revenue: number;
  /** Market fare of the class and your fare (USD, one way). */
  marketFareUsd: number;
  fareUsd: number;
}

export interface RouteWeek {
  flights: number;
  seats: number;
  demand: number;
  /** Demand this week relative to an average week (summer peak > 1, winter low < 1). */
  season: number;
  pax: number;
  loadFactor: number;
  /** Your economy fare (USD). */
  fareUsd: number;
  revenue: number;
  costs: RouteCosts;
  blockHours: number;
  /** The timetable used (the plan's own, or the assumed typical one). */
  timetable: PlannedFlight[];
  /** Per timetable flight, in the same order. */
  byFlight: FlightResult[];
  /** Per cabin class (only classes you offer). */
  byClass: Partial<Record<CabinClass, ClassResult>>;
  /** Passengers' experience per class (for the reputation). */
  experience: Partial<Record<CabinClass, ExperienceSums>>;
}

/** "Smooth minimum": passengers carried approach the seats offered without a hard edge (some flights fill, some don't). */
const carried = (demand: number, seats: number) => (seats <= 0 ? 0 : (demand * seats) / (demand ** 4 + seats ** 4) ** 0.25);

/** A timed non-stop offer by somebody else, e.g. the player's flights when an AI airline does its sums. */
export interface TimedSupplierFlight {
  dir: 0 | 1;
  days: number;
  dep: number;
  cabin?: CabinLayout;
}

/** Brand reputation (0–100) and awareness (0–1) of an airline. */
export interface Brand {
  reputation: number;
  awareness: number;
}

/** Another airline's offer described in full (the player's, seen by an AI airline). */
export type ExtraSupplier = Supplier & { flights?: TimedSupplierFlight[]; cabin?: CabinLayout; classFares?: ClassFares; brand?: Brand };

/** Who else is on the route, seen from the airline being calculated. */
export interface RouteContext {
  /** The AI's changes in this game. */
  ai?: AiState;
  /** Leave this real airline out of the competitors (when calculating that airline's own route). */
  exclude?: string;
  /** More non-stop offers on the route, e.g. the player's flights when an AI airline does its sums. */
  extra?: ExtraSupplier[];
  /** Only these weekdays (bit 0 = Monday), e.g. to book a single day; default: the whole week. */
  days?: number;
  /** The calculated airline's reputation and awareness (default: neutral and well known). */
  brand?: Brand;
  /** The player's aircraft pay their airframe checks separately (Phase 4.2): hourly maintenance without them. */
  checksSeparate?: boolean;
  /** The world's state (Phase 5.1): fuel price, traffic growth, recessions and pandemics. Default: the real 2026 data. */
  conditions?: Conditions;
}

/** Cruise speed assumed for other airlines' jets when generating their timetables. */
const GENERIC_CRUISE_KMH = 830;
const genericTurnMin = (longHaul: boolean) => (longHaul ? 120 : 45);

/** Is `a` the home end of this airline's route a–b (hub/base, else home country)? */
function homeAt(world: EngineWorld, airlineId: string, a: Airport, b: Airport): boolean {
  const airline = world.realAirlines?.byId.get(airlineId);
  if (!airline) return a.id < b.id;
  const bases = [...airline.hubs, ...airline.bases];
  if (bases.includes(a.id)) return true;
  if (bases.includes(b.id)) return false;
  if (airline.country === a.country) return true;
  if (airline.country === b.country) return false;
  return a.id < b.id;
}

/**
 * The generated timetable of another airline in one direction (local departure minutes and the share of days each
 * flight operates). Flights from its home airport leave in typical waves; flights from the other end are the
 * return legs after a turnaround.
 */
export function competitorDepartures(world: EngineWorld, airlineId: string, A: Airport, B: Airport, weekly: number, time: SimTime): { dep: number; arr: number; weight: number }[] {
  const weights = dailyWeights(weekly);
  if (!weights.length) return [];
  const km = Math.max(distanceKm(A, B), 50);
  const blockAB = blockMinutes(GENERIC_CRUISE_KMH, A, B, km);
  const long = blockAB > LONG_HAUL_MIN;
  const offA = utcOffsetMin(A.tz, time);
  const offB = utcOffsetMin(B.tz, time);
  let deps: number[];
  if (homeAt(world, airlineId, A, B)) {
    deps = homeDepartures(weights.length, seedOf(airlineId + B.id), long, isEastbound(A, B));
  } else {
    const blockBA = blockMinutes(GENERIC_CRUISE_KMH, B, A, km);
    deps = homeDepartures(weights.length, seedOf(airlineId + A.id), long, isEastbound(B, A)).map(
      (d) => wrapDay(d - offB + blockBA + genericTurnMin(long) + offA).min,
    );
  }
  return deps.map((dep, i) => ({ dep, arr: dep - offA + blockAB + offB, weight: weights[i]! }));
}

/** A typical timetable for `frequency` round trips (used when a plan has none, e.g. for the AI's own sums). */
export function typicalTimetable(plan: RoutePlan, from: Airport, to: Airport, time: SimTime): PlannedFlight[] {
  const km = Math.max(distanceKm(from, to), 50);
  const out = blockMinutes(plan.type.cruiseKmh, from, to, km);
  const long = out > LONG_HAUL_MIN;
  const slots = Math.ceil(plan.frequency / 7);
  const deps = homeDepartures(slots, seedOf(from.id + to.id), long, isEastbound(from, to));
  const offFrom = utcOffsetMin(from.tz, time);
  const offTo = utcOffsetMin(to.tz, time);
  const turn = Math.max(TURNAROUND_MIN[plan.type.category], genericTurnMin(long));
  const cabin = plan.cabin ?? economyCabin(plan.type, plan.seats);
  const flights: PlannedFlight[] = [];
  deps.forEach((dep, i) => {
    const days = i < slots - 1 ? DAYS_ALL : spreadDays(plan.frequency - 7 * (slots - 1));
    const back = wrapDay(dep - offFrom + out + turn + offTo);
    const common = { type: plan.type, seats: plan.seats, cabin, ageYears: plan.ageYears };
    flights.push({ dir: 0, days, dep, ...common }, { dir: 1, days: shiftDays(days, back.shift), dep: back.min, ...common });
  });
  return flights;
}

/** Aircraft assumed for other airlines' cabins: a typical short-haul and a typical long-haul type. */
const GENERIC_TYPES = { short: 'A20N', long: 'B789' } as const;
const modelCabins = new Map<string, CabinLayout>();
/** The cabin other airlines of this type usually offer on short or long routes (modelled). */
export function competitorCabin(model: BusinessModel, longHaul: boolean): CabinLayout {
  const key = `${model}|${longHaul}`;
  let cabin = modelCabins.get(key);
  if (!cabin) {
    cabin = modelCabin(getAircraftType(longHaul ? GENERIC_TYPES.long : GENERIC_TYPES.short), model, longHaul);
    modelCabins.set(key, cabin);
  }
  return cabin;
}

const CLASS_INDEX: Record<CabinClass, number> = { F: 0, J: 1, W: 2, Y: 3 };

/** Which class of a cabin suits a traveller wanting `wanted` best, and how appealing that is. */
function bestClass(
  cabin: readonly CabinSection[],
  wanted: CabinClass,
  segment: Segment,
  t: number,
  fare: (cls: CabinClass) => number,
  pull: (x: number) => number,
): { cls: CabinClass; appeal: number } | null {
  let best: { cls: CabinClass; appeal: number } | null = null;
  for (const s of cabin) {
    if (s.seats <= 0) continue;
    const appeal = classFit(wanted, s.cls, t) * pull(fare(s.cls)) * seatAppeal(segment, s, t);
    if (!best || appeal > best.appeal) best = { cls: s.cls, appeal };
  }
  return best;
}

const NEUTRAL_BRAND: Brand = { reputation: START_REPUTATION, awareness: 1 };

/** Forecast of one week on a route (both directions), in USD, flight by flight and class by class. */
export function routeWeek(world: EngineWorld, from: Airport, to: Airport, plan: RoutePlan, date: Date, ctx: RouteContext = {}): RouteWeek {
  const m = market(world, from, to);
  const time = fromDate(date);
  const t = haul(m.distanceKm);
  const cond = ctx.conditions;
  // In bad times airlines discount: fares follow demand a little (a 20 % drop in leisure demand ≈ 6 % lower fares).
  const average = marketFareUsd(world, from, to, date, cond?.fuelSpot) * (cond ? cond.demand(from, to, 'leisure') ** 0.3 : 1);
  const marketFare = (cls: CabinClass) => average * classFareRatio(cls, t);
  const myFactor = (cls: CabinClass) => fareFactorOf(cls, plan.fareFactor, plan.classFares);
  const biz = m.businessShare;
  const season = seasonFactor(from, to, biz, date);
  const timetable = plan.flights ?? typicalTimetable(plan, from, to, time);
  const longHaul = blockMinutes(GENERIC_CRUISE_KMH, from, to, m.distanceKm) > LONG_HAUL_MIN;
  const jetBlock = BLOCK_OVERHEAD_H + (m.distanceKm * ROUTING_FACTOR) / 830;
  const ends = [from, to] as const;
  const offsets = ends.map((a) => utcOffsetMin(a.tz, time));
  const days = ctx.days ?? DAYS_ALL;
  const myBrand = ctx.brand ?? NEUTRAL_BRAND;

  // Per timetable flight: block time, arrival, appeal from speed (slow aircraft lose travellers on long routes).
  const info = timetable.map((f) => {
    const A = ends[f.dir];
    const B = ends[1 - f.dir]!;
    const blockMin = blockMinutes(f.type.cruiseKmh, A, B, m.distanceKm);
    return {
      blockMin,
      arr: f.dep - offsets[f.dir]! + blockMin + offsets[1 - f.dir]!,
      speed: Math.min(1, jetBlock / blockHours(f.type, m.distanceKm)) ** 2,
    };
  });
  // Demand per flight, weekday and class (F, J, W, Y).
  const demand = timetable.map(() => Array.from({ length: 7 }, () => [0, 0, 0, 0]));

  for (const dir of [0, 1] as const) {
    const A = ends[dir];
    const B = ends[1 - dir]!;
    // Competition: the real airlines on this route with their current frequencies and fares (they react to price cuts
    // themselves, month by month, see ai.ts) or, without real airline data, "invisible incumbents" that are assumed to
    // match about half of any price cut right away.
    const competitors = competitorsOn(world, A, B, undefined, ctx.ai)?.filter((c) => c.airlineId !== ctx.exclude) ?? null;
    const relative = (x: number) => (!competitors && x < 1 ? 1 - INCUMBENT_PRICE_MATCH * (1 - x) : x);
    type Other = { dep: number; arr: number; weight: number; fare: (cls: CabinClass) => number; speed: number; group: string; days?: number; cabin: CabinLayout; brand: Brand };
    const others: Other[] = [];
    if (competitors) {
      for (const c of competitors) {
        const cabin = competitorCabin(c.model, longHaul);
        const brand = { reputation: MODEL_REPUTATION[c.model], awareness: 1 };
        // Competitors' capacity grows with the market over the years.
        const weekly = c.weekly * (cond?.trend ?? 1);
        for (const d of competitorDepartures(world, c.airlineId, A, B, weekly, time)) others.push({ ...d, fare: () => c.fareFactor, speed: 1, group: c.airlineId, cabin, brand });
      }
    } else {
      const cabin = competitorCabin('legacy', longHaul);
      for (const d of competitorDepartures(world, 'incumbent', A, B, m.incumbentFlights * (cond?.trend ?? 1), time)) {
        others.push({ ...d, fare: () => 1, speed: 1, group: 'incumbent', cabin, brand: NEUTRAL_BRAND });
      }
    }
    (ctx.extra ?? []).forEach((x, i) => {
      const fare = (cls: CabinClass) => fareFactorOf(cls, x.fareFactor, x.classFares);
      const brand = x.brand ?? NEUTRAL_BRAND;
      const cabin = x.cabin ?? competitorCabin('legacy', longHaul);
      if (x.flights) {
        for (const f of x.flights.filter((f) => f.dir === dir)) {
          const arr = f.dep - offsets[dir]! + blockMinutes(GENERIC_CRUISE_KMH, A, B, m.distanceKm) + offsets[1 - dir]!;
          others.push({ dep: f.dep, arr, weight: 1, fare, speed: x.speed ?? 1, group: `extra${i}`, days: f.days, cabin: f.cabin ?? cabin, brand });
        }
      } else {
        for (const d of competitorDepartures(world, `extra${i}`, A, B, x.weekly, time)) others.push({ ...d, fare, speed: x.speed ?? 1, group: `extra${i}`, cabin, brand });
      }
    });
    const mineIdx = timetable.map((f, i) => (f.dir === dir ? i : -1)).filter((i) => i >= 0);
    if (!mineIdx.length) continue;

    for (const segment of ['business', 'leisure'] as const) {
      const segShare = segment === 'business' ? biz : 1 - biz;
      // Holidaymakers react much more strongly to price than business travellers; cheaper fares also make more
      // people fly at all ("stimulation").
      const pull = (x: number) => Math.max(0.3, x) ** (segment === 'business' ? -1.2 : -2.6);
      const myBrandAppeal = brandAppeal(segment, myBrand.reputation, myBrand.awareness);
      for (const wanted of CLASSES) {
        const classShare = classDemandShare(segment, wanted, t);
        if (classShare < 1e-4) continue;
        // Each flight's best class for these travellers, and its appeal (class, seat, price, brand, speed).
        const mine = mineIdx.map((i) => bestClass(timetable[i]!.cabin, wanted, segment, t, (c) => relative(myFactor(c)), pull));
        const theirs = others.map((o) => bestClass(o.cabin, wanted, segment, t, o.fare, pull)?.appeal ?? 0);
        const theirBrand = others.map((o) => brandAppeal(segment, o.brand.reputation, o.brand.awareness));
        const firstClass = mine.find(Boolean)?.cls ?? 'Y';
        const stimulation = Math.max(0.3, myFactor(firstClass)) ** (segment === 'business' ? -0.6 : -1.6);
        const cache = new Map<string, number[]>();
        for (let day = 0; day < 7; day++) {
          if (!hasDay(days, day)) continue;
          const today = mineIdx.map((i, k) => (hasDay(timetable[i]!.days, day) && mine[k] ? k : -1)).filter((k) => k >= 0);
          if (!today.length) continue;
          const otherIdx = others.map((o, j) => (o.days === undefined || hasDay(o.days, day) ? j : -1)).filter((j) => j >= 0);
          const key = `${today.join(',')}|${otherIdx.length}`;
          let shares = cache.get(key);
          if (!shares) {
            const options: DayOption[] = [
              ...today.map((k) => {
                const i = mineIdx[k]!;
                return { dep: timetable[i]!.dep, arr: info[i]!.arr, pull: mine[k]!.appeal * info[i]!.speed * myBrandAppeal, weight: 1, group: 'me' };
              }),
              ...otherIdx.map((j) => {
                const o = others[j]!;
                return { dep: o.dep, arr: o.arr, pull: theirs[j]! * o.speed * theirBrand[j]!, weight: o.weight, group: o.group };
              }),
            ];
            shares = dayShares(options, segment, longHaul, m.connectingFlights / 7, 1);
            cache.set(key, shares);
          }
          const world5 = cond ? cond.trend * cond.demand(A, B, segment) : 1;
          const travellers = (m.weeklyPax / 7) * segShare * classShare * weekdayFactor(segment, day) * season * plan.rampUp * stimulation * world5;
          today.forEach((k, n) => {
            demand[mineIdx[k]!]![day]![CLASS_INDEX[mine[k]!.cls]]! += travellers * shares[n]!;
          });
        }
      }
    }
  }

  // Passengers, revenue and costs flight by flight.
  const costs: RouteCosts = { fuel: 0, maintenance: 0, airport: 0, handling: 0, navigation: 0, distribution: 0, service: 0 };
  const fuelPrice = cond ? (cond.fuelSpot + INTO_PLANE_USD_PER_GAL) / KG_PER_GALLON : fuelUsdPerKg(date);
  const nav = new Map<string, number>();
  const byClass: Partial<Record<CabinClass, ClassResult>> = {};
  const experience: Partial<Record<CabinClass, ExperienceSums>> = {};
  let flights = 0;
  let seats = 0;
  let pax = 0;
  let revenue = 0;
  let totalDemand = 0;
  let block = 0;
  const byFlight: FlightResult[] = timetable.map((f, i) => {
    const A = ends[f.dir];
    const B = ends[1 - f.dir]!;
    const result: FlightResult = { flights: 0, seats: 0, pax: 0, arr: info[i]!.arr, blockMin: info[i]!.blockMin };
    for (let day = 0; day < 7; day++) {
      if (!hasDay(days, day) || !hasDay(f.days, day)) continue;
      result.flights += 1;
      // European business has a movable curtain: rows business doesn't need that day are sold as economy.
      let freedRows = 0;
      for (const s of f.cabin) {
        if (s.seats <= 0) continue;
        const d = demand[i]![day]![CLASS_INDEX[s.cls]]!;
        let seatsToday = s.seats;
        if (s.cls === 'Y') seatsToday += freedRows * abreast(f.type, 'economy');
        const p = Math.min(carried(d, seatsToday), seatsToday);
        if (s.product === 'euro') {
          const per = abreast(f.type, 'euro');
          const rows = Math.ceil(s.seats / per);
          const needed = Math.min(rows, Math.max(1, Math.ceil(p / per)));
          freedRows = f.cabin.some((x) => x.cls === 'Y') ? rows - needed : 0;
          seatsToday = Math.min(s.seats, needed * per);
        }
        const factor = myFactor(s.cls);
        const fareUsd = marketFare(s.cls) * factor;
        const c = (byClass[s.cls] ??= { seats: 0, pax: 0, demand: 0, revenue: 0, marketFareUsd: marketFare(s.cls), fareUsd });
        c.seats += seatsToday;
        c.pax += p;
        c.demand += d;
        c.revenue += p * fareUsd;
        result.seats += seatsToday;
        result.pax += p;
        revenue += p * fareUsd;
        totalDemand += d;
        costs.service += p * serviceCostUsd(s.cls, t);
        // What these passengers will tell others: their seat, the aircraft's age, the price and how full it was.
        const e = (experience[s.cls] ??= { pax: 0, product: 0, age: 0, value: 0, crowd: 0 });
        const lf = p / seatsToday;
        e.pax += p;
        e.product += p * (seatScore(s.product, s.pitch, t) - expectedScore(s.cls, t));
        e.age += p * (f.ageYears <= 3 ? 3 : -Math.min(8, 0.5 * Math.max(0, f.ageYears - 8)));
        e.value += p * Math.min(8, Math.max(-10, (1 - factor) * 20));
        e.crowd += p * (lf > 0.85 ? -(lf - 0.85) * 40 : 0);
      }
    }
    const n = result.flights;
    if (!n) return result;
    const h = info[i]!.blockMin / 60;
    const mtowT = f.type.mtowKg / 1000;
    costs.fuel += f.type.fuelKgPerHour * (h + 0.15) * n * fuelPrice;
    costs.maintenance += f.type.maintUsdPerBlockHour * (1 + 0.01 * f.ageYears) * (ctx.checksSeparate ? 1 - CHECK_SHARE : 1) * h * n;
    // Landing fee per tonne of MTOW at the arrival airport, passenger fee at the departure airport.
    costs.airport += (6 * mtowT * n * airportFactor(world, B)) + 13 * result.pax * airportFactor(world, A);
    costs.handling += (250 + 7 * f.seats) * wageFactor(world, B.country) * n + result.pax * (1.5 + 0.0025 * m.distanceKm);
    const navKey = `${f.type.id}|${f.dir}`;
    if (!nav.has(navKey)) nav.set(navKey, navigationChargeUsd(world, f.type, A, B, m.distanceKm));
    costs.navigation += nav.get(navKey)! * n;
    flights += n;
    seats += result.seats;
    pax += result.pax;
    block += h * n;
    return result;
  });
  costs.distribution = 0.05 * revenue;

  return {
    flights,
    seats,
    demand: totalDemand,
    season,
    pax,
    loadFactor: seats > 0 ? pax / seats : 0,
    fareUsd: marketFare('Y') * myFactor('Y'),
    revenue,
    costs,
    blockHours: block,
    timetable,
    byFlight,
    byClass,
    experience,
  };
}

export const totalCosts = (c: RouteCosts): number =>
  c.fuel + c.maintenance + c.airport + c.handling + c.navigation + c.distribution + c.service;

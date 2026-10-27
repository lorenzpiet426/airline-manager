// The airline economics model (Realistic mode): how many people want to fly between two airports,
// what they pay, how long the flight takes and what it costs to operate. All amounts in US dollars;
// they are converted into the airline's book currency when booked.
// Calibration notes and sources: docs/DATA_SOURCES.md ("Economics model").
import { TURNAROUND_MIN, type AircraftCategory, type AircraftType } from '../data/aircraft';
import { fuelUsdPerKg, jetFuelSpot } from '../data/fuel';
import type { Airport } from '../data/types';
import { distanceKm, greatCirclePoints } from './geo';
import type { BusinessModel, SourceTag } from './realAirlines';
import type { AiState } from './state';
import { longestHardRunwayM, type EngineWorld } from './world';

// ─── Flight times ──────────────────────────────────────────────────────────────

/** Airways are not straight lines: real routings are ~6 % longer than the great circle. */
const ROUTING_FACTOR = 1.06;
/** Taxi out/in, climb and descent add roughly this much to the cruise time (hours). */
const BLOCK_OVERHEAD_H = 0.45;

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
/** Travellers prefer the airline with more flights more than proportionally (an "S-curve"). */
const FREQUENCY_EXP = 1.3;
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
export function marketFareUsd(world: EngineWorld, a: Airport, b: Airport, date: Date): number {
  const km = Math.max(distanceKm(a, b), 50);
  const meanWealth = (wealth(world, a) + wealth(world, b)) / 2;
  const fuelIndex = 1 + 0.35 * (jetFuelSpot(date) / FARE_FUEL_REFERENCE - 1);
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
export function crewPerAircraft(type: AircraftType, seats: number) {
  const wide = type.category === 'widebody';
  // EU rules: at least one cabin crew member per 50 seats; long-haul service needs more.
  const cabinPerFlight = Math.max(1, Math.ceil(seats / (wide ? 35 : 50)));
  return { pilots: wide ? 18 : 10, cabin: cabinPerFlight * (wide ? 8 : 5) };
}

/** Crew salaries for one aircraft per day (USD), paid whether it flies or not. */
export function crewCostPerDayUsd(world: EngineWorld, type: AircraftType, seats: number, hubCountry: string): number {
  const crew = crewPerAircraft(type, seats);
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

export interface RoutePlan {
  type: AircraftType;
  seats: number;
  /** Round trips per week. */
  frequency: number;
  /** Your fare relative to the market fare (1 = market fare). */
  fareFactor: number;
  ageYears: number;
  /** New routes take a few weeks until everybody knows them (0…1). */
  rampUp: number;
}

export interface RouteCosts {
  fuel: number;
  maintenance: number;
  airport: number;
  handling: number;
  navigation: number;
  distribution: number;
}

export interface RouteWeek {
  flights: number;
  seats: number;
  demand: number;
  /** Demand this week relative to an average week (summer peak > 1, winter low < 1). */
  season: number;
  pax: number;
  loadFactor: number;
  fareUsd: number;
  revenue: number;
  costs: RouteCosts;
  blockHours: number;
}

/** "Smooth minimum": passengers carried approach the seats offered without a hard edge (some flights fill, some don't). */
const carried = (demand: number, seats: number) => (seats <= 0 ? 0 : (demand * seats) / (demand ** 4 + seats ** 4) ** 0.25);

/** Who else is on the route, seen from the airline being calculated. */
export interface RouteContext {
  /** The AI's changes in this game. */
  ai?: AiState;
  /** Leave this real airline out of the competitors (when calculating that airline's own route). */
  exclude?: string;
  /** More non-stop offers on the route, e.g. the player's flights when an AI airline does its sums. */
  extra?: Supplier[];
}

/** Forecast of one week on a route (both directions), in USD. */
export function routeWeek(world: EngineWorld, from: Airport, to: Airport, plan: RoutePlan, date: Date, ctx: RouteContext = {}): RouteWeek {
  const m = market(world, from, to);
  const fare = marketFareUsd(world, from, to, date) * plan.fareFactor;
  const biz = m.businessShare;
  const ff = Math.max(0.3, plan.fareFactor);
  // Cheaper than the market: more people fly at all, and more choose you over the others.
  // Holidaymakers react much more strongly to price than business travellers.
  const stimulation = biz * ff ** -0.6 + (1 - biz) * ff ** -1.6;
  // Competition: the real airlines on this route with their current frequencies and fares (they react to price cuts
  // themselves, month by month, see ai.ts) or, without real airline data, "invisible incumbents" that are assumed to
  // match about half of any price cut right away.
  const competitors = competitorsOn(world, from, to, m, ctx.ai)?.filter((c) => c.airlineId !== ctx.exclude) ?? null;
  const relative = !competitors && ff < 1 ? 1 - INCUMBENT_PRICE_MATCH * (1 - ff) : ff;
  const attraction = biz * relative ** -1.2 + (1 - biz) * relative ** -2.6;
  // Slow aircraft lose travellers on long routes (an ATR needs 3 h to London, a jet 2 h).
  const jetBlock = BLOCK_OVERHEAD_H + (m.distanceKm * ROUTING_FACTOR) / 830;
  const speed = Math.min(1, jetBlock / blockHours(plan.type, m.distanceKm)) ** 2;
  const mine = plan.frequency ** FREQUENCY_EXP * attraction * speed;
  // Everyone else attracts travellers by frequency and price level; plus one-stop connections via other hubs.
  const fareAttraction = (x: number) => biz * Math.max(0.3, x) ** -1.2 + (1 - biz) * Math.max(0.3, x) ** -2.6;
  const nonstop =
    (competitors
      ? competitors.reduce((s, c) => s + c.weekly ** FREQUENCY_EXP * fareAttraction(c.fareFactor), 0)
      : m.incumbentFlights ** FREQUENCY_EXP) +
    (ctx.extra ?? []).reduce((s, x) => s + x.weekly ** FREQUENCY_EXP * fareAttraction(x.fareFactor) * (x.speed ?? 1), 0);
  const others = nonstop + m.connectingFlights ** FREQUENCY_EXP;
  const share = mine / (mine + others) || 0;
  const season = seasonFactor(from, to, biz, date);
  const demandPerDirection = m.weeklyPax * share * stimulation * season * plan.rampUp;
  const seatsPerDirection = plan.frequency * plan.seats;
  const paxPerDirection = carried(demandPerDirection, seatsPerDirection);

  const flights = plan.frequency * 2;
  const pax = paxPerDirection * 2;
  const block = blockHours(plan.type, m.distanceKm);
  const revenue = pax * fare;
  const fuelKg = plan.type.fuelKgPerHour * (block + 0.15) * flights;
  const mtowT = plan.type.mtowKg / 1000;
  // Each airport: a landing fee per tonne of MTOW for every departure, plus a fee per departing passenger.
  const airportFees = (a: Airport) => (plan.frequency * 6 * mtowT + 13 * paxPerDirection) * airportFactor(world, a);
  const handlingPerTurn = (a: Airport) => (250 + 7 * plan.seats) * wageFactor(world, a.country);

  return {
    flights,
    seats: seatsPerDirection * 2,
    demand: demandPerDirection * 2,
    season,
    pax,
    loadFactor: seatsPerDirection > 0 ? paxPerDirection / seatsPerDirection : 0,
    fareUsd: fare,
    revenue,
    blockHours: block * flights,
    costs: {
      fuel: fuelKg * fuelUsdPerKg(date),
      maintenance: plan.type.maintUsdPerBlockHour * (1 + 0.01 * plan.ageYears) * block * flights,
      airport: airportFees(from) + airportFees(to),
      handling: plan.frequency * (handlingPerTurn(from) + handlingPerTurn(to)) + pax * (1.5 + 0.0025 * m.distanceKm),
      navigation: navigationChargeUsd(world, plan.type, from, to, m.distanceKm) * flights,
      distribution: 0.05 * revenue,
    },
  };
}

export const totalCosts = (c: RouteCosts): number =>
  c.fuel + c.maintenance + c.airport + c.handling + c.navigation + c.distribution;

// The Ops screen's overview: what needs the player's attention, and the key numbers of money, today's operation, the
// network and the fleet and people — worked out from the game state so the Ops screen shows the important things of
// every other screen in one place.
import { ON_TIME_MIN } from '../../data/delays';
import { crewShortages } from '../../engine/crews';
import { pairsOfAircraft, grounded } from '../../engine/schedule';
import { pnlCosts, type Airline, type GameState, type RouteStats } from '../../engine/state';
import { MINUTES_PER_DAY } from '../../engine/time';
import type { EngineWorld } from '../../engine/world';
import type { Route as NavRoute } from '../navigation';

export interface ActionItem {
  level: 'warning' | 'caution' | 'info';
  /** i18n key under `overview.action`, with its values. */
  key: string;
  params: Record<string, string | number>;
  route: NavRoute;
  query?: Record<string, string>;
}

const DAY = MINUTES_PER_DAY;
const routeCode = (world: EngineWorld | null, r: { originId: string; destinationId: string }) =>
  `${world?.airportById.get(r.originId)?.iata ?? r.originId}–${world?.airportById.get(r.destinationId)?.iata ?? r.destinationId}`;

/** The last completed week's accounts. */
export const lastWeek = (game: GameState, airline: Airline) => game.finance[airline.id]?.history.at(-1);

/** Everything waiting for the player, most urgent first. */
export function actionItems(game: GameState, world: EngineWorld | null, airline: Airline): ActionItem[] {
  const items: ActionItem[] = [];
  const add = (level: ActionItem['level'], key: string, params: ActionItem['params'], route: NavRoute, query?: Record<string, string>) =>
    items.push({ level, key, params, route, ...(query ? { query } : {}) });

  // Money.
  const week = lastWeek(game, airline);
  const result = week ? week.lines.revenue - pnlCosts(week.lines) : 0;
  if (airline.cash.amount < 0) add('warning', 'cashNegative', {}, 'finance');
  else if (result < 0 && airline.cash.amount / -result < 12) add('caution', 'cashRunway', { weeks: Math.max(0, Math.floor(airline.cash.amount / -result)) }, 'finance');
  // Owners and the board.
  if (airline.equity?.bid) add('warning', 'bid', { bidder: airline.equity.bid.bidder }, 'investments');
  if (airline.board?.warnedAt !== undefined) add('warning', 'boardWarning', { confidence: Math.round(airline.board.confidence) }, 'board');
  else if (airline.board && airline.board.confidence < 50) add('caution', 'boardDoubts', { confidence: Math.round(airline.board.confidence) }, 'board');
  // People.
  if (world) {
    const short = [...crewShortages(game, world, airline.id).values()].filter((x) => x > 0).length;
    if (short) add('warning', 'crewShort', { count: short }, 'fleet', { tab: 'crew' });
  }
  for (const a of Object.values(airline.labour ?? {})) {
    const strike = a.strikes.find((s) => s.until > game.time);
    if (strike) add('warning', 'strike', { group: a.group, country: a.country }, 'fleet', { tab: 'crew' });
    else if (a.talks) add('caution', 'talks', { group: a.group, country: a.country }, 'fleet', { tab: 'crew' });
  }
  // Managers.
  const waiting = (airline.mgmt?.proposals ?? []).filter((p) => !p.advice).length;
  if (waiting) add('info', 'proposals', { count: waiting }, 'management');
  // Partners and other airlines.
  if (airline.allianceMembership?.status === 'invited') add('info', 'allianceInvited', {}, 'alliances');
  if (airline.takeover) add('info', 'takeoverRunning', { stage: airline.takeover.stage }, 'investments');
  // Fleet.
  const fleet = Object.values(game.aircraft).filter((a) => a.airlineId === airline.id);
  const leases = fleet.filter((a) => a.status === 'active' && a.lease && a.lease.endAt - game.time < 90 * DAY && a.lease.endAt > game.time).length;
  if (leases) add('caution', 'leasesEnding', { count: leases }, 'fleet');
  const idle = fleet.filter((a) => a.status === 'active' && !pairsOfAircraft(game, a.id).length).length;
  if (idle) add('caution', 'idle', { count: idle }, 'network');
  const arriving = fleet.filter((a) => a.status === 'delivering' && a.deliveryAt - game.time < 21 * DAY && !pairsOfAircraft(game, a.id).length).length;
  if (arriving) add('info', 'arriving', { count: arriving }, 'network');
  // Network: routes that lost money last week.
  if (week) {
    const losing = Object.entries(week.routes).filter(([id, r]) => game.routes[id] && r.revenue - r.directCosts < 0).length;
    if (losing) add('caution', 'routesLosing', { count: losing }, 'finance');
  }
  const order = { warning: 0, caution: 1, info: 2 };
  return items.sort((a, b) => order[a.level] - order[b.level]);
}

/** Today's (else yesterday's) flights: how many, how punctual, delayed, cancelled; aircraft on the ground. */
export function operationSummary(game: GameState, airline: Airline) {
  const today = (game.ops?.flights ?? []).filter((f) => f.airlineId === airline.id);
  const prev = (game.ops?.prev ?? []).filter((f) => f.airlineId === airline.id && f.status !== 'cancelled');
  const yesterdayOnTime = prev.length ? prev.filter((f) => f.status === 'ok' && f.arrDelay <= ON_TIME_MIN).length / prev.length : null;
  const fleet = Object.values(game.aircraft).filter((a) => a.airlineId === airline.id && a.status === 'active');
  return {
    flights: today.length,
    delayed: today.filter((f) => f.status !== 'cancelled' && f.depDelay > ON_TIME_MIN).length,
    cancelled: today.filter((f) => f.status === 'cancelled').length,
    diverted: today.filter((f) => f.status === 'diverted').length,
    onTime: yesterdayOnTime,
    grounded: fleet.filter((a) => grounded(a, game.time)).length,
  };
}

/** Last week's best and weakest routes, and the fullest and emptiest. */
export function networkSummary(game: GameState, world: EngineWorld | null, airline: Airline) {
  const week = lastWeek(game, airline);
  const rows = Object.entries(week?.routes ?? {})
    .map(([id, r]: [string, RouteStats]) => ({ id, route: game.routes[id], r }))
    .filter((x) => x.route && x.r.seats > 0);
  const name = (x: (typeof rows)[number]) => routeCode(world, x.route!);
  const byResult = [...rows].sort((a, b) => b.r.revenue - b.r.directCosts - (a.r.revenue - a.r.directCosts));
  const loadOf = (x: (typeof rows)[number]) => Math.min(1, x.r.pax / x.r.seats);
  const byLoad = [...rows].sort((a, b) => loadOf(b) - loadOf(a));
  const pick = (x: (typeof rows)[number] | undefined, value: number) => (x ? { name: name(x), id: x.id, value } : null);
  return {
    routes: Object.values(game.routes).filter((r) => r.airlineId === airline.id).length,
    best: pick(byResult[0], byResult[0] ? byResult[0].r.revenue - byResult[0].r.directCosts : 0),
    worst: pick(byResult.at(-1), byResult.at(-1) ? byResult.at(-1)!.r.revenue - byResult.at(-1)!.r.directCosts : 0),
    fullest: pick(byLoad[0], byLoad[0] ? loadOf(byLoad[0]) : 0),
    emptiest: pick(byLoad.at(-1), byLoad.at(-1) ? loadOf(byLoad.at(-1)!) : 0),
  };
}

/** Aircraft flying, idle, arriving soon; crews employed and in training. */
export function fleetSummary(game: GameState, airline: Airline) {
  const fleet = Object.values(game.aircraft).filter((a) => a.airlineId === airline.id);
  const active = fleet.filter((a) => a.status === 'active');
  const stations = Object.values(airline.crew?.stations ?? {});
  return {
    active: active.length,
    idle: active.filter((a) => !pairsOfAircraft(game, a.id).length).length,
    arriving: fleet.filter((a) => a.status === 'delivering' && a.deliveryAt - game.time < 30 * DAY).length,
    ordered: fleet.filter((a) => a.status !== 'active' && !(a.status === 'delivering' && a.deliveryAt - game.time < 30 * DAY)).length,
    pilots: stations.reduce((n, s) => n + Object.values(s.pilots).reduce((m, p) => m + p.captains + p.firstOfficers, 0), 0),
    cabin: stations.reduce((n, s) => n + s.cabin, 0),
    training: stations.reduce((n, s) => n + s.pipeline.reduce((m, b) => m + b.count, 0), 0),
  };
}

/** Last week's money: result, margin, change against the week before, load factor. */
export function moneySummary(game: GameState, airline: Airline) {
  const hist = game.finance[airline.id]?.history ?? [];
  const w = hist.at(-1);
  const p = hist.at(-2);
  const res = (x: typeof w) => (x ? x.lines.revenue - pnlCosts(x.lines) : null);
  const routes = Object.values(w?.routes ?? {});
  const seats = routes.reduce((n, r) => n + r.seats, 0);
  return {
    cash: airline.cash,
    result: res(w),
    previous: res(p),
    margin: w && w.lines.revenue > 0 ? res(w)! / w.lines.revenue : null,
    load: seats > 0 ? routes.reduce((n, r) => n + r.pax, 0) / seats : null,
  };
}

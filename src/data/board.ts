// The board and the owners' targets (Phase 10.4). European airlines have a two-tier board: the management board (the
// CEO) runs the company, the supervisory board — elected by the shareholders, in Austria and Germany partly by the
// employees — sets targets and appoints or dismisses the CEO (Austrian Aktiengesetz §75, §86; ArbVG §110: one
// employee seat per two shareholder seats; German MitbestG/DrittelbG: half the seats above 2,000 staff, a third above
// 500). What owners want differs: venture investors want a startup to reach profit before the money runs out; the stock
// market wants margins and a share price beating the market; the state (Austrian until 2008) wanted jobs and Vienna's
// connections; a group (Lufthansa since 2009) margins and feed for its hubs. Points and thresholds are modelled.
import type { OwnerKind, TargetKind } from '../engine/state';

/** Targets and their weights per owner. */
export const OWNER_TARGETS: Record<OwnerKind, Partial<Record<TargetKind, number>>> = {
  investors: { margin: 0.5, cash: 0.3, onTime: 0.2 },
  public: { margin: 0.45, sharePrice: 0.35, onTime: 0.2 },
  state: { margin: 0.3, jobs: 0.3, destinations: 0.25, onTime: 0.15 },
  group: { margin: 0.55, transfer: 0.25, onTime: 0.2 },
};

/** Margin goal: last year's margin plus a step (twice the step below `floor`), at most `max`. */
export const MARGIN_RULE: Record<OwnerKind, { step: number; floor: number; max: number }> = {
  investors: { step: 0.01, floor: 0, max: 0.08 },
  public: { step: 0.01, floor: 0, max: 0.08 },
  state: { step: 0.005, floor: -0.03, max: 0.03 },
  group: { step: 0.01, floor: 0, max: 0.08 },
};
/** Venture investors' plan for a startup: margin by year of the company (then the stock-market rule). */
export const STARTUP_MARGIN = [-0.3, -0.08, 0.01];

/** Fixed goals: staff and destinations kept (change since the start of the year), months of costs in cash. */
export const JOBS_GOAL = -0.03;
export const DESTINATIONS_GOAL = -0.05;
export const CASH_MONTHS_GOAL = 6;
export const ON_TIME_MAX_GOAL = 0.85;

/** How far from the goal a target counts fully (score ±1). */
export const SCALE: Record<TargetKind, number> = { margin: 0.05, onTime: 0.05, transfer: 0.05, sharePrice: 0.2, jobs: 0.05, destinations: 0.1, cash: 6 };

/** Confidence: start, points per quarterly review at full score, warning and dismissal lines. */
export const START_CONFIDENCE = 60;
export const REVIEW_POINTS = 12;
export const WARNING_BELOW = 40;
export const WARNING_LIFTED = 50;
export const DISMISS_BELOW = 20;
/** A new CEO's first year: misses count half and nobody is dismissed. */
export const HONEYMOON_MONTHS = 12;
export const HONEYMOON_FACTOR = 0.5;
/** In a crisis (the economy at the hub weak) misses count less: boards know. */
export const CRISIS_DEMAND = 0.93;
export const CRISIS_FACTOR = 0.4;
/** Events between reviews. */
export const STRIKE_POINTS = -2;
export const CASH_NEGATIVE_POINTS = -5;
/** A group or the state does not let its airline go bankrupt: it puts in money (cash for this many months of costs),
 * as Lufthansa and the Austrian state did for Austrian (EU-approved restructuring aid 2009, Covid aid 2020) — at a cost
 * to the CEO's standing. */
export const INJECTION_MONTHS = 2;
export const INJECTION_POINTS = -8;

/** Supervisory board: seats elected by the shareholders. */
export const SHAREHOLDER_SEATS = 6;

/** Job offers from real airlines after a dismissal: years as CEO and average margin needed. */
export const OFFER_MIN_YEARS = 3;
export const OFFER_MIN_MARGIN = -0.02;

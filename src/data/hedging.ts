// Fuel and currency hedging (Phase 10.2). Airlines fix part of their future fuel and dollar costs months ahead: fuel
// swaps (a fixed price), call options (a price cap bought for a premium) and currency forwards (dollars at a fixed
// rate), in a rolling "hedging ladder" — e.g. Lufthansa Group: up to 85 % of the fuel 24 months ahead, mostly with
// options; Ryanair and easyJet ≈ 60–85 % 12–18 months ahead with swaps (annual reports, read 2026-10-30). Prices here are
// modelled: forward fuel prices drift from today's price back towards the last year's average; currency forwards follow
// the two central banks' rates (interest rate parity); options by the Black-76 formula.

/** Periods of the ladder (months ahead, inclusive) and how many months ahead the treasury hedges at most. */
export const LADDER: readonly (readonly [number, number])[] = [
  [1, 3],
  [4, 12],
  [13, 24],
];
export const MAX_MONTHS = 24;

/** Forward fuel prices move from today's price towards the 12-month average with this time scale (months). */
export const FUEL_REVERSION_MONTHS = 18;
/** Fuel price volatility for options (per year); options on monthly averages are cheaper (factor). */
export const FUEL_VOLATILITY = 0.35;
export const AVERAGE_OPTION_FACTOR = 0.8;
/** Banks' margin on swaps and forwards (share of the price) and on options (share of the premium). */
export const SWAP_MARGIN = 0.01;
/** Currency forwards are a big, cheap market. */
export const FX_MARGIN = 0.001;
export const OPTION_MARGIN = 0.1;

/** Losses on open swaps and forwards the banks accept without collateral, as a share of a year's revenue, by rating. */
export const COLLATERAL_FREE: Readonly<Record<string, number>> = { AAA: 0.05, AA: 0.04, A: 0.03, BBB: 0.02, BB: 0.005, B: 0, CCC: 0 };

/** What new airlines start with (no hedging) and what a big group airline does (Austrian in the Lufthansa Group). */
export interface HedgePolicy {
  /** Share of the expected fuel and dollar spending hedged per ladder period. */
  fuel: [number, number, number];
  fx: [number, number, number];
  /** Of the fuel hedges, the share bought as call options (the rest as swaps), and their strike above the forward price. */
  optionShare: number;
  strikeOffset: number;
}
export const NO_POLICY: HedgePolicy = { fuel: [0, 0, 0], fx: [0, 0, 0], optionShare: 0.5, strikeOffset: 0.1 };
export const GROUP_POLICY: HedgePolicy = { fuel: [0.85, 0.7, 0.3], fx: [0.8, 0.6, 0.2], optionShare: 0.7, strikeOffset: 0.1 };

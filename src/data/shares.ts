// Shares, shareholders and the share price (Phase 10.3). Airlines are valued by investors at a low multiple of their
// earnings before interest, tax, depreciation and rent (EV/EBITDAR ≈ 4–8 for European airlines), minus their net debt
// including leases; the price also follows the stock market's mood (crashes in crises, e.g. 2001, 2008, 2020) and some
// noise. Austrian Airlines: state-owned, listed on the Vienna Stock Exchange in 1988 with the state (ÖIAG) keeping the
// majority, sold to Lufthansa in 2008/09, minority shareholders squeezed out on 4 February 2010 (Austrian Airlines
// investor relations, Wikipedia, read 2026-10-30). Numbers are modelled orders of magnitude.

/** Shares a new airline is split into, and the founder's (the player's) stake in a startup. */
export const STARTUP_SHARES = 10_000_000;
export const FOUNDER_STAKE = 0.3;

/** Valuation: EV/EBITDAR multiple (more with growth and margin), and the floor of a young airline's value. */
export const BASE_MULTIPLE = 6;
export const MIN_MULTIPLE = 3;
export const MAX_MULTIPLE = 10;
/** A young airline without a year of accounts is valued around the capital paid in. */
export const YOUNG_MONTHS = 12;

/** Weekly: the price moves this share of the way to its value, plus noise; the market's mood swings around 1. */
export const PRICE_ADJUST = 0.3;
export const PRICE_NOISE = 0.035;
export const MOOD_NOISE = 0.02;
export const MOOD_REVERSION = 0.05;

/** Going public: at least this much revenue a year (EUR, today's money) and this many months of accounts. */
export const IPO_MIN_REVENUE_EUR = 200_000_000;
export const IPO_MIN_MONTHS = 24;
/** IPOs are priced below the value to attract buyers; banks take fees. */
export const IPO_DISCOUNT = 0.1;
export const IPO_FEE = 0.04;
export const OFFERING_DISCOUNT = 0.05;
export const OFFERING_FEE = 0.03;
export const BUYBACK_PREMIUM = 0.02;
/** At most this share of the existing shares in one new issue or buyback. */
export const MAX_ISSUE_SHARE = 0.3;

/** The CEO's pay: a salary a month and shares worth this much a year (EUR, today's money, Austrian level). */
export const CEO_SALARY_EUR_MONTH = 50_000;
export const CEO_SHARES_EUR_YEAR = 400_000;
/** No trading in own shares in the last 30 days of a quarter (before the results). */
export const BLACKOUT_DAYS = 30;

export type HolderKind = 'player' | 'founders' | 'investors' | 'state' | 'group' | 'public';

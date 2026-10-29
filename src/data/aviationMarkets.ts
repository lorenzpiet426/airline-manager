// Where an airline may open a base (Phase 7.4): in its own country, and — for airlines of the European single aviation
// market — anywhere in it. The market's third package (Regulation 2408/92) opened all routes inside the EU from 1 January
// 1993 and full cabotage (domestic flights in another member state) from 1 April 1997; countries joined with the EU or by
// agreement (EEA: Norway and Iceland with the EU's 1997 rules; Switzerland from 1 June 2002 under the bilateral air
// transport agreement), the United Kingdom left on 1 January 2021. Wikipedia "European Common Aviation Area" and
// "Enlargement of the European Union", read 2026-10-29. Elsewhere bases abroad need traffic rights (Phase 12).

/** Member of the single aviation market from (inclusive) … until (exclusive). */
export const SINGLE_MARKET: Readonly<Record<string, readonly [string, string?]>> = {
  BE: ['1997-04-01'], DE: ['1997-04-01'], FR: ['1997-04-01'], IT: ['1997-04-01'], LU: ['1997-04-01'], NL: ['1997-04-01'],
  DK: ['1997-04-01'], IE: ['1997-04-01'], GB: ['1997-04-01', '2021-01-01'], GR: ['1997-04-01'], ES: ['1997-04-01'],
  PT: ['1997-04-01'], AT: ['1997-04-01'], FI: ['1997-04-01'], SE: ['1997-04-01'], NO: ['1997-04-01'], IS: ['1997-04-01'],
  CH: ['2002-06-01'],
  CY: ['2004-05-01'], CZ: ['2004-05-01'], EE: ['2004-05-01'], HU: ['2004-05-01'], LV: ['2004-05-01'], LT: ['2004-05-01'],
  MT: ['2004-05-01'], PL: ['2004-05-01'], SK: ['2004-05-01'], SI: ['2004-05-01'],
  BG: ['2007-01-01'], RO: ['2007-01-01'], HR: ['2013-07-01'],
};

/** Is the country in the single aviation market on this day (YYYY-MM-DD)? */
export function inSingleMarket(country: string, day: string): boolean {
  const m = SINGLE_MARKET[country];
  return !!m && day >= m[0] && (!m[1] || day < m[1]);
}

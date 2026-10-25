/* Look-through earnings for holding companies with listed stock portfolios,
 * after Semper Augustus's Berkshire method: investment gains come out of
 * income (stock API operating basis) and in their place goes the holdco's
 * pro-rata share of investees' retained earnings — "the earnings yield on
 * the portfolio, not just dividends". Dividends are already in net income.
 *
 * Built by scripts/refresh-lookthrough.ts from each holdco's year-end 13F,
 * read by app/api/stock/route.ts. Only for portfolios of listed stocks: the
 * Mag 7's private stakes (SpaceX, Anthropic) have no earnings to look
 * through, and Bloomstran's tables only strip their gains. */

// Stock ticker → superinvestors manager id whose 13F is that company's portfolio
export const LOOK_THROUGH_HOLDCOS: Record<string, string> = {
  "BRK-A": "buffett",
  "BRK-B": "buffett",
  MKL: "gayner",
};

// Equity-method investees per holdco (from its 10-K) and the first year so
// accounted: their earnings are already in GAAP net income, so adding them
// would double count. Not inferred from a 20% stake — Berkshire carries AXP
// and DVA above 20% at fair value.
export const EQUITY_METHOD: Record<string, Record<string, number>> = {
  buffett: { KHC: 2015, OXY: 2022 },
  gayner: {},
};

// Retained investee earnings are taxed at the dividends-received-deduction
// rate when eventually distributed: 3% (1/7 of 21%) from 2018, 5% before
export const lookThroughTaxRate = (year: number) => (year >= 2018 ? 0.03 : 0.05);

export interface LookThroughYear {
  lookThrough: number; // after-tax retained earnings, USD
  portfolio: number; // 13F value at Dec 31, USD
  covered: number; // share of fair-value holdings with earnings data; the rest is scaled up at the same rate
  equityMethod: string[]; // tickers skipped as equity-method investees
}

export interface LookThroughJson {
  updated: string;
  holdcos: Record<string, Record<string, LookThroughYear>>; // manager id → year → data
}

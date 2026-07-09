/* Shared between the Watchlist component and scripts/refresh-watchlist.ts:
 * the seed ticker list, row types, and the metric computation for one stock. */

export const WATCHLIST_TICKERS = [
  // Market infrastructure & data monopolies
  "IBKR", "VRSN", "CME", "ICE", "NDAQ", "SPGI", "MCO", "MSCI", "FICO", "VRSK",
  // Payments
  "MA", "V",
  // Serial acquirers & proprietary-parts industrials
  "ROP", "TDG", "HEI", "CSU.TO", "TOI.V", "LMN.V", "KPG.AX", "SGN.WA", "ACP.WA",
  // Boring dominance
  "COST", "CPRT", "ORLY", "AZO", "CTAS", "WCN", "BRO",
  // More compounders
  "MSFT", "ASML", "INTU", "IDXX", "ZTS", "ODFL", "POOL", "FAST", "KNSL", "RACE",
  // Deep value / cyclical (P/E-vs-median verdict reads these backwards:
  // cyclicals look cheapest at peak earnings and richest at trough)
  "DAC",
  // Global quality & exchanges
  "UBER", "0388.HK", "ASX.AX", "BSE.NS", "3064.T", "BAP",
];

export interface YearData {
  year: number;
  revenue: number;
  netIncome: number;
  sharesOutstanding: number;
  eps: number;
  price: number;
  netMargin: number;
  peMultiple: number;
  dividendsPerShare: number;
  equity?: number;
  longTermDebt?: number;
}

export interface StockData {
  ticker: string;
  name: string;
  currency: string;
  currentPrice: number | null;
  beta12w?: number | null;
  years: YearData[];
}

export interface WatchRow {
  ticker: string;
  name: string;
  currency: string;
  currentPrice: number | null;
  currentPe: number | null;
  medianPe: number | null;
  premium: number | null; // current P/E vs own median: negative = discount
  epsCAGR: number | null;
  divYield: number | null;
  impliedReturn: number | null;
  qualityScore: number | null;
  beta12w: number | null;
  yearsOfData: number;
}

// Implied return: EPS growth assumption capped to avoid extrapolating blowout years
export const MAX_ASSUMED_GROWTH = 0.25;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function cagr(start: number, end: number, years: number): number | null {
  if (years <= 0 || start <= 0 || end <= 0) return null;
  return Math.pow(end / start, 1 / years) - 1;
}

// Same quality score as the S&P 500 screener
function qualityScore(years: YearData[]): number | null {
  if (years.length < 2) return null;
  const latest = years[years.length - 1];
  const fiveAgo = years.find((y) => y.year === latest.year - 5) ?? years[0];
  const span = latest.year - fiveAgo.year;

  const roe = latest.equity && latest.equity > 0 ? latest.netIncome / latest.equity : null;
  const capitalEmployed = (latest.equity ?? 0) + (latest.longTermDebt ?? 0);
  const roce = capitalEmployed > 0 ? latest.netIncome / capitalEmployed : null;
  const margin = latest.netMargin;
  const epsG = fiveAgo.eps > 0 && latest.eps > 0 ? cagr(fiveAgo.eps, latest.eps, span) : null;
  const revG = cagr(fiveAgo.revenue, latest.revenue, span);
  const buyback =
    fiveAgo.sharesOutstanding > 0 && span > 0
      ? (fiveAgo.sharesOutstanding - latest.sharesOutstanding) / fiveAgo.sharesOutstanding / span
      : null;

  let score = 0, weights = 0;
  if (roe !== null) { score += Math.min(roe, 1) * 25; weights += 25; }
  if (roce !== null) { score += Math.min(roce, 1) * 20; weights += 20; }
  score += Math.min(Math.max(margin, 0), 0.5) * 2 * 15; weights += 15;
  if (epsG !== null) { score += Math.min(Math.max(epsG, 0), 0.5) * 2 * 15; weights += 15; }
  if (revG !== null) { score += Math.min(Math.max(revG, 0), 0.5) * 2 * 15; weights += 15; }
  if (buyback !== null) { score += Math.min(Math.max(buyback, 0), 0.1) * 10 * 10; weights += 10; }
  return weights > 0 ? (score / weights) * 100 : null;
}

export function buildRow(ticker: string, data: StockData): WatchRow {
  const years = data.years;
  const latest = years[years.length - 1];
  const fiveAgo = years.find((y) => y.year === latest.year - 5) ?? years[0];
  const span = latest.year - fiveAgo.year;

  // Median P/E over up to the last 10 years with positive earnings
  const peHistory = years
    .slice(-10)
    .map((y) => y.peMultiple)
    .filter((pe) => pe > 0);
  const medianPe = median(peHistory);

  const price = data.currentPrice;
  const currentPe = price && latest.eps > 0 ? price / latest.eps : null;
  const premium =
    currentPe != null && medianPe != null && medianPe > 0 ? currentPe / medianPe - 1 : null;

  const epsCAGR = fiveAgo.eps > 0 && latest.eps > 0 ? cagr(fiveAgo.eps, latest.eps, span) : null;
  const divYield = price && price > 0 ? latest.dividendsPerShare / price : null;

  // If P/E reverts to its median while EPS compounds at the (capped) historical rate
  let impliedReturn: number | null = null;
  if (price && price > 0 && medianPe != null && latest.eps > 0 && epsCAGR != null) {
    const g = Math.min(Math.max(epsCAGR, 0), MAX_ASSUMED_GROWTH);
    const futurePrice = medianPe * latest.eps * Math.pow(1 + g, 5);
    impliedReturn = Math.pow(futurePrice / price, 1 / 5) - 1 + (divYield ?? 0);
  }

  return {
    ticker: data.ticker,
    name: data.name,
    currency: data.currency,
    currentPrice: price,
    currentPe,
    medianPe,
    premium,
    epsCAGR,
    divYield,
    impliedReturn,
    qualityScore: qualityScore(years),
    beta12w: data.beta12w ?? null,
    yearsOfData: years.length,
  };
}

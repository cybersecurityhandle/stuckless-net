import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const API_VERSION = "1.3.0"; // 1.3.0 = stock split adjustment for EDGAR data

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
};

const SEC_HEADERS = { "User-Agent": "stuckless.net admin@stuckless.net" };

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── SEC EDGAR helpers ──────────────────────────────────────────

let tickerMapCache: Record<string, { cik_str: number; ticker: string; title: string }> | null =
  null;

async function getTickerMap() {
  if (tickerMapCache) return tickerMapCache;
  const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
    headers: SEC_HEADERS,
  });
  if (!res.ok) return null;
  const data = await res.json();
  // Index by ticker for fast lookup
  const map: Record<string, any> = {};
  for (const entry of Object.values(data) as any[]) {
    map[entry.ticker?.toUpperCase()] = entry;
  }
  tickerMapCache = map;
  return map;
}

/**
 * Extract annual values from SEC EDGAR company facts.
 * Merges data from ALL matching XBRL concept names (companies switch concepts over time).
 * Deduplicates by fiscal year end date, keeping the most recently filed value.
 * Earlier concepts in the list take priority when dates overlap.
 */
function extractEdgar(
  facts: Record<string, any>,
  conceptNames: string[],
  units = "USD",
  namespaces = ["us-gaap"]
): Record<string, number> {
  const result: Record<string, number> = {};

  // Iterate in reverse so earlier (higher-priority) concepts overwrite later ones
  for (let i = conceptNames.length - 1; i >= 0; i--) {
    for (const ns of namespaces) {
      const nsData = facts[ns] || {};
      const concept = nsData[conceptNames[i]];
      if (!concept) continue;
      const entries: any[] = concept.units?.[units] || [];
      const annuals = entries.filter((e: any) => e.form === "10-K");
      if (annuals.length === 0) continue;

      // Group by end date, keep latest filing
      const byEnd: Record<string, any> = {};
      for (const e of annuals) {
        if (!byEnd[e.end] || e.filed > byEnd[e.end].filed) {
          byEnd[e.end] = e;
        }
      }

      for (const [end, entry] of Object.entries(byEnd) as [string, any][]) {
        result[end] = entry.val;
      }
    }
  }
  return result;
}

async function fetchEdgarData(ticker: string) {
  const map = await getTickerMap();
  if (!map) return null;

  const entry = map[ticker.toUpperCase()];
  if (!entry) return null;

  const cik = String(entry.cik_str).padStart(10, "0");
  const res = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, {
    headers: SEC_HEADERS,
  });
  if (!res.ok) return null;

  const factsJson = await res.json();
  const allFacts = factsJson.facts || {};

  const revenues = extractEdgar(allFacts, [
    "Revenues",
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "SalesRevenueNet",
    "SalesRevenueGoodsNet",
    "SalesRevenueServicesNet",
  ]);

  const netIncomes = extractEdgar(allFacts, [
    "NetIncomeLoss",
    "ProfitLoss",
    "NetIncomeLossAvailableToCommonStockholdersBasic",
    "NetIncomeLossAvailableToCommonStockholdersDiluted",
    "ComprehensiveIncomeNetOfTaxIncludingPortionAttributableToNoncontrollingInterest",
  ]);

  // Shares: start with weighted average (reliable fiscal year-end dates), then layer
  // actual shares outstanding on top (higher priority but may have non-fiscal dates)
  const shares: Record<string, number> = {
    ...extractEdgar(
      allFacts,
      ["WeightedAverageNumberOfSharesOutstandingBasic", "WeightedAverageNumberOfDilutedSharesOutstanding"],
      "shares"
    ),
    ...extractEdgar(
      allFacts,
      ["CommonStockSharesOutstanding", "EntityCommonStockSharesOutstanding"],
      "shares",
      ["us-gaap", "dei"]
    ),
  };

  const eps = extractEdgar(
    allFacts,
    [
      "EarningsPerShareDiluted",
      "IncomeLossFromContinuingOperationsPerDilutedShare",
      "EarningsPerShareBasic",
      "IncomeLossFromContinuingOperationsPerBasicShare",
    ],
    "USD/shares"
  );

  const dps = extractEdgar(
    allFacts,
    [
      "CommonStockDividendsPerShareDeclared",
      "CommonStockDividendsPerShareCashPaid",
    ],
    "USD/shares"
  );

  // Build a year-based shares lookup (some share concepts use filing dates, not fiscal year-end)
  const sharesByYear: Record<number, number> = {};
  for (const [dateStr, val] of Object.entries(shares)) {
    const yr = new Date(dateStr).getFullYear();
    // For dei dates like 2026-02-18, map to prior fiscal year (2025)
    const month = new Date(dateStr).getMonth(); // 0-indexed
    const fiscalYear = month < 4 ? yr - 1 : yr; // Q1 filing → prior year
    if (!sharesByYear[fiscalYear]) sharesByYear[fiscalYear] = val;
  }

  // Build year-end map: merge all metrics by fiscal year end date
  const allDates = new Set([
    ...Object.keys(revenues),
    ...Object.keys(netIncomes),
    ...Object.keys(eps),
  ]);

  const yearData: Record<
    string,
    { revenue?: number; netIncome?: number; shares?: number; eps?: number; dps?: number }
  > = {};

  for (const date of allDates) {
    const yr = new Date(date).getFullYear();
    yearData[date] = {
      revenue: revenues[date],
      netIncome: netIncomes[date],
      shares: shares[date] ?? sharesByYear[yr],
      eps: eps[date],
      dps: dps[date],
    };
  }

  return {
    name: entry.title,
    yearData,
  };
}

// ── Yahoo Finance helpers ──────────────────────────────────────

async function getYahooFinance() {
  const { default: YahooFinance } = await import("yahoo-finance2");
  return new YahooFinance({ suppressNotices: ["yahooSurvey"] });
}

function getClosestPrice(historical: any[], targetDate: Date): number {
  let closest: any = null;
  let minDiff = Infinity;

  for (const day of historical) {
    const d = day.date instanceof Date ? day.date : new Date(day.date);
    const diff = Math.abs(d.getTime() - targetDate.getTime());
    if (diff < minDiff && day.close) {
      minDiff = diff;
      closest = day;
    }
  }

  return closest?.close || 0;
}

/**
 * Compute cumulative split factor for a given date.
 * Returns the factor to multiply shares by (and divide per-share values by)
 * to convert as-filed values to current split-adjusted basis.
 */
function splitFactorAfterDate(
  splits: Array<{ date: Date | string; numerator: number; denominator: number }>,
  asOfDate: Date
): number {
  let factor = 1;
  for (const split of splits) {
    const splitDate = split.date instanceof Date ? split.date : new Date(split.date);
    if (splitDate > asOfDate) {
      factor *= split.numerator / split.denominator;
    }
  }
  return factor;
}

// ── Main handler ───────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker");
  const search = searchParams.get("search");

  try {
    const yahooFinance = await getYahooFinance();

    if (search) {
      const result: any = await yahooFinance.search(search);
      const equities = (result.quotes || [])
        .filter((q: any) => q.quoteType === "EQUITY")
        .slice(0, 8)
        .map((q: any) => ({
          symbol: q.symbol,
          name: q.shortname || q.longname || q.symbol,
          exchange: q.exchDisp || q.exchange,
        }));
      return NextResponse.json(equities);
    }

    if (!ticker) {
      return NextResponse.json({ error: "Provide ?ticker= or ?search=" }, { status: 400 });
    }

    // Fetch in parallel: SEC EDGAR (10+ years fundamentals), Yahoo (prices + info + recent fundamentals + splits)
    const startDate = new Date(new Date().getFullYear() - 20, 0, 1);
    const [edgar, yfSummary, yfFundamentals, historical, chartData] = await Promise.all([
      fetchEdgarData(ticker).catch(() => null),
      yahooFinance.quoteSummary(ticker, { modules: ["price"] }).catch(() => null),
      yahooFinance
        .fundamentalsTimeSeries(ticker, {
          period1: new Date(new Date().getFullYear() - 6, 0, 1),
          period2: new Date(),
          type: "annual",
          module: "all",
        })
        .catch(() => []),
      yahooFinance.historical(ticker, {
        period1: startDate,
        period2: new Date(),
        interval: "1mo",
      }),
      yahooFinance.chart(ticker, {
        period1: startDate,
        period2: new Date(),
        interval: "3mo",
        events: "splits",
      }).catch(() => null),
    ]);

    const splits: Array<{ date: Date | string; numerator: number; denominator: number }> =
      (chartData as any)?.events?.splits || [];

    const companyName =
      yfSummary?.price?.longName ||
      yfSummary?.price?.shortName ||
      edgar?.name ||
      ticker.toUpperCase();
    const currency = yfSummary?.price?.currency || "USD";

    // Build year data: prefer SEC EDGAR, fill gaps with Yahoo Finance
    const yearMap: Record<number, any> = {};

    // 1. SEC EDGAR data (10+ years) — adjust for stock splits
    if (edgar?.yearData) {
      for (const [dateStr, data] of Object.entries(edgar.yearData)) {
        const endDate = new Date(dateStr);
        const year = endDate.getFullYear();
        // Only include if we have at least revenue + (netIncome or eps) + shares
        const hasIncome = data.netIncome != null || data.eps != null;
        if (data.revenue == null || !hasIncome || data.shares == null) continue;

        const netIncome =
          data.netIncome ?? (data.eps && data.shares ? data.eps * data.shares : undefined);
        if (netIncome == null) continue;

        const epsVal = data.eps ?? netIncome / data.shares;
        const dpsVal = data.dps ?? 0;

        // Adjust for any stock splits that occurred after this fiscal year end
        const sf = splitFactorAfterDate(splits, endDate);

        yearMap[year] = {
          endDate: dateStr,
          revenue: data.revenue,
          netIncome, // Revenue & net income are totals, not affected by splits
          sharesOutstanding: data.shares * sf,
          eps: epsVal / sf,
          dps: dpsVal / sf,
        };
      }
    }

    // 2. Fill/override with Yahoo Finance fundamentalsTimeSeries (more accurate for recent years)
    for (const entry of yfFundamentals as any[]) {
      const endDate = entry.date instanceof Date ? entry.date : new Date(entry.date);
      const year = endDate.getFullYear();

      const revenue = entry.totalRevenue;
      const netIncome = entry.netIncome;
      const sharesOut = entry.ordinarySharesNumber;
      if (!revenue || !netIncome || !sharesOut) continue;

      const epsVal = entry.dilutedEPS || netIncome / sharesOut;
      const dividendsPaid = Math.abs(
        entry.cashDividendsPaid || entry.commonStockDividendPaid || 0
      );
      const dpsVal = sharesOut > 0 ? dividendsPaid / sharesOut : 0;

      yearMap[year] = {
        endDate: endDate.toISOString().split("T")[0],
        revenue,
        netIncome,
        sharesOutstanding: sharesOut,
        eps: epsVal,
        dps: dpsVal,
      };
    }

    // 3. Compute derived metrics with historical prices
    const years = [];
    const sortedYears = Object.keys(yearMap)
      .map(Number)
      .sort((a, b) => a - b);

    for (const year of sortedYears) {
      const d = yearMap[year];
      const endDate = new Date(d.endDate);
      const price = getClosestPrice(historical, endDate);
      if (!price) continue;

      const salesPerShare = d.revenue / d.sharesOutstanding;
      const netMargin = d.netIncome / d.revenue;
      const pe = d.eps > 0 ? price / d.eps : 0;
      const divYield = price > 0 ? d.dps / price : 0;

      years.push({
        year,
        endDate: d.endDate,
        revenue: d.revenue,
        netIncome: d.netIncome,
        sharesOutstanding: d.sharesOutstanding,
        eps: Math.round(d.eps * 100) / 100,
        price: Math.round(price * 100) / 100,
        dividendsPerShare: Math.round(d.dps * 1000) / 1000,
        salesPerShare: Math.round(salesPerShare * 100) / 100,
        netMargin: Math.round(netMargin * 10000) / 10000,
        peMultiple: Math.round(pe * 100) / 100,
        dividendYield: Math.round(divYield * 10000) / 10000,
      });
    }

    return NextResponse.json(
      {
        ticker: ticker.toUpperCase(),
        name: companyName,
        currency,
        version: API_VERSION,
        source: edgar?.yearData ? "edgar+yahoo" : "yahoo",
        years,
      },
      { headers: CACHE_HEADERS }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch stock data";
    console.error("Stock API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

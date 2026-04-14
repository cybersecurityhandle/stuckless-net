import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const API_VERSION = "1.5.5"; // 1.5.5 = XBRL scale error guard: when filings disagree >1000x use minimum (fixes BRK-A 2011 1.65T→1.65M)

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
  const map: Record<string, any> = {};
  for (const entry of Object.values(data) as any[]) {
    map[entry.ticker?.toUpperCase()] = entry;
  }
  tickerMapCache = map;
  return map;
}

/**
 * Extract annual values from SEC EDGAR company facts (10-K filings).
 * Merges data from ALL matching XBRL concept names (companies switch concepts over time).
 * Deduplicates by fiscal year end date, keeping the most recently filed value.
 * Earlier concepts in the list take priority when dates overlap.
 */
function extractEdgar(
  facts: Record<string, any>,
  conceptNames: string[],
  units = "USD",
  namespaces = ["us-gaap"],
  preferEarliestFiling = false // For per-share data: use earliest filing to avoid split-restated values
): Record<string, number> {
  const result: Record<string, number> = {};

  for (let i = conceptNames.length - 1; i >= 0; i--) {
    for (const ns of namespaces) {
      const nsData = facts[ns] || {};
      const concept = nsData[conceptNames[i]];
      if (!concept) continue;
      const entries: any[] = concept.units?.[units] || [];
      // Filter for 10-K filings with annual-length periods (>300 days) or point-in-time (no start)
      const annuals = entries.filter((e: any) => {
        if (e.form !== "10-K") return false;
        if (e.start && e.end) {
          const days = (new Date(e.end).getTime() - new Date(e.start).getTime()) / 86400000;
          if (days < 300) return false; // Skip quarterly entries within 10-K filings
        }
        return true;
      });
      if (annuals.length === 0) continue;

      // Group all filings by period end date
      const byEnd: Record<string, any[]> = {};
      for (const e of annuals) {
        if (!byEnd[e.end]) byEnd[e.end] = [];
        byEnd[e.end].push(e);
      }

      for (const [end, periodEntries] of Object.entries(byEnd) as [string, any[]][]) {
        // Sort by preference (earliest or latest filing)
        periodEntries.sort((a: any, b: any) =>
          preferEarliestFiling
            ? a.filed.localeCompare(b.filed)
            : b.filed.localeCompare(a.filed)
        );

        // XBRL scale error guard: early EDGAR filings sometimes mis-file values
        // at 10^6 the correct magnitude (e.g. BRK-A filed shares as 1.65T instead
        // of 1.65M). When filings for the same period disagree by >1000x it is
        // never a legitimate split restatement — it is a units bug. Use the minimum.
        const vals = periodEntries.map((e: any) => e.val as number).filter((v) => v > 0);
        if (vals.length > 1) {
          const min = Math.min(...vals);
          const max = Math.max(...vals);
          if (max / min > 1000) {
            result[end] = min;
            continue;
          }
        }

        result[end] = periodEntries[0].val;
      }
    }
  }
  return result;
}

/**
 * Extract calendar-year totals by summing quarterly EDGAR data.
 * Collects entries with 60-120 day periods from 10-Q and 10-K filings,
 * groups by calendar year of end date, and sums.
 * Only returns years with exactly 4 unique quarter periods.
 */
function extractEdgarCalendarYear(
  facts: Record<string, any>,
  conceptNames: string[],
  units = "USD",
  namespaces = ["us-gaap"]
): Record<number, number> {
  const yearQuarters: Record<number, Map<string, { val: number; filed: string }>> = {};

  for (let i = conceptNames.length - 1; i >= 0; i--) {
    for (const ns of namespaces) {
      const concept = facts[ns]?.[conceptNames[i]];
      if (!concept) continue;
      const entries: any[] = concept.units?.[units] || [];

      // Within this concept+namespace, group by period key, keep latest filing
      const byPeriod: Record<string, any> = {};
      for (const e of entries) {
        if (!e.start || !e.end) continue;
        if (e.form !== "10-Q" && e.form !== "10-K") continue;
        const days = (new Date(e.end).getTime() - new Date(e.start).getTime()) / 86400000;
        if (days < 60 || days > 120) continue;

        const key = `${e.start}_${e.end}`;
        if (!byPeriod[key] || e.filed > byPeriod[key].filed) {
          byPeriod[key] = e;
        }
      }

      // Higher priority concepts (earlier in list, processed later) overwrite same period
      for (const [key, e] of Object.entries(byPeriod) as [string, any][]) {
        const cy = new Date(e.end).getFullYear();
        if (!yearQuarters[cy]) yearQuarters[cy] = new Map();
        yearQuarters[cy].set(key, { val: e.val, filed: e.filed });
      }
    }
  }

  const result: Record<number, number> = {};
  for (const [yrStr, qMap] of Object.entries(yearQuarters)) {
    if (qMap.size === 4) {
      let sum = 0;
      for (const q of qMap.values()) sum += q.val;
      result[Number(yrStr)] = sum;
    }
  }
  return result;
}

// Concept name lists (shared between fiscal and calendar year extraction)
const REVENUE_CONCEPTS = [
  "Revenues",
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "SalesRevenueNet",
  "SalesRevenueGoodsNet",
  "SalesRevenueServicesNet",
];

// Priority: "available to common stockholders" first (matches per-share analysis),
// then total NetIncomeLoss as fallback for simple capital structures
const NET_INCOME_CONCEPTS = [
  "NetIncomeLossAvailableToCommonStockholdersBasic",
  "NetIncomeLoss",
  "ProfitLoss",
  "NetIncomeLossAvailableToCommonStockholdersDiluted",
  "ComprehensiveIncomeNetOfTaxIncludingPortionAttributableToNoncontrollingInterest",
];

const SHARES_WEIGHTED_CONCEPTS = [
  "WeightedAverageNumberOfSharesOutstandingBasic",
  "WeightedAverageNumberOfDilutedSharesOutstanding",
];

const SHARES_OUTSTANDING_CONCEPTS = [
  "CommonStockSharesOutstanding",
  "EntityCommonStockSharesOutstanding",
];

const EPS_CONCEPTS = [
  "EarningsPerShareDiluted",
  "IncomeLossFromContinuingOperationsPerDilutedShare",
  "EarningsPerShareBasic",
  "IncomeLossFromContinuingOperationsPerBasicShare",
];

const DPS_CONCEPTS = [
  "CommonStockDividendsPerShareDeclared",
  "CommonStockDividendsPerShareCashPaid",
];

// Balance sheet concepts for ROCE/ROE
const STOCKHOLDERS_EQUITY_CONCEPTS = [
  "StockholdersEquity",
  "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
];

const TOTAL_ASSETS_CONCEPTS = ["Assets"];

const LONG_TERM_DEBT_CONCEPTS = [
  "LongTermDebt",
  "LongTermDebtNoncurrent",
  "LongTermDebtAndCapitalLeaseObligations",
];

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

  // ── Fiscal year data (from 10-K annual) ──
  const revenues = extractEdgar(allFacts, REVENUE_CONCEPTS);
  const netIncomes = extractEdgar(allFacts, NET_INCOME_CONCEPTS);

  // Per-share data: use earliest filing to avoid split-restated values from later 10-Ks.
  // Weighted average basic shares has highest priority — it is the correct EPS denominator.
  // CommonStockSharesOutstanding (us-gaap only) is the fallback for companies that don't file
  // WeightedAverage. EntityCommonStockSharesOutstanding in DEI is excluded: for multi-class
  // companies (e.g. BRK-A/B) it reports each share class separately and gives wrong counts.
  const shares: Record<string, number> = {
    ...extractEdgar(allFacts, SHARES_OUTSTANDING_CONCEPTS, "shares", ["us-gaap"], true),
    ...extractEdgar(allFacts, SHARES_WEIGHTED_CONCEPTS, "shares", ["us-gaap"], true),
  };

  // EPS: derive from netIncome/shares (not EDGAR's diluted EPS which uses higher diluted share count)
  // This ensures consistency between displayed EPS, share count, and margin
  const dps = extractEdgar(allFacts, DPS_CONCEPTS, "USD/shares", ["us-gaap"], true);

  // Balance sheet (point-in-time values, no split adjustment needed)
  const equity = extractEdgar(allFacts, STOCKHOLDERS_EQUITY_CONCEPTS);
  const totalAssets = extractEdgar(allFacts, TOTAL_ASSETS_CONCEPTS);
  const longTermDebt = extractEdgar(allFacts, LONG_TERM_DEBT_CONCEPTS);

  // Build year-based shares lookup (some share concepts use filing dates, not fiscal year-end)
  const sharesByYear: Record<number, number> = {};
  for (const [dateStr, val] of Object.entries(shares)) {
    const yr = new Date(dateStr).getFullYear();
    const month = new Date(dateStr).getMonth();
    const fiscalYear = month < 5 ? yr - 1 : yr;
    if (!sharesByYear[fiscalYear]) sharesByYear[fiscalYear] = val;
  }

  // Build fiscal year-end map
  const allDates = new Set([
    ...Object.keys(revenues),
    ...Object.keys(netIncomes),
  ]);

  const yearData: Record<
    string,
    { revenue?: number; netIncome?: number; shares?: number; dps?: number; equity?: number; totalAssets?: number; longTermDebt?: number }
  > = {};

  for (const date of allDates) {
    const yr = new Date(date).getFullYear();
    yearData[date] = {
      revenue: revenues[date],
      netIncome: netIncomes[date],
      shares: shares[date] ?? sharesByYear[yr],
      dps: dps[date],
      equity: equity[date],
      totalAssets: totalAssets[date],
      longTermDebt: longTermDebt[date],
    };
  }

  // ── Calendar year data (from quarterly 10-Q + 10-K) ──
  const calRevenues = extractEdgarCalendarYear(allFacts, REVENUE_CONCEPTS);
  const calNetIncomes = extractEdgarCalendarYear(allFacts, NET_INCOME_CONCEPTS);

  const calendarYearData: Record<number, { revenue: number; netIncome: number }> = {};
  const allCalYears = new Set([
    ...Object.keys(calRevenues).map(Number),
    ...Object.keys(calNetIncomes).map(Number),
  ]);
  for (const cy of allCalYears) {
    if (calRevenues[cy] != null && calNetIncomes[cy] != null) {
      calendarYearData[cy] = {
        revenue: calRevenues[cy],
        netIncome: calNetIncomes[cy],
      };
    }
  }

  return {
    name: entry.title,
    yearData,
    calendarYearData,
    sharesByYear,
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

    // Fetch in parallel: SEC EDGAR, Yahoo (prices + info + annual/quarterly fundamentals + splits)
    const startDate = new Date(new Date().getFullYear() - 20, 0, 1);
    const [edgar, yfSummary, yfFundamentals, yfQuarterly, historical, chartData] =
      await Promise.all([
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
        yahooFinance
          .fundamentalsTimeSeries(ticker, {
            period1: new Date(new Date().getFullYear() - 10, 0, 1),
            period2: new Date(),
            type: "quarterly",
            module: "all",
          })
          .catch(() => []),
        yahooFinance.historical(ticker, {
          period1: startDate,
          period2: new Date(),
          interval: "1wk", // Weekly for better Dec 31 price accuracy
        }),
        yahooFinance
          .chart(ticker, {
            period1: startDate,
            period2: new Date(),
            interval: "3mo",
            events: "splits",
          })
          .catch(() => null),
      ]);

    const splits: Array<{ date: Date | string; numerator: number; denominator: number }> =
      (chartData as any)?.events?.splits || [];

    const companyName =
      yfSummary?.price?.longName ||
      yfSummary?.price?.shortName ||
      edgar?.name ||
      ticker.toUpperCase();
    const currency = yfSummary?.price?.currency || "USD";

    // ═══════════════════════════════════════════════════════════════
    // FISCAL YEAR DATA
    // ═══════════════════════════════════════════════════════════════
    const yearMap: Record<number, any> = {};

    // 1. SEC EDGAR data (10+ years) — adjust for stock splits
    if (edgar?.yearData) {
      for (const [dateStr, data] of Object.entries(edgar.yearData)) {
        const endDate = new Date(dateStr);
        // Label fiscal year by the calendar year it mostly falls in (standard financial convention).
        // Jan–Apr FYE (months 0–4): use prior year (e.g. NVDA Jan 31 2025 → FY 2024)
        // May–Dec FYE (months 5–11): use end year (e.g. AAPL Sep 30 2024 → FY 2024)
        const year = endDate.getMonth() < 5 ? endDate.getFullYear() - 1 : endDate.getFullYear();
        if (data.revenue == null || data.netIncome == null || data.shares == null) continue;

        const netIncome = data.netIncome;
        const epsVal = netIncome / data.shares; // Basic EPS = netIncome / basicShares
        const dpsVal = data.dps ?? 0;

        const sf = splitFactorAfterDate(splits, endDate);

        yearMap[year] = {
          endDate: dateStr,
          revenue: data.revenue,
          netIncome,
          sharesOutstanding: data.shares * sf,
          eps: epsVal / sf,
          dps: dpsVal / sf,
          equity: data.equity,
          totalAssets: data.totalAssets,
          longTermDebt: data.longTermDebt,
        };
      }
    }

    // 2. Fill gaps with Yahoo Finance fundamentalsTimeSeries (only for years EDGAR doesn't cover)
    for (const entry of yfFundamentals as any[]) {
      const endDate = entry.date instanceof Date ? entry.date : new Date(entry.date);
      const year = endDate.getMonth() < 5 ? endDate.getFullYear() - 1 : endDate.getFullYear();

      // Don't override EDGAR data — EDGAR 10-K filings are the authoritative source for US stocks
      if (yearMap[year]) continue;

      const revenue = entry.totalRevenue;
      const netIncome = entry.netIncome;
      const sharesOut = entry.ordinarySharesNumber;
      if (!revenue || !netIncome || !sharesOut) continue;

      const epsVal = netIncome / sharesOut;
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
      const fiscalPrice = getClosestPrice(historical, endDate);
      const calendarPrice = getClosestPrice(historical, new Date(year, 11, 31));
      if (!fiscalPrice && !calendarPrice) continue;

      const price = fiscalPrice || calendarPrice;
      const salesPerShare = d.revenue / d.sharesOutstanding;
      const netMargin = d.netIncome / d.revenue;
      const pe = d.eps > 0 ? price / d.eps : 0;
      const divYield = price > 0 ? d.dps / price : 0;
      const calPe = d.eps > 0 && calendarPrice ? calendarPrice / d.eps : 0;
      const calDivYield = calendarPrice > 0 ? d.dps / calendarPrice : 0;

      years.push({
        year,
        endDate: d.endDate,
        revenue: d.revenue,
        netIncome: d.netIncome,
        sharesOutstanding: d.sharesOutstanding,
        eps: Math.round(d.eps * 100) / 100,
        price: Math.round(price * 100) / 100,
        calendarPrice: Math.round((calendarPrice || 0) * 100) / 100,
        dividendsPerShare: Math.round(d.dps * 1000) / 1000,
        salesPerShare: Math.round(salesPerShare * 100) / 100,
        netMargin: Math.round(netMargin * 10000) / 10000,
        peMultiple: Math.round(pe * 100) / 100,
        dividendYield: Math.round(divYield * 10000) / 10000,
        calendarPeMultiple: Math.round(calPe * 100) / 100,
        calendarDividendYield: Math.round(calDivYield * 10000) / 10000,
        equity: d.equity,
        totalAssets: d.totalAssets,
        longTermDebt: d.longTermDebt,
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // CALENDAR YEAR DATA
    // ═══════════════════════════════════════════════════════════════
    const calYearMap: Record<number, any> = {};

    // 1. EDGAR calendar year data (10+ years, aggregated from quarterly 10-Q/10-K)
    if (edgar?.calendarYearData) {
      for (const [cyStr, data] of Object.entries(edgar.calendarYearData)) {
        const cy = Number(cyStr);
        // Reuse fiscal year shares (closest available, already split-adjusted)
        const fyData = yearMap[cy] || yearMap[cy - 1] || yearMap[cy + 1];
        if (!fyData?.sharesOutstanding) continue;

        const shares = fyData.sharesOutstanding;
        const eps = data.netIncome / shares;
        const dps = fyData.dps ?? 0;

        calYearMap[cy] = {
          endDate: `${cy}-12-31`,
          revenue: data.revenue,
          netIncome: data.netIncome,
          sharesOutstanding: shares,
          eps,
          dps,
        };
      }
    }

    // 2. Yahoo quarterly data (fill/override recent years)
    const yfCalAgg: Record<
      number,
      { revenue: number; netIncome: number; shares: number; divPaid: number; eps: number; quarters: number }
    > = {};
    for (const entry of yfQuarterly as any[]) {
      const endDate = entry.date instanceof Date ? entry.date : new Date(entry.date);
      const cy = endDate.getFullYear();

      const revenue = entry.totalRevenue || 0;
      const netIncome = entry.netIncome || 0;
      const sharesQ = entry.ordinarySharesNumber || 0;
      const epsQ = sharesQ > 0 ? netIncome / sharesQ : 0; // Basic EPS, consistent with share count
      const divPaid = Math.abs(entry.cashDividendsPaid || entry.commonStockDividendPaid || 0);

      if (!yfCalAgg[cy])
        yfCalAgg[cy] = { revenue: 0, netIncome: 0, shares: 0, divPaid: 0, eps: 0, quarters: 0 };
      yfCalAgg[cy].revenue += revenue;
      yfCalAgg[cy].netIncome += netIncome;
      if (sharesQ > yfCalAgg[cy].shares) yfCalAgg[cy].shares = sharesQ;
      yfCalAgg[cy].divPaid += divPaid;
      yfCalAgg[cy].eps += epsQ;
      yfCalAgg[cy].quarters++;
    }

    for (const [cyStr, d] of Object.entries(yfCalAgg)) {
      const cy = Number(cyStr);
      if (d.quarters !== 4 || !d.shares) continue;

      const dps = d.shares > 0 ? d.divPaid / d.shares : 0;
      calYearMap[cy] = {
        endDate: `${cy}-12-31`,
        revenue: d.revenue,
        netIncome: d.netIncome,
        sharesOutstanding: d.shares,
        eps: d.netIncome / d.shares, // Always derive from netIncome/basicShares
        dps,
      };
    }

    // 3. Fill gaps: for December FYE companies, fiscal year ≈ calendar year.
    //    Copy fiscal data for any missing CY years when FYE is Nov-Jan.
    {
      // Determine if this company has a Dec-ish FYE (check most recent fiscal year)
      const latestFy = years[years.length - 1];
      const fyEndMonth = latestFy ? new Date(latestFy.endDate).getMonth() : -1;
      const isDecFye = fyEndMonth >= 10 || fyEndMonth <= 0; // Nov, Dec, or Jan

      if (isDecFye || Object.keys(calYearMap).length < 2) {
        for (const fy of years) {
          const cy = fy.year;
          if (!calYearMap[cy]) {
            const fyData = yearMap[cy];
            if (fyData) {
              calYearMap[cy] = { ...fyData, endDate: `${cy}-12-31` };
            }
          }
        }
      }
    }

    // 4. Compute calendar year derived metrics
    const calendarYears = [];
    const sortedCalYears = Object.keys(calYearMap)
      .map(Number)
      .sort((a, b) => a - b);

    for (const cy of sortedCalYears) {
      const d = calYearMap[cy];
      const price = getClosestPrice(historical, new Date(cy, 11, 31));
      if (!price) continue;

      const salesPerShare = d.revenue / d.sharesOutstanding;
      const netMargin = d.netIncome / d.revenue;
      const pe = d.eps > 0 ? price / d.eps : 0;
      const divYield = price > 0 ? d.dps / price : 0;

      calendarYears.push({
        year: cy,
        endDate: d.endDate,
        revenue: d.revenue,
        netIncome: d.netIncome,
        sharesOutstanding: d.sharesOutstanding,
        eps: Math.round(d.eps * 100) / 100,
        price: Math.round(price * 100) / 100,
        calendarPrice: Math.round(price * 100) / 100,
        dividendsPerShare: Math.round(d.dps * 1000) / 1000,
        salesPerShare: Math.round(salesPerShare * 100) / 100,
        netMargin: Math.round(netMargin * 10000) / 10000,
        peMultiple: Math.round(pe * 100) / 100,
        dividendYield: Math.round(divYield * 10000) / 10000,
        calendarPeMultiple: Math.round(pe * 100) / 100,
        calendarDividendYield: Math.round(divYield * 10000) / 10000,
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
        calendarYears,
      },
      { headers: CACHE_HEADERS }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch stock data";
    console.error("Stock API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

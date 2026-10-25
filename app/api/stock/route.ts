import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/analytics";

export const runtime = "nodejs";

const API_VERSION = "1.19.0"; // 1.19.0 = period-end prices from daily closes (last close on or before the period end); unrealized-gain fallback tags

// Tickers whose EDGAR filings report share counts for a different share
// class than the listed ticker. BRK filings carry Class A equivalents;
// 1 A converts to exactly 1,500 B. Per-share values divide by the same
// factor (BRK pays no dividend, but handled for completeness).
const SHARE_CLASS_MULTIPLIER: Record<string, number> = {
  "BRK-B": 1500,
};

// Weighted-average basic shares (as filed) for years where the filer tags shares
// only by share-class dimension, which the SEC companyfacts API drops. Keyed by
// CIK so BRK-A and BRK-B share it. Values from each 10-K's XBRL instance.
// TODO(yearly, ~March): add the new year once Berkshire files its 10-K (FY2026 due
// ~Feb 2027) — without it that year falls back to Yahoo (no equity, revenue incl.
// investment gains). Source: WeightedAverageNumberOfSharesOutstandingBasic with
// context member brka:EquivalentClassAMember in brka-YYYYMMDD_htm.xml.
const EDGAR_SHARES_OVERRIDE: Record<string, Record<string, number>> = {
  // Berkshire: brka:EquivalentClassAMember (Class A equivalents)
  "0001067983": {
    "2015-12-31": 1643183, "2016-12-31": 1643826, "2017-12-31": 1644615,
    "2018-12-31": 1643795, "2019-12-31": 1633946, "2020-12-31": 1594469,
    "2021-12-31": 1510180, "2022-12-31": 1468876, "2023-12-31": 1448880,
    "2024-12-31": 1437720, "2025-12-31": 1438223,
  },
};

// Some foreign listings price in USD while Yahoo serves their financials in
// the local reporting currency, inflating every per-share and money figure.
// Map ticker → reporting currency; values are converted to the price currency
// at the current FX rate (approximation: historical years use today's rate).
// Only pure cases belong here (1:1 share listing, no ADR ratio) — e.g. TSM
// (1 ADR = 5 shares) needs more than FX and is deliberately excluded.
const REPORTING_FX: Record<string, string> = {
  BAP: "PEN", // Credicorp — NYSE-listed, reports in Peruvian soles
  IFS: "PEN", // Intercorp Financial — same
  "TOI.V": "EUR", // Topicus.com — TSXV-listed in CAD, reports in EUR
  ASML: "EUR", // ASML — NASDAQ shares are 1:1 ordinary, reports in EUR
  RACE: "EUR", // Ferrari — NYSE shares are 1:1 ordinary, reports in EUR
  "LMN.V": "USD", // Lumine — TSXV-listed in CAD, reports in USD
  "0700.HK": "CNY", // Tencent — HKEX-listed in HKD, reports in RMB
  "PRX.AS": "USD", // Prosus — Euronext-listed in EUR, reports in USD
};

// Yahoo-sourced tickers whose EPS uses weighted-average rather than year-end
// shares (year-end still fills years with no average). PRX.AS: Yahoo's FY23
// year-end count reads 4,043M vs 2,750M weighted, and heavy buybacks make
// year-end understate the period's share base anyway.
const YAHOO_WEIGHTED_SHARES = new Set(["PRX.AS"]);

// Hard-coded tickers whose yearData is already in the listing currency, but
// whose Yahoo-backfilled FCF arrives in the reporting currency. Only the
// backfilled FCF is converted (current FX rate, same approximation as above).
const BACKFILL_FX: Record<string, string> = {
  "CSU.TO": "USD", // Constellation — hard-coded in CAD, Yahoo serves USD
  "FFH.TO": "USD", // Fairfax — same
};

// Trading days for short-horizon beta (~12 weeks). Daily returns give ~60
// observations; weekly returns over the same window would give only 12.
const BETA_TRADING_DAYS = 60;

// Consolidated figures overstate what belongs to shareholders when the listed
// entity only part-owns its operating businesses. Approximate attributable
// shares for known cases. `netIncome` is only set where the upstream data is
// consolidated-total. Yahoo's KPG.AX and ACP.WA net income are both already
// attributable (ACP.WA FY24 PLN 519.9M / FY25 PLN 1,138.7M match Asseco's
// reported profit attributable to the parent), so only FCF is scaled.
//   KPG.AX — owns ~51% of each practice, but a flat 51% of consolidated
//            OCF−capex still ignores holdco debt service, lease principal
//            (AASB 16), and earnout payments. Calibrated instead to reported
//            underlying NPATA attributable to shareholders vs consolidated
//            FCF: FY25 A$9.1M / A$28.8M ≈ 0.32.
//   ACP.WA — consolidated FCF scaled by attributable/consolidated net profit:
//            37% (2022), 40% (2023), 50% (2024), ~55% (2025); 0.45 midpoint.
const ATTRIBUTABLE_SHARE: Record<string, { fcf: number; netIncome?: number }> = {
  "KPG.AX": { fcf: 0.32 },
  "ACP.WA": { fcf: 0.45 },
};

// Fundamentals change quarterly; the live quote is refreshed on every cache hit
const REDIS_TTL_S = 24 * 60 * 60;

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
};

const SEC_HEADERS = { "User-Agent": "stuckless.net admin@stuckless.net" };

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Hard-coded financials (tickers not in SEC EDGAR) ──────────
// Values in actual dollars/shares (multiply source millions by 1e6).
// Prices still come live from Yahoo Finance.

const M = 1_000_000;

const HARDCODED_FINANCIALS: Record<string, {
  name: string;
  yearData: Record<string, { revenue: number; netIncome: number; shares: number; dps: number; equity: number; totalAssets: number; longTermDebt: number; fcf?: number }>;
}> = {
  OTCM: {
    name: "OTC Markets Group Inc.",
    yearData: {
      "2016-12-31": { revenue: 48.6*M, netIncome: 10.5*M, shares: 11.1*M, dps: 0.56, equity: 15.5*M, totalAssets: 36.6*M, longTermDebt: 0 },
      "2017-12-31": { revenue: 52.2*M, netIncome: 12.6*M, shares: 11.1*M, dps: 0.56, equity: 13.8*M, totalAssets: 36.3*M, longTermDebt: 0 },
      "2018-12-31": { revenue: 56.5*M, netIncome: 16.2*M, shares: 11.3*M, dps: 0.58, equity: 16.4*M, totalAssets: 41.6*M, longTermDebt: 0 },
      "2019-12-31": { revenue: 59.6*M, netIncome: 14.9*M, shares: 11.4*M, dps: 0.60, equity: 17.7*M, totalAssets: 60.4*M, longTermDebt: 17.5*M },
      "2020-12-31": { revenue: 65.4*M, netIncome: 18.3*M, shares: 11.4*M, dps: 0.60, equity: 19.5*M, totalAssets: 64.8*M, longTermDebt: 16.3*M },
      "2021-12-31": { revenue: 90.6*M, netIncome: 30.5*M, shares: 11.5*M, dps: 0.66, equity: 25.0*M, totalAssets: 82.3*M, longTermDebt: 16.5*M },
      "2022-12-31": { revenue: 96.2*M, netIncome: 30.8*M, shares: 11.6*M, dps: 0.72, equity: 29.8*M, totalAssets: 89.6*M, longTermDebt: 15.2*M },
      "2023-12-31": { revenue: 101.1*M, netIncome: 27.7*M, shares: 11.7*M, dps: 0.72, equity: 32.2*M, totalAssets: 90.5*M, longTermDebt: 13.9*M },
      "2024-12-31": { revenue: 101.2*M, netIncome: 27.4*M, shares: 11.7*M, dps: 0.72, equity: 35.7*M, totalAssets: 90.7*M, longTermDebt: 12.5*M },
      "2025-12-31": { revenue: 112.1*M, netIncome: 31.1*M, shares: 11.8*M, dps: 0.72, equity: 40.5*M, totalAssets: 100.1*M, longTermDebt: 10.9*M },
    },
  },
  // Fairfax Financial Holdings — TSX:FFH (CAD). Yahoo Finance ticker: FFH.TO
  // Revenue is ex-investment-gains, from Fairfax's Q4 press releases (US$):
  // net premiums earned (IFRS 4, 2016–21) / insurance revenue − cost of
  // reinsurance (IFRS 17, 2022 restated onward) + interest and dividends +
  // share of profit of associates + other/non-insurance revenue. Net gains on
  // investments are excluded so sales growth and margin don't track markets.
  // Converted at each year's netIncome CAD/US$ ratio (the rate the rest of
  // this row uses). Other fields are Seeking Alpha / S&P Capital IQ (CAD).
  "FFH.TO": {
    name: "Fairfax Financial Holdings Ltd.",
    yearData: {
      "2016-12-31": { revenue: 14104.0*M, netIncome: -688.2*M,  shares: 23.0*M, dps: 13.43, equity: 11393.3*M, totalAssets: 58257.4*M,  longTermDebt: 5910.2*M },
      "2017-12-31": { revenue: 17272.2*M, netIncome: 2188.3*M,  shares: 25.4*M, dps: 12.57, equity: 15684.2*M, totalAssets: 80573.4*M,  longTermDebt: 7766.5*M },
      "2018-12-31": { revenue: 23892.2*M, netIncome: 513.2*M,   shares: 27.5*M, dps: 13.65, equity: 16078.5*M, totalAssets: 87866.6*M,  longTermDebt: 8628.4*M },
      "2019-12-31": { revenue: 25731.6*M, netIncome: 2602.3*M,  shares: 26.9*M, dps: 12.98, equity: 16935.7*M, totalAssets: 91554.6*M,  longTermDebt: 8964.3*M },
      "2020-12-31": { revenue: 24640.3*M, netIncome: 277.9*M,   shares: 26.4*M, dps: 12.72, equity: 15932.1*M, totalAssets: 94227.8*M,  longTermDebt: 10764.2*M },
      "2021-12-31": { revenue: 28779.2*M, netIncome: 4300.8*M,  shares: 26.0*M, dps: 12.65, equity: 19030.7*M, totalAssets: 109565.7*M, longTermDebt: 9629.3*M },
      "2022-12-31": { revenue: 37585.8*M, netIncome: 4568.5*M,  shares: 23.6*M, dps: 13.54, equity: 24073.6*M, totalAssets: 106716.3*M, longTermDebt: 11664.1*M },
      "2023-12-31": { revenue: 41724.0*M, netIncome: 5805.8*M,  shares: 23.2*M, dps: 19.87, equity: 28639.2*M, totalAssets: 121877.5*M, longTermDebt: 12513.7*M },
      "2024-12-31": { revenue: 50344.1*M, netIncome: 5570.9*M,  shares: 22.4*M, dps: 21.57, equity: 33009.1*M, totalAssets: 139135.8*M, longTermDebt: 16898.2*M },
      "2025-12-31": { revenue: 52158.9*M, netIncome: 6550.5*M,  shares: 21.4*M, dps: 20.59, equity: 36074.7*M, totalAssets: 147946.2*M, longTermDebt: 18725.8*M },
    },
  },
  // Constellation Software — TSX:CSU (CAD). Yahoo Finance ticker: CSU.TO
  "CSU.TO": {
    name: "Constellation Software Inc.",
    yearData: {
      "2016-12-31": { revenue: 2853.6*M, netIncome: 277.7*M, shares: 21.2*M, dps: 5.37, equity: 614.4*M,   totalAssets: 2529.1*M, longTermDebt: 455.5*M },
      "2017-12-31": { revenue: 3117.1*M, netIncome: 279.0*M, shares: 21.2*M, dps: 5.03, equity: 759.6*M,   totalAssets: 2876.7*M, longTermDebt: 297.3*M },
      "2018-12-31": { revenue: 4176.8*M, netIncome: 517.3*M, shares: 21.2*M, dps: 0,    equity: 1182.1*M,  totalAssets: 4006.2*M, longTermDebt: 432.7*M },
      "2019-12-31": { revenue: 4531.7*M, netIncome: 432.4*M, shares: 21.2*M, dps: 5.19, equity: 892.1*M,   totalAssets: 4529.1*M, longTermDebt: 486.9*M },
      "2020-12-31": { revenue: 5050.2*M, netIncome: 554.8*M, shares: 21.2*M, dps: 5.09, equity: 1333.5*M,  totalAssets: 5566.8*M, longTermDebt: 788.9*M },
      "2021-12-31": { revenue: 6456.7*M, netIncome: 392.0*M, shares: 21.2*M, dps: 5.06, equity: 1340.4*M,  totalAssets: 7291.3*M, longTermDebt: 1157.0*M },
      "2022-12-31": { revenue: 8965.9*M, netIncome: 693.2*M, shares: 21.2*M, dps: 5.42, equity: 2318.0*M,  totalAssets: 10658.3*M, longTermDebt: 1561.1*M },
      "2023-12-31": { revenue: 11139.0*M, netIncome: 748.6*M, shares: 21.2*M, dps: 5.30, equity: 2485.6*M, totalAssets: 14391.8*M, longTermDebt: 2978.5*M },
      "2024-12-31": { revenue: 14471.8*M, netIncome: 1051.0*M, shares: 21.2*M, dps: 5.75, equity: 4016.9*M, totalAssets: 18471.4*M, longTermDebt: 5095.2*M },
      "2025-12-31": { revenue: 15953.4*M, netIncome: 702.8*M, shares: 21.2*M, dps: 5.49, equity: 4908.3*M, totalAssets: 22195.8*M, longTermDebt: 5487.5*M },
    },
  },
};

function getHardcodedEdgarData(ticker: string) {
  const key = ticker.toUpperCase();
  const h = HARDCODED_FINANCIALS[key] ?? HARDCODED_FINANCIALS[key + ".TO"];
  if (!h) return null;
  const sharesByYear: Record<number, number> = {};
  for (const [dateStr, d] of Object.entries(h.yearData)) {
    sharesByYear[new Date(dateStr).getFullYear()] = d.shares;
  }
  return {
    name: h.name,
    yearData: h.yearData,
    calendarYearData: {},
    sharesByYear,
    operatingBasis: false,
    investmentGains: {} as Record<string, number>,
    calInvestmentGains: {} as Record<number, number>,
  };
}

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
  preferEarliestFiling = false, // For per-share data: use earliest filing to avoid split-restated values
  filedOut?: Record<string, string> // Receives the filing date of each chosen value
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
            if (filedOut) filedOut[end] = periodEntries.find((e: any) => e.val === min).filed;
            continue;
          }
        }

        result[end] = periodEntries[0].val;
        if (filedOut) filedOut[end] = periodEntries[0].filed;
      }
    }
  }
  return result;
}

/**
 * Per-share annual totals for filers that tag only quarterly values: sums the
 * four distinct ~quarter periods (60–120 days) ending within each fiscal year.
 * Earliest filing wins per period (split-unadjusted, like preferEarliestFiling).
 */
function extractEdgarQuarterlySum(
  facts: Record<string, any>,
  conceptNames: string[],
  fiscalYearEnds: string[]
): Record<string, number> {
  const quarters: Record<string, { end: number; val: number; filed: string }> = {};
  for (const name of conceptNames) {
    for (const e of facts["us-gaap"]?.[name]?.units?.["USD/shares"] ?? []) {
      if ((e.form !== "10-K" && e.form !== "10-Q") || !e.start || !e.end) continue;
      const end = new Date(e.end).getTime();
      const days = (end - new Date(e.start).getTime()) / 86400000;
      if (days < 60 || days > 120) continue;
      const key = `${e.start}|${e.end}`;
      if (!quarters[key] || e.filed < quarters[key].filed) quarters[key] = { end, val: e.val, filed: e.filed };
    }
  }
  const result: Record<string, number> = {};
  for (const fy of fiscalYearEnds) {
    const fyEnd = new Date(fy).getTime();
    const inYear = Object.values(quarters).filter((q) => q.end <= fyEnd && q.end > fyEnd - 355 * 86400000);
    if (inYear.length === 4) result[fy] = inYear.reduce((sum, q) => sum + q.val, 0);
  }
  return result;
}

/**
 * Extract calendar-year totals by summing quarterly EDGAR data.
 * Collects entries with 60-120 day periods from 10-Q and 10-K filings (deriving
 * fiscal Q4 from the 10-K annual total where it isn't tagged separately),
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
      const annual: Record<string, any> = {};
      for (const e of entries) {
        if (!e.start || !e.end) continue;
        if (e.form !== "10-Q" && e.form !== "10-K") continue;
        const days = (new Date(e.end).getTime() - new Date(e.start).getTime()) / 86400000;
        const key = `${e.start}_${e.end}`;
        const bucket = days >= 60 && days <= 120 ? byPeriod : e.form === "10-K" && days >= 350 && days <= 380 ? annual : null;
        if (!bucket) continue;
        if (!bucket[key] || e.filed > bucket[key].filed) {
          bucket[key] = e;
        }
      }

      // Most filers tag fiscal Q4 only inside the 10-K annual total, so derive it
      // as annual minus the three quarters filed in that fiscal year's 10-Qs
      const DAY = 86400000;
      for (const a of Object.values(annual)) {
        const aStart = new Date(a.start).getTime();
        const aEnd = new Date(a.end).getTime();
        const within = Object.values(byPeriod).filter(
          (q: any) => new Date(q.start).getTime() >= aStart - 7 * DAY && new Date(q.end).getTime() <= aEnd + 7 * DAY
        );
        const hasQ4 = within.some((q: any) => Math.abs(new Date(q.end).getTime() - aEnd) <= 7 * DAY);
        if (hasQ4 || within.length !== 3) continue;
        const q3End = Math.max(...within.map((q: any) => new Date(q.end).getTime()));
        const q4Start = new Date(q3End + DAY).toISOString().slice(0, 10);
        byPeriod[`${q4Start}_${a.end}`] = {
          end: a.end,
          val: a.val - within.reduce((sum: number, q: any) => sum + q.val, 0),
          filed: a.filed,
        };
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
  "RevenuesNetOfInterestExpense", // brokers (IBKR): net revenues; RevenueFromContract… is commissions only
  "Revenues",
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "SalesRevenueNet",
  "SalesRevenueGoodsNet",
  "SalesRevenueServicesNet",
  "RevenueFromContractWithCustomerIncludingAssessedTax", // e.g. CPRT from FY2021
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

// Investment gains and losses (realized plus, since ASU 2016-01 in 2018,
// unrealized on equities) run through net income, so for insurers and
// holdcos (BRK, MKL, PGR) GAAP EPS mostly tracks the stock market. Where
// they're material, earnings switch to an operating basis: net income less
// after-tax gains — Berkshire's own presentation. BRK's after-tax figures
// (2022 −$53.6B, 2024 $41.6B) match pre-tax × 0.79 within ~1%.
const INVESTMENT_GAIN_CONCEPTS = [
  "GainLossOnInvestments",
  "EquitySecuritiesFvNiGainLoss",
  "DebtAndEquitySecuritiesGainLoss",
  "RealizedInvestmentGainsLosses",
  // Unrealized-only tags, for years a filer skips the totals (AMZN's 2021–22 Rivian marks)
  "EquitySecuritiesFvNiUnrealizedGainLoss",
  "MarketableSecuritiesUnrealizedGainLoss",
];
// Material = after-tax gains ≥ 10% of operating earnings in at least two of
// the last ten years (two, so a one-off stake sale doesn't flip the basis)
const OPERATING_BASIS_SHARE = 0.1;
const OPERATING_BASIS_MIN_YEARS = 2;
// Alternative asset managers: investment gains (carry, principal stakes) are
// the business, not noise around it — stripping them leaves BX negative
const OPERATING_BASIS_EXCLUDED = new Set(["BX", "KKR", "APO", "ARES", "CG", "TPG", "OWL", "BAM", "BN"]);

function afterTaxGain(periodEnd: string, pretax: number) {
  return pretax * (periodEnd >= "2018-01-01" ? 0.79 : 0.65); // 21% / 35% federal rate
}

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

// Cash flow concepts for free cash flow (FCF = operating cash flow − capex)
const OPERATING_CASH_FLOW_CONCEPTS = [
  "NetCashProvidedByUsedInOperatingActivities",
  "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
];

const CAPEX_CONCEPTS = [
  "PaymentsToAcquirePropertyPlantAndEquipment",
  "PaymentsToAcquireProductiveAssets",
  "PaymentsForCapitalImprovements",
];

/**
 * Repair unit-scale flips in a share-count series. Some filers switch between
 * raw counts and thousands/millions across years (MCD: 744,600,000 → "746"),
 * which poisons every per-share metric. Real share counts never move 100x in
 * a year (worst reverse splits are ~1:20, and splits are adjusted separately),
 * so rescale outliers by powers of 1000 toward the series' median magnitude.
 */
function repairShareScale(series: Record<string, number>): void {
  const vals = Object.values(series).filter((v) => v > 0);
  if (vals.length < 3) return;
  const logs = vals.map((v) => Math.log10(v)).sort((a, b) => a - b);
  const medLog = logs[Math.floor(logs.length / 2)];
  for (const key of Object.keys(series)) {
    let v = series[key];
    if (v <= 0) continue;
    while (Math.log10(v) < medLog - 2) v *= 1000;
    while (Math.log10(v) > medLog + 2) v /= 1000;
    series[key] = v;
  }
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

  // ── Fiscal year data (from 10-K annual) ──
  const revenues = extractEdgar(allFacts, REVENUE_CONCEPTS);
  const netIncomes = extractEdgar(allFacts, NET_INCOME_CONCEPTS);

  const investmentGains: Record<string, number> = {};
  for (const [end, v] of Object.entries(extractEdgar(allFacts, INVESTMENT_GAIN_CONCEPTS)))
    investmentGains[end] = afterTaxGain(end, v);
  const materialYears = Object.keys(netIncomes)
    .sort()
    .slice(-10)
    .filter((end) => {
      const gain = investmentGains[end];
      return gain != null && Math.abs(gain) >= OPERATING_BASIS_SHARE * Math.abs(netIncomes[end] - gain);
    }).length;
  const operatingBasis =
    materialYears >= OPERATING_BASIS_MIN_YEARS && !OPERATING_BASIS_EXCLUDED.has(ticker.toUpperCase());

  // Per-share data: use earliest filing to avoid split-restated values from later 10-Ks.
  // Weighted average basic shares has highest priority — it is the correct EPS denominator.
  // CommonStockSharesOutstanding (us-gaap only) is the fallback for companies that don't file
  // WeightedAverage. EntityCommonStockSharesOutstanding in DEI is excluded: for multi-class
  // companies (e.g. BRK-A/B) it reports each share class separately and gives wrong counts.
  // Filing dates matter for split adjustment: a 10-K filed after a split already
  // reports post-split shares (e.g. CPRT FY Jul-2023, split Aug-2023, filed Sep-2023).
  const outstandingFiled: Record<string, string> = {};
  const weightedFiled: Record<string, string> = {};
  const shares: Record<string, number> = {
    ...extractEdgar(allFacts, SHARES_OUTSTANDING_CONCEPTS, "shares", ["us-gaap"], true, outstandingFiled),
    ...extractEdgar(allFacts, SHARES_WEIGHTED_CONCEPTS, "shares", ["us-gaap"], true, weightedFiled),
  };
  const sharesFiled: Record<string, string> = { ...outstandingFiled, ...weightedFiled };
  for (const [end, v] of Object.entries(EDGAR_SHARES_OVERRIDE[cik] ?? {})) shares[end] ??= v;
  repairShareScale(shares);

  // Diluted weighted shares, for the analyzer's basic/diluted toggle — basic
  // understates dilution while convertibles are outstanding (VRSN's basic
  // count jumps 100M → 118M in 2018–19 as its debentures convert)
  const dilutedFiled: Record<string, string> = {};
  const diluted = extractEdgar(
    allFacts,
    ["WeightedAverageNumberOfDilutedSharesOutstanding"],
    "shares",
    ["us-gaap"],
    true,
    dilutedFiled
  );
  repairShareScale(diluted);

  // EPS: derive from netIncome/shares (not EDGAR's diluted EPS which uses higher diluted share count)
  // This ensures consistency between displayed EPS, share count, and margin
  const dps = extractEdgar(allFacts, DPS_CONCEPTS, "USD/shares", ["us-gaap"], true);
  // Some filers (e.g. VRSK) tag only per-quarter DPS in their 10-K
  const qDps = extractEdgarQuarterlySum(allFacts, DPS_CONCEPTS, Object.keys(netIncomes));
  for (const [end, v] of Object.entries(qDps)) if (dps[end] == null) dps[end] = v;

  // Balance sheet (point-in-time values, no split adjustment needed)
  const equity = extractEdgar(allFacts, STOCKHOLDERS_EQUITY_CONCEPTS);
  const totalAssets = extractEdgar(allFacts, TOTAL_ASSETS_CONCEPTS);
  const longTermDebt = extractEdgar(allFacts, LONG_TERM_DEBT_CONCEPTS);

  // Cash flow statement
  const ocf = extractEdgar(allFacts, OPERATING_CASH_FLOW_CONCEPTS);
  const capex = extractEdgar(allFacts, CAPEX_CONCEPTS);

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
    { revenue?: number; netIncome?: number; shares?: number; sharesFiled?: string; diluted?: number; dilutedFiled?: string; dps?: number; equity?: number; totalAssets?: number; longTermDebt?: number; fcf?: number }
  > = {};

  for (const date of allDates) {
    const yr = new Date(date).getFullYear();
    yearData[date] = {
      revenue: revenues[date],
      netIncome:
        operatingBasis && netIncomes[date] != null
          ? netIncomes[date] - (investmentGains[date] ?? 0)
          : netIncomes[date],
      shares: shares[date] ?? sharesByYear[yr],
      sharesFiled: shares[date] != null ? sharesFiled[date] : undefined,
      diluted: diluted[date],
      dilutedFiled: dilutedFiled[date],
      dps: dps[date],
      equity: equity[date],
      totalAssets: totalAssets[date],
      longTermDebt: longTermDebt[date],
      fcf: ocf[date] != null ? ocf[date] - (capex[date] ?? 0) : undefined,
    };
  }

  // ── Calendar year data (from quarterly 10-Q + 10-K) ──
  const calRevenues = extractEdgarCalendarYear(allFacts, REVENUE_CONCEPTS);
  const calNetIncomes = extractEdgarCalendarYear(allFacts, NET_INCOME_CONCEPTS);
  const calInvestmentGains: Record<number, number> = {};
  if (operatingBasis) {
    for (const [cy, v] of Object.entries(extractEdgarCalendarYear(allFacts, INVESTMENT_GAIN_CONCEPTS)))
      calInvestmentGains[Number(cy)] = afterTaxGain(`${cy}-12-31`, v);
  }

  const calendarYearData: Record<number, { revenue: number; netIncome: number }> = {};
  const allCalYears = new Set([
    ...Object.keys(calRevenues).map(Number),
    ...Object.keys(calNetIncomes).map(Number),
  ]);
  for (const cy of allCalYears) {
    if (calRevenues[cy] != null && calNetIncomes[cy] != null) {
      calendarYearData[cy] = {
        revenue: calRevenues[cy],
        netIncome: calNetIncomes[cy] - (calInvestmentGains[cy] ?? 0),
      };
    }
  }

  return {
    name: entry.title,
    yearData,
    calendarYearData,
    sharesByYear,
    operatingBasis,
    investmentGains: operatingBasis ? investmentGains : {},
    calInvestmentGains,
  };
}

// ── Yahoo Finance helpers ──────────────────────────────────────

async function getYahooFinance() {
  const { default: YahooFinance } = await import("yahoo-finance2");
  return new YahooFinance({ suppressNotices: ["yahooSurvey"] });
}

// Last close on or before the target day — the period-end price, as in the
// Semper Augustus tables (GOOGL 2021: Dec 31 close $144.85). The old nearest-
// bar rule on weekly data picked the week *starting* Jan 3 and so its Jan 7
// close ($137.02). Falls back to the earliest bar if none precede the target.
function getClosestPrice(historical: any[], targetDate: Date): number {
  const target = targetDate.toISOString().slice(0, 10);
  let best: any = null;
  for (const day of historical) {
    if (!day.close) continue;
    const d = (day.date instanceof Date ? day.date : new Date(day.date)).toISOString().slice(0, 10);
    if (d <= target) best = day;
    else {
      best ??= day;
      break;
    }
  }
  return best?.close || 0;
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

// ── Short-horizon beta ─────────────────────────────────────────

/** Daily closes for the last ~6 months, as a date → close map. */
async function fetchDailyCloses(
  yahooFinance: any,
  symbol: string
): Promise<Record<string, number> | null> {
  try {
    const chart = await yahooFinance.chart(symbol, {
      period1: new Date(Date.now() - 200 * 86400000),
      period2: new Date(),
      interval: "1d",
    });
    const closes: Record<string, number> = {};
    for (const q of chart?.quotes ?? []) {
      if (q.close != null) {
        const d = q.date instanceof Date ? q.date : new Date(q.date);
        closes[d.toISOString().slice(0, 10)] = q.close;
      }
    }
    return Object.keys(closes).length > 20 ? closes : null;
  } catch {
    return null;
  }
}

/**
 * Beta over the trailing BETA_TRADING_DAYS daily returns vs the S&P 500.
 * Foreign tickers are regressed in their local currency against ^GSPC —
 * a rough but conventional shortcut.
 */
function computeBeta(
  stockCloses: Record<string, number>,
  marketCloses: Record<string, number>
): number | null {
  const dates = Object.keys(stockCloses)
    .filter((d) => marketCloses[d] != null)
    .sort();
  if (dates.length < 30) return null;

  const rs: number[] = [];
  const rm: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    rs.push(stockCloses[dates[i]] / stockCloses[dates[i - 1]] - 1);
    rm.push(marketCloses[dates[i]] / marketCloses[dates[i - 1]] - 1);
  }
  const s = rs.slice(-BETA_TRADING_DAYS);
  const m = rm.slice(-BETA_TRADING_DAYS);
  const n = s.length;
  if (n < 30) return null;

  const meanS = s.reduce((a, b) => a + b, 0) / n;
  const meanM = m.reduce((a, b) => a + b, 0) / n;
  let cov = 0;
  let varM = 0;
  for (let i = 0; i < n; i++) {
    cov += (s[i] - meanS) * (m[i] - meanM);
    varM += (m[i] - meanM) ** 2;
  }
  if (varM === 0) return null;
  return Math.round((cov / varM) * 100) / 100;
}

/** S&P 500 daily closes, shared across tickers via Redis (6h TTL). */
async function getMarketCloses(
  yahooFinance: any,
  redis: ReturnType<typeof getRedis>
): Promise<Record<string, number> | null> {
  const key = "mkt:gspc:1d";
  if (redis) {
    try {
      const cached = await redis.get(key);
      if (cached) return typeof cached === "string" ? JSON.parse(cached) : (cached as any);
    } catch {
      // fall through
    }
  }
  const closes = await fetchDailyCloses(yahooFinance, "^GSPC");
  if (closes && redis) {
    try {
      await redis.set(key, JSON.stringify(closes), { ex: 6 * 3600 });
    } catch {
      // best-effort
    }
  }
  return closes;
}

// ── Main handler ───────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker");
  const search = searchParams.get("search");

  try {
    const yahooFinance = await getYahooFinance();

    if (search) {
      // Some foreign-ticker search responses fail yahoo-finance2's strict
      // schema (e.g. "sygnity", "topicus") — skip validation, we only read
      // symbol/name/exchange
      const result: any = await yahooFinance.search(
        search,
        {},
        { validateResult: false } as any
      );
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

    // Redis cache: serve the heavy EDGAR+Yahoo payload from cache, refreshing
    // only the live quote (1 upstream call instead of ~6)
    const redis = getRedis();
    const cacheKey = `stock:${API_VERSION}:${ticker.toUpperCase()}`;
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          const payload = typeof cached === "string" ? JSON.parse(cached) : (cached as any);
          try {
            const q: any = await yahooFinance.quoteSummary(ticker, { modules: ["price"] });
            const live = q?.price?.regularMarketPrice;
            if (live) payload.currentPrice = Math.round(live * 100) / 100;
          } catch {
            // keep cached price
          }
          // Self-heal a missing beta (e.g. the ^GSPC fetch was throttled when
          // this payload was first computed)
          if (payload.beta12w == null) {
            const [dc, mc] = await Promise.all([
              fetchDailyCloses(yahooFinance, ticker),
              getMarketCloses(yahooFinance, redis),
            ]);
            if (dc && mc) {
              const b = computeBeta(dc, mc);
              if (b != null) {
                payload.beta12w = b;
                try {
                  const ttl = await redis.ttl(cacheKey);
                  await redis.set(cacheKey, JSON.stringify(payload), { ex: ttl > 0 ? ttl : REDIS_TTL_S });
                } catch {
                  // best-effort
                }
              }
            }
          }
          return NextResponse.json(payload, { headers: CACHE_HEADERS });
        }
      } catch {
        // Redis unavailable — fall through to full fetch
      }
    }

    // Fetch in parallel: SEC EDGAR, Yahoo (prices + info + annual/quarterly fundamentals + splits)
    const startDate = new Date(new Date().getFullYear() - 20, 0, 1);
    const [edgar, yfSummary, yfFundamentals, yfQuarterly, historical, chartData, dailyCloses, marketCloses] =
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
        yahooFinance
          .historical(ticker, { period1: startDate, period2: new Date(), interval: "1d" })
          .catch(() => []),
        yahooFinance
          .chart(ticker, {
            period1: startDate,
            period2: new Date(),
            interval: "1wk",
            events: "splits",
            return: "array",
          } as any)
          .catch(() => null),
        fetchDailyCloses(yahooFinance, ticker),
        getMarketCloses(yahooFinance, redis),
      ]);

    // FX rate for tickers whose financials arrive in a different currency
    // than their listing price. Converts straight to the listing currency —
    // BAP/IFS happen to list in USD (reportCur→USD), but TOI.V lists in CAD,
    // so the pair has to follow the actual quote currency, not assume USD.
    const listingCurrency: string = yfSummary?.price?.currency || "USD";
    const fetchFx = async (from: string | undefined): Promise<number | null> => {
      if (!from || from === listingCurrency) return null;
      try {
        const q: any = await yahooFinance.quote(`${from}${listingCurrency}=X`);
        return q?.regularMarketPrice ?? null;
      } catch {
        return null;
      }
    };
    const reportCur = REPORTING_FX[ticker.toUpperCase()];
    const fxRate = await fetchFx(reportCur); // null → serve unconverted rather than fail
    const backfillCur = BACKFILL_FX[ticker.toUpperCase()];
    const backfillFx = await fetchFx(backfillCur);

    const beta12w =
      dailyCloses && marketCloses ? computeBeta(dailyCloses, marketCloses) : null;

    const splits: Array<{ date: Date | string; numerator: number; denominator: number }> =
      (chartData as any)?.events?.splits || [];

    // If historical threw (e.g. Yahoo returns partial nulls around earnings), fall back to chart quotes
    const priceHistory: any[] =
      (historical as any[]).length > 0
        ? (historical as any[])
        : (chartData as any)?.quotes || [];

    const edgarData = edgar ?? getHardcodedEdgarData(ticker);

    const companyName =
      yfSummary?.price?.longName ||
      yfSummary?.price?.shortName ||
      edgarData?.name ||
      ticker.toUpperCase();
    const currency = listingCurrency;

    // ═══════════════════════════════════════════════════════════════
    // FISCAL YEAR DATA
    // ═══════════════════════════════════════════════════════════════
    const yearMap: Record<number, any> = {};

    // 1. SEC EDGAR data (10+ years) — adjust for stock splits
    const classMult = SHARE_CLASS_MULTIPLIER[ticker.toUpperCase()] ?? 1;
    if (edgarData?.yearData) {
      for (const [dateStr, data] of Object.entries(edgarData.yearData)) {
        const endDate = new Date(dateStr);
        // Label fiscal year by the calendar year it mostly falls in (standard financial convention).
        // Jan–Apr FYE (months 0–4): use prior year (e.g. NVDA Jan 31 2025 → FY 2024)
        // May–Dec FYE (months 5–11): use end year (e.g. AAPL Sep 30 2024 → FY 2024)
        const year = endDate.getMonth() < 5 ? endDate.getFullYear() - 1 : endDate.getFullYear();
        if (data.revenue == null || data.netIncome == null || data.shares == null) continue;

        const netIncome = data.netIncome;
        const epsVal = netIncome / data.shares; // Basic EPS = netIncome / basicShares
        const dpsVal = data.dps; // undefined = not filed; Yahoo may backfill below

        // Splits after the filing date only — the filing already reflects earlier ones
        const sf = splitFactorAfterDate(splits, data.sharesFiled ? new Date(data.sharesFiled) : endDate);

        yearMap[year] = {
          endDate: dateStr,
          revenue: data.revenue,
          netIncome,
          sharesOutstanding: data.shares * sf,
          sharesDiluted:
            data.diluted != null
              ? data.diluted * splitFactorAfterDate(splits, data.dilutedFiled ? new Date(data.dilutedFiled) : endDate)
              : undefined,
          eps: epsVal / sf,
          dps: dpsVal != null ? dpsVal / sf : undefined,
          equity: data.equity,
          totalAssets: data.totalAssets,
          longTermDebt: data.longTermDebt,
          fcf: data.fcf,
        };
      }
    }

    // 2. Fill gaps with Yahoo Finance fundamentalsTimeSeries (only for years EDGAR doesn't cover)
    for (const entry of yfFundamentals as any[]) {
      const endDate = entry.date instanceof Date ? entry.date : new Date(entry.date);
      const year = endDate.getMonth() < 5 ? endDate.getFullYear() - 1 : endDate.getFullYear();

      const yfFcf =
        entry.freeCashFlow ??
        (entry.operatingCashFlow != null
          ? entry.operatingCashFlow - Math.abs(entry.capitalExpenditure ?? 0)
          : undefined);

      // Don't override EDGAR data — EDGAR 10-K filings are the authoritative source for US stocks.
      // Exceptions: backfill FCF where EDGAR/hardcoded data lacks it (e.g. CSU.TO;
      // mismatched currencies without a rate → skip rather than mislabel), and
      // DPS where EDGAR has no usable dividend tag (e.g. IBKR 2024+).
      if (yearMap[year]) {
        const yfDiv = entry.commonStockDividendPaid ?? entry.cashDividendsPaid;
        if (yearMap[year].dps == null && yfDiv != null && entry.ordinarySharesNumber > 0)
          yearMap[year].dps = Math.abs(yfDiv) / entry.ordinarySharesNumber;
        if (yearMap[year].fcf == null && yfFcf != null) {
          if (!backfillCur || backfillCur === listingCurrency) yearMap[year].fcf = yfFcf;
          else if (backfillFx) yearMap[year].fcf = yfFcf * backfillFx;
        }
        continue;
      }

      const revenue = entry.totalRevenue;
      const netIncome = entry.netIncome;
      const sharesOut =
        (YAHOO_WEIGHTED_SHARES.has(ticker.toUpperCase()) && entry.basicAverageShares > 0
          ? entry.basicAverageShares
          : undefined) ?? entry.ordinarySharesNumber;
      if (!revenue || !netIncome || !sharesOut) continue;

      const epsVal = netIncome / sharesOut;
      const dividendsPaid = Math.abs(
        entry.commonStockDividendPaid || entry.cashDividendsPaid || 0
      );
      const dpsVal = sharesOut > 0 ? dividendsPaid / sharesOut : 0;

      yearMap[year] = {
        endDate: endDate.toISOString().split("T")[0],
        revenue,
        netIncome,
        sharesOutstanding: sharesOut,
        eps: epsVal,
        dps: dpsVal,
        fcf: yfFcf,
      };
    }

    for (const d of Object.values(yearMap)) d.dps ??= 0;

    // Scale consolidated-total net income down to the shareholder-attributable
    // portion where flagged (before any derived metrics are computed)
    const attrShare = ATTRIBUTABLE_SHARE[ticker.toUpperCase()];
    if (attrShare?.netIncome) {
      for (const d of Object.values(yearMap)) {
        d.netIncome *= attrShare.netIncome;
        d.eps *= attrShare.netIncome;
      }
    }

    // Convert reporting-currency financials to the listing currency
    if (fxRate) {
      for (const d of Object.values(yearMap)) {
        d.revenue *= fxRate;
        d.netIncome *= fxRate;
        d.eps *= fxRate;
        d.dps *= fxRate;
        if (d.fcf != null) d.fcf *= fxRate;
        if (d.equity != null) d.equity *= fxRate;
        if (d.totalAssets != null) d.totalAssets *= fxRate;
        if (d.longTermDebt != null) d.longTermDebt *= fxRate;
      }
    }

    // Convert cross-class share counts (both EDGAR and Yahoo serve BRK-B
    // as Class A equivalents) — applied after all sources have filled yearMap
    if (classMult !== 1) {
      for (const d of Object.values(yearMap)) {
        d.sharesOutstanding *= classMult;
        if (d.sharesDiluted != null) d.sharesDiluted *= classMult;
        d.eps /= classMult;
        d.dps /= classMult;
      }
    }

    // Absolute share-scale anchor: some filers report the entire series in
    // thousands (EG, COP), which the relative median repair cannot detect.
    // Compare the latest year against shares implied by live market cap and
    // rescale the whole series by the nearest power of 1,000. Deliberately
    // no-ops for ADR ratios (not powers of 1000) and normal buyback drift.
    {
      const mc = (yfSummary?.price as any)?.marketCap;
      const px = (yfSummary?.price as any)?.regularMarketPrice;
      const yrs = Object.keys(yearMap).map(Number);
      if (mc && px && yrs.length) {
        const latest = yearMap[Math.max(...yrs)];
        if (latest?.sharesOutstanding > 0) {
          const lg = Math.log10(mc / px / latest.sharesOutstanding);
          const k = Math.round(lg / 3) * 3;
          if (k !== 0 && Math.abs(lg - k) < 0.35) {
            const scale = Math.pow(10, k);
            for (const d of Object.values(yearMap)) {
              d.sharesOutstanding *= scale;
              if (d.sharesDiluted != null) d.sharesDiluted *= scale;
              d.eps /= scale;
              d.dps /= scale;
            }
          }
        }
      }
    }

    // 3. Compute derived metrics with historical prices
    const years = [];
    const sortedYears = Object.keys(yearMap)
      .map(Number)
      .sort((a, b) => a - b);

    for (const year of sortedYears) {
      const d = yearMap[year];
      const endDate = new Date(d.endDate);
      const fiscalPrice = getClosestPrice(priceHistory, endDate);
      const calendarPrice = getClosestPrice(priceHistory, new Date(year, 11, 31));
      if (!fiscalPrice && !calendarPrice) continue;

      const price = fiscalPrice || calendarPrice;
      const salesPerShare = d.revenue / d.sharesOutstanding;
      const netMargin = d.netIncome / d.revenue;
      const pe = d.eps > 0 ? price / d.eps : 0;
      const divYield = price > 0 ? d.dps / price : 0;
      const calPe = d.eps > 0 && calendarPrice ? calendarPrice / d.eps : 0;
      const calDivYield = calendarPrice > 0 ? d.dps / calendarPrice : 0;

      // Informational FCF metrics (not part of the five-factor decomposition).
      // Scaled to the shareholder-attributable portion for partially-owned structures.
      const fcfShare = attrShare?.fcf ?? 1;
      const fcfAttr = d.fcf != null ? d.fcf * fcfShare : null;
      const fcfPerShare = fcfAttr != null ? fcfAttr / d.sharesOutstanding : null;
      const fcfMargin = fcfAttr != null ? fcfAttr / d.revenue : null;
      const pFcf = fcfPerShare != null && fcfPerShare > 0 ? price / fcfPerShare : null;

      years.push({
        year,
        endDate: d.endDate,
        revenue: d.revenue,
        netIncome: d.netIncome,
        sharesOutstanding: d.sharesOutstanding,
        sharesDiluted: d.sharesDiluted ?? null,
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
        fcf: fcfAttr,
        fcfPerShare: fcfPerShare != null ? Math.round(fcfPerShare * 100) / 100 : null,
        fcfMargin: fcfMargin != null ? Math.round(fcfMargin * 10000) / 10000 : null,
        pFcf: pFcf != null ? Math.round(pFcf * 100) / 100 : null,
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // CALENDAR YEAR DATA
    // ═══════════════════════════════════════════════════════════════
    const calYearMap: Record<number, any> = {};

    // 1. EDGAR calendar year data (10+ years, aggregated from quarterly 10-Q/10-K)
    if (edgarData?.calendarYearData) {
      for (const [cyStr, data] of Object.entries(edgarData.calendarYearData)) {
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
      // Yahoo sometimes returns placeholder quarters with no figures (e.g. VRSN Q1 2025);
      // counting them would pass the 4-quarter check with only three quarters of data
      if (entry.totalRevenue == null || entry.netIncome == null) continue;

      const fxQ = fxRate ?? 1;
      const revenue = (entry.totalRevenue || 0) * fxQ;
      const netIncome = (entry.netIncome || 0) * (attrShare?.netIncome ?? 1) * fxQ;
      const sharesQ = (entry.ordinarySharesNumber || 0) * classMult;
      const epsQ = sharesQ > 0 ? netIncome / sharesQ : 0; // Basic EPS, consistent with share count
      const divPaid = Math.abs(entry.commonStockDividendPaid || entry.cashDividendsPaid || 0) * fxQ;

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
      // Yahoo's quarters are GAAP; put them on the same operating basis
      d.netIncome -= (edgarData?.calInvestmentGains[cy] ?? 0) * (fxRate ?? 1);

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
      const price = getClosestPrice(priceHistory, new Date(cy, 11, 31));
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

    // Prefer the live quote (already fetched in yfSummary) over the last weekly close
    const livePrice = (yfSummary?.price as any)?.regularMarketPrice;
    const lastClose = livePrice || getClosestPrice(priceHistory, new Date());

    const fcfAttributableShare = attrShare?.fcf ?? null;
    const netIncomeAttributableShare = attrShare?.netIncome ?? null;

    const payload = {
      ticker: ticker.toUpperCase(),
      name: companyName,
      currency,
      version: API_VERSION,
      source: edgarData?.yearData ? "edgar+yahoo" : "yahoo",
      currentPrice: lastClose ? Math.round(lastClose * 100) / 100 : null,
      beta12w,
      fcfAttributableShare,
      netIncomeAttributableShare,
      reportingFx: fxRate && reportCur ? { from: reportCur, rate: fxRate } : null,
      // "operating": netIncome/eps exclude after-tax investment gains, listed
      // per fiscal year (reporting currency) so the page can show GAAP too
      earningsBasis: edgarData?.operatingBasis ? "operating" : "gaap",
      investmentGains: edgarData?.operatingBasis
        ? Object.fromEntries(
            years
              .map((y) => [y.year, edgarData.investmentGains[y.endDate]] as const)
              .filter(([, g]) => g != null)
          )
        : null,
      years,
      calendarYears,
    };

    if (redis && years.length >= 2) {
      try {
        await redis.set(cacheKey, JSON.stringify(payload), { ex: REDIS_TTL_S });
      } catch {
        // caching is best-effort
      }
    }

    return NextResponse.json(payload, { headers: CACHE_HEADERS });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch stock data";
    console.error("Stock API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";

/* ── Types ─────────────────────────────────────── */

interface YearData {
  year: number;
  endDate: string;
  revenue: number;
  netIncome: number;
  sharesOutstanding: number;
  eps: number;
  price: number;
  dividendsPerShare: number;
  salesPerShare: number;
  netMargin: number;
  peMultiple: number;
  dividendYield: number;
}

interface StockData {
  ticker: string;
  name: string;
  currency: string;
  source: "edgar+yahoo" | "yahoo";
  years: YearData[];
}

interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
}

interface FiveFactorResult {
  numYears: number;
  negativeStartEps: boolean; // true when starting EPS <= 0
  // Total growth (null = not meaningful due to negative start)
  dollarSalesGrowth: number;
  shareCountGrowth: number;
  salesPerShareGrowth: number;
  marginGrowth: number | null;
  peGrowth: number | null;
  epsGrowth: number | null;
  dpsGrowth: number | null;
  yieldGrowth: number | null;
  priceReturn: number;
  totalReturn: number;
  // Annualized
  annDollarSales: number;
  annShareCount: number;
  annSalesPerShare: number;
  annMargin: number | null;
  annPe: number | null;
  annEps: number | null;
  annDps: number | null;
  annDividendYield: number;
  annPriceReturn: number;
  annTotalReturn: number;
}

/* ── Helpers ───────────────────────────────────── */

function fmtCurrency(n: number, currency: string) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
}

function fmtBig(n: number, currency: string) {
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${currency === "USD" ? "$" : currency}${(n / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `${currency === "USD" ? "$" : currency}${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${currency === "USD" ? "$" : currency}${(n / 1e6).toFixed(1)}M`;
  return fmtCurrency(n, currency);
}

function fmtPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function fmtPctOrNm(n: number | null) {
  if (n == null) return "N/M";
  return fmtPct(n);
}

function fmtNum(n: number, dec = 2) {
  return n.toLocaleString("en-US", { maximumFractionDigits: dec, minimumFractionDigits: dec });
}

function annualize(totalGrowth: number, years: number): number {
  if (years <= 0) return 0;
  if (years === 1) return totalGrowth;
  if (1 + totalGrowth <= 0) return -1;
  return Math.pow(1 + totalGrowth, 1 / years) - 1;
}

function safeGrowth(start: number, end: number): number | null {
  if (start <= 0) return null; // not meaningful from negative/zero base
  return end / start - 1;
}

function calcFiveFactors(start: YearData, end: YearData): FiveFactorResult {
  const numYears = end.year - start.year;
  const negativeStartEps = start.eps <= 0;

  // Sales & shares always have positive bases
  const dollarSalesGrowth = start.revenue > 0 ? end.revenue / start.revenue - 1 : 0;
  const shareCountGrowth = start.sharesOutstanding > 0 ? end.sharesOutstanding / start.sharesOutstanding - 1 : 0;
  const salesPerShareGrowth = (1 + dollarSalesGrowth) / (1 + shareCountGrowth) - 1;

  // These require positive starting values to be meaningful
  const marginGrowth = safeGrowth(start.netMargin, end.netMargin);
  const epsGrowth = safeGrowth(start.eps, end.eps);
  const peGrowth = safeGrowth(start.peMultiple, end.peMultiple);
  const dpsGrowth = safeGrowth(start.dividendsPerShare, end.dividendsPerShare);
  const yieldGrowth = safeGrowth(start.dividendYield, end.dividendYield);
  const priceReturn = start.price > 0 ? end.price / start.price - 1 : 0;

  // Average annual dividend yield (approx)
  const avgDivYield = (start.dividendYield + end.dividendYield) / 2;
  const annTotalReturn = annualize(priceReturn, numYears) + avgDivYield;

  return {
    numYears,
    negativeStartEps,
    dollarSalesGrowth,
    shareCountGrowth,
    salesPerShareGrowth,
    marginGrowth,
    peGrowth,
    epsGrowth,
    dpsGrowth,
    yieldGrowth,
    priceReturn,
    totalReturn: priceReturn + avgDivYield * numYears,
    annDollarSales: annualize(dollarSalesGrowth, numYears),
    annShareCount: annualize(shareCountGrowth, numYears),
    annSalesPerShare: annualize(salesPerShareGrowth, numYears),
    annMargin: marginGrowth != null ? annualize(marginGrowth, numYears) : null,
    annPe: peGrowth != null ? annualize(peGrowth, numYears) : null,
    annEps: epsGrowth != null ? annualize(epsGrowth, numYears) : null,
    annDps: dpsGrowth != null ? annualize(dpsGrowth, numYears) : null,
    annDividendYield: avgDivYield,
    annPriceReturn: annualize(priceReturn, numYears),
    annTotalReturn,
  };
}

/* ── Component ─────────────────────────────────── */

export function StockAnalyzer() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [stockData, setStockData] = useState<StockData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startIdx, setStartIdx] = useState(0);
  const [endIdx, setEndIdx] = useState(0);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Close suggestions on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const searchTickers = useCallback(async (q: string) => {
    if (q.length < 1) {
      setSuggestions([]);
      return;
    }
    try {
      const res = await fetch(`/api/stock?search=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data);
        setShowSuggestions(true);
      }
    } catch {
      // ignore search errors
    }
  }, []);

  function handleQueryChange(value: string) {
    setQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchTickers(value), 300);
  }

  async function selectTicker(symbol: string) {
    setQuery(symbol);
    setShowSuggestions(false);
    setSuggestions([]);
    setLoading(true);
    setError(null);
    setStockData(null);

    try {
      const res = await fetch(`/api/stock?ticker=${encodeURIComponent(symbol)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch");
      if (!data.years || data.years.length < 2) {
        throw new Error("Not enough annual data available (need at least 2 years)");
      }
      setStockData(data);
      setStartIdx(0);
      setEndIdx(data.years.length - 1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to fetch stock data");
    } finally {
      setLoading(false);
    }
  }

  const analysis = useMemo(() => {
    if (!stockData || stockData.years.length < 2) return null;
    const start = stockData.years[startIdx];
    const end = stockData.years[endIdx];
    if (!start || !end || start.year >= end.year) return null;
    return calcFiveFactors(start, end);
  }, [stockData, startIdx, endIdx]);

  const chartData = useMemo(() => {
    if (!analysis) return [];
    const shareImpact = -analysis.annShareCount / (1 + analysis.annShareCount);
    const items = [
      { name: "Dollar Sales", value: analysis.annDollarSales, color: analysis.annDollarSales >= 0 ? "#10b981" : "#ef4444" },
      { name: "Share Count", value: shareImpact, color: shareImpact >= 0 ? "#10b981" : "#ef4444" },
    ];
    if (analysis.annMargin != null) {
      items.push({ name: "Margin", value: analysis.annMargin, color: analysis.annMargin >= 0 ? "#10b981" : "#ef4444" });
    }
    if (analysis.annPe != null) {
      items.push({ name: "P/E Multiple", value: analysis.annPe, color: analysis.annPe >= 0 ? "#10b981" : "#ef4444" });
    }
    items.push({ name: "Dividends", value: analysis.annDividendYield, color: "#3b82f6" });
    return items;
  }, [analysis]);

  const currency = stockData?.currency || "USD";

  return (
    <div className="space-y-6">
      {/* Search */}
      <Card className="overflow-visible">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="relative flex-1" ref={searchRef}>
              <label className="mb-1 block text-xs text-muted-foreground">Ticker / Company</label>
              <Input
                placeholder="Search e.g. AAPL, MSFT, Google..."
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && query.length > 0) {
                    selectTicker(query.toUpperCase());
                  }
                }}
                className="h-9 text-sm"
              />
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-zinc-600 bg-zinc-800 shadow-xl shadow-black/50">
                  {suggestions.map((s) => (
                    <button
                      key={s.symbol}
                      onClick={() => selectTicker(s.symbol)}
                      className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition-colors hover:bg-zinc-700"
                    >
                      <span className="font-semibold text-emerald-400">{s.symbol}</span>
                      <span className="ml-2 truncate text-xs text-zinc-400">{s.name} · {s.exchange}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {stockData && stockData.years.length >= 2 && (
              <>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">From</label>
                  <select
                    value={startIdx}
                    onChange={(e) => setStartIdx(Number(e.target.value))}
                    className="h-9 rounded-md border border-border bg-card px-3 text-sm"
                  >
                    {stockData.years.map((y, i) => (
                      <option key={y.year} value={i} disabled={i >= endIdx}>
                        {y.year}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">To</label>
                  <select
                    value={endIdx}
                    onChange={(e) => setEndIdx(Number(e.target.value))}
                    className="h-9 rounded-md border border-border bg-card px-3 text-sm"
                  >
                    {stockData.years.map((y, i) => (
                      <option key={y.year} value={i} disabled={i <= startIdx}>
                        {y.year}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>

          {loading && (
            <p className="mt-4 text-sm text-muted-foreground animate-pulse">
              Fetching financial data...
            </p>
          )}
          {error && (
            <p className="mt-4 text-sm text-red-400">{error}</p>
          )}
          {stockData && (
            <div className="mt-3 space-y-1">
              <p className="text-xs text-muted-foreground">
                {stockData.name} ({stockData.ticker}) &middot; {stockData.currency} &middot;{" "}
                {stockData.years.length} years of data
                {stockData.source === "edgar+yahoo"
                  ? " · SEC EDGAR + Yahoo Finance"
                  : " · Yahoo Finance only"}
              </p>
              {stockData.source === "yahoo" && (
                <p className="text-[10px] text-yellow-500/80">
                  Non-US tickers are limited to ~4 years of data (Yahoo Finance only).
                  US-listed stocks get 10+ years via SEC EDGAR.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Five-Factor Table */}
      {stockData && analysis && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {analysis.numYears}-Year Five-Factor Breakdown &mdash; {stockData.ticker}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Semper Augustus five-factor return attribution. Bold columns are the five factors.
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Period</th>
                  <th className="pb-2 pr-3 font-medium">EPS</th>
                  <th className="pb-2 pr-3 font-medium">DPS</th>
                  <th className="pb-2 pr-3 font-medium">Sales/Share</th>
                  <th className="pb-2 pr-3 font-bold">Sales ($)</th>
                  <th className="pb-2 pr-3 font-bold">Shares Out</th>
                  <th className="pb-2 pr-3 font-bold">Margin</th>
                  <th className="pb-2 pr-3 font-bold">P/E</th>
                  <th className="pb-2 pr-3 font-bold">Yield</th>
                  <th className="pb-2 pr-3 font-medium">Price</th>
                  <th className="pb-2 font-medium">Total Return</th>
                </tr>
              </thead>
              <tbody>
                {/* Start row */}
                <tr className="border-b border-border/50">
                  <td className="py-2 pr-3 text-muted-foreground">
                    {stockData.years[startIdx].endDate}
                  </td>
                  <td className="py-2 pr-3">{fmtNum(stockData.years[startIdx].eps)}</td>
                  <td className="py-2 pr-3">{fmtNum(stockData.years[startIdx].dividendsPerShare)}</td>
                  <td className="py-2 pr-3">{fmtNum(stockData.years[startIdx].salesPerShare)}</td>
                  <td className="py-2 pr-3 font-medium">{fmtBig(stockData.years[startIdx].revenue, currency)}</td>
                  <td className="py-2 pr-3 font-medium">{fmtBig(stockData.years[startIdx].sharesOutstanding, "")}</td>
                  <td className="py-2 pr-3 font-medium">{fmtPct(stockData.years[startIdx].netMargin)}</td>
                  <td className="py-2 pr-3 font-medium">{fmtNum(stockData.years[startIdx].peMultiple, 1)}x</td>
                  <td className="py-2 pr-3 font-medium">{fmtPct(stockData.years[startIdx].dividendYield)}</td>
                  <td className="py-2 pr-3">{fmtCurrency(stockData.years[startIdx].price, currency)}</td>
                  <td className="py-2"></td>
                </tr>
                {/* End row */}
                <tr className="border-b border-border/50">
                  <td className="py-2 pr-3 text-muted-foreground">
                    {stockData.years[endIdx].endDate}
                  </td>
                  <td className="py-2 pr-3">{fmtNum(stockData.years[endIdx].eps)}</td>
                  <td className="py-2 pr-3">{fmtNum(stockData.years[endIdx].dividendsPerShare)}</td>
                  <td className="py-2 pr-3">{fmtNum(stockData.years[endIdx].salesPerShare)}</td>
                  <td className="py-2 pr-3 font-medium">{fmtBig(stockData.years[endIdx].revenue, currency)}</td>
                  <td className="py-2 pr-3 font-medium">{fmtBig(stockData.years[endIdx].sharesOutstanding, "")}</td>
                  <td className="py-2 pr-3 font-medium">{fmtPct(stockData.years[endIdx].netMargin)}</td>
                  <td className="py-2 pr-3 font-medium">{fmtNum(stockData.years[endIdx].peMultiple, 1)}x</td>
                  <td className="py-2 pr-3 font-medium">{fmtPct(stockData.years[endIdx].dividendYield)}</td>
                  <td className="py-2 pr-3">{fmtCurrency(stockData.years[endIdx].price, currency)}</td>
                  <td className="py-2"></td>
                </tr>
                {/* Growth % row */}
                <tr className="border-b border-border/50 bg-muted/30">
                  <td className="py-2 pr-3 font-medium text-muted-foreground">Growth %</td>
                  <td className="py-2 pr-3">{fmtPctOrNm(analysis.epsGrowth)}</td>
                  <td className="py-2 pr-3">{fmtPctOrNm(analysis.dpsGrowth)}</td>
                  <td className="py-2 pr-3">{fmtPct(analysis.salesPerShareGrowth)}</td>
                  <td className="py-2 pr-3 font-bold">{fmtPct(analysis.dollarSalesGrowth)}</td>
                  <td className="py-2 pr-3 font-bold">{fmtPct(analysis.shareCountGrowth)}</td>
                  <td className="py-2 pr-3 font-bold">{fmtPctOrNm(analysis.marginGrowth)}</td>
                  <td className="py-2 pr-3 font-bold">{fmtPctOrNm(analysis.peGrowth)}</td>
                  <td className="py-2 pr-3 font-bold">{fmtPctOrNm(analysis.yieldGrowth)}</td>
                  <td className="py-2 pr-3">{fmtPct(analysis.priceReturn)}</td>
                  <td className="py-2 font-bold">{fmtPct(analysis.totalReturn)}</td>
                </tr>
                {/* Annual Avg row */}
                <tr className="bg-muted/30">
                  <td className="py-2 pr-3 font-medium text-muted-foreground">Annual Avg</td>
                  <td className="py-2 pr-3">{fmtPctOrNm(analysis.annEps)}</td>
                  <td className="py-2 pr-3">{fmtPctOrNm(analysis.annDps)}</td>
                  <td className="py-2 pr-3">{fmtPct(analysis.annSalesPerShare)}</td>
                  <td className="py-2 pr-3 font-bold">{fmtPct(analysis.annDollarSales)}</td>
                  <td className="py-2 pr-3 font-bold">{fmtPct(analysis.annShareCount)}</td>
                  <td className="py-2 pr-3 font-bold">{fmtPctOrNm(analysis.annMargin)}</td>
                  <td className="py-2 pr-3 font-bold">{fmtPctOrNm(analysis.annPe)}</td>
                  <td className="py-2 pr-3 font-bold">{fmtPct(analysis.annDividendYield)}</td>
                  <td className="py-2 pr-3">{fmtPct(analysis.annPriceReturn)}</td>
                  <td className="py-2 font-bold">{fmtPct(analysis.annTotalReturn)}</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Negative earnings warning */}
      {analysis?.negativeStartEps && (
        <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 px-4 py-3 text-xs text-yellow-400">
          Starting period has negative earnings (EPS: {fmtNum(stockData!.years[startIdx].eps)}).
          Margin, P/E, and EPS growth rates are not meaningful (shown as N/M).
          Consider choosing a later start year with positive earnings for full five-factor decomposition.
        </div>
      )}

      {/* Factor Attribution + Formula */}
      {analysis && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Factor breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Annual Factor Attribution</CardTitle>
              <p className="text-xs text-muted-foreground">
                Approximate contribution of each factor to annualized return
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <FactorRow
                label="Dollar Sales Growth"
                value={analysis.annDollarSales}
                hint="Revenue growth in absolute dollars"
              />
              <FactorRow
                label="Share Count (dilution/accretion)"
                value={-analysis.annShareCount / (1 + analysis.annShareCount)}
                hint={analysis.annShareCount > 0 ? "Dilutive — more shares issued" : "Accretive — shares bought back"}
              />
              <FactorRow
                label="Margin Growth"
                value={analysis.annMargin}
                hint={analysis.annMargin == null ? "N/M — starting margin was negative" : "Change in net profit margin"}
              />
              <FactorRow
                label="P/E Multiple Growth"
                value={analysis.annPe}
                hint={analysis.annPe == null ? "N/M — starting P/E was zero (negative earnings)" : "Change in what investors pay per dollar of earnings"}
              />
              <FactorRow
                label="Dividend Yield"
                value={analysis.annDividendYield}
                hint="Cash returned to shareholders as dividends"
                isDividend
              />
              <div className="border-t border-border pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">Total Annual Return</span>
                  <span className={`text-sm font-bold ${analysis.annTotalReturn >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                    {fmtPct(analysis.annTotalReturn)}
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground/60">
                  Note: Factors are multiplicative — individual contributions are approximate and do not precisely sum to total return.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Formula card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Five-Factor Formula</CardTitle>
              <p className="text-xs text-muted-foreground">
                Semper Augustus return decomposition
              </p>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <div className="rounded-md bg-muted/50 p-3 font-mono">
                <p className="text-muted-foreground">Total Return =</p>
                <p className="mt-1 ml-2">
                  ((1 + <strong>DS</strong>) / (1 + <strong>SC</strong>)) × (1 + <strong>MG</strong>) × (1 + <strong>PE</strong>) − 1 + <strong>DY</strong>
                </p>
              </div>
              <div className="space-y-1.5 text-muted-foreground">
                <p><strong className="text-foreground">DS</strong> = Dollar Sales Growth — {fmtPct(analysis.annDollarSales)}</p>
                <p><strong className="text-foreground">SC</strong> = Share Count Growth — {fmtPct(analysis.annShareCount)}</p>
                <p><strong className="text-foreground">MG</strong> = Margin Growth — {fmtPctOrNm(analysis.annMargin)}</p>
                <p><strong className="text-foreground">PE</strong> = P/E Multiple Growth — {fmtPctOrNm(analysis.annPe)}</p>
                <p><strong className="text-foreground">DY</strong> = Dividend Yield — {fmtPct(analysis.annDividendYield)}</p>
              </div>
              {analysis.annMargin != null && analysis.annPe != null ? (
                <div className="rounded-md border border-border p-3">
                  <p className="text-muted-foreground">Verification:</p>
                  <p className="mt-1 font-mono">
                    ((1 + {analysis.annDollarSales.toFixed(4)}) / (1 + {analysis.annShareCount.toFixed(4)}))
                    × (1 + {analysis.annMargin.toFixed(4)})
                    × (1 + {analysis.annPe.toFixed(4)}) − 1
                    + {analysis.annDividendYield.toFixed(4)}
                  </p>
                  <p className="mt-1 font-mono font-bold">
                    = {fmtPct(
                      ((1 + analysis.annDollarSales) / (1 + analysis.annShareCount)) *
                      (1 + analysis.annMargin) *
                      (1 + analysis.annPe) -
                      1 +
                      analysis.annDividendYield
                    )}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground/60">
                    vs actual annual price return + yield: {fmtPct(analysis.annTotalReturn)}
                  </p>
                </div>
              ) : (
                <div className="rounded-md border border-yellow-500/20 p-3 text-yellow-400/80">
                  <p>Verification unavailable — starting period has negative earnings.</p>
                  <p className="mt-1">Actual annual total return: <strong>{fmtPct(analysis.annTotalReturn)}</strong></p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Chart */}
      {analysis && chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Factor Contributions to Annual Return — {stockData?.ticker}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: "#a1a1aa" }}
                  tickFormatter={(v) => `${(v * 100).toFixed(1)}%`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "#a1a1aa" }}
                  width={100}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#18181b",
                    border: "1px solid #27272a",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(value) => fmtPct(Number(value))}
                />
                <ReferenceLine x={0} stroke="#27272a" />
                <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ── Sub-components ────────────────────────────── */

function FactorRow({
  label,
  value,
  hint,
  isDividend,
}: {
  label: string;
  value: number | null;
  hint: string;
  isDividend?: boolean;
}) {
  if (value == null) {
    return (
      <div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-foreground">{label}</span>
          <span className="text-sm font-medium text-muted-foreground">N/M</span>
        </div>
        <p className="text-[10px] text-muted-foreground/60">{hint}</p>
      </div>
    );
  }
  const isPositive = value >= 0;
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-foreground">{label}</span>
        <span
          className={`text-sm font-medium ${
            isDividend ? "text-blue-400" : isPositive ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {isPositive ? "+" : ""}
          {fmtPct(value)}
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground/60">{hint}</p>
    </div>
  );
}

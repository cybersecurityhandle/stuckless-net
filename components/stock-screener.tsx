"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

/* ── Types ─────────────────────────────────────── */

interface YearData {
  year: number;
  revenue: number;
  netIncome: number;
  sharesOutstanding: number;
  eps: number;
  price: number;
  netMargin: number;
  equity?: number;
  totalAssets?: number;
  longTermDebt?: number;
}

interface StockData {
  ticker: string;
  name: string;
  years: YearData[];
  calendarYears?: YearData[];
}

interface ScreenerRow {
  ticker: string;
  name: string;
  price: number;
  roe: number | null;
  roce: number | null;
  margin: number;
  margin5yr: number;
  epsCAGR: number | null;
  revCAGR: number | null;
  buybackYield: number | null;
  qualityScore: number;
}

type SortKey = keyof ScreenerRow;

/* ── Helpers ───────────────────────────────────── */

function cagr(start: number, end: number, years: number): number | null {
  if (years <= 0 || start <= 0 || end <= 0) return null;
  return Math.pow(end / start, 1 / years) - 1;
}

function computeMetrics(data: StockData): ScreenerRow | null {
  const years = data.years;
  if (years.length < 2) return null;

  const latest = years[years.length - 1];
  const fiveAgo = years.find((y) => y.year === latest.year - 5) || years[0];
  const span = latest.year - fiveAgo.year;

  // ROE = Net Income / Equity (latest year)
  const roe =
    latest.equity && latest.equity > 0
      ? latest.netIncome / latest.equity
      : null;

  // ROCE = Net Income / (Equity + LT Debt) — using net income as EBIT proxy
  const capitalEmployed =
    (latest.equity || 0) + (latest.longTermDebt || 0);
  const roce =
    capitalEmployed > 0 ? latest.netIncome / capitalEmployed : null;

  // Net margin (latest)
  const margin = latest.netMargin;

  // 5yr average margin
  const recentYears = years.filter((y) => y.year >= latest.year - 4);
  const margin5yr =
    recentYears.reduce((sum, y) => sum + y.netMargin, 0) / recentYears.length;

  // EPS CAGR
  const epsCAGR =
    fiveAgo.eps > 0 && latest.eps > 0
      ? cagr(fiveAgo.eps, latest.eps, span)
      : null;

  // Revenue CAGR
  const revCAGR = cagr(fiveAgo.revenue, latest.revenue, span);

  // Buyback yield = (sharesOld - sharesNew) / sharesOld, annualized
  const buybackYield =
    fiveAgo.sharesOutstanding > 0 && span > 0
      ? (fiveAgo.sharesOutstanding - latest.sharesOutstanding) /
        fiveAgo.sharesOutstanding /
        span
      : null;

  // Quality score (weighted composite)
  let score = 0;
  let weights = 0;

  if (roe !== null) {
    score += Math.min(roe, 1) * 25;
    weights += 25;
  }
  if (roce !== null) {
    score += Math.min(roce, 1) * 20;
    weights += 20;
  }
  score += Math.min(Math.max(margin, 0), 0.5) * 2 * 15; // 50% margin = full score
  weights += 15;
  if (epsCAGR !== null) {
    score += Math.min(Math.max(epsCAGR, 0), 0.5) * 2 * 15;
    weights += 15;
  }
  if (revCAGR !== null) {
    score += Math.min(Math.max(revCAGR, 0), 0.5) * 2 * 15;
    weights += 15;
  }
  if (buybackYield !== null) {
    score += Math.min(Math.max(buybackYield, 0), 0.1) * 10 * 10;
    weights += 10;
  }

  const qualityScore = weights > 0 ? (score / weights) * 100 : 0;

  return {
    ticker: data.ticker,
    name: data.name,
    price: latest.price,
    roe,
    roce,
    margin,
    margin5yr,
    epsCAGR,
    revCAGR,
    buybackYield,
    qualityScore,
  };
}

/* ── Component ─────────────────────────────────── */

export function StockScreener() {
  const [input, setInput] = useState("VRSN, IBKR, AAPL, MSFT, GOOGL");
  const [rows, setRows] = useState<ScreenerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("qualityScore");
  const [sortAsc, setSortAsc] = useState(false);

  async function handleScreen() {
    const tickers = input
      .split(/[,\s]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);

    if (tickers.length === 0) return;

    setLoading(true);
    setError("");
    setRows([]);

    try {
      const results = await Promise.all(
        tickers.map(async (ticker) => {
          const res = await fetch(`/api/stock?ticker=${ticker}`);
          if (!res.ok) return null;
          const data: StockData = await res.json();
          return computeMetrics(data);
        })
      );

      const valid = results.filter((r): r is ScreenerRow => r !== null);
      if (valid.length === 0) {
        setError("No valid data found for the given tickers.");
      }
      setRows(valid);
    } catch {
      setError("Failed to fetch stock data. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string" && typeof bv === "string") {
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortAsc
        ? (av as number) - (bv as number)
        : (bv as number) - (av as number);
    });
  }, [rows, sortKey, sortAsc]);

  const fmt = (v: number | null, pct = false) => {
    if (v == null) return "—";
    if (pct) return `${(v * 100).toFixed(1)}%`;
    return v.toFixed(2);
  };

  // Color based on rank within the set
  function rankColor(value: number | null, allValues: (number | null)[], higher = true) {
    if (value == null) return "";
    const valid = allValues.filter((v): v is number => v != null);
    if (valid.length < 2) return "";
    const sorted = [...valid].sort((a, b) => a - b);
    const rank = sorted.indexOf(value);
    const pct = rank / (sorted.length - 1);
    const position = higher ? pct : 1 - pct;
    if (position >= 0.75) return "text-emerald-400";
    if (position <= 0.25) return "text-red-400";
    return "";
  }

  const columns: {
    key: SortKey;
    label: string;
    pct?: boolean;
    higher?: boolean;
  }[] = [
    { key: "ticker", label: "Ticker" },
    { key: "name", label: "Company" },
    { key: "roe", label: "ROE", pct: true, higher: true },
    { key: "roce", label: "ROCE", pct: true, higher: true },
    { key: "margin", label: "Margin", pct: true, higher: true },
    { key: "margin5yr", label: "5yr Margin", pct: true, higher: true },
    { key: "epsCAGR", label: "EPS CAGR", pct: true, higher: true },
    { key: "revCAGR", label: "Rev CAGR", pct: true, higher: true },
    { key: "buybackYield", label: "Buyback %", pct: true, higher: true },
    { key: "price", label: "Price" },
    { key: "qualityScore", label: "Score", higher: true },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Stock Quality Screener</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Input */}
        <div className="flex gap-3">
          <Input
            placeholder="Enter tickers separated by commas (e.g. VRSN, IBKR, AAPL)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleScreen()}
            className="flex-1"
          />
          <Button onClick={handleScreen} disabled={loading}>
            {loading ? "Screening..." : "Screen"}
          </Button>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {loading && (
          <div className="py-8 text-center text-muted-foreground">
            Fetching data for {input.split(/[,\s]+/).filter(Boolean).length} stocks...
          </div>
        )}

        {/* Results Table */}
        {sortedRows.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((col) => (
                    <TableHead
                      key={col.key}
                      className="cursor-pointer select-none hover:text-foreground whitespace-nowrap"
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}
                      {sortKey === col.key && (
                        <span className="ml-1">{sortAsc ? "▲" : "▼"}</span>
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRows.map((row) => (
                  <TableRow key={row.ticker}>
                    <TableCell className="font-mono font-bold">
                      {row.ticker}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                      {row.name}
                    </TableCell>
                    <TableCell
                      className={rankColor(
                        row.roe,
                        rows.map((r) => r.roe)
                      )}
                    >
                      {fmt(row.roe, true)}
                    </TableCell>
                    <TableCell
                      className={rankColor(
                        row.roce,
                        rows.map((r) => r.roce)
                      )}
                    >
                      {fmt(row.roce, true)}
                    </TableCell>
                    <TableCell
                      className={rankColor(
                        row.margin,
                        rows.map((r) => r.margin)
                      )}
                    >
                      {fmt(row.margin, true)}
                    </TableCell>
                    <TableCell
                      className={rankColor(
                        row.margin5yr,
                        rows.map((r) => r.margin5yr)
                      )}
                    >
                      {fmt(row.margin5yr, true)}
                    </TableCell>
                    <TableCell
                      className={rankColor(
                        row.epsCAGR,
                        rows.map((r) => r.epsCAGR)
                      )}
                    >
                      {fmt(row.epsCAGR, true)}
                    </TableCell>
                    <TableCell
                      className={rankColor(
                        row.revCAGR,
                        rows.map((r) => r.revCAGR)
                      )}
                    >
                      {fmt(row.revCAGR, true)}
                    </TableCell>
                    <TableCell
                      className={rankColor(
                        row.buybackYield,
                        rows.map((r) => r.buybackYield)
                      )}
                    >
                      {fmt(row.buybackYield, true)}
                    </TableCell>
                    <TableCell className="font-mono">
                      ${row.price.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row.qualityScore >= 60
                            ? "default"
                            : row.qualityScore >= 35
                              ? "secondary"
                              : "destructive"
                        }
                        className="font-mono"
                      >
                        {row.qualityScore.toFixed(0)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Legend */}
        {sortedRows.length > 0 && (
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              <span className="text-emerald-400">Green</span> = top quartile,{" "}
              <span className="text-red-400">Red</span> = bottom quartile within
              screened set.
            </p>
            <p>
              Score weights: ROE 25%, ROCE 20%, Margin 15%, EPS Growth 15%, Rev
              Growth 15%, Buybacks 10%.
            </p>
            <p>
              ROCE uses net income / (equity + LT debt). Buyback % is annualized
              share reduction over 5 years.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

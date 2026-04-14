"use client";

import { useState, useMemo, useEffect } from "react";
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
  longTermDebt?: number;
}

interface StockData {
  ticker: string;
  name: string;
  years: YearData[];
}

interface ScreenerRow {
  ticker: string;
  name: string;
  sector?: string;
  price: number;
  roe: number | null;
  roce: number | null;
  margin: number;
  margin5yr: number;
  marginDelta: number; // latest margin − 5yr avg (positive = expanding, negative = contracting)
  epsCAGR: number | null;
  revCAGR: number | null;
  buybackYield: number | null;
  qualityScore: number;
}

interface Sp500Cache {
  updated: string | null;
  count: number;
  stocks: ScreenerRow[];
}

type SortKey = keyof ScreenerRow;
type Mode = "custom" | "sp500";

/* ── Helpers ───────────────────────────────────── */

function cagr(start: number, end: number, years: number): number | null {
  if (years <= 0 || start <= 0 || end <= 0) return null;
  return Math.pow(end / start, 1 / years) - 1;
}

function computeMetrics(data: StockData, sector?: string): ScreenerRow | null {
  const years = data.years;
  if (years.length < 2) return null;

  const latest = years[years.length - 1];
  const fiveAgo = years.find((y) => y.year === latest.year - 5) ?? years[0];
  const span = latest.year - fiveAgo.year;

  const roe =
    latest.equity && latest.equity > 0
      ? latest.netIncome / latest.equity
      : null;
  const capitalEmployed = (latest.equity ?? 0) + (latest.longTermDebt ?? 0);
  const roce = capitalEmployed > 0 ? latest.netIncome / capitalEmployed : null;
  const margin = latest.netMargin;
  const recentYears = years.filter((y) => y.year >= latest.year - 4);
  const margin5yr =
    recentYears.reduce((s, y) => s + y.netMargin, 0) / recentYears.length;
  const marginDelta = margin - margin5yr;
  const epsCAGR =
    fiveAgo.eps > 0 && latest.eps > 0
      ? cagr(fiveAgo.eps, latest.eps, span)
      : null;
  const revCAGR = cagr(fiveAgo.revenue, latest.revenue, span);
  const buybackYield =
    fiveAgo.sharesOutstanding > 0 && span > 0
      ? (fiveAgo.sharesOutstanding - latest.sharesOutstanding) /
        fiveAgo.sharesOutstanding /
        span
      : null;

  let score = 0, weights = 0;
  if (roe !== null) { score += Math.min(roe, 1) * 25; weights += 25; }
  if (roce !== null) { score += Math.min(roce, 1) * 20; weights += 20; }
  score += Math.min(Math.max(margin, 0), 0.5) * 2 * 15; weights += 15;
  if (epsCAGR !== null) { score += Math.min(Math.max(epsCAGR, 0), 0.5) * 2 * 15; weights += 15; }
  if (revCAGR !== null) { score += Math.min(Math.max(revCAGR, 0), 0.5) * 2 * 15; weights += 15; }
  if (buybackYield !== null) { score += Math.min(Math.max(buybackYield, 0), 0.1) * 10 * 10; weights += 10; }
  const qualityScore = weights > 0 ? (score / weights) * 100 : 0;

  return {
    ticker: data.ticker,
    name: data.name,
    sector,
    price: latest.price,
    roe,
    roce,
    margin,
    margin5yr,
    marginDelta,
    epsCAGR,
    revCAGR,
    buybackYield,
    qualityScore,
  };
}

const NUMERIC_COLS = [
  "roe", "roce", "margin", "margin5yr",
  "epsCAGR", "revCAGR", "buybackYield", "qualityScore",
] as const;

/** Precomputes top/bottom quartile color per ticker per column. O(k·n log n) once. */
function buildColorMaps(rows: ScreenerRow[]): Record<string, Map<string, string>> {
  const maps: Record<string, Map<string, string>> = {};
  for (const col of NUMERIC_COLS) {
    const entries = rows
      .map((r) => ({ ticker: r.ticker, val: r[col] as number | null }))
      .filter((x): x is { ticker: string; val: number } => x.val !== null);
    const map = new Map<string, string>();
    if (entries.length >= 4) {
      const sorted = [...entries].sort((a, b) => a.val - b.val);
      sorted.forEach(({ ticker }, i) => {
        const pct = i / (sorted.length - 1);
        if (pct >= 0.75) map.set(ticker, "text-emerald-400");
        else if (pct <= 0.25) map.set(ticker, "text-red-400");
      });
    }
    maps[col] = map;
  }
  return maps;
}

/* ── Component ─────────────────────────────────── */

export function StockScreener() {
  const [mode, setMode] = useState<Mode>("custom");

  // Custom mode state
  const [input, setInput] = useState("VRSN, IBKR, AAPL, MSFT, GOOGL");
  const [customRows, setCustomRows] = useState<ScreenerRow[]>([]);
  const [customLoading, setCustomLoading] = useState(false);

  // S&P 500 mode state
  const [sp500, setSp500] = useState<Sp500Cache | null>(null);
  const [sp500Loading, setSp500Loading] = useState(false);
  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState("all");
  const [minROE, setMinROE] = useState("");
  const [minMargin, setMinMargin] = useState("");
  const [minScore, setMinScore] = useState("");

  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("qualityScore");
  const [sortAsc, setSortAsc] = useState(false);

  // Load S&P 500 JSON on tab switch
  useEffect(() => {
    if (mode !== "sp500" || sp500 || sp500Loading) return;
    setSp500Loading(true);
    fetch("/sp500-screener.json")
      .then((r) => r.json())
      .then((data: Sp500Cache) => { setSp500(data); setSp500Loading(false); })
      .catch(() => {
        setError("Failed to load S&P 500 data. Run: npm run refresh-sp500");
        setSp500Loading(false);
      });
  }, [mode, sp500, sp500Loading]);

  async function handleScreen() {
    const tickers = input
      .split(/[,\s]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    if (tickers.length === 0) return;
    setCustomLoading(true);
    setError("");
    setCustomRows([]);
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
      if (valid.length === 0) setError("No valid data found.");
      setCustomRows(valid);
    } catch {
      setError("Failed to fetch stock data. Please try again.");
    } finally {
      setCustomLoading(false);
    }
  }

  // Filtered S&P 500 rows
  const sp500Filtered = useMemo(() => {
    if (!sp500?.stocks.length) return [];
    return sp500.stocks.filter((r) => {
      if (sectorFilter !== "all" && r.sector !== sectorFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!r.ticker.toLowerCase().includes(q) && !r.name.toLowerCase().includes(q)) return false;
      }
      if (minROE && (r.roe === null || r.roe * 100 < parseFloat(minROE))) return false;
      if (minMargin && r.margin * 100 < parseFloat(minMargin)) return false;
      if (minScore && r.qualityScore < parseFloat(minScore)) return false;
      return true;
    });
  }, [sp500, sectorFilter, search, minROE, minMargin, minScore]);

  const activeRows = mode === "custom" ? customRows : sp500Filtered;

  // Precompute rank colors once per active row set
  const colorMaps = useMemo(() => buildColorMaps(activeRows), [activeRows]);

  const sortedRows = useMemo(() => {
    return [...activeRows].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string" && typeof bv === "string")
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [activeRows, sortKey, sortAsc]);

  const sectors = useMemo(() => {
    if (!sp500?.stocks.length) return [];
    return [...new Set(sp500.stocks.map((s) => s.sector).filter(Boolean))].sort() as string[];
  }, [sp500]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  }

  const fmt = (v: number | null, pct = false) => {
    if (v == null) return "—";
    if (pct) return `${(v * 100).toFixed(1)}%`;
    return v.toFixed(2);
  };

  const fmtPrice = (p: number) =>
    p < 1 ? `$${p.toFixed(3)}` : `$${p.toFixed(2)}`;

  const showSector = mode === "sp500";
  const loading = mode === "custom" ? customLoading : sp500Loading;

  const columns: { key: SortKey; label: string; pct?: boolean }[] = [
    { key: "ticker", label: "Ticker" },
    { key: "name", label: "Company" },
    ...(showSector ? [{ key: "sector" as SortKey, label: "Sector" }] : []),
    { key: "roe", label: "ROE", pct: true },
    { key: "roce", label: "ROCE", pct: true },
    { key: "margin", label: "Margin", pct: true },
    { key: "margin5yr", label: "5yr Avg", pct: true },
    { key: "marginDelta", label: "Margin Δ", pct: true },
    { key: "epsCAGR", label: "EPS CAGR", pct: true },
    { key: "revCAGR", label: "Rev CAGR", pct: true },
    { key: "buybackYield", label: "Buyback", pct: true },
    { key: "price", label: "Price" },
    { key: "qualityScore", label: "Score" },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-xl">Stock Quality Screener</CardTitle>
          {/* Mode tabs */}
          <div className="flex rounded-md border border-border overflow-hidden text-sm">
            {(["custom", "sp500"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(""); }}
                className={`px-4 py-1.5 transition-colors ${
                  mode === m
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "custom" ? "Custom" : "S&P 500"}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ── Custom mode controls ── */}
        {mode === "custom" && (
          <div className="flex gap-3">
            <Input
              placeholder="Tickers, comma-separated (e.g. VRSN, IBKR, AAPL)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleScreen()}
              className="flex-1"
            />
            <Button onClick={handleScreen} disabled={loading}>
              {loading ? "Fetching…" : "Screen"}
            </Button>
          </div>
        )}

        {/* ── S&P 500 mode controls ── */}
        {mode === "sp500" && (
          <div className="space-y-3">
            {sp500?.updated && (
              <p className="text-xs text-muted-foreground">
                Last updated: {sp500.updated} · {sp500.count} stocks · {sp500Filtered.length} matching
              </p>
            )}
            <div className="flex flex-wrap gap-4 items-end">
              {/* Search */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Search</label>
                <Input
                  placeholder="Ticker or name"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-44"
                />
              </div>
              {/* Sector */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Sector</label>
                <select
                  value={sectorFilter}
                  onChange={(e) => setSectorFilter(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground w-52"
                >
                  <option value="all">All Sectors</option>
                  {sectors.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              {/* Min ROE */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Min ROE %</label>
                <Input
                  placeholder="e.g. 15"
                  value={minROE}
                  onChange={(e) => setMinROE(e.target.value)}
                  className="w-28"
                  type="number"
                />
              </div>
              {/* Min Margin */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Min Margin %</label>
                <Input
                  placeholder="e.g. 10"
                  value={minMargin}
                  onChange={(e) => setMinMargin(e.target.value)}
                  className="w-28"
                  type="number"
                />
              </div>
              {/* Min Score */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Min Score</label>
                <Input
                  placeholder="e.g. 50"
                  value={minScore}
                  onChange={(e) => setMinScore(e.target.value)}
                  className="w-28"
                  type="number"
                />
              </div>
              {/* Clear */}
              {(search || sectorFilter !== "all" || minROE || minMargin || minScore) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mb-0.5"
                  onClick={() => { setSearch(""); setSectorFilter("all"); setMinROE(""); setMinMargin(""); setMinScore(""); }}
                >
                  Clear filters
                </Button>
              )}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        {loading && (
          <div className="py-10 text-center text-muted-foreground">
            {mode === "sp500" ? "Loading S&P 500 data…" : `Fetching ${input.split(/[,\s]+/).filter(Boolean).length} stocks…`}
          </div>
        )}

        {mode === "sp500" && sp500?.count === 0 && !sp500Loading && (
          <div className="py-10 text-center text-muted-foreground text-sm space-y-2">
            <p>No S&P 500 data yet.</p>
            <p className="font-mono bg-muted inline-block px-3 py-1 rounded">npm run refresh-sp500</p>
            <p>Then commit and push <code>public/sp500-screener.json</code>.</p>
          </div>
        )}

        {/* ── Results table ── */}
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
                        <span className="ml-1 opacity-60">{sortAsc ? "▲" : "▼"}</span>
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRows.map((row) => (
                  <TableRow key={row.ticker}>
                    <TableCell className="font-mono font-bold">{row.ticker}</TableCell>
                    <TableCell className="max-w-[180px] truncate text-sm text-muted-foreground">
                      {row.name}
                    </TableCell>
                    {showSector && (
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {row.sector ?? "—"}
                      </TableCell>
                    )}
                    {(["roe", "roce", "margin", "margin5yr"] as const).map((col) => (
                      <TableCell key={col} className={colorMaps[col]?.get(row.ticker) ?? ""}>
                        {fmt(row[col], true)}
                      </TableCell>
                    ))}
                    {/* Margin Δ — absolute coloring: green=expanding, red=contracting */}
                    <TableCell className={
                      row.marginDelta > 0.01 ? "text-emerald-400"
                      : row.marginDelta < -0.01 ? "text-red-400"
                      : "text-muted-foreground"
                    }>
                      {row.marginDelta >= 0 ? "+" : ""}{(row.marginDelta * 100).toFixed(1)}%
                    </TableCell>
                    {(["epsCAGR", "revCAGR", "buybackYield"] as const).map((col) => (
                      <TableCell key={col} className={colorMaps[col]?.get(row.ticker) ?? ""}>
                        {fmt(row[col], true)}
                      </TableCell>
                    ))}
                    <TableCell className="font-mono">{fmtPrice(row.price)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row.qualityScore >= 60 ? "default"
                          : row.qualityScore >= 35 ? "secondary"
                          : "destructive"
                        }
                        className={`font-mono ${colorMaps["qualityScore"]?.get(row.ticker) ?? ""}`}
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

        {/* ── Legend ── */}
        {sortedRows.length > 0 && (
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              <span className="text-emerald-400">Green</span> = top quartile,{" "}
              <span className="text-red-400">Red</span> = bottom quartile within shown set.
              Margin Δ uses absolute thresholds: <span className="text-emerald-400">green &gt;+1%</span> (expanding),{" "}
              <span className="text-red-400">red &lt;−1%</span> (contracting).
            </p>
            <p>
              Score weights: ROE 25%, ROCE 20%, Margin 15%, EPS Growth 15%, Rev Growth 15%, Buybacks 10%.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

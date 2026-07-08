"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/* ── Types ─────────────────────────────────────── */

interface YearData {
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

interface StockData {
  ticker: string;
  name: string;
  currency: string;
  currentPrice: number | null;
  years: YearData[];
}

interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
}

interface WatchRow {
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
  yearsOfData: number;
  loading: boolean;
  error?: string;
}

const STORAGE_KEY = "stuckless-watchlist-v7"; // v7: + DAC
const SEED_TICKERS = [
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
];

// Client-side fetch batching — each ticker triggers EDGAR + Yahoo calls server-side,
// so a full seed list fired at once would trip SEC's rate limit
const FETCH_BATCH_SIZE = 4;

// Verdict thresholds: current P/E vs own historical median
const CHEAP_BELOW = -0.15;
const RICH_ABOVE = 0.15;

// Implied return: EPS growth assumption capped to avoid extrapolating blowout years
const MAX_ASSUMED_GROWTH = 0.25;

/* ── Helpers ───────────────────────────────────── */

function fmtPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

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

function buildRow(ticker: string, data: StockData): WatchRow {
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
  const premium = currentPe != null && medianPe != null && medianPe > 0 ? currentPe / medianPe - 1 : null;

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
    yearsOfData: years.length,
    loading: false,
  };
}

function verdict(premium: number | null): { label: string; className: string } {
  if (premium == null) return { label: "N/M", className: "bg-zinc-700 text-zinc-300" };
  if (premium <= CHEAP_BELOW) return { label: "Cheap", className: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" };
  if (premium >= RICH_ABOVE) return { label: "Rich", className: "bg-red-500/15 text-red-400 border border-red-500/30" };
  return { label: "Fair", className: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30" };
}

/* ── Component ─────────────────────────────────── */

export function Watchlist() {
  const [tickers, setTickers] = useState<string[] | null>(null); // null until localStorage loads
  const [rows, setRows] = useState<Record<string, WatchRow>>({});
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Load saved list (client only)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const list: string[] = saved ? JSON.parse(saved) : SEED_TICKERS;
      setTickers(Array.isArray(list) && list.length > 0 ? list : SEED_TICKERS);
    } catch {
      setTickers(SEED_TICKERS);
    }
  }, []);

  // Persist on change
  useEffect(() => {
    if (tickers) localStorage.setItem(STORAGE_KEY, JSON.stringify(tickers));
  }, [tickers]);

  const fetchTicker = useCallback(async (symbol: string) => {
    setRows((r) => ({
      ...r,
      [symbol]: { ...(r[symbol] ?? ({} as WatchRow)), ticker: symbol, name: symbol, loading: true } as WatchRow,
    }));
    try {
      const res = await fetch(`/api/stock?ticker=${encodeURIComponent(symbol)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fetch failed");
      if (!data.years || data.years.length < 2) throw new Error("Not enough annual data");
      setRows((r) => ({ ...r, [symbol]: buildRow(symbol, data) }));
    } catch (err: unknown) {
      setRows((r) => ({
        ...r,
        [symbol]: {
          ...(r[symbol] as WatchRow),
          loading: false,
          error: err instanceof Error ? err.message : "Fetch failed",
        },
      }));
    }
  }, []);

  // Fetch any tickers we don't have data for yet, a few at a time
  const inFlight = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!tickers) return;
    const missing = tickers.filter((t) => !rows[t] && !inFlight.current.has(t));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      for (let i = 0; i < missing.length; i += FETCH_BATCH_SIZE) {
        if (cancelled) return;
        const batch = missing.slice(i, i + FETCH_BATCH_SIZE);
        batch.forEach((t) => inFlight.current.add(t));
        await Promise.all(batch.map(fetchTicker));
        batch.forEach((t) => inFlight.current.delete(t));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickers, fetchTicker]);

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
        setSuggestions(await res.json());
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

  function addTicker(symbol: string) {
    const sym = symbol.toUpperCase().trim();
    if (!sym) return;
    setQuery("");
    setSuggestions([]);
    setShowSuggestions(false);
    setTickers((t) => (t && !t.includes(sym) ? [...t, sym] : t));
  }

  function removeTicker(symbol: string) {
    setTickers((t) => (t ? t.filter((x) => x !== symbol) : t));
    setRows((r) => {
      const next = { ...r };
      delete next[symbol];
      return next;
    });
  }

  // Cheapest (biggest discount to own history) first; errors/loading last
  const sortedRows = (tickers ?? [])
    .map((t) => rows[t])
    .filter(Boolean)
    .sort((a, b) => {
      if (a.error || a.loading) return 1;
      if (b.error || b.loading) return -1;
      if (a.premium == null) return 1;
      if (b.premium == null) return -1;
      return a.premium - b.premium;
    });

  return (
    <div className="space-y-6">
      {/* Add ticker */}
      <Card className="overflow-visible">
        <CardContent className="pt-6">
          <div className="relative max-w-md" ref={searchRef}>
            <label className="mb-1 block text-xs text-muted-foreground">Add to watchlist</label>
            <Input
              placeholder="Search e.g. IBKR, VRSN, MA..."
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && query.length > 0) addTicker(query);
              }}
              className="h-9 text-sm"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-zinc-600 bg-zinc-800 shadow-xl shadow-black/50">
                {suggestions.map((s) => (
                  <button
                    key={s.symbol}
                    onClick={() => addTicker(s.symbol)}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition-colors hover:bg-zinc-700"
                  >
                    <span className="font-semibold text-emerald-400">{s.symbol}</span>
                    <span className="ml-2 truncate text-xs text-zinc-400">{s.name} · {s.exchange}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Great businesses worth owning at the right price. Verdict compares today&apos;s P/E
            against each stock&apos;s own ~10-year median — <span className="text-emerald-400">Cheap</span> is
            more than 15% below its norm, <span className="text-red-400">Rich</span> more than 15% above.
            Saved in your browser.
          </p>
        </CardContent>
      </Card>

      {/* Watchlist table */}
      <Card>
        <CardContent className="pt-6 overflow-x-auto">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead>Ticker</TableHead>
                <TableHead>Company</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">P/E Now</TableHead>
                <TableHead className="text-right">Median P/E</TableHead>
                <TableHead className="text-right">vs History</TableHead>
                <TableHead>Verdict</TableHead>
                <TableHead className="text-right">EPS CAGR (5y)</TableHead>
                <TableHead className="text-right">Div Yield</TableHead>
                <TableHead className="text-right">Implied 5y Return</TableHead>
                <TableHead className="text-right">Quality</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={12} className="text-center text-sm text-muted-foreground">
                    {tickers === null ? "Loading..." : "Watchlist is empty — search above to add tickers."}
                  </TableCell>
                </TableRow>
              )}
              {sortedRows.map((row) => {
                if (row.loading) {
                  return (
                    <TableRow key={row.ticker}>
                      <TableCell className="font-semibold text-emerald-400">{row.ticker}</TableCell>
                      <TableCell colSpan={11} className="text-sm text-muted-foreground animate-pulse">
                        Fetching...
                      </TableCell>
                    </TableRow>
                  );
                }
                if (row.error) {
                  return (
                    <TableRow key={row.ticker}>
                      <TableCell className="font-semibold text-emerald-400">{row.ticker}</TableCell>
                      <TableCell colSpan={10} className="text-sm text-red-400">{row.error}</TableCell>
                      <TableCell className="text-right">
                        <button
                          onClick={() => removeTicker(row.ticker)}
                          className="text-xs text-muted-foreground hover:text-red-400"
                          title="Remove"
                        >
                          ✕
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                }
                const v = verdict(row.premium);
                return (
                  <TableRow key={row.ticker}>
                    <TableCell className="font-semibold text-emerald-400">{row.ticker}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground">{row.name}</TableCell>
                    <TableCell className="text-right font-mono">
                      {row.currentPrice != null ? `$${row.currentPrice.toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {row.currentPe != null ? `${row.currentPe.toFixed(1)}x` : "N/M"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {row.medianPe != null ? `${row.medianPe.toFixed(1)}x` : "—"}
                    </TableCell>
                    <TableCell className={`text-right font-mono ${
                      row.premium == null ? "text-muted-foreground"
                        : row.premium <= 0 ? "text-emerald-400" : "text-red-400"
                    }`}>
                      {row.premium != null ? `${row.premium >= 0 ? "+" : ""}${fmtPct(row.premium)}` : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge className={v.className}>{v.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {row.epsCAGR != null ? fmtPct(row.epsCAGR) : "N/M"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {row.divYield != null ? fmtPct(row.divYield) : "—"}
                    </TableCell>
                    <TableCell className={`text-right font-mono font-medium ${
                      row.impliedReturn == null ? "text-muted-foreground"
                        : row.impliedReturn >= 0.1 ? "text-emerald-400"
                        : row.impliedReturn >= 0 ? "text-yellow-400" : "text-red-400"
                    }`}>
                      {row.impliedReturn != null ? fmtPct(row.impliedReturn) : "N/M"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {row.qualityScore != null ? row.qualityScore.toFixed(0) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <button
                        onClick={() => removeTicker(row.ticker)}
                        className="text-xs text-muted-foreground hover:text-red-400"
                        title="Remove"
                      >
                        ✕
                      </button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <p className="mt-3 text-[10px] text-muted-foreground/60">
            Implied 5y return assumes P/E reverts to its historical median while EPS compounds at the
            5-year rate (capped at {fmtPct(MAX_ASSUMED_GROWTH)}/yr), plus dividends. Quality score uses the
            same ROE/ROCE/margin/growth/buyback formula as the S&amp;P 500 screener. Not investment advice.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

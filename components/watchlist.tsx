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
import {
  WATCHLIST_TICKERS,
  MAX_ASSUMED_GROWTH,
  buildRow,
  type WatchRow,
} from "@/lib/watchlist-data";

/* ── Types ─────────────────────────────────────── */

interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
}

// WatchRow + client-side fetch state (for tickers not in the static JSON)
type RowState = WatchRow & { loading?: boolean; error?: string };

interface WatchlistJson {
  updated: string;
  rows: WatchRow[];
}

const STORAGE_KEY = "stuckless-watchlist-v7";

// Verdict thresholds: current P/E vs own historical median
const CHEAP_BELOW = -0.15;
const RICH_ABOVE = 0.15;

// Live fetches happen only for user-added tickers missing from watchlist.json;
// keep them gentle on SEC EDGAR
const FETCH_BATCH_SIZE = 4;

/* ── Helpers ───────────────────────────────────── */

function fmtPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
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
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [updated, setUpdated] = useState<string | null>(null);
  const [staticLoaded, setStaticLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Load saved list (client only)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const list: string[] = saved ? JSON.parse(saved) : WATCHLIST_TICKERS;
      setTickers(Array.isArray(list) && list.length > 0 ? list : WATCHLIST_TICKERS);
    } catch {
      setTickers(WATCHLIST_TICKERS);
    }
  }, []);

  // Persist on change
  useEffect(() => {
    if (tickers) localStorage.setItem(STORAGE_KEY, JSON.stringify(tickers));
  }, [tickers]);

  // Load precomputed rows from the static JSON (no EDGAR/Yahoo queries)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/watchlist.json");
        if (res.ok) {
          const data: WatchlistJson = await res.json();
          setUpdated(data.updated);
          setRows((r) => {
            const next = { ...r };
            for (const row of data.rows) {
              if (!next[row.ticker]) next[row.ticker] = row;
            }
            return next;
          });
        }
      } catch {
        // fall back to live fetching everything
      } finally {
        setStaticLoaded(true);
      }
    })();
  }, []);

  const fetchTicker = useCallback(async (symbol: string) => {
    setRows((r) => ({
      ...r,
      [symbol]: { ...(r[symbol] ?? ({} as RowState)), ticker: symbol, name: symbol, loading: true } as RowState,
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
          ...(r[symbol] as RowState),
          loading: false,
          error: err instanceof Error ? err.message : "Fetch failed",
        },
      }));
    }
  }, []);

  // Live-fetch only tickers the static JSON doesn't cover (user-added ones),
  // after the static file has had its chance
  const inFlight = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!tickers || !staticLoaded) return;
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
  }, [tickers, staticLoaded, fetchTicker]);

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
            {updated && (
              <span className="text-muted-foreground/60"> Data as of {updated} (precomputed; run{" "}
              <code className="text-[10px]">npm run refresh-watchlist</code> to update).</span>
            )}
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
                    {tickers === null || !staticLoaded ? "Loading..." : "Watchlist is empty — search above to add tickers."}
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

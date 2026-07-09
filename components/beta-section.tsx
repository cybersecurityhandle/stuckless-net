"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { WatchRow } from "@/lib/watchlist-data";

/* Short-horizon beta, quarantined from the five-factor and quality views.
 * Beta measures covariance with the market — how a stock wiggles — which is
 * the institutional definition of risk, not this site's. It lives in its own
 * tab for exactly that reason. */

interface WatchlistJson {
  updated: string;
  rows: WatchRow[];
}

interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
}

interface LookupRow {
  ticker: string;
  name: string;
  beta12w: number | null;
  loading?: boolean;
  error?: string;
}

function betaColor(b: number): string {
  if (b >= 1.3) return "text-red-400";
  if (b >= 0.8) return "text-foreground";
  return "text-emerald-400";
}

export function BetaSection() {
  const [rows, setRows] = useState<WatchRow[] | null>(null);
  const [updated, setUpdated] = useState<string | null>(null);
  const [lookups, setLookups] = useState<LookupRow[]>([]);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/watchlist.json");
        if (res.ok) {
          const data: WatchlistJson = await res.json();
          setUpdated(data.updated);
          setRows(data.rows);
        } else {
          setRows([]);
        }
      } catch {
        setRows([]);
      }
    })();
  }, []);

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

  async function lookupTicker(symbol: string) {
    const sym = symbol.toUpperCase().trim();
    if (!sym) return;
    setQuery("");
    setSuggestions([]);
    setShowSuggestions(false);
    setLookups((l) => [
      { ticker: sym, name: sym, beta12w: null, loading: true },
      ...l.filter((x) => x.ticker !== sym),
    ]);
    try {
      const res = await fetch(`/api/stock?ticker=${encodeURIComponent(sym)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fetch failed");
      setLookups((l) =>
        l.map((x) =>
          x.ticker === sym
            ? { ticker: sym, name: data.name ?? sym, beta12w: data.beta12w ?? null }
            : x
        )
      );
    } catch (err: unknown) {
      setLookups((l) =>
        l.map((x) =>
          x.ticker === sym
            ? { ...x, loading: false, error: err instanceof Error ? err.message : "Fetch failed" }
            : x
        )
      );
    }
  }

  const withBeta = (rows ?? [])
    .filter((r) => r.beta12w != null)
    .sort((a, b) => (b.beta12w as number) - (a.beta12w as number));

  return (
    <div className="space-y-6">
      <Card className="overflow-visible">
        <CardContent className="pt-6">
          <div className="relative max-w-md" ref={searchRef}>
            <label className="mb-1 block text-xs text-muted-foreground">
              Look up beta for any stock
            </label>
            <Input
              placeholder="Search e.g. NVDA, TSLA, Shopify..."
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && query.length > 0) lookupTicker(query);
              }}
              className="h-9 text-sm"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-zinc-600 bg-zinc-800 shadow-xl shadow-black/50">
                {suggestions.map((s) => (
                  <button
                    key={s.symbol}
                    onClick={() => lookupTicker(s.symbol)}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition-colors hover:bg-zinc-700"
                  >
                    <span className="font-semibold text-emerald-400">{s.symbol}</span>
                    <span className="ml-2 truncate text-xs text-zinc-400">{s.name} · {s.exchange}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {lookups.length > 0 && (
            <div className="mt-4 space-y-1.5">
              {lookups.map((l) => (
                <div key={l.ticker} className="flex items-center gap-3 text-sm">
                  <span className="w-20 shrink-0 font-semibold text-emerald-400">{l.ticker}</span>
                  {l.loading ? (
                    <span className="text-xs text-muted-foreground animate-pulse">Computing beta...</span>
                  ) : l.error ? (
                    <span className="text-xs text-red-400">{l.error}</span>
                  ) : (
                    <>
                      <span className="max-w-[260px] truncate text-xs text-muted-foreground">{l.name}</span>
                      <span className={`ml-auto font-mono ${l.beta12w != null ? betaColor(l.beta12w) : "text-muted-foreground"}`}>
                        {l.beta12w != null ? `β ${l.beta12w.toFixed(2)}` : "β N/A"}
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Trailing 12-week beta vs the S&amp;P 500, computed from ~60 daily returns — the
            short-horizon convention risk desks use for current positioning. β = 1 moves with
            the market; β = 1.5 amplifies a 10% market move to ~15%; β &lt; 1 dampens it.
            Foreign listings are regressed in local currency against ^GSPC (rough but conventional).
            {updated && <span className="text-muted-foreground/60"> Data as of {updated}.</span>}
          </p>
          <p className="mt-2 text-xs text-muted-foreground/70">
            Editorial note: beta measures how a stock <em>wiggles</em>, not whether the business
            fails. A halved price on an unchanged business raises its beta and lowers its risk.
            This tab exists for translation into institutional dialect, not for decisions.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 overflow-x-auto">
          <Table className="min-w-[500px]">
            <TableHeader>
              <TableRow>
                <TableHead>Ticker</TableHead>
                <TableHead>Company</TableHead>
                <TableHead className="text-right">β (12w daily)</TableHead>
                <TableHead className="text-right">Implied move on a −10% market</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows === null && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              )}
              {rows !== null && withBeta.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    No beta data yet — it appears after the next data refresh.
                  </TableCell>
                </TableRow>
              )}
              {withBeta.map((r) => (
                <TableRow key={r.ticker}>
                  <TableCell className="font-semibold text-emerald-400">{r.ticker}</TableCell>
                  <TableCell className="max-w-[240px] truncate text-muted-foreground">{r.name}</TableCell>
                  <TableCell className={`text-right font-mono ${betaColor(r.beta12w as number)}`}>
                    {(r.beta12w as number).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">
                    {((r.beta12w as number) * -10).toFixed(1)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-3 text-[10px] text-muted-foreground/60">
            12-week betas are regime-dependent and noisy — a takeover pins beta near 0, a
            drawdown inflates it. For cost-of-capital work institutions typically use 2–5 year
            windows instead.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

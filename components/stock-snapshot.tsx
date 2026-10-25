"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import type { StockStats } from "@/app/api/stock/stats/route";
import type { InsiderBuy, InsiderBuysJson } from "@/lib/insiders";
import {
  buildIssuers,
  issuerKeyForTicker,
  type ChangeType,
  type LatestHoldingsJson,
  type Owner,
  type SuperinvestorsJson,
} from "@/lib/superinvestors";

/* ── Helpers ───────────────────────────────────── */

function fmtBig(n: number, currency: string) {
  const sym = currency === "USD" ? "$" : "";
  const suffix = currency === "USD" ? "" : ` ${currency}`;
  const abs = Math.abs(n);
  const s =
    abs >= 1e12 ? `${(abs / 1e12).toFixed(2)}T`
    : abs >= 1e9 ? `${(abs / 1e9).toFixed(2)}B`
    : abs >= 1e6 ? `${(abs / 1e6).toFixed(1)}M`
    : `${(abs / 1e3).toFixed(0)}K`;
  return `${n < 0 ? "-" : ""}${sym}${s}${suffix}`;
}

const fmtX = (n: number | null) => (n == null ? "—" : `${n.toFixed(1)}x`);
const fmtPct = (n: number | null) => (n == null ? "—" : `${(n * 100).toFixed(1)}%`);

function changeLabel(c?: ChangeType, p?: number) {
  if (!c) return null;
  if (c === "new") return { text: "Buy", up: true };
  if (c === "sold") return { text: "Sell", up: false };
  const pct = p! < 0.01 ? "<1%" : `${Math.round(p! * 100)}%`;
  return { text: `${c === "add" ? "Add" : "Reduce"} ${pct}`, up: c === "add" };
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground/70">{sub}</p>}
    </div>
  );
}

/* ── Ownership lookups ─────────────────────────── */

const OWNERS_SHOWN = 8;

// Every tracked manager holding any share class of this ticker's issuer
// (BRK-B finds BRK-A holders too); featured managers first
function findOwners(index: SuperinvestorsJson | null, latest: LatestHoldingsJson | null, ticker: string): Owner[] {
  if (!index || !latest) return [];
  const key = issuerKeyForTicker(latest, ticker);
  if (!key) return [];
  const owners = buildIssuers(latest, index.managers).get(key)?.owners ?? [];
  return [...owners].sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.w - a.w);
}

/* ── Component ─────────────────────────────────── */

export function StockSnapshot({ ticker }: { ticker: string }) {
  const [stats, setStats] = useState<StockStats | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [index, setIndex] = useState<SuperinvestorsJson | null>(null);
  const [latest, setLatest] = useState<LatestHoldingsJson | null>(null);
  const [buys, setBuys] = useState<InsiderBuy[]>([]);
  const [buysWindow, setBuysWindow] = useState<string | null>(null);

  // Mounted with key={ticker}, so state starts fresh per ticker
  useEffect(() => {
    fetch(`/api/stock/stats?ticker=${encodeURIComponent(ticker)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((d: StockStats) => setStats(d))
      .catch(() => setStatsError(true));
    fetch("/superinvestors.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((d: SuperinvestorsJson | null) => d && setIndex(d))
      .catch(() => {});
    fetch("/superinvestors/latest.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((d: LatestHoldingsJson | null) => d && setLatest(d))
      .catch(() => {});
    fetch("/insider-buys.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((d: InsiderBuysJson | null) => {
        if (!d) return;
        setBuys(d.buys.filter((b) => b.ticker === ticker));
        setBuysWindow(d.from);
      })
      .catch(() => {});
  }, [ticker]);

  const owners = useMemo(() => findOwners(index, latest, ticker), [index, latest, ticker]);
  const favCount = owners.filter((o) => o.favorite).length;

  if (statsError && !owners.length && !buys.length) return null;

  const cur = stats?.currency ?? "USD";
  const rangePos =
    stats?.price != null && stats.low52 != null && stats.high52 != null && stats.high52 > stats.low52
      ? (stats.price - stats.low52) / (stats.high52 - stats.low52)
      : null;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Key stats */}
      <Card className="lg:col-span-2">
        <CardContent className="pt-5">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium">Key Stats</p>
            {stats?.sector && (
              <p className="text-xs text-muted-foreground">
                {stats.sector} · {stats.industry}
              </p>
            )}
          </div>
          {!stats && !statsError && <p className="text-sm text-muted-foreground animate-pulse">Loading stats…</p>}
          {statsError && <p className="text-sm text-muted-foreground">Stats unavailable for {ticker}.</p>}
          {stats && (
            <>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                <Stat
                  label="Price"
                  value={stats.price != null ? `${stats.price.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${cur}` : "—"}
                  sub={stats.changePct != null ? `${stats.changePct >= 0 ? "+" : ""}${(stats.changePct * 100).toFixed(2)}% today` : undefined}
                />
                <Stat label="Market Cap" value={stats.marketCap != null ? fmtBig(stats.marketCap, cur) : "—"} />
                <Stat label="P/E (ttm)" value={fmtX(stats.trailingPE)} sub="GAAP earnings" />
                <Stat label="Forward P/E" value={fmtX(stats.forwardPE)} sub="analyst estimates" />
                <Stat label="P/B" value={fmtX(stats.priceToBook)} />
                <Stat label="EPS (ttm)" value={stats.eps != null ? stats.eps.toFixed(2) : "—"} />
                <Stat label="Dividend Yield" value={fmtPct(stats.dividendYield)} />
                <Stat label="Beta (5y)" value={stats.beta != null ? stats.beta.toFixed(2) : "—"} />
                <Stat label="Profit Margin" value={fmtPct(stats.profitMargin)} />
                <Stat label="Operating Margin" value={fmtPct(stats.operatingMargin)} />
                <Stat label="ROE" value={fmtPct(stats.roe)} />
                <Stat label="Debt / Equity" value={stats.debtToEquity != null ? `${stats.debtToEquity.toFixed(2)}x` : "—"} />
                <Stat label="Revenue (ttm)" value={stats.revenue != null ? fmtBig(stats.revenue, cur) : "—"} />
                <Stat label="Free Cash Flow" value={stats.freeCashflow != null ? fmtBig(stats.freeCashflow, cur) : "—"} />
                <Stat label="Employees" value={stats.employees != null ? stats.employees.toLocaleString() : "—"} />
              </div>
              {rangePos != null && (
                <div className="mt-5">
                  <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
                    <span>52w low {stats.low52!.toFixed(2)}</span>
                    <span>52w high {stats.high52!.toFixed(2)}</span>
                  </div>
                  <div className="relative h-1.5 rounded-full bg-zinc-800">
                    <div
                      className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-emerald-500"
                      style={{ left: `${Math.min(Math.max(rangePos, 0), 1) * 100}%` }}
                      title={`${Math.round(rangePos * 100)}% of 52-week range`}
                    />
                  </div>
                </div>
              )}
              {stats.financialCurrency && stats.financialCurrency !== cur && (
                <p className="mt-4 text-[10px] text-yellow-500/80">
                  Reports in {stats.financialCurrency} but trades in {cur} — Yahoo&apos;s P/E, EPS and
                  revenue may mix the two currencies.
                </p>
              )}
              <p className="mt-4 text-[10px] text-muted-foreground/70">
                Yahoo Finance. Trailing figures are consolidated GAAP — not adjusted for
                attributable share like the five-factor numbers below.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {/* Superinvestor ownership */}
        <Card>
          <CardContent className="pt-5">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <p className="text-sm font-medium">Superinvestors</p>
              {index && owners.length > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  {favCount} featured · {owners.length} of {index.managers.length}
                </p>
              )}
            </div>
            {!owners.length ? (
              <p className="text-xs text-muted-foreground">None of the tracked managers hold {ticker}.</p>
            ) : (
              <ul className="space-y-2">
                {owners.slice(0, OWNERS_SHOWN).map((o) => {
                  const c = changeLabel(o.c, o.p);
                  return (
                    <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
                      <Link href={`/superinvestors?m=${o.id}`} className="truncate hover:underline">
                        {o.favorite && <span className="mr-1 text-emerald-400">★</span>}
                        {o.name}
                      </Link>
                      <span className="flex shrink-0 items-center gap-2 text-xs">
                        {c && <span className={c.up ? "text-emerald-400" : "text-red-400"}>{c.text}</span>}
                        <span className="font-medium">{(o.w * 100).toFixed(o.w < 0.001 ? 2 : 1)}%</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {owners.length > 0 && (
              <p className="mt-3 text-[10px] text-muted-foreground/70">
                % of each 13F portfolio, latest quarter
                {owners.length > OWNERS_SHOWN && ` · +${owners.length - OWNERS_SHOWN} more`}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Insider buys */}
        <Card>
          <CardContent className="pt-5">
            <p className="mb-3 text-sm font-medium">Insider Buys</p>
            {!buys.length ? (
              <p className="text-xs text-muted-foreground">
                No open-market insider purchases{buysWindow ? ` since ${buysWindow}` : ""}.
              </p>
            ) : (
              <ul className="space-y-2">
                {buys.slice(0, 6).map((b) => (
                  <li key={b.accession} className="text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="truncate">{b.owner}</span>
                      <span className="shrink-0 font-medium">{fmtBig(b.value, "USD")}</span>
                    </div>
                    <div className="flex justify-between gap-2 text-[10px] text-muted-foreground">
                      <span className="truncate">{b.role}</span>
                      <span className="shrink-0">
                        {b.lastTrade} @ ${b.avgPrice.toFixed(2)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Link href={`/insiders`} className="mt-3 block text-[10px] text-muted-foreground/70 hover:underline">
              All insider buys →
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

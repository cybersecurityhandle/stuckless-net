"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import { filingIndexUrl, type InsiderBuy, type InsiderBuysJson } from "@/lib/insiders";
import { buildIssuers, type LatestHoldingsJson, type Owner, type SuperinvestorsJson } from "@/lib/superinvestors";

const MIN_VALUES = [
  { value: 10_000, label: "≥ $10K" },
  { value: 100_000, label: "≥ $100K" },
  { value: 1_000_000, label: "≥ $1M" },
];

/* ── Helpers ───────────────────────────────────── */

function fmtMoney(n: number) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${(n / 1e3).toFixed(0)}K`;
}

// How much the purchase grew the insider's stake (null if they had none
// before, or holdings weren't reported)
function stakeIncrease(b: InsiderBuy): number | null {
  if (b.sharesAfter == null) return null;
  const before = b.sharesAfter - b.shares;
  return before > 0 ? b.shares / before : null;
}

// Your picks by name, everyone else as a count: "Buffett, Akre +12"
function HeldByTag({ owners }: { owners: Owner[] }) {
  const favs = owners.filter((o) => o.favorite).map((o) => o.name.split(" ").pop());
  const others = owners.length - favs.length;
  const label = favs.length
    ? `${favs.join(", ")}${others ? ` +${others}` : ""}`
    : `${others} superinvestor${others > 1 ? "s" : ""}`;
  return (
    <span
      className="rounded border border-blue-500/30 bg-blue-500/15 px-1.5 py-0.5 text-xs text-blue-400"
      title={`Held by ${owners.map((o) => o.name).join(", ")}`}
    >
      {label}
    </span>
  );
}

/* ── Component ─────────────────────────────────── */

export function InsiderFeed() {
  const [data, setData] = useState<InsiderBuysJson | null>(null);
  const [error, setError] = useState(false);
  const [heldBy, setHeldBy] = useState<Record<string, Owner[]>>({});
  const [minValue, setMinValue] = useState(100_000);
  const [insidersOnly, setInsidersOnly] = useState(true);
  const [clustersOnly, setClustersOnly] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/insider-buys.json")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((d: InsiderBuysJson) => setData(d))
      .catch(() => setError(true));
    // Tag stocks the tracked superinvestors hold (any share class)
    Promise.all([
      fetch("/superinvestors.json").then((res) => (res.ok ? res.json() : Promise.reject())),
      fetch("/superinvestors/latest.json").then((res) => (res.ok ? res.json() : Promise.reject())),
    ])
      .then(([index, latest]: [SuperinvestorsJson, LatestHoldingsJson]) => {
        const issuers = buildIssuers(latest, index.managers);
        const map: Record<string, Owner[]> = {};
        for (const [cusip, sec] of Object.entries(latest.securities)) {
          const owners = issuers.get(cusip.slice(0, 6))?.owners;
          if (sec.t && owners) map[sec.t] = owners;
        }
        setHeldBy(map);
      })
      .catch(() => {});
  }, []);

  // Distinct insiders buying each ticker across the whole window (10% owners
  // excluded — a fund adding isn't management conviction)
  const clusters = useMemo(() => {
    const map = new Map<string, Set<number>>();
    for (const b of data?.buys ?? []) {
      if (!b.ticker || (b.isTenPct && !b.isOfficer && !b.isDirector)) continue;
      if (!map.has(b.ticker)) map.set(b.ticker, new Set());
      map.get(b.ticker)!.add(b.ownerCik);
    }
    return map;
  }, [data]);

  const rows = useMemo(() => {
    const q = query.trim().toUpperCase();
    return (data?.buys ?? []).filter((b) => {
      if (b.value < minValue) return false;
      if (insidersOnly && !b.isOfficer && !b.isDirector) return false;
      if (clustersOnly && (clusters.get(b.ticker!)?.size ?? 0) < 2) return false;
      if (q && !b.ticker?.includes(q) && !b.issuer.toUpperCase().includes(q) && !b.owner.toUpperCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [data, minValue, insidersOnly, clustersOnly, query, clusters]);

  const totalValue = rows.reduce((s, b) => s + b.value, 0);
  const clusterCount = new Set(rows.filter((b) => (clusters.get(b.ticker!)?.size ?? 0) >= 2).map((b) => b.ticker)).size;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Insider Buys</h1>
        <p className="mt-2 text-muted-foreground">
          Open-market purchases reported on SEC Form 4. Insiders sell for many reasons; they buy
          with their own cash for one.
        </p>
        {data && (
          <p className="mt-1 text-xs text-muted-foreground">
            Filings {data.from} → {data.to} · refreshed {data.updated}
          </p>
        )}
      </div>

      {error && <p className="text-red-400">Couldn&apos;t load insider data.</p>}
      {!data && !error && <p className="text-muted-foreground">Loading…</p>}

      {data && (
        <>
          <Card className="mb-4">
            <CardContent className="flex flex-wrap items-end gap-4 pt-6">
              <div className="min-w-[180px] flex-1">
                <label className="mb-1 block text-xs text-muted-foreground">Search</label>
                <Input
                  placeholder="Ticker, company or insider"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Size</label>
                <select
                  value={minValue}
                  onChange={(e) => setMinValue(Number(e.target.value))}
                  className="h-9 rounded-md border border-border bg-card px-3 text-sm"
                >
                  {MIN_VALUES.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <label className="flex h-9 items-center gap-2 text-sm">
                <input type="checkbox" checked={insidersOnly} onChange={(e) => setInsidersOnly(e.target.checked)} />
                Officers &amp; directors only
              </label>
              <label className="flex h-9 items-center gap-2 text-sm">
                <input type="checkbox" checked={clustersOnly} onChange={(e) => setClustersOnly(e.target.checked)} />
                Cluster buys only
              </label>
            </CardContent>
          </Card>

          <p className="mb-3 text-sm text-muted-foreground">
            {rows.length} purchases · {fmtMoney(totalValue)} total · {clusterCount} cluster{clusterCount === 1 ? "" : "s"}
          </p>

          <Card>
            <CardContent className="overflow-x-auto pt-6">
              <Table className="min-w-[900px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Filed</TableHead>
                    <TableHead>Ticker</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Insider</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="text-right">Avg Price</TableHead>
                    <TableHead className="text-right">Stake +</TableHead>
                    <TableHead>Signals</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((b) => {
                    const inc = stakeIncrease(b);
                    const cluster = clusters.get(b.ticker!)?.size ?? 0;
                    const holders = heldBy[b.ticker!];
                    return (
                      <TableRow key={b.accession}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          <a
                            href={filingIndexUrl(b.issuerCik, b.accession)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-foreground hover:underline"
                            title={`Traded ${b.firstTrade}${b.lastTrade !== b.firstTrade ? ` → ${b.lastTrade}` : ""}`}
                          >
                            {b.filed}
                          </a>
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/finance?ticker=${encodeURIComponent(b.ticker!)}`}
                            className="font-mono font-medium text-emerald-400 hover:underline"
                          >
                            {b.ticker}
                          </Link>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate" title={b.issuer}>{b.issuer}</TableCell>
                        <TableCell className="max-w-[220px]">
                          <div className="truncate" title={b.owner}>{b.owner}</div>
                          <div className="truncate text-[10px] text-muted-foreground" title={b.role}>
                            {b.role}{!b.direct && " · indirect"}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">{fmtMoney(b.value)}</TableCell>
                        <TableCell className="text-right">${b.avgPrice.toFixed(2)}</TableCell>
                        <TableCell className="text-right" title="Shares bought ÷ shares held before">
                          {inc == null ? <span className="text-muted-foreground">new</span> : `+${Math.round(inc * 100)}%`}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {cluster >= 2 && (
                              <span className="rounded border border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0.5 text-xs text-emerald-400">
                                Cluster ×{cluster}
                              </span>
                            )}
                            {holders && <HeldByTag owners={holders} />}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

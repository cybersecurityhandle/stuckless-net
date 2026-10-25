"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PriceHistory } from "@/app/api/stock/history/route";
import {
  eventsShardUrl,
  issuerKeyForTicker,
  type EventsJson,
  type LatestHoldingsJson,
  type MoveEvent,
  type SuperinvestorsJson,
} from "@/lib/superinvestors";
import { ScopeToggle, type Scope } from "@/components/superinvestors";

// Price since 2013 with each quarter's superinvestor buying and selling
// marked at the quarter-end price: who bought near the lows, who sold the top.

const LINE = "var(--color-zinc-400)";
const BUY = "#10b981";
const SELL = "#ef4444";
const TOOLTIP_STYLE = { backgroundColor: "var(--color-zinc-900)", border: "1px solid var(--color-zinc-800)", borderRadius: "8px", fontSize: "12px" };

interface Marker {
  t: number; // quarter end, ms
  price: number;
  buys: string[];
  sells: string[];
}

function closeAt(points: [number, number][], t: number): number | null {
  // Last weekly close on or before t
  let lo = 0;
  let hi = points.length - 1;
  if (!points.length || points[0][0] > t) return null;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (points[mid][0] <= t) lo = mid;
    else hi = mid - 1;
  }
  return points[lo][1];
}

function label(e: MoveEvent, names: Map<string, string>) {
  const [, id, c, p] = e;
  const who = names.get(id) ?? id;
  const what = c === "new" ? "buy" : c === "sold" ? "sold out" : `${c} ${p != null ? Math.round(p * 100) + "%" : ""}`;
  return `${who} (${what.trim()})`;
}

export function SuperinvestorMovesChart({ ticker }: { ticker: string }) {
  const [prices, setPrices] = useState<PriceHistory | null>(null);
  const [events, setEvents] = useState<MoveEvent[] | null>(null);
  const [index, setIndex] = useState<SuperinvestorsJson | null>(null);
  const [scope, setScope] = useState<Scope>("favorites");

  // Mounted with key={ticker}
  useEffect(() => {
    fetch(`/api/stock/history?ticker=${encodeURIComponent(ticker)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((d: PriceHistory) => setPrices(d))
      .catch(() => {});
    Promise.all([
      fetch("/superinvestors.json").then((res) => (res.ok ? res.json() : Promise.reject())),
      fetch("/superinvestors/latest.json").then((res) => (res.ok ? res.json() : Promise.reject())),
    ])
      .then(async ([idx, lat]: [SuperinvestorsJson, LatestHoldingsJson]) => {
        setIndex(idx);
        // Prefer the current-holdings mapping; fall back to scanning the shard
        // for a ticker nobody holds any more is out of scope (no key)
        const key = issuerKeyForTicker(lat, ticker);
        if (!key) return setEvents([]);
        const shard: EventsJson = await (await fetch(eventsShardUrl(key))).json();
        setEvents(shard[key] ?? []);
      })
      .catch(() => setEvents([]));
  }, [ticker]);

  const names = useMemo(() => new Map((index?.managers ?? []).map((m) => [m.id, m.name])), [index]);
  const favs = useMemo(() => new Set((index?.managers ?? []).filter((m) => m.favorite).map((m) => m.id)), [index]);

  const { line, buys, sells, count } = useMemo(() => {
    const pts: [number, number][] = (prices?.points ?? []).map(([d, c]) => [Date.parse(d), c]);
    const byQuarter = new Map<string, Marker>();
    let count = 0;
    for (const e of events ?? []) {
      if (scope === "favorites" && !favs.has(e[1])) continue;
      const t = Date.parse(e[0]);
      const price = closeAt(pts, t);
      if (price == null) continue;
      const m = byQuarter.get(e[0]) ?? { t, price, buys: [], sells: [] };
      (e[4] >= 0 ? m.buys : m.sells).push(label(e, names));
      byQuarter.set(e[0], m);
      count++;
    }
    const markers = [...byQuarter.values()];
    return {
      line: pts.map(([t, c]) => ({ t, close: c })),
      // Offset markers slightly off the line so buys and sells in the same
      // quarter don't overlap
      buys: markers.filter((m) => m.buys.length).map((m) => ({ ...m, y: m.price * 0.93 })),
      sells: markers.filter((m) => m.sells.length).map((m) => ({ ...m, y: m.price * 1.07 })),
      count,
    };
  }, [prices, events, scope, favs, names]);

  if (!prices || !prices.points.length || events == null) return null;

  return (
    <section className="pt-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Superinvestor moves on {ticker}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Weekly price since 2013; markers at quarter-end where 13Fs show buying (below the line) or
            selling (above). {count} moves shown.
          </p>
        </div>
        <ScopeToggle scope={scope} onChange={setScope} />
      </div>
      <div className="mt-4 rounded-md border border-border p-2">
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={line} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid stroke="var(--color-zinc-800)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(t) => new Date(t).getUTCFullYear().toString()}
              tick={{ fontSize: 11, fill: "var(--color-zinc-400)" }}
              axisLine={false}
              tickLine={false}
              minTickGap={32}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--color-zinc-400)" }}
              axisLine={false}
              tickLine={false}
              width={52}
              tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              content={({ payload }) => {
                const d = payload?.[0]?.payload as (Marker & { close?: number }) | { t: number; close: number } | undefined;
                if (!d) return null;
                const date = new Date(d.t).toISOString().split("T")[0];
                if ("buys" in d) {
                  return (
                    <div style={TOOLTIP_STYLE} className="max-w-[320px] px-3 py-2">
                      <div className="font-medium">Quarter ending {date} · ${d.price.toFixed(2)}</div>
                      {d.buys.length > 0 && <div className="mt-1 text-emerald-400">Bought: {d.buys.join(", ")}</div>}
                      {d.sells.length > 0 && <div className="mt-1 text-red-400">Sold: {d.sells.join(", ")}</div>}
                    </div>
                  );
                }
                return (
                  <div style={TOOLTIP_STYLE} className="px-3 py-2">
                    {date} · ${(d as { close: number }).close.toFixed(2)}
                  </div>
                );
              }}
            />
            <Line dataKey="close" stroke={LINE} strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Scatter data={buys} dataKey="y" fill={BUY} shape="triangle" isAnimationActive={false} />
            <Scatter data={sells} dataKey="y" fill={SELL} shape="triangle" isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span style={{ color: BUY }}>▲</span>Bought / added that quarter</span>
        <span className="flex items-center gap-1.5"><span style={{ color: SELL }}>▲</span>Reduced / sold</span>
        <span>13F dates are quarter-ends — the trades happened sometime in the quarter.</span>
      </div>
    </section>
  );
}

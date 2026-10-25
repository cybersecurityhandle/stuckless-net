"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BacktestJson, BacktestManager, FiveFactorJson, SuperinvestorsJson } from "@/lib/superinvestors";
import {
  caption,
  fmtPct,
  frame,
  ScopeToggle,
  table,
  td,
  th,
  zebra,
  type Scope,
} from "@/components/superinvestors";

// Copycat backtest: buy each 13F the day it's public, hold to the next.
// Answers "who is worth following through 13Fs" — not "who is a great
// investor" (13Fs miss shorts, non-US stocks, cash and intra-quarter trades).

const MANAGER = "#10b981";
const BENCH = "var(--color-zinc-500)";
const TOOLTIP_STYLE = { backgroundColor: "var(--color-zinc-900)", border: "1px solid var(--color-zinc-800)", borderRadius: "8px", fontSize: "12px" };

function useJson<T>(url: string): T | null | undefined {
  // undefined = loading, null = not available
  const [data, setData] = useState<T | null | undefined>(undefined);
  useEffect(() => {
    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((d: T | null) => setData(d))
      .catch(() => setData(null));
  }, [url]);
  return data;
}

const signed = (n: number | null | undefined, d = 1) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${(n * 100).toFixed(d)}%`);

function GrowthChart({ r, bench, name }: { r: BacktestManager; bench: string; name: string }) {
  const b = new Map(r.bench ?? []);
  const data = r.points.map(([d, v]) => ({
    t: Date.parse(d),
    manager: Math.round(v * 10_000),
    bench: b.has(d) ? Math.round(b.get(d)! * 10_000) : null,
  }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
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
          width={60}
          tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}K`}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelFormatter={(t) => new Date(Number(t)).toISOString().split("T")[0]}
          formatter={(v, n) => [`$${Number(v).toLocaleString()}`, n === "manager" ? `Copy ${name}` : bench]}
        />
        <Line dataKey="bench" stroke={BENCH} strokeWidth={2} dot={false} strokeDasharray="4 3" isAnimationActive={false} />
        <Line dataKey="manager" stroke={MANAGER} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function BacktestView({ index, onSelect }: { index: SuperinvestorsJson; onSelect: (id: string) => void }) {
  const bt = useJson<BacktestJson>("/superinvestors/backtest.json");
  const [scope, setScope] = useState<Scope>("all");
  const [picked, setPicked] = useState<string | null>(null);
  const byId = useMemo(() => new Map(index.managers.map((m) => [m.id, m])), [index]);

  const rows = useMemo(
    () =>
      Object.entries(bt?.managers ?? {})
        .filter(([id]) => scope === "all" || byId.get(id)?.favorite)
        .filter(([, r]) => r.cagr != null && r.coverage >= 0.5)
        .sort((a, b) => (b[1].excess ?? -9) - (a[1].excess ?? -9)),
    [bt, scope, byId]
  );

  if (bt === undefined) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!bt) return <p className="text-sm text-muted-foreground">Backtest data isn&apos;t built yet (npm run refresh-backtest).</p>;

  const sel = picked ?? rows[0]?.[0];
  const selRow = sel ? bt.managers[sel] : null;
  const beat = rows.filter(([, r]) => (r.excess ?? 0) > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Copycat backtest</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Buy each manager&apos;s top 30 13F positions (as weighted) on the day the filing became public,
            hold until the next one, repeat — dividends included, vs {bt.bench} over the same dates.{" "}
            <span className="text-foreground">{beat}</span> of {rows.length} beat {bt.bench} this way.
          </p>
        </div>
        <ScopeToggle scope={scope} onChange={setScope} />
      </div>

      {selRow && sel && (
        <div className="rounded-md border border-border p-3">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span>
              <span className="font-medium">$10K copying {byId.get(sel)?.name}</span>
              <span className="text-muted-foreground"> since {selRow.start}</span>
            </span>
            <span className="text-muted-foreground">
              <span className="text-emerald-400">— copy</span> · <span>- - {bt.bench}</span>
            </span>
          </div>
          <GrowthChart r={selRow} bench={bt.bench} name={byId.get(sel)?.name ?? sel} />
        </div>
      )}

      <div className={frame}>
        <table className={`${table} min-w-[820px]`}>
          <thead>
            <tr className="text-left">
              <th className={th}>Manager</th>
              <th className={`${th} text-right`}>Since</th>
              <th className={`${th} text-right`}>Copycat<br />CAGR</th>
              <th className={`${th} text-right`}>{bt.bench}<br />Same Dates</th>
              <th className={`${th} text-right`}>Excess<br />/ yr</th>
              <th className={`${th} text-right`} title="At quarterly rebalance points — intra-quarter drawdowns were deeper">Max<br />Drawdown</th>
              <th className={`${th} text-right`} title="Average share of each portfolio with price data (delisted names drop out)">Coverage</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([id, r]) => {
              const m = byId.get(id);
              return (
                <tr
                  key={id}
                  onClick={() => setPicked(id)}
                  className={`cursor-pointer border-b border-border/30 ${zebra} ${id === sel ? "!bg-emerald-500/10" : ""}`}
                >
                  <td className={td}>
                    <span className="mr-1.5 inline-block w-3 text-emerald-400">{m?.favorite ? "★" : ""}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(id);
                      }}
                      className="font-medium text-emerald-400 hover:underline"
                    >
                      {m?.name ?? id}
                    </button>
                  </td>
                  <td className={`${td} text-right text-muted-foreground`}>{r.start.slice(0, 4)}</td>
                  <td className={`${td} text-right font-medium`}>{fmtPct(r.cagr!)}</td>
                  <td className={`${td} text-right text-muted-foreground`}>{r.benchCagr != null ? fmtPct(r.benchCagr) : "—"}</td>
                  <td className={`${td} text-right ${(r.excess ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>{signed(r.excess)}</td>
                  <td className={`${td} text-right text-red-400`}>{fmtPct(r.maxDrawdown, 0)}</td>
                  <td className={`${td} text-right text-muted-foreground`}>{fmtPct(r.coverage, 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        13Fs omit shorts, cash, non-US listings and intra-quarter trades, and positions are bought up to
        ~45 days after the quarter they describe — this measures how useful following the filings is,
        not the manager&apos;s actual returns. Managers under 50% coverage are hidden.
      </p>
    </div>
  );
}

/* ── Manager page card: five factors + copycat ── */

const FACTOR_ROWS: [keyof FiveFactorJson["managers"][string]["factors"], string][] = [
  ["sales", "Dollar sales"],
  ["shares", "Share count"],
  ["margin", "Margin"],
  ["pe", "P/E multiple"],
  ["dividends", "Dividends"],
];

export function ManagerReturnsCard({ id }: { id: string }) {
  const ff = useJson<FiveFactorJson>("/superinvestors/fivefactor.json");
  const bt = useJson<BacktestJson>("/superinvestors/backtest.json");
  const f = ff?.managers[id];
  const r = bt?.managers[id];
  if (!f && !r) return null;
  const max = f ? Math.max(...FACTOR_ROWS.map(([k]) => Math.abs(f.factors[k])), 0.01) : 1;

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      {f && ff && (
        <div className="rounded-md border border-border p-4">
          <h3 className={caption}>Where the returns came from — top holdings, last {ff.window} years</h3>
          <p className="mt-1 mb-3 text-xs text-muted-foreground">
            Five-factor decomposition of each top-10 holding, weighted by today&apos;s portfolio weight
            ({fmtPct(f.coverage, 0)} of the portfolio decomposable).
          </p>
          {FACTOR_ROWS.map(([k, name]) => {
            const v = f.factors[k];
            return (
              <div key={k} className="grid grid-cols-[110px_1fr_60px] items-center gap-2 py-1 text-sm">
                <span className="text-muted-foreground">{name}</span>
                <div className="relative h-2.5 rounded-sm bg-muted/30">
                  <div
                    className={`absolute top-0 h-2.5 rounded-sm ${k === "dividends" ? "bg-blue-500" : v >= 0 ? "bg-emerald-500" : "bg-red-500"}`}
                    style={{ left: v >= 0 ? "50%" : `${50 - (Math.abs(v) / max) * 50}%`, width: `${(Math.abs(v) / max) * 50}%` }}
                  />
                  <div className="absolute top-[-2px] left-1/2 h-[14px] w-px bg-border" />
                </div>
                <span className="text-right tabular-nums">{signed(v)}</span>
              </div>
            );
          })}
          <div className="mt-2 flex justify-between border-t border-border pt-2 text-sm">
            <span className="font-medium">Annual return</span>
            <span className="font-semibold tabular-nums">{signed(f.factors.total)}</span>
          </div>
        </div>
      )}
      {r && bt && (
        <div className="rounded-md border border-border p-4">
          <h3 className={caption}>Copycat backtest</h3>
          <p className="mt-1 mb-2 text-xs text-muted-foreground">
            Buying each 13F the day it was public, holding to the next — since {r.start}.
          </p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-xs text-muted-foreground">Copycat CAGR</div>
              <div className="text-lg font-semibold tabular-nums">{r.cagr != null ? fmtPct(r.cagr) : "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{bt.bench}</div>
              <div className="text-lg font-semibold tabular-nums text-muted-foreground">{r.benchCagr != null ? fmtPct(r.benchCagr) : "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Excess / yr</div>
              <div className={`text-lg font-semibold tabular-nums ${(r.excess ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>{signed(r.excess)}</div>
            </div>
          </div>
          <GrowthChart r={r} bench={bt.bench} name="manager" />
        </div>
      )}
    </div>
  );
}

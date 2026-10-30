"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { IsolationGroup, IsolationJson, IsolationStats, SuperinvestorsJson } from "@/lib/superinvestors";
import { caption, frame, table, td, th, wide, zebra } from "@/components/superinvestors";
import { signed, useJson } from "@/components/superinvestor-backtest";

// Isolation vs performance: are lone-wolf portfolios better or worse to copy
// than ones that look like everyone else's? Built by refresh-isolation.
// Deliberately about the groups, not individuals: no per-manager returns or
// red/green verdicts (the backtest tab already ranks managers). Linked from
// the map rather than a tab of its own.

const FAV = "#10b981";
const OTHER = "var(--color-zinc-500)";
const TOOLTIP_STYLE = { backgroundColor: "var(--color-zinc-900)", border: "1px solid var(--color-zinc-800)", borderRadius: "8px", fontSize: "12px", color: "var(--color-zinc-100)" };
const AXIS_TICK = { fontSize: 11, fill: "var(--color-zinc-400)" };

type Metric = "avg" | "closest";

interface Point {
  id: string;
  name: string;
  favorite: boolean;
  x: number;
  y: number;
  years: number;
}

// Plain-language strength, for the headline
function describe(r: number) {
  const a = Math.abs(r);
  if (a < 0.1) return "no meaningful link";
  return `a ${a < 0.3 ? "weak" : "moderate"} ${r > 0 ? "positive" : "negative"} link`;
}

const fmtSim = (x: number) => `${(x * 100).toFixed(1)}%`;

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className={caption}>{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {note && <div className="mt-0.5 text-xs text-muted-foreground">{note}</div>}
    </div>
  );
}

function GroupTable({ groups, title }: { groups: IsolationGroup[]; title: string }) {
  return (
    <div className={frame}>
      <table className={table}>
        <thead>
          <tr className="text-left">
            <th className={th}>{title}</th>
            <th className={`${th} text-right`}>Managers</th>
            <th className={`${th} ${wide} text-right`}>Overlap</th>
            <th className={`${th} text-right`}>Mean excess / yr</th>
            <th className={`${th} ${wide} text-right`}>Median</th>
            <th className={`${th} text-right`}>Beat SPY</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.label} className={`border-b border-border/30 ${zebra}`}>
              <td className={`${td} font-medium`}>{g.label}</td>
              <td className={`${td} text-right`}>{g.ids.length}</td>
              <td className={`${td} ${wide} text-right text-muted-foreground`}>
                {fmtSim(g.sim[0])}–{fmtSim(g.sim[1])}
              </td>
              <td className={`${td} text-right`}>{signed(g.meanExcess)}</td>
              <td className={`${td} ${wide} text-right`}>{signed(g.medianExcess)}</td>
              <td className={`${td} text-right text-muted-foreground`}>
                {g.beat} of {g.ids.length}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function IsolationView({ index, onSelect }: { index: SuperinvestorsJson; onSelect: (id: string) => void }) {
  const data = useJson<IsolationJson>("/superinvestors/isolation.json");
  const [metric, setMetric] = useState<Metric>("avg");
  const byId = useMemo(() => new Map(index.managers.map((m) => [m.id, m])), [index]);

  const points = useMemo<Point[]>(
    () =>
      Object.entries(data?.managers ?? {}).map(([id, r]) => ({
        id,
        name: byId.get(id)?.name ?? id,
        favorite: !!byId.get(id)?.favorite,
        x: metric === "avg" ? r.avgSim : r.maxSim,
        y: r.avgExcess,
        years: r.years.length,
      })),
    [data, metric, byId]
  );

  // Least-squares line, drawn faintly so the cloud stays the subject
  const trend = useMemo((): [{ x: number; y: number }, { x: number; y: number }] | null => {
    if (points.length < 3) return null;
    const mx = points.reduce((s, p) => s + p.x, 0) / points.length;
    const my = points.reduce((s, p) => s + p.y, 0) / points.length;
    const sxy = points.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
    const sxx = points.reduce((s, p) => s + (p.x - mx) ** 2, 0);
    if (!sxx) return null;
    const slope = sxy / sxx;
    const x0 = Math.min(...points.map((p) => p.x));
    const x1 = Math.max(...points.map((p) => p.x));
    return [
      { x: x0, y: my + slope * (x0 - mx) },
      { x: x1, y: my + slope * (x1 - mx) },
    ];
  }, [points]);

  // Round 10% steps spanning the data
  const yTicks = useMemo(() => {
    if (!points.length) return [];
    const lo = Math.floor(Math.min(0, ...points.map((p) => p.y)) * 10);
    const hi = Math.ceil(Math.max(0, ...points.map((p) => p.y)) * 10);
    return Array.from({ length: hi - lo + 1 }, (_, i) => (lo + i) / 10);
  }, [points]);

  if (data === undefined) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Isolation data isn&apos;t built yet (npm run refresh-isolation).</p>;

  const s = data.stats;
  const c: IsolationStats = metric === "avg" ? s.avg : s.closest;
  const xLabel = metric === "avg" ? "Average overlap with every other manager" : "Overlap with the closest manager";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Lone wolves vs the pack</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Do managers whose portfolios look like nobody else&apos;s do better, copied through their 13Fs, than
            those who own what their peers own? Overlap is the cosine similarity of position sizes, recomputed
            every quarter from {data.years[0]}; returns are the copycat backtest&apos;s, chained into calendar
            years and compared with {data.bench} over the same dates.
          </p>
        </div>
        <div className="flex rounded-md border border-border p-0.5 text-sm">
          {(["avg", "closest"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`rounded px-3 py-1 transition-colors ${
                metric === m ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m === "avg" ? "Vs everyone" : "Vs closest match"}
            </button>
          ))}
        </div>
      </div>

      <p className="text-sm">
        Across {s.managers} managers, isolation and excess return show{" "}
        <span className="font-medium">{describe(c.pearson)}</span> (r = {c.pearson.toFixed(2)}). Dropping any one
        manager moves r between {c.looMin.toFixed(2)} and {c.looMax.toFixed(2)}.
        {` Isolated half: ${signed(c.halves[0].meanExcess)}/yr on average; clustered half: ${signed(c.halves[1].meanExcess)}/yr.`}
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Correlation (r)" value={c.pearson.toFixed(2)} note={`rank: ${c.spearman.toFixed(2)}`} />
        <Stat label="Year by year (r)" value={c.pooled.toFixed(2)} note="manager-years, within each year" />
        <Stat label="Managers" value={String(s.managers)} note={`${data.minYears}+ complete years each`} />
        <Stat label="Manager-years" value={String(s.managerYears)} note={`${data.years[0]}–${data.years[1]}`} />
      </div>

      <div className="rounded-md border border-border p-3">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span className="font-medium">{xLabel} vs average annual excess return</span>
          <span className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: FAV }} /> Featured
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: OTHER }} /> Other
            </span>
            <span>- - trend</span>
          </span>
        </div>
        <ResponsiveContainer width="100%" height={380}>
          <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
            <CartesianGrid stroke="var(--color-zinc-800)" strokeDasharray="3 3" />
            <XAxis
              dataKey="x"
              type="number"
              domain={[0, "auto"]}
              tick={AXIS_TICK}
              tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`}
              axisLine={false}
              tickLine={false}
              label={{ value: "← isolated · clustered →", position: "insideBottom", offset: -16, fontSize: 11, fill: "var(--color-zinc-400)" }}
            />
            <YAxis
              dataKey="y"
              type="number"
              domain={yTicks.length ? [yTicks[0], yTicks[yTicks.length - 1]] : undefined}
              ticks={yTicks}
              tick={AXIS_TICK}
              tickFormatter={(v) => signed(Number(v), 0)}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <ReferenceLine y={0} stroke="var(--color-zinc-500)" />
            {trend && <ReferenceLine segment={trend} stroke="var(--color-zinc-400)" strokeDasharray="5 4" strokeWidth={1.5} ifOverflow="extendDomain" />}
            <Tooltip
              cursor={false}
              contentStyle={TOOLTIP_STYLE}
              content={({ active, payload }) => {
                const p = active ? (payload?.[0]?.payload as Point | undefined) : undefined;
                if (!p) return null;
                return (
                  <div style={TOOLTIP_STYLE} className="px-3 py-2">
                    <div className="font-medium">{p.name}</div>
                    <div>Overlap {fmtSim(p.x)}</div>
                    <div className="text-zinc-400">{p.years} years included</div>
                  </div>
                );
              }}
            />
            {[false, true].map((fav) => (
              <Scatter
                key={String(fav)}
                data={points.filter((p) => p.favorite === fav)}
                fill={fav ? FAV : OTHER}
                fillOpacity={fav ? 0.95 : 0.7}
                stroke="var(--background)"
                strokeWidth={2}
                isAnimationActive={false}
                className="cursor-pointer"
                onClick={(p) => onSelect((p as unknown as { payload: Point }).payload.id)}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-3">
        <GroupTable groups={c.halves} title="Split at the median overlap" />
        <GroupTable groups={c.quartiles} title="Quartiles" />
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Read this as suggestive, not proof</p>
        <p>
          13F returns are approximations: US-listed long positions only, so no shorts, cash, bonds or non-US
          holdings; filings arrive up to 45 days after quarter end; trades within a quarter are invisible. Each
          quarter&apos;s top 30 positions are priced from monthly closes, dividends included, and names without
          price history (delisted, no ticker) drop out.
        </p>
        <p>
          A few dozen managers is a small sample, and one or two outliers can move the correlation — hence the
          leave-one-out range. Only managers on today&apos;s list are included, so ones who stopped filing or were
          dropped are missing (survivorship bias). A year counts only when all four of its quarters are priced
          and held to the next filing; managers need {data.minYears}+ such years.
        </p>
      </div>
    </div>
  );
}

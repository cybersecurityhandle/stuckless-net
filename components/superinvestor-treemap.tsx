"use client";

import { ResponsiveContainer, Tooltip, Treemap } from "recharts";
import type { ChangeType, HistoryPosition, ManagerHistoryJson } from "@/lib/superinvestors";

// One manager's quarter as boxes sized by weight, colored by last quarter's
// action (Finviz-map style). Status colors: green buy/add, red reduce,
// neutral unchanged — paired with a text label in the tooltip.

const SHOWN = 40;
const COLORS: Record<ChangeType | "none", string> = {
  new: "#059669",
  add: "#047857",
  reduce: "#b91c1c",
  sold: "#b91c1c",
  none: "#3f3f46",
};
const LABEL: Record<ChangeType | "none", string> = {
  new: "New buy",
  add: "Added",
  reduce: "Reduced",
  sold: "Sold",
  none: "Unchanged",
};

interface Cell {
  name: string;
  full: string;
  size: number;
  c: ChangeType | "none";
  [key: string]: unknown;
}

// recharts passes layout props to the custom content renderer
function Box(props: { x?: number; y?: number; width?: number; height?: number; name?: string; c?: ChangeType | "none"; size?: number }) {
  const { x = 0, y = 0, width = 0, height = 0, name, c = "none", size = 0 } = props;
  if (width <= 0 || height <= 0) return null;
  const showLabel = width > 44 && height > 26;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={COLORS[c]} stroke="#0a0a0a" strokeWidth={2} rx={3} />
      {showLabel && (
        <>
          <text x={x + 6} y={y + 16} fill="#fafafa" fontSize={12} fontWeight={600}>{name}</text>
          {height > 40 && (
            <text x={x + 6} y={y + 31} fill="#e4e4e7" fontSize={11}>{(size * 100).toFixed(1)}%</text>
          )}
        </>
      )}
    </g>
  );
}

export function PortfolioTreemap({ history, positions, total }: { history: ManagerHistoryJson; positions: HistoryPosition[]; total: number }) {
  const data: Cell[] = positions.slice(0, SHOWN).map((p) => {
    const s = history.securities[p.k];
    return { name: s.t ?? s.d.split(" ")[0], full: s.d, size: total ? p.v / total : 0, c: p.c ?? "none" };
  });
  return (
    <div>
      <div className="rounded-md border border-border p-1">
        <ResponsiveContainer width="100%" height={460}>
          <Treemap data={data} dataKey="size" isAnimationActive={false} content={<Box />}>
            <Tooltip
              contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px", fontSize: "12px" }}
              formatter={(v, _n, item) => [`${(Number(v) * 100).toFixed(2)}% · ${LABEL[(item.payload as Cell).c]}`, (item.payload as Cell).full]}
            />
          </Treemap>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
        {(["new", "reduce", "none"] as const).map((c) => (
          <span key={c} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLORS[c] }} />
            {c === "new" ? "Bought / added" : LABEL[c]}
          </span>
        ))}
        {positions.length > SHOWN && <span>Top {SHOWN} of {positions.length} positions</span>}
      </div>
    </div>
  );
}

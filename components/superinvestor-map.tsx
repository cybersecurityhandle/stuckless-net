"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SuperinvestorsJson } from "@/lib/superinvestors";
import { fmtMoney, shortName } from "@/components/superinvestors";

// Managers placed by portfolio similarity (classical MDS on 1 − cosine of
// issuer weights, computed in refresh-13f). Near = owns similar things in
// similar sizes. Axes have no units — only distances mean anything.

const FAV = "#10b981";
// Managers whose closest match overlaps less than this sit at roughly equal
// distance from everyone; MDS piles them together, which reads as "similar".
// Drawn hollow so the clump isn't misread.
const UNIQUE_BELOW = 0.15;
const OTHER = "var(--color-zinc-500)";
const TOOLTIP_STYLE = {
  backgroundColor: "var(--color-zinc-900)",
  border: "1px solid var(--color-zinc-800)",
  borderRadius: "8px",
  fontSize: "12px",
};

interface Point {
  id: string;
  name: string;
  firm: string;
  favorite: boolean;
  x: number;
  y: number;
  value: number;
  similar: string;
  unique: boolean;
}

export function SimilarityMapView({
  index,
  onSelect,
}: {
  index: SuperinvestorsJson;
  onSelect: (id: string) => void;
}) {
  const byId = useMemo(() => new Map(index.managers.map((m) => [m.id, m])), [index]);
  const points = useMemo<Point[]>(
    () =>
      index.managers
        .filter((m) => m.xy)
        .map((m) => ({
          id: m.id,
          name: m.name,
          firm: m.firm,
          favorite: m.favorite,
          x: m.xy![0],
          y: m.xy![1],
          value: m.totalValue,
          similar: (m.similar ?? []).map((s) => `${byId.get(s.id)?.name ?? s.id} (${Math.round(s.score * 100)}%)`).join(", "),
          unique: (m.similar?.[0]?.score ?? 0) < UNIQUE_BELOW,
        })),
    [index, byId]
  );
  const favs = points.filter((p) => p.favorite && !p.unique);
  const others = points.filter((p) => !p.favorite && !p.unique);
  const unique = points.filter((p) => p.unique);

  return (
    <div>
      <h2 className="text-xl font-semibold">Similarity map</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Each dot is a manager; nearby dots own similar stocks in similar sizes. The axes have no
        units — only distance matters. Click a dot to open that manager.
      </p>

      <div className="mt-4 rounded-md border border-border p-2">
        <ResponsiveContainer width="100%" height={560}>
          <ScatterChart margin={{ top: 16, right: 24, bottom: 16, left: 16 }}>
            <CartesianGrid stroke="var(--color-zinc-800)" strokeDasharray="3 3" />
            <XAxis type="number" dataKey="x" hide domain={["dataMin - 0.05", "dataMax + 0.05"]} />
            <YAxis type="number" dataKey="y" hide domain={["dataMin - 0.05", "dataMax + 0.05"]} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              cursor={{ strokeDasharray: "3 3" }}
              content={({ payload }) => {
                const p = payload?.[0]?.payload as Point | undefined;
                if (!p) return null;
                return (
                  <div style={TOOLTIP_STYLE} className="max-w-[280px] px-3 py-2">
                    <div className="font-medium text-foreground">{p.name}</div>
                    {p.firm && <div className="text-muted-foreground">{p.firm}</div>}
                    <div className="mt-1 text-muted-foreground">{fmtMoney(p.value)}</div>
                    {p.similar && <div className="mt-1 text-muted-foreground">Closest: {p.similar}</div>}
                  </div>
                );
              }}
            />
            <Scatter
              data={others}
              fill={OTHER}
              fillOpacity={0.7}
              onClick={(d) => onSelect((d as unknown as Point).id)}
              className="cursor-pointer"
            />
            <Scatter
              data={unique}
              fill="transparent"
              stroke={OTHER}
              strokeWidth={1.5}
              onClick={(d) => onSelect((d as unknown as Point).id)}
              className="cursor-pointer"
            >
              <LabelList
                dataKey="name"
                position="right"
                formatter={(v) => {
                  const p = unique.find((x) => x.name === v);
                  return p?.favorite ? shortName(String(v)) : "";
                }}
                style={{ fill: "var(--color-zinc-400)", fontSize: 11 }}
              />
            </Scatter>
            <Scatter data={favs} fill={FAV} onClick={(d) => onSelect((d as unknown as Point).id)} className="cursor-pointer">
              <LabelList
                dataKey="name"
                position="top"
                formatter={(v) => shortName(String(v))}
                style={{ fill: "var(--color-zinc-200)", fontSize: 11 }}
              />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: FAV }} />Your picks (labelled)</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: OTHER }} />Other managers</span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border-[1.5px]" style={{ borderColor: OTHER }} />
          Idiosyncratic — under {Math.round(UNIQUE_BELOW * 100)}% overlap with anyone, so their position isn&apos;t meaningful
        </span>
      </div>
    </div>
  );
}

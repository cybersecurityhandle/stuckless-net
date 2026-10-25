"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SignalsView } from "@/components/superinvestor-signals";
import { CompareView } from "@/components/superinvestor-compare";
import { SimilarityMapView } from "@/components/superinvestor-map";
import { PortfolioTreemap } from "@/components/superinvestor-treemap";
import { BacktestView, ManagerReturnsCard } from "@/components/superinvestor-backtest";
import {
  buildIssuers,
  filingUrl,
  issuerKey,
  portfolioImpact,
  splitFactorSince,
  type ChangeType,
  type HistoryPosition,
  type HistoryQuarter,
  type LatestHoldingsJson,
  type LatestPosition,
  type ManagerHistoryJson,
  type ManagerSummary,
  type Quote,
  type SuperinvestorsJson,
} from "@/lib/superinvestors";

// Flat, dense, Dataroma-style: no cards, plain tables, colored text instead
// of badges.

const ACCENT = "#10b981";
const TOOLTIP_STYLE = {
  backgroundColor: "#18181b",
  border: "1px solid #27272a",
  borderRadius: "8px",
  fontSize: "12px",
};

/* ── Formatting ────────────────────────────────── */

export function fmtPct(n: number, digits = 1) {
  return `${(n * 100).toFixed(digits)}%`;
}

export function fmtMoney(n: number) {
  const abs = Math.abs(n);
  const s =
    abs >= 1e9 ? `$${(abs / 1e9).toFixed(2)}B`
    : abs >= 1e6 ? `$${(abs / 1e6).toFixed(1)}M`
    : `$${(abs / 1e3).toFixed(0)}K`;
  return n < 0 ? `-${s}` : s;
}

export function fmtPrice(n: number | null | undefined) {
  if (n == null) return "—";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtQuarter(period: string) {
  const [y, m] = period.split("-");
  return `Q${Math.ceil(Number(m) / 3)} ${y}`;
}

export function fmtQuarterShort(period: string) {
  const [y, m] = period.split("-");
  return `Q${Math.ceil(Number(m) / 3)} '${y.slice(2)}`;
}

export function fmtDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/* ── Small pieces ──────────────────────────────── */

// Dataroma wording: Buy / Add x% / Reduce x% / Sell. Growing a stub into a
// real position reads as e.g. "Add 630555%" (Dodge & Cox, Visa), so cap it.
export function ActivityText({ type, pct }: { type?: ChangeType; pct?: number }) {
  if (!type) return null;
  const up = type === "new" || type === "add";
  const size = pct! < 0.0005 ? "<0.1%" : pct! > 9.99 ? ">999%" : fmtPct(pct!);
  const label =
    type === "new" ? "Buy"
    : type === "sold" ? "Sell"
    : `${type === "add" ? "Add" : "Reduce"} ${size}`;
  return <span className={up ? "text-emerald-400" : "text-red-400"}>{label}</span>;
}

// 13F class titles → readable: "CAP STK CL A" → "Class A", "CL B NEW" → "Class B"
function shareClass(cl: string) {
  const m = cl.match(/\bCL(?:ASS)?\s*([A-Z])\b/i);
  if (m) return `Class ${m[1].toUpperCase()}`;
  return cl.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// Current price vs the 13F's implied price. A 5× gap either way in one
// quarter is a split, spin-off or filing error (Rochon's GLD files at
// $6,458/share), not a price move — show nothing rather than +900%.
export function priceChange(price: number | undefined, reported: number | null): number | null {
  if (price == null || !reported) return null;
  const ratio = price / reported;
  return ratio > 5 || ratio < 0.2 ? null : ratio - 1;
}

export function StockCell({ ticker, name }: { ticker: string | null; name: string }) {
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      {ticker ? (
        <Link
          href={`/finance?ticker=${encodeURIComponent(ticker)}`}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 font-medium text-emerald-400 hover:underline"
        >
          {ticker}
        </Link>
      ) : (
        <span className="shrink-0 text-muted-foreground">—</span>
      )}
      <span className="truncate">
        <span className="text-muted-foreground">- </span>
        {name}
      </span>
    </span>
  );
}

export const th =
  "border-b border-border bg-card px-3 py-2 align-bottom text-[12.5px] font-semibold leading-tight text-foreground/80";
export const td = "px-3 py-2";
// Alternating row tint, Dataroma-style
export const zebra = "even:bg-muted/20 hover:bg-muted/40";
// Tables sit in a thin rounded frame; the table itself is page-colored
export const frame = "overflow-x-auto rounded-md border border-border";
export const table = "w-full text-sm tabular-nums";
// A page-colored gap cell (border-hidden wins over the row border) splits
// off the price block
export const gap = "w-4 border-hidden bg-background";
// Small caps label above a table or column group
export const caption = "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

export type Scope = "favorites" | "all";

export function ScopeToggle({ scope, onChange }: { scope: Scope; onChange: (s: Scope) => void }) {
  return (
    <div className="flex rounded-md border border-border p-0.5 text-sm">
      {(["favorites", "all"] as const).map((s) => (
        <button
          key={s}
          onClick={() => onChange(s)}
          className={`rounded px-3 py-1 transition-colors ${
            scope === s ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {s === "favorites" ? "Featured" : "All managers"}
        </button>
      ))}
    </div>
  );
}

/* ── New filings ───────────────────────────────── */

const FILINGS_SHOWN = 15;

// 13F-HR deadline: 45 days after quarter end
function dueDate(period: string) {
  const d = new Date(`${period}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 45);
  return d.toISOString().slice(0, 10);
}

export function signedPct(n: number, digits = 1) {
  return `${n >= 0 ? "+" : ""}${fmtPct(n, digits)}`;
}

function NewFilingsView({ index, onSelect }: { index: SuperinvestorsJson; onSelect: (id: string) => void }) {
  const [scope, setScope] = useState<Scope>("all");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const managers = scope === "all" ? index.managers : index.managers.filter((m) => m.favorite);

  // One table per quarter, newest quarter and newest filing first
  const byPeriod = new Map<string, ManagerSummary[]>();
  for (const m of managers) byPeriod.set(m.period, [...(byPeriod.get(m.period) ?? []), m]);
  const groups = [...byPeriod.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([period, rows]) => ({
      period,
      rows: rows.sort(
        (a, b) => b.filed.localeCompare(a.filed) || Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name)
      ),
    }));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">New filings</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Latest 13F from {scope === "all" ? `all ${managers.length} managers` : `the ${managers.length} featured managers`}, newest first.
          </p>
        </div>
        <ScopeToggle scope={scope} onChange={setScope} />
      </div>

      {groups.map(({ period, rows }, gi) => {
        const due = dueDate(period);
        const all = gi === 0 || open.has(period);
        const filed = rows.map((m) => m.filed).sort();
        return (
          <section key={period} className="mt-6">
            <h3 className="flex flex-wrap items-baseline gap-x-3 text-sm">
              <span className="text-base font-semibold">{fmtQuarter(period)}</span>
              <span className="text-muted-foreground">
                {index.updated <= due
                  ? `${rows.length} of ${managers.length} filed · due ${fmtDate(due)}`
                  : `${rows.length} filed ${fmtDate(filed[0])} – ${fmtDate(filed[filed.length - 1])}`}
              </span>
            </h3>
            <div className={`mt-2 ${frame}`}>
              <table className={`${table} min-w-[960px]`}>
                <thead>
                  <tr className="text-left">
                    <th className={th}>Filed</th>
                    <th className={th}>Manager</th>
                    <th className={`${th} text-right`}>Portfolio<br />Value</th>
                    <th className={`${th} text-right`}>vs Prior<br />Quarter</th>
                    <th className={`${th} text-right`}>Stocks</th>
                    <th className={`${th} text-right`}>Buys</th>
                    <th className={`${th} text-right`}>Sells</th>
                    <th className={th}>Biggest Move</th>
                  </tr>
                </thead>
                <tbody>
                  {(all ? rows : rows.slice(0, FILINGS_SHOWN)).map((m) => {
                    const vsPrior = m.prevTotal ? m.totalValue / m.prevTotal - 1 : null;
                    return (
                      <tr
                        key={m.id}
                        onClick={() => onSelect(m.id)}
                        className={`cursor-pointer border-b border-border/30 ${zebra} ${m.favorite && scope === "all" ? "!bg-emerald-500/10" : ""}`}
                      >
                        <td className={`${td} whitespace-nowrap text-muted-foreground`}>{fmtDate(m.filed)}</td>
                        <td className={`${td} whitespace-nowrap`}>
                          <span className="mr-1.5 inline-block w-3 text-emerald-400">{m.favorite ? "★" : ""}</span>
                          <span className="font-medium text-emerald-400">{m.name}</span>
                          {m.firm && <span className="text-muted-foreground"> - {m.firm}</span>}
                        </td>
                        <td className={`${td} text-right`}>{fmtMoney(m.totalValue)}</td>
                        <td className={`${td} text-right ${vsPrior == null ? "text-muted-foreground" : vsPrior >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {vsPrior == null ? "—" : signedPct(vsPrior)}
                        </td>
                        <td className={`${td} text-right`}>{m.positions}</td>
                        <td className={`${td} text-right text-emerald-400`}>{m.buys ?? "—"}</td>
                        <td className={`${td} text-right text-red-400`}>{m.sells ?? "—"}</td>
                        <td className={`${td} whitespace-nowrap`}>
                          {m.move ? (
                            <span className="flex items-baseline gap-1.5">
                              <ActivityText type={m.move.c} pct={m.move.p} />
                              {m.move.t ? (
                                <Link
                                  href={`/finance?ticker=${encodeURIComponent(m.move.t)}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="font-medium text-emerald-400 hover:underline"
                                >
                                  {m.move.t}
                                </Link>
                              ) : (
                                <span>{m.move.d}</span>
                              )}
                              <span className="text-muted-foreground">({signedPct(m.move.impact)})</span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">No changes</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!all && rows.length > FILINGS_SHOWN && (
              <button
                onClick={() => setOpen((s) => new Set(s).add(period))}
                className="mt-2 text-sm text-emerald-400 hover:underline"
              >
                Show all {rows.length} {fmtQuarter(period)} filings
              </button>
            )}
          </section>
        );
      })}

      <p className="mt-4 text-xs text-muted-foreground">
        Buys and sells count every position that changed. Biggest move = the trade with the largest effect on
        portfolio weight, at quarter-end prices.
      </p>
    </div>
  );
}

/* ── Consensus ─────────────────────────────────── */

const CONSENSUS_LIMIT = 100;
const OWNERS_SHOWN = 6;

function ConsensusView({
  index,
  latest,
  onSelect,
}: {
  index: SuperinvestorsJson;
  latest: LatestHoldingsJson;
  onSelect: (id: string) => void;
}) {
  const [scope, setScope] = useState<Scope>("favorites");
  const managers = scope === "all" ? index.managers : index.managers.filter((m) => m.favorite);
  const rows = useMemo(
    () =>
      [...buildIssuers(latest, managers).values()]
        .filter((r) => r.owners.length >= 2)
        .map((r) => ({ ...r, avg: r.owners.reduce((s, o) => s + o.w, 0) / r.owners.length }))
        .sort((a, b) => b.owners.length - a.owners.length || b.avg - a.avg)
        .slice(0, CONSENSUS_LIMIT),
    [latest, managers]
  );

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Consensus</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Stocks held by two or more of {scope === "all" ? `all ${managers.length} managers` : `the ${managers.length} featured managers`},
            latest 13F{rows.length === CONSENSUS_LIMIT ? ` — top ${CONSENSUS_LIMIT}` : ""}.
          </p>
        </div>
        <ScopeToggle scope={scope} onChange={setScope} />
      </div>
      <div className={`mt-5 ${frame}`}>
        <table className={`${table} min-w-[760px]`}>
          <thead>
            <tr className="text-left">
              <th className={th}>Stock</th>
              <th className={`${th} text-right`}>Owners</th>
              <th className={`${th} text-right`}>Avg %</th>
              <th className={`${th} text-right`}>Price</th>
              <th className={th}>Held by</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              // Your picks first, then by weight
              const owners = [...r.owners].sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.w - a.w);
              const hidden = owners.length - OWNERS_SHOWN;
              return (
                <tr key={r.key} className={`border-b border-border/30 ${zebra}`}>
                  <td className={`${td} max-w-[260px]`}><StockCell ticker={r.ticker} name={r.name} /></td>
                  <td className={`${td} text-right`}>{r.owners.length}</td>
                  <td className={`${td} text-right`}>{fmtPct(r.avg)}</td>
                  <td className={`${td} text-right`}>{fmtPrice(r.ticker ? latest.quotes[r.ticker]?.price : null)}</td>
                  <td className={`${td} text-sm`}>
                    <span className="text-muted-foreground">
                      {owners.slice(0, OWNERS_SHOWN).map((o, i) => (
                        <Fragment key={o.id}>
                          {i > 0 && <span className="mx-1.5 text-border">·</span>}
                          <button
                            onClick={() => onSelect(o.id)}
                            className={`hover:text-foreground hover:underline ${o.favorite && scope === "all" ? "text-foreground" : ""}`}
                          >
                            {shortName(o.name)}
                          </button>{" "}
                          <span className="text-foreground">{fmtPct(o.w, o.w < 0.001 ? 2 : 1)}</span>
                          {o.c && (
                            <span className="ml-1 text-xs">
                              <ActivityText type={o.c} pct={o.p} />
                            </span>
                          )}
                        </Fragment>
                      ))}
                      {hidden > 0 && <span className="ml-1.5">+{hidden} more</span>}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// "Warren Buffett" → "Buffett"; firm-only names ("Tweedy Browne") stay whole
export function shortName(name: string) {
  const parts = name.split(" ");
  // Keep very short surnames whole ("Li Lu", not "Lu")
  return parts.length === 2 && parts[1].length > 2 && !/(Capital|Funds?|Partners|Group|Management|Trust|Browne)$/.test(name)
    ? parts[1]
    : name;
}

/* ── All managers ──────────────────────────────── */

function AllManagersView({ index, onSelect }: { index: SuperinvestorsJson; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const rows = index.managers
    .filter((m) => !q || `${m.name} ${m.firm} ${m.top.join(" ")}`.toLowerCase().includes(q))
    .sort((a, b) => b.totalValue - a.totalValue);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">All managers</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {index.managers.length} superinvestors · ★ = featured
          </p>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search manager, firm or ticker"
          className="h-9 w-64 rounded-md border border-border bg-transparent px-3 text-sm placeholder:text-muted-foreground"
        />
      </div>
      <div className={`mt-5 ${frame}`}>
        <table className={`${table} min-w-[760px]`}>
          <thead>
            <tr className="text-left">
              <th className={th}>Manager</th>
              <th className={`${th} text-right`}>Portfolio<br />Value</th>
              <th className={`${th} text-right`}>Stocks</th>
              <th className={th}>Top Holdings</th>
              <th className={`${th} text-right`}>Period</th>
              <th className={`${th} text-right`}>Filed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} onClick={() => onSelect(m.id)} className={`cursor-pointer border-b border-border/30 ${zebra}`}>
                <td className={td}>
                  <span className="mr-1.5 inline-block w-3 text-emerald-400">{m.favorite ? "★" : ""}</span>
                  <span className="font-medium text-emerald-400">{m.name}</span>
                  {m.firm && <span className="text-muted-foreground"> - {m.firm}</span>}
                </td>
                <td className={`${td} text-right`}>{fmtMoney(m.totalValue)}</td>
                <td className={`${td} text-right`}>{m.positions}</td>
                <td className={`${td} text-sm text-muted-foreground`}>{m.top.join(", ")}</td>
                <td className={`${td} text-right`}>{fmtQuarter(m.period)}</td>
                <td className={`${td} text-right text-muted-foreground`}>{fmtDate(m.filed)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Manager: holdings ─────────────────────────── */

// Weight of one position in every quarter since it was first reported
function PositionHistory({ history, k }: { history: ManagerHistoryJson; k: string }) {
  const rows = useMemo(() => {
    const quarters = [...history.quarters].reverse();
    const first = quarters.findIndex((q) => q.positions.some((p) => p.k === k));
    return quarters.slice(Math.max(first, 0)).map((q) => {
      const p = q.positions.find((x) => x.k === k);
      return {
        period: fmtQuarterShort(q.period),
        pct: p && q.total ? (p.v / q.total) * 100 : 0,
        shares: p?.s ?? 0,
      };
    });
  }, [history, k]);
  const held = rows.filter((r) => r.shares > 0).length;

  return (
    <div className="px-2 py-3">
      <div className="mb-2 text-xs text-muted-foreground">
        % of portfolio · first reported {rows[0]?.period} · held {held} of {rows.length} quarters since
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={rows} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
          <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="period" tick={{ fontSize: 10, fill: "#a1a1aa" }} minTickGap={16} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "#a1a1aa" }} tickFormatter={(v) => `${v}%`} width={36} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ fill: "#27272a" }}
            formatter={(v, _n, item) => [
              `${Number(v).toFixed(1)}% · ${item.payload.shares.toLocaleString()} sh`,
              "Weight",
            ]}
          />
          <Bar dataKey="pct" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={12} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function HoldingsTab({
  history,
  q,
  prev,
  quotes,
  positions,
  splits,
}: {
  history: ManagerHistoryJson;
  q: HistoryQuarter;
  prev?: HistoryQuarter;
  quotes: Record<string, Quote> | null; // only for the latest quarter
  positions: Map<string, LatestPosition> | null; // est. cost etc., latest quarter only
  splits: LatestHoldingsJson["splits"];
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [view, setView] = useState<"table" | "map">("table");
  const sec = (k: string) => history.securities[k.split("|")[0]];
  const longs = q.positions.filter((p) => !p.k.includes("|"));
  const options = q.positions.filter((p) => p.k.includes("|"));
  const soldOut = q.sold.filter((p) => !p.k.includes("|"));
  const cols = quotes ? 13 : 6;

  // Share classes of one company (BRK-A + BRK-B, GOOGL + GOOG) are one
  // position — total it, then list the classes
  const byIssuer = new Map<string, HistoryPosition[]>();
  for (const p of longs) {
    const key = issuerKey(p.k, sec(p.k));
    byIssuer.set(key, [...(byIssuer.get(key) ?? []), p]);
  }
  const issuers = [...byIssuer.entries()]
    .map(([key, classes]) => ({ key, classes, value: classes.reduce((s, p) => s + p.v, 0) }))
    .sort((a, b) => b.value - a.value);

  function positionRow(p: HistoryPosition, isClass: boolean) {
    const s = sec(p.k);
    const reported = p.s ? p.v / p.s : null;
    const quote = quotes && s.t ? quotes[s.t] : undefined;
    // Compare on today's share basis if the stock split since quarter end
    const split = splitFactorSince({ splits }, s.t, q.period);
    const vsReported = priceChange(quote?.price, reported && reported / split);
    const lp = positions?.get(p.k);
    // Est. cost is per quarter-end share — same split adjustment
    const cost = lp?.cost != null ? lp.cost / split : null;
    // Not priceChange(): its 5× "split or filing error" guard is right for one
    // quarter, but a 7× gain on a decade-old position is real
    const vsCost = quote && cost ? quote.price / cost - 1 : null;
    const open = expanded === p.k;
    return (
      <Fragment key={p.k}>
        <tr
          onClick={() => setExpanded(open ? null : p.k)}
          className={`cursor-pointer border-b border-border/30 ${zebra} ${open ? "!bg-emerald-500/10" : ""}`}
        >
          <td className={`${td} max-w-[300px]`} title={`${s.n} — ${s.cl}`}>
            <span className={`flex min-w-0 items-baseline gap-1.5 ${isClass ? "pl-4" : ""}`}>
              <span aria-hidden className="w-2.5 shrink-0 text-[10px] text-muted-foreground">{open ? "▾" : "▸"}</span>
              <StockCell ticker={s.t} name={isClass ? shareClass(s.cl) : s.d} />
            </span>
          </td>
          <td className={`${td} text-right ${isClass ? "text-muted-foreground" : "font-medium"}`}>
            {fmtPct(q.total ? p.v / q.total : 0, 2)}
          </td>
          <td className={`${td} whitespace-nowrap`}><ActivityText type={p.c} pct={p.p} /></td>
          <td className={`${td} text-right`}>{p.s.toLocaleString()}</td>
          <td className={`${td} text-right`}>{fmtPrice(reported)}</td>
          <td className={`${td} text-right ${isClass ? "text-muted-foreground" : ""}`}>{fmtMoney(p.v)}</td>
          {quotes && (
            <>
              <td className={gap} />
              <td className={`${td} text-right`}>{fmtPrice(quote?.price)}</td>
              <td
                className={`${td} text-right ${vsReported == null ? "text-muted-foreground" : vsReported >= 0 ? "text-emerald-400" : "text-red-400"}`}
                title={
                  quote && reported && vsReported == null
                    ? "Not comparable: spin-off or filing error since quarter end"
                    : split !== 1
                      ? `Adjusted for a ${split}-for-1 split since quarter end`
                      : undefined
                }
              >
                {vsReported == null ? "—" : `${vsReported >= 0 ? "+" : ""}${fmtPct(vsReported)}`}
                {split !== 1 && vsReported != null && <span className="text-muted-foreground">*</span>}
              </td>
              <td className={`${td} text-right`}>{fmtPrice(quote?.low52)}</td>
              <td className={`${td} text-right`}>{fmtPrice(quote?.high52)}</td>
              <td
                className={`${td} text-right ${lp?.costPartial ? "text-muted-foreground" : ""}`}
                title={lp?.costPartial ? "Held before Q2 2013 — true cost is likely lower" : lp?.since ? `Held since ${fmtQuarter(lp.since)}` : undefined}
              >
                {lp?.costPartial && cost != null && "≥"}
                {fmtPrice(cost)}
              </td>
              <td className={`${td} text-right ${vsCost == null ? "" : vsCost >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {vsCost == null ? "—" : `${vsCost >= 0 ? "+" : ""}${fmtPct(vsCost)}`}
              </td>
            </>
          )}
        </tr>
        {open && (
          <tr className="border-b border-border/40 bg-emerald-500/5">
            <td colSpan={cols} className="pl-6"><PositionHistory history={history} k={p.k} /></td>
          </tr>
        )}
      </Fragment>
    );
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <div className="flex rounded-md border border-border p-0.5 text-xs">
          {(["table", "map"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded px-2.5 py-1 ${view === v ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {v === "table" ? "Table" : "Map"}
            </button>
          ))}
        </div>
      </div>
      {view === "map" ? (
        <PortfolioTreemap history={history} positions={longs} total={q.total} />
      ) : (
      <div className="overflow-x-auto">
        <table className={`${table} ${quotes ? "min-w-[1180px]" : "min-w-[640px]"}`}>
          <thead>
            <tr className="text-left">
              <th colSpan={6} className={`${caption} px-3 pb-1.5`}>As reported, {fmtDate(q.period)}</th>
              {quotes && (
                <>
                  <th className={gap} />
                  <th colSpan={6} className={`${caption} px-3 pb-1.5`}>Now</th>
                </>
              )}
            </tr>
            <tr className="text-left">
              <th className={th}>Stock</th>
              <th className={`${th} text-right`}>% of<br />Portfolio</th>
              <th className={th}>Recent<br />Activity</th>
              <th className={`${th} text-right`}>Shares</th>
              <th className={`${th} text-right`}>Reported<br />Price</th>
              <th className={`${th} text-right`}>Value</th>
              {quotes && (
                <>
                  <th className={gap} />
                  <th className={`${th} text-right`}>Current<br />Price</th>
                  <th className={`${th} text-right`}>± Reported<br />Price</th>
                  <th className={`${th} text-right`}>52 Week<br />Low</th>
                  <th className={`${th} text-right`}>52 Week<br />High</th>
                  <th className={`${th} text-right`} title="Estimated average cost from quarter-end prices of each buy since Q2 2013">Est.<br />Cost</th>
                  <th className={`${th} text-right`}>± Est.<br />Cost</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {issuers.map(({ key, classes, value }) =>
              classes.length === 1 ? (
                positionRow(classes[0], false)
              ) : (
                <Fragment key={key}>
                  <tr className="border-b border-border/30 bg-muted/25">
                    <td className={td}>
                      <span className="flex items-baseline gap-1.5">
                        <span className="w-2.5 shrink-0" />
                        <span className="font-medium">{sec(classes[0].k).d}</span>
                        <span className="text-xs text-muted-foreground">{classes.length} share classes</span>
                      </span>
                    </td>
                    <td className={`${td} text-right font-semibold`}>{fmtPct(q.total ? value / q.total : 0, 2)}</td>
                    <td colSpan={3} />
                    <td className={`${td} text-right font-medium`}>{fmtMoney(value)}</td>
                    {quotes && (
                      <>
                        <td className={gap} />
                        <td colSpan={6} />
                      </>
                    )}
                  </tr>
                  {classes.map((p) => positionRow(p, true))}
                </Fragment>
              )
            )}
          </tbody>
        </table>
      </div>
      )}

      {soldOut.length > 0 && (
        <div className="mt-6">
          <h3 className={`${caption} px-3`}>Sold out {prev && `since ${fmtQuarter(prev.period)}`}</h3>
          <table className={`mt-1 ${table}`}>
            <tbody>
              {soldOut.map((p) => {
                const s = sec(p.k);
                return (
                  <tr key={p.k} className="border-b border-border/40">
                    <td className={`${td} max-w-[280px]`}><StockCell ticker={s.t} name={s.d} /></td>
                    <td className={`${td} text-right text-muted-foreground`}>
                      was {fmtPct(prev?.total ? p.v / prev.total : 0, 2)} · {fmtMoney(p.v)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 px-2 text-xs text-muted-foreground">
        Click a row for its weight over time. Reported price = 13F value ÷ shares at quarter end.
        {quotes && " Current prices as of the last data refresh; * = adjusted for a stock split since quarter end. Est. cost = average of quarter-end prices of each buy (≥ = held before Q2 2013, so the real cost is likely lower)."}
        {options.length > 0 && (
          <>
            {" "}Also reports {options.length} option position{options.length > 1 ? "s" : ""} (
            {options.map((o) => `${sec(o.k).t ?? sec(o.k).d} ${o.k.split("|")[1].toLowerCase()}s ${fmtMoney(o.v)}`).join(", ")}),
            excluded from weights.
          </>
        )}
      </p>
    </>
  );
}

/* ── Manager: activity ─────────────────────────── */

const ACTIVITY_PAGE = 8;

function ActivityTab({ history }: { history: ManagerHistoryJson }) {
  const [shown, setShown] = useState(ACTIVITY_PAGE);
  // The oldest quarter has no prior to compare against
  const quarters = history.quarters.slice(0, -1);

  return (
    <div>
      {quarters.slice(0, shown).map((q, i) => {
        const prev = history.quarters[i + 1];
        const moves = [...q.positions, ...q.sold]
          .filter((p) => p.c && !p.k.includes("|"))
          .map((p) => ({ p, impact: portfolioImpact(p, q, prev) }))
          .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
        const buys = moves.filter((m) => m.impact > 0).length;
        return (
          <section key={q.period} className="mb-6">
            <h3 className="flex items-baseline justify-between border-b border-border px-2 pb-1.5 text-sm">
              <span className="font-semibold">{fmtQuarter(q.period)}</span>
              <span className="text-xs text-muted-foreground">
                {buys} buys · {moves.length - buys} sells
              </span>
            </h3>
            {!moves.length ? (
              <p className="px-2 py-2 text-[13px] text-muted-foreground">No changes.</p>
            ) : (
              <table className={table}>
                <tbody>
                  {moves.map(({ p, impact }) => {
                    const s = history.securities[p.k];
                    return (
                      <tr key={p.k} className="border-b border-border/40">
                        <td className={`${td} max-w-[280px]`}><StockCell ticker={s.t} name={s.d} /></td>
                        <td className={`${td} whitespace-nowrap`}><ActivityText type={p.c} pct={p.p} /></td>
                        <td className={`${td} text-right ${impact >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {impact >= 0 ? "+" : ""}{fmtPct(impact, 2)}
                        </td>
                        <td className={`${td} hidden text-right text-muted-foreground sm:table-cell`}>
                          {p.c === "sold" ? "—" : `${fmtPct(q.total ? p.v / q.total : 0, 2)} now`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        );
      })}
      {shown < quarters.length && (
        <button
          onClick={() => setShown((n) => n + ACTIVITY_PAGE)}
          className="px-2 text-sm text-muted-foreground hover:text-foreground"
        >
          Show earlier quarters ({quarters.length - shown} more)
        </button>
      )}
      <p className="mt-4 px-2 text-xs text-muted-foreground">
        Impact = the trade&apos;s effect on portfolio weight, at quarter-end prices. Stock splits are
        adjusted out.
      </p>
    </div>
  );
}

/* ── Manager: history ──────────────────────────── */

const RANGES = [
  { id: "1y", label: "1Y", quarters: 5 },
  { id: "5y", label: "5Y", quarters: 21 },
  { id: "all", label: "All", quarters: Infinity },
] as const;

function HistoryTab({ history }: { history: ManagerHistoryJson }) {
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("all");
  const n = RANGES.find((r) => r.id === range)!.quarters;
  const data = useMemo(
    () =>
      history.quarters
        .slice(0, n)
        .reverse()
        .map((q) => ({ period: fmtQuarterShort(q.period), total: q.total, positions: q.positions.length })),
    [history, n]
  );

  return (
    <div>
      <div className="mb-3 flex items-center justify-between px-2">
        <p className="text-sm text-muted-foreground">Reported 13F value</p>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                range === r.id ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ left: 8, right: 8, top: 4, bottom: 0 }}>
          <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#a1a1aa" }} minTickGap={24} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#a1a1aa" }} tickFormatter={fmtMoney} width={64} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v, _n, item) => [`${fmtMoney(Number(v))} · ${item.payload.positions} positions`, "Value"]}
          />
          <Area type="monotone" dataKey="total" stroke={ACCENT} strokeWidth={2} fill={ACCENT} fillOpacity={0.1} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Manager: style & look-through ─────────────── */

// Latest-13F style numbers plus Buffett-style look-through earnings: the
// manager's share of investees' trailing GAAP net income (losses count)
function StyleStrip({
  summary: m,
  index,
  onSelect,
}: {
  summary: ManagerSummary;
  index: SuperinvestorsJson;
  onSelect: (id: string) => void;
}) {
  const lt = m.lookThrough;
  const items: [string, React.ReactNode, string?][] = [
    ["Avg. holding period", m.avgHold != null ? `${m.holdCapped ? "≥ " : ""}${(m.avgHold / 4).toFixed(1)} yrs` : "—",
      "Value-weighted time each current position has been held. ≥ when some predate Q2 2013."],
    ["Held 5+ years", m.longHeld != null ? fmtPct(m.longHeld, 0) : "—", "Share of the portfolio in positions held 20+ quarters"],
    ["Turnover / quarter", m.turnover != null ? fmtPct(m.turnover) : "—", "Average share of the portfolio traded per quarter, last 4 quarters"],
    ["Look-through P/E", lt ? (lt.pe != null ? `${lt.pe.toFixed(1)}×` : "n/m (losses)") : "—",
      "Portfolio value ÷ its share of holdings' trailing GAAP earnings"],
    ["Look-through earnings", lt ? fmtMoney(lt.earnings) : "—", "Share of investees' trailing net income — retained earnings count, not just dividends"],
    ["of which dividends", lt ? `${fmtMoney(lt.dividends)}${lt.earnings > 0 ? ` (${fmtPct(lt.dividends / lt.earnings, 0)})` : ""}` : "—",
      "Dividends received; the rest is retained by investees on the manager's behalf"],
  ];
  const byId = new Map(index.managers.map((x) => [x.id, x]));
  return (
    <>
      <dl className="mt-2 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border text-sm sm:grid-cols-3 lg:grid-cols-6">
        {items.map(([name, value, hint]) => (
          <div key={name} className="bg-background px-4 py-2.5" title={hint}>
            <dt className="text-xs text-muted-foreground">{name}</dt>
            <dd className="flex h-7 items-center font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {(lt && lt.coverage < 0.95) || m.similar?.length ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {m.similar?.length ? (
            <>
              Most similar:{" "}
              {m.similar.map((s, i) => (
                <span key={s.id}>
                  {i > 0 && ", "}
                  <button onClick={() => onSelect(s.id)} className="hover:text-foreground hover:underline">
                    {byId.get(s.id)?.name ?? s.id}
                  </button>{" "}
                  ({Math.round(s.score * 100)}%)
                </span>
              ))}
            </>
          ) : null}
          {lt && lt.coverage < 0.95 && <> · look-through covers {fmtPct(lt.coverage, 0)} of the portfolio</>}
        </p>
      ) : null}
    </>
  );
}

/* ── Manager ───────────────────────────────────── */

const TABS = [
  { id: "holdings", label: "Holdings" },
  { id: "activity", label: "Activity" },
  { id: "history", label: "History" },
] as const;

function ManagerView({
  summary,
  latest,
  index,
  onSelect,
}: {
  summary: ManagerSummary;
  latest: LatestHoldingsJson;
  index: SuperinvestorsJson;
  onSelect: (id: string) => void;
}) {
  const quotes = latest.quotes;
  const splits = latest.splits;
  const positions = useMemo(
    () => new Map((latest.holdings[summary.id] ?? []).map((p) => [p.k, p])),
    [latest, summary.id]
  );
  const [history, setHistory] = useState<ManagerHistoryJson | null>(null);
  const [error, setError] = useState(false);
  const [qi, setQi] = useState(0);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("holdings");

  // Mounted with key={id}, so state starts fresh per manager
  useEffect(() => {
    fetch(`/superinvestors/${summary.id}.json`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((d: ManagerHistoryJson) => setHistory(d))
      .catch(() => setError(true));
  }, [summary.id]);

  const q = history?.quarters[qi];
  const prev = history?.quarters[qi + 1];
  const longs = q?.positions.filter((p) => !p.k.includes("|")) ?? [];
  // Company level, share classes combined (Spier: BRK-A + BRK-B is one stock)
  const byIssuer = new Map<string, number>();
  for (const p of longs) {
    const key = issuerKey(p.k, history?.securities[p.k]);
    byIssuer.set(key, (byIssuer.get(key) ?? 0) + p.v);
  }
  const issuerValues = [...byIssuer.values()].sort((a, b) => b - a);
  const top10 = q?.total ? issuerValues.slice(0, 10).reduce((s, v) => s + v, 0) / q.total : 0;

  const facts: [string, React.ReactNode][] = q
    ? [
        [
          "Period",
          <select
            key="period"
            value={qi}
            onChange={(e) => setQi(Number(e.target.value))}
            aria-label="Period"
            className="-ml-1.5 h-7 cursor-pointer rounded-md border border-border bg-background px-1.5 font-semibold hover:bg-muted"
          >
            {history!.quarters.map((x, i) => (
              <option key={x.period} value={i} className="bg-card">
                {fmtQuarter(x.period)}
              </option>
            ))}
          </select>,
        ],
        ["Portfolio date", fmtDate(q.period)],
        ["Filed", fmtDate(q.filed)],
        ["No. of stocks", byIssuer.size],
        ["Portfolio value", fmtMoney(q.total)],
        ["Top 10", fmtPct(top10)],
      ]
    : [];

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold">
          {summary.favorite && <span className="mr-1.5 text-emerald-400">★</span>}
          {summary.name}
          {summary.firm && <span className="font-normal text-muted-foreground"> — {summary.firm}</span>}
        </h2>
        {q && (
          <a
            href={filingUrl(q.cik, q.accession)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            13F on EDGAR ↗
          </a>
        )}
      </div>

      {error && <p className="mt-4 text-red-400">Couldn&apos;t load history for {summary.name}.</p>}
      {!history && !error && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}

      {history && q && (
        <>
          {/* gap-px over a border-colored background draws the cell dividers */}
          <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border text-sm sm:grid-cols-3 lg:grid-cols-6">
            {facts.map(([name, value]) => (
              <div key={name} className="bg-background px-4 py-2.5">
                <dt className="text-xs text-muted-foreground">{name}</dt>
                <dd className="flex h-7 items-center font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <StyleStrip summary={summary} index={index} onSelect={onSelect} />

          <div className="mt-6 mb-4 flex gap-5 border-b border-border">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`-mb-px border-b-2 pb-2 text-sm font-medium transition-colors ${
                  tab === t.id
                    ? "border-emerald-500 text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "holdings" && (
            <HoldingsTab
              key={q.period}
              history={history}
              q={q}
              prev={prev}
              quotes={qi === 0 ? quotes : null}
              positions={qi === 0 ? positions : null}
              splits={splits}
            />
          )}
          {tab === "activity" && <ActivityTab history={history} />}
          {tab === "history" && (
            <>
              <HistoryTab history={history} />
              <ManagerReturnsCard id={summary.id} />
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ── Page ──────────────────────────────────────── */

// Non-manager views reachable by ?m=
const VIEWS = ["filings", "consensus", "signals", "compare", "map", "backtest", "all"];

export function Superinvestors() {
  const [index, setIndex] = useState<SuperinvestorsJson | null>(null);
  const [latest, setLatest] = useState<LatestHoldingsJson | null>(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<string>("filings");

  useEffect(() => {
    Promise.all([
      fetch("/superinvestors.json").then((res) => (res.ok ? res.json() : Promise.reject())),
      fetch("/superinvestors/latest.json").then((res) => (res.ok ? res.json() : Promise.reject())),
    ])
      .then(([idx, lat]: [SuperinvestorsJson, LatestHoldingsJson]) => {
        setIndex(idx);
        setLatest(lat);
        // Deep link: /superinvestors?m=<manager id | consensus | all> (e.g. from the stock snapshot)
        const m = new URLSearchParams(window.location.search).get("m");
        if (m && (VIEWS.includes(m) || idx.managers.some((x) => x.id === m))) setSelected(m);
      })
      .catch(() => setError(true));
  }, []);

  function select(id: string) {
    setSelected(id);
    const url = id === "filings" ? "/superinvestors" : `/superinvestors?m=${id}`;
    window.history.replaceState(null, "", url);
    window.scrollTo({ top: 0 });
  }

  const manager = index?.managers.find((m) => m.id === selected);
  const favorites = index?.managers.filter((m) => m.favorite) ?? [];
  // Filings in the newest quarter, while that quarter is still coming in
  const newest = index?.managers.reduce((p, m) => (m.period > p ? m.period : p), "");
  const newCount = index?.managers.filter((m) => m.period === newest).length ?? 0;
  const navItem = (id: string, label: React.ReactNode, title?: string) => (
    <button
      key={id}
      onClick={() => select(id)}
      title={title}
      className={`-mb-px shrink-0 border-b-2 pb-2 text-sm transition-colors ${
        selected === id
          ? "border-emerald-500 font-medium text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Superinvestors</h1>
        <p className="mt-2 text-muted-foreground">
          Quarterly 13F holdings from SEC EDGAR — US-listed positions, reported up to 45 days after
          quarter end.
        </p>
        {index && <p className="mt-1 text-xs text-muted-foreground">Updated {fmtDate(index.updated)}</p>}
      </div>

      {error && <p className="text-red-400">Couldn&apos;t load holdings data.</p>}
      {!index && !error && <p className="text-muted-foreground">Loading…</p>}

      {index && latest && (
        <>
          {/* Wraps rather than scrolls, so every tab stays visible */}
          <nav className="mb-8 flex flex-wrap gap-x-6 gap-y-2 border-b border-border">
            {navItem(
              "filings",
              <>
                New filings
                {index.managers.length > newCount && (
                  <span className="ml-1.5 rounded-full bg-emerald-600 px-1.5 py-px text-[11px] font-semibold text-white">
                    {newCount}
                  </span>
                )}
              </>,
              newest ? `${newCount} ${fmtQuarter(newest)} filings so far` : undefined
            )}
            {navItem("consensus", "Consensus", "Stocks held by 2+ managers")}
            {navItem("signals", "Signals", "Conviction buys, accumulation streaks, below-cost")}
            {navItem("compare", "Compare", "Two portfolios side by side")}
            {navItem("map", "Map", "Managers placed by portfolio similarity")}
            {navItem("backtest", "Backtest", "Would copying each manager's 13Fs have worked?")}
            {favorites.map((m) => navItem(m.id, m.name, `${m.firm} · ${fmtQuarter(m.period)}`))}
            {/* A manager opened from All managers gets a temporary tab */}
            {manager && !manager.favorite && navItem(manager.id, manager.name)}
            <span className="ml-auto" />
            {navItem("all", `All managers (${index.managers.length})`)}
          </nav>
          {selected === "filings" && <NewFilingsView index={index} onSelect={select} />}
          {selected === "consensus" && <ConsensusView index={index} latest={latest} onSelect={select} />}
          {selected === "all" && <AllManagersView index={index} onSelect={select} />}
          {selected === "signals" && <SignalsView index={index} latest={latest} onSelect={select} />}
          {selected === "compare" && <CompareView index={index} latest={latest} onSelect={select} />}
          {selected === "map" && <SimilarityMapView index={index} onSelect={select} />}
          {selected === "backtest" && <BacktestView index={index} onSelect={select} />}
          {manager && (
            <ManagerView key={manager.id} summary={manager} latest={latest} index={index} onSelect={select} />
          )}
        </>
      )}
    </div>
  );
}

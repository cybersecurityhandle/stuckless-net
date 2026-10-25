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
import {
  buildIssuers,
  filingUrl,
  type ChangeType,
  type HistoryPosition,
  type HistoryQuarter,
  type LatestHoldingsJson,
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

function fmtQuarterShort(period: string) {
  const [y, m] = period.split("-");
  return `Q${Math.ceil(Number(m) / 3)} '${y.slice(2)}`;
}

function fmtDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/* ── Small pieces ──────────────────────────────── */

// Dataroma wording: Buy / Add x% / Reduce x% / Sell
export function ActivityText({ type, pct }: { type?: ChangeType; pct?: number }) {
  if (!type) return null;
  const up = type === "new" || type === "add";
  const label =
    type === "new" ? "Buy"
    : type === "sold" ? "Sell"
    : `${type === "add" ? "Add" : "Reduce"} ${pct! < 0.0005 ? "<0.1%" : fmtPct(pct!)}`;
  return <span className={up ? "text-emerald-400" : "text-red-400"}>{label}</span>;
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

export const th = "px-3 py-2.5 text-[13px] font-medium leading-tight text-muted-foreground";
export const td = "px-3 py-2";
// Alternating row tint, Dataroma-style
export const zebra = "odd:bg-muted/15 hover:bg-muted/30";
// Dataroma-style panels: the whole table is tinted, and a page-colored gap
// cell (border-hidden wins over the row border) splits off the price block
export const panel = "bg-muted/20";
const gap = "w-4 border-hidden bg-background";

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
  const [scope, setScope] = useState<"favorites" | "all">("favorites");
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
            Stocks held by two or more of {scope === "all" ? `all ${managers.length} managers` : `your ${managers.length} picks`},
            latest 13F{rows.length === CONSENSUS_LIMIT ? ` — top ${CONSENSUS_LIMIT}` : ""}.
          </p>
        </div>
        <div className="flex rounded-md border border-border p-0.5 text-sm">
          {(["favorites", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`rounded px-3 py-1 transition-colors ${
                scope === s ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s === "favorites" ? "My picks" : "All managers"}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className={`w-full min-w-[760px] text-[15px] tabular-nums ${panel}`}>
          <thead>
            <tr className="border-b border-border text-left">
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
function shortName(name: string) {
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
            {index.managers.length} superinvestors · ★ = your picks
          </p>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search manager, firm or ticker"
          className="h-9 w-64 rounded-md border border-border bg-transparent px-3 text-sm placeholder:text-muted-foreground"
        />
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className={`w-full min-w-[760px] text-[15px] tabular-nums ${panel}`}>
          <thead>
            <tr className="border-b border-border text-left">
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
}: {
  history: ManagerHistoryJson;
  q: HistoryQuarter;
  prev?: HistoryQuarter;
  quotes: Record<string, Quote> | null; // only for the latest quarter
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const sec = (k: string) => history.securities[k.split("|")[0]];
  const longs = q.positions.filter((p) => !p.k.includes("|"));
  const options = q.positions.filter((p) => p.k.includes("|"));
  const soldOut = q.sold.filter((p) => !p.k.includes("|"));
  const cols = quotes ? 11 : 6;

  return (
    <>
      <div className="overflow-x-auto">
        <table className={`w-full text-[15px] tabular-nums ${panel} ${quotes ? "min-w-[1000px]" : "min-w-[640px]"}`}>
          <thead>
            <tr className="border-b border-border text-left">
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
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {longs.map((p) => {
              const s = sec(p.k);
              const reported = p.s ? p.v / p.s : null;
              const quote = quotes && s.t ? quotes[s.t] : undefined;
              const vsReported = quote && reported ? quote.price / reported - 1 : null;
              const open = expanded === p.k;
              return (
                <Fragment key={p.k}>
                  <tr
                    onClick={() => setExpanded(open ? null : p.k)}
                    className={`cursor-pointer border-b border-border/30 ${zebra} ${open ? "bg-muted/30" : ""}`}
                  >
                    <td className={`${td} max-w-[280px]`} title={`${s.n} — ${s.cl}`}>
                      <StockCell ticker={s.t} name={s.d} />
                    </td>
                    <td className={`${td} text-right font-medium`}>{fmtPct(q.total ? p.v / q.total : 0, 2)}</td>
                    <td className={`${td} whitespace-nowrap`}><ActivityText type={p.c} pct={p.p} /></td>
                    <td className={`${td} text-right`}>{p.s.toLocaleString()}</td>
                    <td className={`${td} text-right`}>{fmtPrice(reported)}</td>
                    <td className={`${td} text-right`}>{fmtMoney(p.v)}</td>
                    {quotes && (
                      <>
                        <td className={gap} />
                        <td className={`${td} text-right`}>{fmtPrice(quote?.price)}</td>
                        <td className={`${td} text-right ${vsReported == null ? "" : vsReported >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {vsReported == null ? "—" : `${vsReported >= 0 ? "+" : ""}${fmtPct(vsReported)}`}
                        </td>
                        <td className={`${td} text-right`}>{fmtPrice(quote?.low52)}</td>
                        <td className={`${td} text-right`}>{fmtPrice(quote?.high52)}</td>
                      </>
                    )}
                  </tr>
                  {open && (
                    <tr className="border-b border-border/40 bg-muted/10">
                      <td colSpan={cols}><PositionHistory history={history} k={p.k} /></td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {soldOut.length > 0 && (
        <div className="mt-6">
          <h3 className="px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Sold out {prev && `since ${fmtQuarter(prev.period)}`}
          </h3>
          <table className="mt-1 w-full text-[15px] tabular-nums">
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
        {quotes && " Current prices as of the last data refresh."}
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

// Change in portfolio weight caused by the trade, at this quarter's price
// (Dataroma's "% change to portfolio")
function portfolioImpact(p: HistoryPosition, q: HistoryQuarter, prev?: HistoryQuarter): number {
  if (p.c === "sold") return prev?.total ? -p.v / prev.total : 0;
  if (!q.total) return 0;
  if (p.c === "new") return p.v / q.total;
  if (p.c === "add" && p.p) return (p.v - p.v / (1 + p.p)) / q.total;
  if (p.c === "reduce" && p.p != null && p.p < 1) return (p.v - p.v / (1 - p.p)) / q.total;
  return 0;
}

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
              <table className="w-full text-[15px] tabular-nums">
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

/* ── Manager ───────────────────────────────────── */

const TABS = [
  { id: "holdings", label: "Holdings" },
  { id: "activity", label: "Activity" },
  { id: "history", label: "History" },
] as const;

function ManagerView({ summary, quotes }: { summary: ManagerSummary; quotes: Record<string, Quote> }) {
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
  const top10 = q?.total ? longs.slice(0, 10).reduce((s, p) => s + p.v, 0) / q.total : 0;

  const facts: [string, React.ReactNode][] = q
    ? [
        [
          "Period",
          <select
            key="period"
            value={qi}
            onChange={(e) => setQi(Number(e.target.value))}
            className="-ml-1 cursor-pointer rounded bg-transparent px-1 font-medium hover:bg-muted"
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
        ["No. of stocks", longs.length],
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
          <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-3 lg:grid-cols-6">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="font-medium tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

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
            <HoldingsTab key={q.period} history={history} q={q} prev={prev} quotes={qi === 0 ? quotes : null} />
          )}
          {tab === "activity" && <ActivityTab history={history} />}
          {tab === "history" && <HistoryTab history={history} />}
        </>
      )}
    </div>
  );
}

/* ── Page ──────────────────────────────────────── */

export function Superinvestors() {
  const [index, setIndex] = useState<SuperinvestorsJson | null>(null);
  const [latest, setLatest] = useState<LatestHoldingsJson | null>(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<string>("consensus");

  useEffect(() => {
    Promise.all([
      fetch("/superinvestors.json").then((res) => (res.ok ? res.json() : Promise.reject())),
      fetch("/superinvestors/latest.json").then((res) => (res.ok ? res.json() : Promise.reject())),
    ])
      .then(([idx, lat]: [SuperinvestorsJson, LatestHoldingsJson]) => {
        setIndex(idx);
        setLatest(lat);
        // Deep link: /superinvestors?m=<manager id | all> (e.g. from the stock snapshot)
        const m = new URLSearchParams(window.location.search).get("m");
        if (m && (m === "all" || idx.managers.some((x) => x.id === m))) setSelected(m);
      })
      .catch(() => setError(true));
  }, []);

  function select(id: string) {
    setSelected(id);
    const url = id === "consensus" ? "/superinvestors" : `/superinvestors?m=${id}`;
    window.history.replaceState(null, "", url);
    window.scrollTo({ top: 0 });
  }

  const manager = index?.managers.find((m) => m.id === selected);
  const favorites = index?.managers.filter((m) => m.favorite) ?? [];
  const navItem = (id: string, label: string, title?: string) => (
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
          <nav className="mb-8 flex gap-x-6 overflow-x-auto overflow-y-hidden border-b border-border">
            {navItem("consensus", "Consensus", "Stocks held by 2+ managers")}
            {favorites.map((m) => navItem(m.id, m.name, `${m.firm} · ${fmtQuarter(m.period)}`))}
            {/* A manager opened from All managers gets a temporary tab */}
            {manager && !manager.favorite && navItem(manager.id, manager.name)}
            <span className="ml-auto" />
            {navItem("all", `All managers (${index.managers.length})`)}
          </nav>
          {selected === "consensus" && <ConsensusView index={index} latest={latest} onSelect={select} />}
          {selected === "all" && <AllManagersView index={index} onSelect={select} />}
          {manager && <ManagerView key={manager.id} summary={manager} quotes={latest.quotes} />}
        </>
      )}
    </div>
  );
}

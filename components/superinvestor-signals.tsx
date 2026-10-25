"use client";

import { useMemo, useState } from "react";
import {
  type LatestHoldingsJson,
  type LatestPosition,
  type ManagerSummary,
  type SuperinvestorsJson,
} from "@/lib/superinvestors";
import {
  ActivityText,
  caption,
  fmtPct,
  fmtPrice,
  fmtQuarter,
  frame,
  ScopeToggle,
  StockCell,
  table,
  td,
  th,
  zebra,
  type Scope,
} from "@/components/superinvestors";

// Signals Dataroma doesn't compute: conviction-sized buys, multi-quarter
// accumulation, and stocks trading below what superinvestors paid.

const SHOWN = 25;
const CONVICTION_NEW = 0.03; // a brand-new position at 3%+ of the portfolio
const CONVICTION_IMPACT = 0.02; // or an add that moved 2%+ of the portfolio
const BELOW_COST_MIN_WEIGHT = 0.01;

interface Row {
  m: ManagerSummary;
  p: LatestPosition;
  ticker: string | null;
  name: string;
}

// Portfolio weight moved by this quarter's trade (latest.json has weights, not
// prior values: a new position moved its whole weight, an add of p moved
// w − w/(1+p))
function impact(p: LatestPosition) {
  if (p.c === "new") return p.w;
  if (p.c === "add" && p.p) return p.w - p.w / (1 + p.p);
  return 0;
}

export function SignalsView({
  index,
  latest,
  onSelect,
}: {
  index: SuperinvestorsJson;
  latest: LatestHoldingsJson;
  onSelect: (id: string) => void;
}) {
  const [scope, setScope] = useState<Scope>("all");
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const m of index.managers) {
      if (scope === "favorites" && !m.favorite) continue;
      for (const p of latest.holdings[m.id] ?? []) {
        const sec = latest.securities[p.k];
        out.push({ m, p, ticker: sec?.t ?? null, name: sec?.d ?? p.k });
      }
    }
    return out;
  }, [index, latest, scope]);

  const conviction = rows
    .filter((r) => (r.p.c === "new" && r.p.w >= CONVICTION_NEW) || (r.p.c === "add" && impact(r.p) >= CONVICTION_IMPACT))
    .sort((a, b) => impact(b.p) - impact(a.p))
    .slice(0, SHOWN);

  const streaks = rows
    .filter((r) => (r.p.streak ?? 0) >= 3)
    .sort((a, b) => b.p.streak! - a.p.streak! || b.p.w - a.p.w)
    .slice(0, SHOWN);

  const belowCost = rows
    .map((r) => {
      const price = r.ticker ? latest.quotes[r.ticker]?.price : undefined;
      return { ...r, price, vsCost: price && r.p.cost ? price / r.p.cost - 1 : null };
    })
    .filter((r) => r.vsCost != null && r.vsCost < 0 && !r.p.costPartial && r.p.w >= BELOW_COST_MIN_WEIGHT)
    .sort((a, b) => a.vsCost! - b.vsCost!)
    .slice(0, SHOWN);

  const managerCell = (m: ManagerSummary) => (
    <button onClick={() => onSelect(m.id)} className="text-left hover:text-foreground hover:underline">
      {m.favorite && <span className="mr-1 text-emerald-400">★</span>}
      {m.name}
    </button>
  );

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Signals</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Conviction, persistence and price — from each manager&apos;s latest 13F and its history since 2013.
          </p>
        </div>
        <ScopeToggle scope={scope} onChange={setScope} />
      </div>

      <section>
        <h3 className={caption}>High-conviction buys</h3>
        <p className="mt-1 mb-3 text-sm text-muted-foreground">
          New positions starting at {fmtPct(CONVICTION_NEW, 0)}+ of the portfolio, or adds that moved{" "}
          {fmtPct(CONVICTION_IMPACT, 0)}+ of it — size is where conviction shows.
        </p>
        <div className={frame}>
          <table className={`${table} min-w-[720px]`}>
            <thead>
              <tr className="text-left">
                <th className={th}>Stock</th>
                <th className={th}>Manager</th>
                <th className={th}>Activity</th>
                <th className={`${th} text-right`}>Portfolio<br />Impact</th>
                <th className={`${th} text-right`}>% of<br />Portfolio</th>
                <th className={`${th} text-right`}>Quarter</th>
              </tr>
            </thead>
            <tbody>
              {conviction.map((r) => (
                <tr key={`${r.m.id}-${r.p.k}`} className={`border-b border-border/30 ${zebra}`}>
                  <td className={`${td} max-w-[260px]`}><StockCell ticker={r.ticker} name={r.name} /></td>
                  <td className={`${td} text-muted-foreground`}>{managerCell(r.m)}</td>
                  <td className={td}><ActivityText type={r.p.c} pct={r.p.p} /></td>
                  <td className={`${td} text-right text-emerald-400`}>+{fmtPct(impact(r.p), 2)}</td>
                  <td className={`${td} text-right`}>{fmtPct(r.p.w, 2)}</td>
                  <td className={`${td} text-right text-muted-foreground`}>{fmtQuarter(r.m.period)}</td>
                </tr>
              ))}
              {!conviction.length && <EmptyRow cols={6} />}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className={caption}>Accumulation streaks</h3>
        <p className="mt-1 mb-3 text-sm text-muted-foreground">
          Bought or added in 3+ consecutive quarters, through the latest filing. One add is noise; a
          sustained build is a thesis.
        </p>
        <div className={frame}>
          <table className={`${table} min-w-[720px]`}>
            <thead>
              <tr className="text-left">
                <th className={th}>Stock</th>
                <th className={th}>Manager</th>
                <th className={`${th} text-right`}>Quarters<br />Adding</th>
                <th className={`${th} text-right`}>Held<br />Since</th>
                <th className={`${th} text-right`}>% of<br />Portfolio</th>
              </tr>
            </thead>
            <tbody>
              {streaks.map((r) => (
                <tr key={`${r.m.id}-${r.p.k}`} className={`border-b border-border/30 ${zebra}`}>
                  <td className={`${td} max-w-[260px]`}><StockCell ticker={r.ticker} name={r.name} /></td>
                  <td className={`${td} text-muted-foreground`}>{managerCell(r.m)}</td>
                  <td className={`${td} text-right font-medium text-emerald-400`}>{r.p.streak}</td>
                  <td className={`${td} text-right text-muted-foreground`}>{r.p.since ? fmtQuarter(r.p.since) : "—"}</td>
                  <td className={`${td} text-right`}>{fmtPct(r.p.w, 2)}</td>
                </tr>
              ))}
              {!streaks.length && <EmptyRow cols={5} />}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className={caption}>Trading below superinvestor cost</h3>
        <p className="mt-1 mb-3 text-sm text-muted-foreground">
          Current price under the manager&apos;s estimated average cost, for positions of{" "}
          {fmtPct(BELOW_COST_MIN_WEIGHT, 0)}+ bought within our history (Q2 2013 on). Cost is estimated
          from quarter-end prices, so treat it as ± a few percent.
        </p>
        <div className={frame}>
          <table className={`${table} min-w-[720px]`}>
            <thead>
              <tr className="text-left">
                <th className={th}>Stock</th>
                <th className={th}>Manager</th>
                <th className={`${th} text-right`}>Est.<br />Cost</th>
                <th className={`${th} text-right`}>Current<br />Price</th>
                <th className={`${th} text-right`}>vs<br />Cost</th>
                <th className={`${th} text-right`}>% of<br />Portfolio</th>
              </tr>
            </thead>
            <tbody>
              {belowCost.map((r) => (
                <tr key={`${r.m.id}-${r.p.k}`} className={`border-b border-border/30 ${zebra}`}>
                  <td className={`${td} max-w-[260px]`}><StockCell ticker={r.ticker} name={r.name} /></td>
                  <td className={`${td} text-muted-foreground`}>{managerCell(r.m)}</td>
                  <td className={`${td} text-right`}>{fmtPrice(r.p.cost)}</td>
                  <td className={`${td} text-right`}>{fmtPrice(r.price)}</td>
                  <td className={`${td} text-right text-red-400`}>{fmtPct(r.vsCost!)}</td>
                  <td className={`${td} text-right`}>{fmtPct(r.p.w, 2)}</td>
                </tr>
              ))}
              {!belowCost.length && <EmptyRow cols={6} />}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Showing {belowCost.length} of the deepest discounts{scope === "favorites" ? " among your picks" : ""} ·{" "}
          Estimated cost uses the average-cost method; trims keep the per-share cost.
        </p>
      </section>
    </div>
  );
}

function EmptyRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className={`${td} text-muted-foreground`}>Nothing qualifies right now.</td>
    </tr>
  );
}

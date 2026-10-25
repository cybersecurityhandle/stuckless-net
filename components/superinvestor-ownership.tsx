"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  issuerKeyForTicker,
  type LatestHoldingsJson,
  type LatestPosition,
  type ManagerSummary,
  type SuperinvestorsJson,
} from "@/lib/superinvestors";
import {
  ActivityText,
  fmtMoney,
  fmtPct,
  fmtPrice,
  fmtQuarter,
  frame,
  table,
  td,
  th,
  zebra,
} from "@/components/superinvestors";

// Dataroma's stock page bottom: every tracked superinvestor holding this
// issuer (all share classes), with size and last-quarter activity.

interface Row {
  manager: ManagerSummary;
  pos: LatestPosition;
  ticker: string | null; // share class
}

export function SuperinvestorOwnership({ ticker }: { ticker: string }) {
  const [index, setIndex] = useState<SuperinvestorsJson | null>(null);
  const [latest, setLatest] = useState<LatestHoldingsJson | null>(null);

  // Mounted with key={ticker}; both files are static and browser-cached
  useEffect(() => {
    Promise.all([
      fetch("/superinvestors.json").then((res) => (res.ok ? res.json() : Promise.reject())),
      fetch("/superinvestors/latest.json").then((res) => (res.ok ? res.json() : Promise.reject())),
    ])
      .then(([idx, lat]: [SuperinvestorsJson, LatestHoldingsJson]) => {
        setIndex(idx);
        setLatest(lat);
      })
      .catch(() => {});
  }, [ticker]);

  const rows = useMemo<Row[]>(() => {
    if (!index || !latest) return [];
    const key = issuerKeyForTicker(latest, ticker);
    if (!key) return [];
    const out: Row[] = [];
    for (const m of index.managers) {
      for (const pos of latest.holdings[m.id] ?? []) {
        if (pos.k.startsWith(key)) out.push({ manager: m, pos, ticker: latest.securities[pos.k]?.t ?? null });
      }
    }
    return out.sort((a, b) => b.pos.w - a.pos.w);
  }, [index, latest, ticker]);

  if (!index || !latest) return null;

  const owners = new Set(rows.map((r) => r.manager.id));
  const favs = new Set(rows.filter((r) => r.manager.favorite).map((r) => r.manager.id));
  const multiClass = new Set(rows.map((r) => r.pos.k)).size > 1;
  const count = (c: LatestPosition["c"]) => rows.filter((r) => r.pos.c === c).length;
  const totalValue = rows.reduce((s, r) => s + r.pos.v, 0);
  // The quarter most managers are on — early filers of the next quarter
  // (due 45 days after quarter end) shouldn't make everyone else look stale
  const periodCounts = new Map<string, number>();
  for (const m of index.managers) periodCounts.set(m.period, (periodCounts.get(m.period) ?? 0) + 1);
  const currentPeriod = [...periodCounts].sort((a, b) => b[1] - a[1])[0][0];

  return (
    <section className="pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold">Superinvestors holding {ticker}</h2>
        <Link href="/superinvestors?m=all" className="text-xs text-muted-foreground hover:text-foreground hover:underline">
          All {index.managers.length} managers →
        </Link>
      </div>

      {!rows.length ? (
        <p className="mt-2 text-sm text-muted-foreground">
          None of the {index.managers.length} tracked superinvestors hold {ticker} as of their latest 13F.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            Held by <span className="text-foreground">{owners.size}</span> of {index.managers.length} superinvestors
            {favs.size > 0 && <> (<span className="text-emerald-400">{favs.size} of your picks</span>)</>}
            {" · "}{fmtMoney(totalValue)} combined
            {" · "}last quarter: <span className="text-emerald-400">{count("new")} buying, {count("add")} adding</span>,{" "}
            <span className="text-red-400">{count("reduce")} reducing</span>
          </p>

          <div className={`mt-4 ${frame}`}>
            <table className={`${table} min-w-[860px]`}>
              <thead>
                <tr className="text-left">
                  <th className={th}>Manager</th>
                  {multiClass && <th className={th}>Class</th>}
                  <th className={`${th} text-right`}>% of<br />Portfolio</th>
                  <th className={th}>Recent<br />Activity</th>
                  <th className={`${th} text-right`}>Shares</th>
                  <th className={`${th} text-right`}>Value</th>
                  <th className={`${th} text-right`}>Reported<br />Price</th>
                  <th className={`${th} text-right`}>± Reported<br />Price</th>
                  <th className={`${th} text-right`}>Period</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ manager: m, pos, ticker: cls }) => {
                  const reported = pos.s ? pos.v / pos.s : null;
                  const quote = cls ? latest.quotes[cls]?.price : undefined;
                  const vs = quote && reported ? quote / reported - 1 : null;
                  return (
                    <tr key={`${m.id}-${pos.k}`} className={`border-b border-border/30 ${zebra}`}>
                      <td className={td}>
                        <span className="mr-1.5 inline-block w-3 text-emerald-400">{m.favorite ? "★" : ""}</span>
                        <Link href={`/superinvestors?m=${m.id}`} className="font-medium text-emerald-400 hover:underline">
                          {m.name}
                        </Link>
                        {m.firm && <span className="text-muted-foreground"> - {m.firm}</span>}
                      </td>
                      {multiClass && <td className={`${td} text-muted-foreground`}>{cls ?? "—"}</td>}
                      <td className={`${td} text-right font-medium`}>{fmtPct(pos.w, 2)}</td>
                      <td className={`${td} whitespace-nowrap`}><ActivityText type={pos.c} pct={pos.p} /></td>
                      <td className={`${td} text-right`}>{pos.s.toLocaleString()}</td>
                      <td className={`${td} text-right`}>{fmtMoney(pos.v)}</td>
                      <td className={`${td} text-right`}>{fmtPrice(reported)}</td>
                      <td className={`${td} text-right ${vs == null ? "" : vs >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {vs == null ? "—" : `${vs >= 0 ? "+" : ""}${fmtPct(vs)}`}
                      </td>
                      <td className={`${td} text-right ${m.period < currentPeriod ? "text-yellow-500/80" : "text-muted-foreground"}`}>
                        {fmtQuarter(m.period)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Latest 13F per manager — positions can be up to ~4½ months old. Managers who sold out entirely
            last quarter aren&apos;t listed; see their Activity tab.
          </p>
        </>
      )}
    </section>
  );
}

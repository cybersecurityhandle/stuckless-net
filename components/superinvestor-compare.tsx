"use client";

import { useMemo, useState } from "react";
import {
  buildIssuers,
  type LatestHoldingsJson,
  type SuperinvestorsJson,
} from "@/lib/superinvestors";
import {
  ActivityText,
  caption,
  fmtMoney,
  fmtPct,
  frame,
  StockCell,
  table,
  td,
  th,
  zebra,
} from "@/components/superinvestors";

// Two portfolios side by side: what they share, what only one owns, and
// where they disagree this quarter.

const ONLY_SHOWN = 12;

export function CompareView({
  index,
  latest,
  onSelect,
}: {
  index: SuperinvestorsJson;
  latest: LatestHoldingsJson;
  onSelect: (id: string) => void;
}) {
  const favs = index.managers.filter((m) => m.favorite);
  const [a, setA] = useState(favs[0]?.id ?? index.managers[0].id);
  const [b, setB] = useState(favs[1]?.id ?? index.managers[1].id);
  const ma = index.managers.find((m) => m.id === a)!;
  const mb = index.managers.find((m) => m.id === b)!;

  const { shared, onlyA, onlyB, overlap } = useMemo(() => {
    const issuers = [...buildIssuers(latest, [ma, mb]).values()];
    const rows = issuers.map((iss) => ({
      ...iss,
      oa: iss.owners.find((o) => o.id === a),
      ob: iss.owners.find((o) => o.id === b),
    }));
    const shared = rows.filter((r) => r.oa && r.ob).sort((x, y) => Math.min(y.oa!.w, y.ob!.w) - Math.min(x.oa!.w, x.ob!.w));
    return {
      shared,
      onlyA: rows.filter((r) => r.oa && !r.ob).sort((x, y) => y.oa!.w - x.oa!.w),
      onlyB: rows.filter((r) => r.ob && !r.oa).sort((x, y) => y.ob!.w - x.ob!.w),
      // Weight both hold in common: Σ min(wA, wB)
      overlap: shared.reduce((s, r) => s + Math.min(r.oa!.w, r.ob!.w), 0),
    };
  }, [latest, ma, mb, a, b]);

  const select = (value: string, onChange: (v: string) => void) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 max-w-[280px] rounded-md border border-border bg-background px-2 text-sm"
    >
      <optgroup label="My picks">
        {favs.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </optgroup>
      <optgroup label="All managers">
        {index.managers.filter((m) => !m.favorite).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </optgroup>
    </select>
  );

  const only = (rows: typeof onlyA, side: "oa" | "ob", who: string) => (
    <div>
      <h3 className={caption}>Only {who}</h3>
      <div className={`${frame} mt-2`}>
        <table className={table}>
          <tbody>
            {rows.slice(0, ONLY_SHOWN).map((r) => (
              <tr key={r.key} className={`border-b border-border/30 ${zebra}`}>
                <td className={`${td} max-w-[240px]`}><StockCell ticker={r.ticker} name={r.name} /></td>
                <td className={`${td} text-right`}>{fmtPct(r[side]!.w, 2)}</td>
                <td className={`${td} whitespace-nowrap text-xs`}><ActivityText type={r[side]!.c} pct={r[side]!.p} /></td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td className={`${td} text-muted-foreground`}>Nothing — fully overlapping.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length > ONLY_SHOWN && (
        <p className="mt-1 text-xs text-muted-foreground">+{rows.length - ONLY_SHOWN} more</p>
      )}
    </div>
  );

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold">Compare</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {select(a, setA)}
          <span className="text-muted-foreground">vs</span>
          {select(b, setB)}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          <span className="text-foreground">{shared.length}</span> stocks in common ·{" "}
          <span className="text-foreground">{fmtPct(overlap)}</span> portfolio overlap ·{" "}
          {fmtMoney(ma.totalValue)} vs {fmtMoney(mb.totalValue)} ·{" "}
          <button onClick={() => onSelect(a)} className="hover:text-foreground hover:underline">open {ma.name}</button>
          {" / "}
          <button onClick={() => onSelect(b)} className="hover:text-foreground hover:underline">{mb.name}</button>
        </p>
      </div>

      <section>
        <h3 className={caption}>Held by both</h3>
        <div className={`${frame} mt-2`}>
          <table className={`${table} min-w-[640px]`}>
            <thead>
              <tr className="text-left">
                <th className={th}>Stock</th>
                <th className={`${th} text-right`}>{ma.name}</th>
                <th className={th}></th>
                <th className={`${th} text-right`}>{mb.name}</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {shared.map((r) => {
                // Opposite moves this quarter are the interesting disagreements
                const up = (c?: string) => c === "new" || c === "add";
                const down = (c?: string) => c === "reduce";
                const split = (up(r.oa!.c) && down(r.ob!.c)) || (down(r.oa!.c) && up(r.ob!.c));
                return (
                  <tr key={r.key} className={`border-b border-border/30 ${zebra} ${split ? "!bg-yellow-500/10" : ""}`}>
                    <td className={`${td} max-w-[260px]`}><StockCell ticker={r.ticker} name={r.name} /></td>
                    <td className={`${td} text-right`}>{fmtPct(r.oa!.w, 2)}</td>
                    <td className={`${td} text-xs`}><ActivityText type={r.oa!.c} pct={r.oa!.p} /></td>
                    <td className={`${td} text-right`}>{fmtPct(r.ob!.w, 2)}</td>
                    <td className={`${td} text-xs`}><ActivityText type={r.ob!.c} pct={r.ob!.p} /></td>
                  </tr>
                );
              })}
              {!shared.length && (
                <tr><td colSpan={5} className={`${td} text-muted-foreground`}>No stocks in common.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Highlighted rows: one is buying while the other sells.</p>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        {only(onlyA, "oa", ma.name)}
        {only(onlyB, "ob", mb.name)}
      </div>
    </div>
  );
}

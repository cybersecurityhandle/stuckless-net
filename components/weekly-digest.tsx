"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { InsiderBuy, InsiderBuysJson, RealtimeJson } from "@/lib/insiders";
import type { SuperinvestorsJson } from "@/lib/superinvestors";
import { WATCHLIST_TICKERS } from "@/lib/watchlist-data";
import {
  ActivityText,
  caption,
  fmtMoney,
  fmtPct,
  fmtPrice,
  fmtQuarter,
  frame,
  StockCell,
  table,
  td,
  th,
  zebra,
} from "@/components/superinvestors";

// One page for the last seven days, pulled from the same static files the
// rest of the site uses.

const DAYS = 7;
const WATCHLIST_KEY = "stuckless-watchlist-v8"; // same key as the Watchlist tab

function since(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString().split("T")[0];
}

function watchlistTickers(): string[] {
  try {
    const saved = localStorage.getItem(WATCHLIST_KEY);
    if (saved) return JSON.parse(saved) as string[];
  } catch {
    // private window / blocked storage — fall back to the default list
  }
  return WATCHLIST_TICKERS;
}

export function WeeklyDigest() {
  const [index, setIndex] = useState<SuperinvestorsJson | null>(null);
  const [insiders, setInsiders] = useState<InsiderBuysJson | null>(null);
  const [realtime, setRealtime] = useState<RealtimeJson | null>(null);
  const [watch, setWatch] = useState<Set<string>>(new Set());

  useEffect(() => {
    const get = <T,>(url: string, set: (d: T) => void) =>
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: T | null) => d && set(d))
        .catch(() => {});
    get<SuperinvestorsJson>("/superinvestors.json", setIndex);
    get<InsiderBuysJson>("/insider-buys.json", setInsiders);
    get<RealtimeJson>("/superinvestors/realtime.json", setRealtime);
    // Read after mount: localStorage isn't available during prerender
    queueMicrotask(() => setWatch(new Set(watchlistTickers())));
  }, []);

  const from = since(DAYS);
  const byId = useMemo(() => new Map((index?.managers ?? []).map((m) => [m.id, m])), [index]);

  const filings = (index?.managers ?? [])
    .filter((m) => m.filed >= from)
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.filed.localeCompare(a.filed));
  const trades = (realtime?.trades ?? []).filter((t) => t.filed >= from);
  const stakes = (realtime?.stakes ?? []).filter((s) => s.filed >= from);
  const recent = (insiders?.buys ?? []).filter((b) => b.filed >= from && (b.isOfficer || b.isDirector));
  const clusters = useMemo(() => {
    const map = new Map<string, InsiderBuy[]>();
    for (const b of recent) map.set(b.ticker!, [...(map.get(b.ticker!) ?? []), b]);
    return [...map.entries()]
      .filter(([, bs]) => new Set(bs.map((b) => b.ownerCik)).size >= 2)
      .map(([t, bs]) => ({ ticker: t, issuer: bs[0].issuer, people: new Set(bs.map((b) => b.ownerCik)).size, value: bs.reduce((s, b) => s + b.value, 0) }))
      .sort((a, b) => b.people - a.people || b.value - a.value);
  }, [recent]);
  const biggest = [...recent].sort((a, b) => b.value - a.value).slice(0, 10);
  const watched = recent.filter((b) => watch.has(b.ticker!));

  const empty = (cols: number, text: string) => (
    <tr><td colSpan={cols} className={`${td} text-muted-foreground`}>{text}</td></tr>
  );

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Weekly digest</h1>
        <p className="mt-2 text-muted-foreground">
          Everything that happened since {from}: new 13Fs, superinvestors&apos; own trades and stakes, and
          insider buying.
        </p>
      </div>

      <section>
        <h2 className={caption}>New 13F filings ({filings.length})</h2>
        <div className={`${frame} mt-2`}>
          <table className={`${table} min-w-[720px]`}>
            <thead>
              <tr className="text-left">
                <th className={th}>Manager</th>
                <th className={`${th} text-right`}>Quarter</th>
                <th className={`${th} text-right`}>Value</th>
                <th className={th}>Biggest move</th>
                <th className={`${th} text-right`}>Filed</th>
              </tr>
            </thead>
            <tbody>
              {filings.map((m) => (
                <tr key={m.id} className={`border-b border-border/30 ${zebra}`}>
                  <td className={td}>
                    <span className="mr-1.5 inline-block w-3 text-emerald-400">{m.favorite ? "★" : ""}</span>
                    <Link href={`/superinvestors?m=${m.id}`} className="font-medium text-emerald-400 hover:underline">{m.name}</Link>
                  </td>
                  <td className={`${td} text-right`}>{fmtQuarter(m.period)}</td>
                  <td className={`${td} text-right`}>{fmtMoney(m.totalValue)}</td>
                  <td className={td}>
                    {m.move ? (
                      <span className="text-sm">
                        <span className="font-medium">{m.move.t ?? m.move.d}</span>{" "}
                        <ActivityText type={m.move.c} pct={m.move.p} />{" "}
                        <span className="text-muted-foreground">({fmtPct(m.move.impact)} of portfolio)</span>
                      </span>
                    ) : "—"}
                  </td>
                  <td className={`${td} text-right text-muted-foreground`}>{m.filed}</td>
                </tr>
              ))}
              {!filings.length && empty(5, "No 13Fs filed this week.")}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className={caption}>Superinvestor Form 4 trades ({trades.length})</h2>
          <div className={`${frame} mt-2`}>
            <table className={table}>
              <tbody>
                {trades.map((t) => (
                  <tr key={`${t.accession}-${t.side}`} className={`border-b border-border/30 ${zebra}`}>
                    <td className={`${td} text-muted-foreground`}>{byId.get(t.managerId)?.name ?? t.owner}</td>
                    <td className={`${td} max-w-[180px]`}><StockCell ticker={t.ticker} name={t.issuer} /></td>
                    <td className={`${td} whitespace-nowrap text-right ${t.side === "buy" ? "text-emerald-400" : "text-red-400"}`}>
                      {t.side === "buy" ? "Bought" : "Sold"} {fmtMoney(t.value)}
                    </td>
                  </tr>
                ))}
                {!trades.length && empty(3, "None this week.")}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h2 className={caption}>13D / 13G stakes ({stakes.length})</h2>
          <div className={`${frame} mt-2`}>
            <table className={table}>
              <tbody>
                {stakes.map((s) => (
                  <tr key={s.accession} className={`border-b border-border/30 ${zebra}`}>
                    <td className={`${td} text-muted-foreground`}>{byId.get(s.managerId)?.name ?? s.managerId}</td>
                    <td className={`${td} max-w-[180px]`}><StockCell ticker={s.ticker} name={s.subject} /></td>
                    <td className={`${td} whitespace-nowrap text-right`}>
                      {s.form}{s.pct != null && ` · ${s.pct.toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
                {!stakes.length && empty(3, "None this week.")}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className={caption}>Cluster buys ({clusters.length})</h2>
          <div className={`${frame} mt-2`}>
            <table className={table}>
              <tbody>
                {clusters.map((c) => (
                  <tr key={c.ticker} className={`border-b border-border/30 ${zebra}`}>
                    <td className={`${td} max-w-[220px]`}><StockCell ticker={c.ticker} name={c.issuer} /></td>
                    <td className={`${td} text-right text-emerald-400`}>{c.people} insiders</td>
                    <td className={`${td} text-right`}>{fmtMoney(c.value)}</td>
                  </tr>
                ))}
                {!clusters.length && empty(3, "No cluster buys this week.")}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h2 className={caption}>Biggest officer & director buys</h2>
          <div className={`${frame} mt-2`}>
            <table className={table}>
              <tbody>
                {biggest.map((b) => (
                  <tr key={b.accession} className={`border-b border-border/30 ${zebra}`}>
                    <td className={`${td} max-w-[180px]`}><StockCell ticker={b.ticker} name={b.issuer} /></td>
                    <td className={`${td} max-w-[160px] truncate text-muted-foreground`} title={b.owner}>{b.owner}</td>
                    <td className={`${td} text-right`}>{fmtMoney(b.value)}</td>
                  </tr>
                ))}
                {!biggest.length && empty(3, "No insider buys this week.")}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section>
        <h2 className={caption}>Insider buys in your watchlist ({watched.length})</h2>
        <div className={`${frame} mt-2`}>
          <table className={table}>
            <tbody>
              {watched.map((b) => (
                <tr key={b.accession} className={`border-b border-border/30 ${zebra}`}>
                  <td className={`${td} max-w-[220px]`}><StockCell ticker={b.ticker} name={b.issuer} /></td>
                  <td className={`${td} text-muted-foreground`}>{b.owner} · {b.role}</td>
                  <td className={`${td} text-right`}>{fmtMoney(b.value)} @ {fmtPrice(b.avgPrice)}</td>
                </tr>
              ))}
              {!watched.length && empty(3, "No insider buying in your watchlist this week.")}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

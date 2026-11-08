"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { HoldingsWeb, Legend, type BranchStyle, type TreeNode } from "@/components/holdings-web";
import { fmtMoney, fmtPct, fmtQuarter } from "@/components/superinvestors";
import { issuerKey, type LatestHoldingsJson, type SuperinvestorsJson } from "@/lib/superinvestors";
import { BRANCH_COLORS, branchItems, type CompanyHoldings, type HoldingItem } from "@/lib/company-holdings";

// "Everything X owns" from a lib/<company>.ts config (/markel, /fairfax):
// stats, a web of the config's branches plus the manager's US stocks from the
// latest 13F, a list per branch, and an acquisition history from the items'
// years. /berkshire predates this and is hand-built.

interface StockRow {
  key: string;
  ticker: string | null;
  name: string;
  value: number;
  w: number;
}

// The manager's 13F by company, share classes combined
function stockRows(latest: LatestHoldingsJson, id: string): StockRow[] {
  const byIssuer = new Map<string, StockRow & { classV: number }>();
  for (const p of latest.holdings[id] ?? []) {
    const sec = latest.securities[p.k];
    const key = issuerKey(p.k, sec);
    const cur = byIssuer.get(key);
    if (!cur) byIssuer.set(key, { key, ticker: sec?.t ?? null, name: sec?.d ?? p.k, value: p.v, w: p.w, classV: p.v });
    else {
      cur.value += p.v;
      cur.w += p.w;
      if (p.v > cur.classV) Object.assign(cur, { ticker: sec?.t ?? null, classV: p.v });
    }
  }
  return [...byIssuer.values()].sort((a, b) => b.value - a.value);
}

const stockHref = (t: string) => `/finance?ticker=${encodeURIComponent(t)}`;

function itemDetail(i: HoldingItem): string[] {
  return [
    i.pct != null ? `${fmtPct(i.pct, i.pct >= 0.995 ? 0 : 1)} owned` : null,
    i.year ? `since ${i.year}` : null,
    i.value ?? null,
    i.note ?? null,
  ].filter((x): x is string => !!x);
}

const STOCKS_SHOWN = 30; // the rest of a long 13F folds into "+N more"

function buildTree(c: CompanyHoldings, stocks: StockRow[] | null, period?: string, total?: number): TreeNode {
  const leaf = (branch: string, prefix: string) => (i: HoldingItem): TreeNode => ({
    id: `${prefix}:${i.name}`,
    label: i.pct != null && i.pct < 0.995 ? `${i.name} ${fmtPct(i.pct, 0)}` : i.name,
    branch,
    detail: itemDetail(i),
    href: i.ticker ? stockHref(i.ticker) : undefined,
    hint: i.ticker ? "Click for the stock page" : undefined,
  });
  const children: TreeNode[] = c.branches.map((b) => ({
    id: b.id,
    label: b.label,
    branch: b.id,
    detail: b.detail ? [b.detail] : undefined,
    children: [
      ...(b.items ?? []).map(leaf(b.id, b.id)),
      ...(b.groups ?? []).map((g) => ({
        id: `${b.id}/${g.name}`,
        label: g.name,
        branch: b.id,
        detail: [g.detail, `${g.items.length} companies`].filter((x): x is string => !!x),
        children: g.items.map(leaf(b.id, `${b.id}/${g.name}`)),
      })),
    ],
  }));
  if (stocks?.length) {
    const shown = stocks.slice(0, STOCKS_SHOWN);
    const rest = stocks.length - shown.length;
    children.push({
      id: "13f",
      label: "US stocks",
      branch: "13f",
      detail: [`${fmtMoney(total ?? 0)} across ${stocks.length} companies`, period ? `13F for ${fmtQuarter(period)}` : ""].filter(Boolean),
      children: [
        ...shown.map((s) => ({
          id: `t:${s.key}`,
          label: s.ticker ?? s.name,
          branch: "13f",
          detail: [s.name, `${fmtMoney(s.value)} · ${fmtPct(s.w, 2)} of the 13F`],
          href: s.ticker ? stockHref(s.ticker) : undefined,
          hint: "Click for the stock page",
        })),
        ...(rest > 0 ? [{ id: "t:rest", label: `+${rest} more`, branch: "13f", detail: ["Smaller positions, listed below"] }] : []),
      ],
    });
  }
  return { id: "root", label: c.name, detail: c.stats.map((s) => `${s.label}: ${s.value}`), children };
}

export function CompanyHoldingsView({ config: c }: { config: CompanyHoldings }) {
  const [data, setData] = useState<{ index: SuperinvestorsJson; latest: LatestHoldingsJson } | null>(null);
  useEffect(() => {
    if (!c.managerId) return;
    Promise.all([
      fetch("/superinvestors.json").then((r) => (r.ok ? r.json() : Promise.reject())),
      fetch("/superinvestors/latest.json").then((r) => (r.ok ? r.json() : Promise.reject())),
    ])
      .then(([index, latest]) => setData({ index, latest }))
      .catch(() => setData(null));
  }, [c.managerId]);

  const summary = data?.index.managers.find((m) => m.id === c.managerId);
  const stocks = useMemo(() => (data && c.managerId ? stockRows(data.latest, c.managerId) : null), [data, c.managerId]);
  const branches: BranchStyle[] = [
    ...c.branches.map((b) => ({ id: b.id, label: b.label, color: b.color })),
    ...(c.managerId ? [{ id: "13f", label: "US stocks (13F)", color: BRANCH_COLORS.blue }] : []),
  ];
  const color = Object.fromEntries(branches.map((b) => [b.id, b.color]));
  const tree = useMemo(() => buildTree(c, stocks, summary?.period, summary?.totalValue), [c, stocks, summary]);
  const leaves = c.branches.reduce((n, b) => n + branchItems(b).length, 0) + Math.min(stocks?.length ?? 0, STOCKS_SHOWN + 1);

  return (
    <>
      <section className="mt-6">
        <h2 className="text-sm font-medium text-muted-foreground">{c.statsTitle}</h2>
        <dl className="mt-2 grid gap-3 sm:grid-cols-3">
          {c.stats.map((s) => (
            <div key={s.label} className="rounded-md border border-border px-3 py-2">
              <dt className="text-xs text-muted-foreground">{s.label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{s.value}</dd>
              {s.sub && <dd className="text-xs text-muted-foreground">{s.sub}</dd>}
            </div>
          ))}
        </dl>
      </section>

      <Legend branches={branches} />
      <div className="hidden md:block">
        <HoldingsWeb tree={tree} branches={branches} label={`Everything ${c.name} owns`} rLeaf={leaves > 110 ? 400 : 340} />
      </div>
      <p className="mt-4 text-sm text-muted-foreground md:hidden">The web needs a wider screen; everything is listed below.</p>

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        {c.branches.map((b) => (
          <section key={b.id} className="min-w-0">
            <Heading color={color[b.id]}>{b.label}</Heading>
            {b.detail && <p className="mt-1 text-xs text-muted-foreground">{b.detail}</p>}
            {b.items && <Items items={b.items} />}
            {b.groups?.map((g) => (
              <div key={g.name} className="mt-4">
                <h3 className="text-sm font-medium">
                  {g.name}
                  {g.detail && <span className="font-normal text-muted-foreground"> · {g.detail}</span>}
                </h3>
                <Items items={g.items} />
              </div>
            ))}
          </section>
        ))}
        {c.managerId && (
          <section className="min-w-0">
            <Heading color={BRANCH_COLORS.blue}>US stocks (13F)</Heading>
            {summary && stocks ? (
              <>
                <p className="mt-1 text-xs text-muted-foreground">
                  {fmtMoney(summary.totalValue)} in {stocks.length} companies, 13F for {fmtQuarter(summary.period)} ·{" "}
                  <Link href={`/superinvestors?m=${c.managerId}`} className="hover:text-foreground hover:underline">
                    full holdings
                  </Link>
                </p>
                <ol className="mt-3 columns-2 gap-6 text-sm sm:columns-3">
                  {stocks.map((s) => (
                    <li key={s.key} className="flex justify-between gap-2 break-inside-avoid py-0.5">
                      {s.ticker ? (
                        <Link href={stockHref(s.ticker)} className="font-medium text-emerald-400 hover:underline" title={s.name}>
                          {s.ticker}
                        </Link>
                      ) : (
                        <span className="truncate" title={s.name}>
                          {s.name}
                        </span>
                      )}
                      <span className="tabular-nums text-muted-foreground">{fmtMoney(s.value)}</span>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
            )}
          </section>
        )}
      </div>

      <History c={c} />

      <p className="mt-6 text-xs text-muted-foreground">
        Sources:{" "}
        {c.sources.map((s, i) => (
          <span key={s.url}>
            {i > 0 && ", "}
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline">
              {s.label}
            </a>
          </span>
        ))}
        .{c.notes?.map((n) => ` ${n}`)}
      </p>
    </>
  );
}

// Every deal the filings report, newest first, searchable
function FullHistory({ c }: { c: CompanyHoldings }) {
  const [q, setQ] = useState("");
  const all = [...(c.acquisitions ?? [])].sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
  const query = q.trim().toLowerCase();
  const rows = query ? all.filter((a) => `${a.name} ${a.deal ?? ""} ${a.date}`.toLowerCase().includes(query)) : all;
  const first = all.at(-1)?.date.slice(0, 4);
  return (
    <section className="mt-10 min-w-0">
      <h2 className="text-lg font-semibold">
        All acquisitions <span className="text-sm font-normal text-muted-foreground">· {all.length} since {first}</span>
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">{c.historyNote}</p>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search company, deal or year"
        className="mt-3 w-full rounded-md border border-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-foreground/40 sm:w-72"
        aria-label={`Search ${c.short}'s acquisitions`}
      />
      <div className="mt-3 overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[640px] text-sm tabular-nums">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Company</th>
              <th className="px-3 py-2 font-medium">Deal</th>
              <th className="px-3 py-2 text-right font-medium">Price</th>
              <th className="px-3 py-2 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={`${a.date}:${a.name}:${a.deal ?? ""}`} className="border-b border-border/30 even:bg-muted/20">
                <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">{fmtDealDate(a.date)}</td>
                <td className="px-3 py-1.5 font-medium">{a.name}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{a.deal ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right">{a.price ?? <span className="text-muted-foreground">—</span>}</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">{a.src}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="px-3 py-3 text-muted-foreground">
                  No match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Heading({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-lg font-semibold">
      <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {children}
    </h2>
  );
}

function Items({ items }: { items: HoldingItem[] }) {
  return (
    <ul className="mt-2 space-y-1 text-sm">
      {items.map((i) => (
        <li key={i.name} className="flex flex-wrap items-baseline justify-between gap-x-4">
          <span>
            {i.ticker ? (
              <Link href={stockHref(i.ticker)} className="font-medium text-emerald-400 hover:underline">
                {i.name}
              </Link>
            ) : (
              <span className="font-medium">{i.name}</span>
            )}
            {(i.note || i.value) && <span className="text-xs text-muted-foreground"> · {[i.value, i.note].filter(Boolean).join(" · ")}</span>}
          </span>
          <span className="tabular-nums text-xs text-muted-foreground">
            {[i.pct != null && i.pct < 0.995 ? `${fmtPct(i.pct, 1)} owned` : null, i.year].filter(Boolean).join(" · ")}
          </span>
        </li>
      ))}
    </ul>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDealDate = (d: string) => (d.length === 7 ? `${MONTHS[+d.slice(5) - 1]} ${d.slice(0, 4)}` : d);

function History({ c }: { c: CompanyHoldings }) {
  if (c.acquisitions?.length) return <FullHistory c={c} />;
  const rows = c.branches
    .flatMap((b) => [
      ...(b.items ?? []).map((i) => ({ i, where: b.label })),
      ...(b.groups ?? []).flatMap((g) => g.items.map((i) => ({ i, where: `${b.label} · ${g.name}` }))),
    ])
    .filter((r) => r.i.year)
    .sort((a, b) => a.i.year! - b.i.year! || a.i.name.localeCompare(b.i.name));
  if (!rows.length) return null;
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">Acquisition history</h2>
      <p className="mt-1 text-xs text-muted-foreground">{c.historyNote}</p>
      <div className="mt-3 overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[560px] text-sm tabular-nums">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-medium">Year</th>
              <th className="px-3 py-2 font-medium">Company</th>
              <th className="px-3 py-2 font-medium">Part of</th>
              <th className="px-3 py-2 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ i, where }) => (
              <tr key={`${where}:${i.name}`} className="border-b border-border/30 even:bg-muted/20">
                <td className="px-3 py-1.5 text-muted-foreground">{i.year}</td>
                <td className="px-3 py-1.5 font-medium">{i.name}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{where}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{i.src ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

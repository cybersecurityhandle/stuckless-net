"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { HoldingsWeb, Legend, type BranchStyle, type TreeNode } from "@/components/holdings-web";
import { fmtPct } from "@/components/superinvestors";
import { ACQUISITION_SPEND, GROUPS, LISTED, NAMED_DEALS, RESULTS, SOURCES, type Ownership, type PortfolioJson } from "@/lib/csu";
import type { TssJson } from "@/lib/topicus";

// Everything Constellation Software owns. 1,100+ businesses won't fit round a
// circle, so the web stops at the operating groups (with company counts) and
// the directory below lists every name the groups publish. Colors show how
// Constellation owns each group; same validated 600-step hues as /berkshire.

const BRANCHES: (BranchStyle & { id: Ownership })[] = [
  { id: "wholly", label: "Wholly owned groups", color: "var(--color-emerald-600)" },
  { id: "topicus", label: `Topicus (${fmtPct(LISTED.topicus.equity)} owned)`, color: "var(--color-sky-600)" },
  { id: "lumine", label: `Lumine (${fmtPct(LISTED.lumine.equity)} owned)`, color: "var(--color-amber-600)" },
];
const COLOR = Object.fromEntries(BRANCHES.map((b) => [b.id, b.color])) as Record<Ownership, string>;

const usd = (m: number) => `$${m.toLocaleString()}M`;

interface Row {
  name: string;
  group: string;
  url?: string;
  vertical?: string;
  year?: number;
  hq?: string;
}

function useData() {
  const [data, setData] = useState<{ portfolio: PortfolioJson; tss: TssJson } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    Promise.all([
      fetch("/csu/portfolio.json").then((r) => (r.ok ? r.json() : Promise.reject())),
      fetch("/topicus/tss.json").then((r) => (r.ok ? r.json() : Promise.reject())),
    ])
      .then(([portfolio, tss]) => setData({ portfolio, tss }))
      .catch(() => setError(true));
  }, []);
  return { data, error };
}

// "Kansys Inc." ~ "Kansys", "Titan.ium" ~ "Titanium", "Empresa 1" ~ "Empresa1"
const nameKey = (n: string) =>
  n
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]/g, "")
    .replace(/(inc|ltd|llc|gmbh)$/, "")
    .replace(/s$/, "");

// Lumine and Modaxo were split off from Volaris, whose site still lists their
// companies: those appear once, under the group that runs them now, with
// Volaris's vertical and year
const SPUN_OUT_OF_VOLARIS = ["lumine", "modaxo"];

// Every listed company, one row each, Topicus from the TSS deal list
function allRows(portfolio: PortfolioJson, tss: TssJson): Row[] {
  const volaris = new Map((portfolio.groups.volaris?.companies ?? []).map((c) => [nameKey(c.name), c]));
  const moved = new Set<string>();
  const rows: Row[] = [];
  for (const g of GROUPS) {
    if (g.id === "topicus") {
      for (const d of tss.deals) rows.push({ name: d.company, group: g.id, url: d.url, hq: d.country ?? undefined, year: Number(d.date.slice(0, 4)) });
      continue;
    }
    if (g.id === "volaris") continue; // after the spun-out groups, below
    for (const c of portfolio.groups[g.id]?.companies ?? []) {
      const v = SPUN_OUT_OF_VOLARIS.includes(g.id) ? volaris.get(nameKey(c.name)) : undefined;
      if (v) moved.add(nameKey(c.name));
      rows.push({ name: c.name, group: g.id, url: c.url ?? v?.url, vertical: c.vertical ?? v?.vertical, year: c.acquired ?? v?.acquired, hq: c.hq ?? v?.hq });
    }
  }
  for (const [key, c] of volaris) {
    if (!moved.has(key)) rows.push({ name: c.name, group: "volaris", url: c.url, vertical: c.vertical, year: c.acquired, hq: c.hq });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}

function buildTree(counts: Record<string, number>, total: number): TreeNode {
  const node = (g: (typeof GROUPS)[number]): TreeNode => ({
    id: g.id,
    label: `${g.name} · ${counts[g.id] ?? 0}`,
    branch: g.ownership,
    detail: [
      g.about,
      `${counts[g.id] ?? 0} companies listed${g.claimed ? ` (says ${g.claimed})` : ""}`,
      ...(g.listNote ? [g.listNote] : []),
      ...(g.ownership === "topicus"
        ? [`Constellation: ${fmtPct(LISTED.topicus.equity)} of equity, ${fmtPct(LISTED.topicus.votes)} of votes`]
        : g.ownership === "lumine"
          ? [`Constellation: ${fmtPct(LISTED.lumine.equity)} of equity, ${fmtPct(LISTED.lumine.votes)} of votes`]
          : []),
    ],
    href: g.page ?? g.site,
    hint: g.page ? "Click for its page here" : "Click for the group's portfolio",
  });
  return {
    id: "root",
    label: "Constellation Software",
    detail: [
      `${RESULTS.period}: revenue ${usd(RESULTS.revenue)} (+${fmtPct(RESULTS.revenueGrowth, 0)})`,
      `Net income to shareholders ${usd(RESULTS.netIncome)}, FCFA2S ${usd(RESULTS.fcfa2s)}`,
      `${total.toLocaleString()} companies named by its groups`,
    ],
    // Groups straight off the root, colored by ownership
    children: GROUPS.map(node),
  };
}

export function CsuWeb() {
  const { data, error } = useData();
  const rows = useMemo(() => (data ? allRows(data.portfolio, data.tss) : []), [data]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.group] = (c[r.group] ?? 0) + 1;
    return c;
  }, [rows]);

  return (
    <>
      <Results />
      {error && <p className="mt-6 text-red-400">Couldn&apos;t load the portfolio lists.</p>}
      {!data && !error && <p className="mt-6 text-muted-foreground">Loading…</p>}
      {data && (
        <>
          <Legend branches={BRANCHES} />
          <div className="mx-auto hidden max-w-[820px] md:block">
            <HoldingsWeb tree={buildTree(counts, rows.length)} branches={BRANCHES} label="Constellation Software's operating groups" rLeaf={260} leafFont={13} />
          </div>
          <Directory rows={rows} counts={counts} portfolio={data.portfolio} />
          <div className="mt-10 grid gap-10 lg:grid-cols-2">
            <Spend />
            <Deals />
          </div>
        </>
      )}
    </>
  );
}

function Results() {
  const stats = [
    { label: "Revenue", value: usd(RESULTS.revenue), sub: `+${fmtPct(RESULTS.revenueGrowth, 0)}` },
    { label: "Net income", value: usd(RESULTS.netIncome), sub: "to Constellation's shareholders" },
    { label: "FCFA2S", value: usd(RESULTS.fcfa2s), sub: "free cash flow available to shareholders" },
  ];
  return (
    <section className="mt-6">
      <h2 className="text-sm font-medium text-muted-foreground">
        {RESULTS.period} ·{" "}
        <a href={SOURCES.mda.url} target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline">
          {SOURCES.mda.label}
        </a>
      </h2>
      <dl className="mt-2 grid gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-md border border-border px-3 py-2">
            <dt className="text-xs text-muted-foreground">{s.label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{s.value}</dd>
            <dd className="text-xs text-muted-foreground">{s.sub}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">
        Listed subsidiaries, {LISTED.asOf}:{" "}
        <Link href="/topicus" className="hover:text-foreground hover:underline">
          Topicus
        </Link>{" "}
        {fmtPct(LISTED.topicus.equity)} of equity, Lumine {fmtPct(LISTED.lumine.equity)}; Constellation holds{" "}
        {fmtPct(LISTED.topicus.votes)} of the votes in each through a super voting share.
      </p>
    </section>
  );
}

function Directory({ rows, counts, portfolio }: { rows: Row[]; counts: Record<string, number>; portfolio: PortfolioJson }) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<string | null>(null);
  const query = q.trim().toLowerCase();
  const shown = rows.filter(
    (r) => (!group || r.group === group) && (!query || `${r.name} ${r.vertical ?? ""} ${r.hq ?? ""}`.toLowerCase().includes(query))
  );
  const byId = Object.fromEntries(GROUPS.map((g) => [g.id, g]));
  const chip = (active: boolean) =>
    `rounded-full border px-2.5 py-0.5 text-xs transition-colors ${active ? "border-foreground/50 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`;
  return (
    <section className="mt-10 min-w-0">
      <h2 className="text-lg font-semibold">Every company the groups list</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {rows.length.toLocaleString()} names from the groups&apos; own websites (refreshed {portfolio.updated}), of
        Constellation&apos;s 1,100+ businesses — the rest aren&apos;t listed anywhere public. Volaris gives the year each was
        acquired; Topicus rows are TSS deals with the year announced. Companies Volaris still lists after Lumine and Modaxo
        were split off from it appear once, under the group that runs them now.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, vertical or country"
          className="w-full rounded-md border border-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-foreground/40 sm:w-72"
          aria-label="Search Constellation's companies"
        />
        <button onClick={() => setGroup(null)} className={chip(!group)}>
          All {rows.length}
        </button>
        {GROUPS.map((g) => (
          <button key={g.id} onClick={() => setGroup(group === g.id ? null : g.id)} className={chip(group === g.id)}>
            <span aria-hidden className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: COLOR[g.ownership] }} />
            {g.name} {counts[g.id] ?? 0}
          </button>
        ))}
      </div>
      {group && byId[group]?.listNote && <p className="mt-2 text-xs text-muted-foreground">{byId[group].name}: {byId[group].listNote}.</p>}
      <ul className="mt-4 columns-1 gap-6 text-sm sm:columns-2 lg:columns-3">
        {shown.map((r) => {
          const g = byId[r.group];
          const extra = [r.vertical, r.year, r.hq && r.group === "topicus" ? r.hq : null].filter(Boolean).join(" · ");
          return (
            <li key={`${r.group}:${r.name}`} className="flex break-inside-avoid items-baseline gap-1.5 py-0.5">
              <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: COLOR[g.ownership] }} title={g.name} />
              <span className="min-w-0">
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {r.name}
                  </a>
                ) : (
                  r.name
                )}
                <span className="text-xs text-muted-foreground">
                  {" "}
                  {g.name}
                  {extra ? ` · ${extra}` : ""}
                </span>
              </span>
            </li>
          );
        })}
        {!shown.length && <li className="text-muted-foreground">No match.</li>}
      </ul>
      {portfolio.failed.length > 0 && (
        <p className="mt-2 text-xs text-yellow-500/80">Last refresh couldn&apos;t read: {portfolio.failed.join(", ")} (showing the previous list).</p>
      )}
    </section>
  );
}

function Spend() {
  return (
    <section>
      <h2 className="text-lg font-semibold">Acquisition spend</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Total consideration each year, including holdbacks and contingent payments, from Constellation&apos;s year-end press
        releases. 2018 and earlier releases aren&apos;t on its site.
      </p>
      <table className="mt-3 w-full text-sm tabular-nums">
        <tbody>
          {[...ACQUISITION_SPEND].reverse().map((r) => (
            <tr key={r.year} className="border-b border-border/30">
              <td className="py-1.5 pr-3 text-muted-foreground">
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline">
                  {r.year}
                </a>
              </td>
              <td className="py-1.5 text-right font-medium">{usd(r.spend)}</td>
              <td className="py-1.5 pl-3 text-xs text-muted-foreground">{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Deals() {
  return (
    <section>
      <h2 className="text-lg font-semibold">Deals Constellation names</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Its filings describe only a handful by name, from the{" "}
        <a href={SOURCES.mda.url} target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline">
          {SOURCES.mda.label}
        </a>
        .
      </p>
      <ul className="mt-3 space-y-2 text-sm">
        {NAMED_DEALS.map((d) => (
          <li key={d.name}>
            <span className="tabular-nums text-muted-foreground">{d.date}</span> <span className="font-medium">{d.name}</span>{" "}
            <span className="text-muted-foreground">
              via {d.via} · {d.note}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

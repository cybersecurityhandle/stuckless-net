"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { HoldingsWeb, Legend, usePhone, type BranchStyle, type TreeNode } from "@/components/holdings-web";
import { fmtPct } from "@/components/superinvestors";
import { ACQUISITION_SPEND, GROUPS, LISTED, NAMED_DEALS, RESULTS, SOURCES, type Ownership, type PortfolioJson } from "@/lib/csu";
import type { TssJson } from "@/lib/topicus";

// Everything Constellation Software owns. The web starts at the operating
// groups (with company counts); tick a group to open it into its companies,
// in a zoomable frame (wheel zoom, drag to pan) since ~860 leaves can't be
// read at page width. The directory below lists every name the groups publish. Colors show
// how Constellation owns each group; same validated 600-step hues as /berkshire.

const BRANCHES: (BranchStyle & { id: Ownership })[] = [
  { id: "wholly", label: "Wholly owned groups", color: "var(--color-emerald-600)" },
  { id: "topicus", label: `Topicus (${fmtPct(LISTED.topicus.equity)} owned)`, color: "var(--color-sky-600)" },
  { id: "lumine", label: `Lumine (${fmtPct(LISTED.lumine.equity)} owned)`, color: "var(--color-amber-600)" },
];
const COLOR = Object.fromEntries(BRANCHES.map((b) => [b.id, b.color])) as Record<Ownership, string>;

// Opened groups sit out toward the rim so company links run short
const OPEN_RINGS = [0, 0.4, 0.74, 0.86];

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

// A ticked group's companies: hover for details, click for the site. Big
// groups split into sub-branches so their links fan out from nearby hubs:
// by vertical or country where the group's site gives one, otherwise into
// alphabetical ranges. Sub-branches under 3 companies fold into "Other".
const SPLIT_BY: Record<string, { key: (r: Row) => string | undefined; other: string }> = {
  volaris: { key: (r) => r.vertical, other: "Other verticals" },
  vela: { key: (r) => r.vertical, other: "Other verticals" },
  topicus: { key: (r) => r.hq, other: "Other countries" },
};
const ALPHA_OVER = 60; // groups with no metadata and more companies than this go into A–Z ranges

function companyChildren(groupId: string, rows: Row[], branch: Ownership): TreeNode[] {
  const topicus = groupId === "topicus";
  const mine = rows.filter((r) => r.group === groupId);
  const leaf = (r: Row, i: number): TreeNode => ({
    id: `${groupId}:${i}:${r.name}`,
    label: r.name,
    branch,
    detail: [r.vertical, r.year ? `${topicus ? "Announced" : "Acquired"} ${r.year}` : undefined, r.hq].filter(
      (x): x is string => Boolean(x)
    ),
    href: r.url,
    hint: topicus ? "Click for the announcement" : "Click for its website",
  });
  const hub = (name: string, list: Row[]): TreeNode => ({
    id: `${groupId}/${name}`,
    label: name,
    branch,
    detail: [`${list.length} compan${list.length === 1 ? "y" : "ies"}`],
    children: list.map(leaf),
  });

  const split = SPLIT_BY[groupId];
  if (split) {
    const by = new Map<string, Row[]>();
    for (const r of mine) {
      const k = split.key(r) ?? split.other;
      by.set(k, [...(by.get(k) ?? []), r]);
    }
    const other: Row[] = [];
    const hubs: [string, Row[]][] = [];
    for (const [k, list] of by) {
      if (k !== split.other && list.length >= 3) hubs.push([k, list]);
      else other.push(...list);
    }
    hubs.sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    return [...hubs.map(([k, list]) => hub(k, list)), ...(other.length ? [hub(split.other, other)] : [])];
  }
  if (mine.length > ALPHA_OVER) {
    const chunks = Math.ceil(mine.length / 32);
    const per = Math.ceil(mine.length / chunks);
    const out: TreeNode[] = [];
    for (let i = 0; i < mine.length; i += per) {
      const part = mine.slice(i, i + per);
      const a = part[0].name[0].toUpperCase();
      const z = part[part.length - 1].name[0].toUpperCase();
      out.push(hub(a === z ? a : `${a}–${z}`, part));
    }
    return out;
  }
  return mine.map(leaf);
}

function alternateBySize<T extends { id: string }>(list: readonly T[], counts: Record<string, number>): T[] {
  const bySize = [...list].sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0));
  const out: T[] = [];
  while (bySize.length) {
    out.push(bySize.shift()!);
    if (bySize.length) out.push(bySize.pop()!);
  }
  return out;
}

function buildTree(counts: Record<string, number>, total: number, open: Set<string>, rows: Row[]): TreeNode {
  const node = (g: (typeof GROUPS)[number]): TreeNode => ({
    id: g.id,
    children: open.has(g.id) ? companyChildren(g.id, rows, g.ownership) : undefined,
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
    // An expanded group isn't a link: its leaves are
    href: open.has(g.id) ? undefined : (g.page ?? g.site),
    hint: g.page ? "Click for its page here" : "Click for the group's portfolio",
  });
  return {
    id: "root",
    label: "Constellation Software",
    href: "/finance?ticker=CSU.TO",
    hint: "Click for the CSU five-factor analysis",
    detail: [
      `${RESULTS.period}: revenue ${usd(RESULTS.revenue)} (+${fmtPct(RESULTS.revenueGrowth, 0)})`,
      `Net income to shareholders ${usd(RESULTS.netIncome)}, FCFA2S ${usd(RESULTS.fcfa2s)}`,
      `${total.toLocaleString()} companies named by its groups`,
    ],
    // Groups straight off the root, colored by ownership, big and small
    // alternating so the small groups' labels don't crowd each other
    children: alternateBySize(GROUPS, counts).map(node),
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

  const [open, setOpen] = useState<Set<string>>(new Set());
  const phone = usePhone(); // phones always get the zoomable frame: even 9 groups are too small to read at that width
  const tree = useMemo(() => buildTree(counts, rows.length, open, rows), [counts, rows, open]);
  // Leaf ring big enough for ~14 units per leaf once companies are shown
  const leaves = GROUPS.reduce((s, g) => s + (open.has(g.id) ? (counts[g.id] ?? 0) : 1), 0);
  // On a phone the nine-group web uses a small ring and big type, so its
  // labels fit the frame and read at ~9px
  const rLeaf = open.size ? Math.max(360, Math.round(((leaves + 2.5 * GROUPS.length) * 14) / (2 * Math.PI))) : phone ? 120 : 260;

  return (
    <>
      <Results />
      {error && <p className="mt-6 text-red-400">Couldn&apos;t load the portfolio lists.</p>}
      {!data && !error && <p className="mt-6 text-muted-foreground">Loading…</p>}
      {data && (
        <>
          <Legend branches={BRANCHES} />
          <ShowCompanies open={open} setOpen={setOpen} counts={counts} total={rows.length} />
          {open.size || phone ? (
            <div>
              {/* keyed by size so each new selection opens fitted */}
              <HoldingsWeb
                key={rLeaf}
                tree={tree}
                branches={BRANCHES}
                label="Constellation Software's operating groups and their companies"
                rLeaf={rLeaf}
                rings={open.size ? OPEN_RINGS : undefined}
                linkOpacity={open.size ? 0.35 : undefined}
                leafFont={open.size ? undefined : 15}
                zoomable
              />
            </div>
          ) : (
            <div className="mx-auto max-w-[820px]">
              <HoldingsWeb tree={tree} branches={BRANCHES} label="Constellation Software's operating groups" rLeaf={260} leafFont={13} />
            </div>
          )}
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

// One tick box per group; ticked groups open into their companies in the web
function ShowCompanies({
  open,
  setOpen,
  counts,
  total,
}: {
  open: Set<string>;
  setOpen: (s: Set<string>) => void;
  counts: Record<string, number>;
  total: number;
}) {
  const all = open.size === GROUPS.length;
  const toggle = (id: string) => {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpen(next);
  };
  return (
    <fieldset className="mt-4">
      <legend className="text-xs text-muted-foreground">
        Show each group&apos;s companies in the web
        {open.size ? (
          <>
            <span className="hidden md:inline"> · zoom in to read names; hover a company for details, click for its site</span>
            <span className="md:hidden"> · pinch to read names; tap a company for details, tap again for its site</span>
          </>
        ) : null}
      </legend>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={all}
            ref={(el) => {
              if (el) el.indeterminate = open.size > 0 && !all;
            }}
            onChange={() => setOpen(all ? new Set() : new Set(GROUPS.map((g) => g.id)))}
            className="accent-emerald-600"
          />
          All {total.toLocaleString()}
        </label>
        {GROUPS.map((g) => (
          <label key={g.id} className="flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={open.has(g.id)} onChange={() => toggle(g.id)} className="accent-emerald-600" />
            <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: COLOR[g.ownership] }} />
            {g.name} <span className="text-muted-foreground">{counts[g.id] ?? 0}</span>
          </label>
        ))}
      </div>
    </fieldset>
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

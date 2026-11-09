"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { HoldingsWeb, Legend, usePhone, type BranchStyle, type TreeNode } from "@/components/holdings-web";
import { fmtPct } from "@/components/superinvestors";
import { ACQUISITION_SPEND, OWNERSHIP, RESULTS, SOURCES, STAKES, TOPICUS_NL, type TssJson } from "@/lib/topicus";

// Everything Topicus.com owns: Topicus (NL) by sector, every acquisition
// TSS has announced since 2016 grouped by country, and its listed stakes.
// Same validated 600-step hues as /berkshire (first three of that set).

const BRANCHES: BranchStyle[] = [
  { id: "nl", label: "Topicus (Netherlands)", color: "var(--color-emerald-600)" },
  { id: "tss", label: "TSS acquisitions", color: "var(--color-sky-600)" },
  { id: "stakes", label: "Listed stakes", color: "var(--color-amber-600)" },
];
const COLOR = Object.fromEntries(BRANCHES.map((b) => [b.id, b.color]));

const eur = (m: number) => `€${m.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;

function fmtDay(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function buildTree(tss: TssJson): TreeNode {
  const byCountry = new Map<string, TssJson["deals"]>();
  for (const d of tss.deals) {
    const c = d.country ?? "Other";
    byCountry.set(c, [...(byCountry.get(c) ?? []), d]);
  }
  // Biggest countries first, each country's deals oldest first. Countries
  // with fewer than SMALL deals share an "Other countries" hub — a hub each
  // crowds their labels together.
  const SMALL = 4;
  const sorted = [...byCountry].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const small = sorted.filter(([, ds]) => ds.length < SMALL);
  const countries: [string, TssJson["deals"]][] = [
    ...sorted.filter(([, ds]) => ds.length >= SMALL),
    ...(small.length ? [["Other countries", small.flatMap(([, ds]) => ds).sort((a, b) => b.date.localeCompare(a.date))] as [string, TssJson["deals"]]] : []),
  ];
  return {
    id: "root",
    label: "Topicus.com",
    href: "/finance?ticker=TOI.V",
    hint: "Click for the TOI five-factor analysis",
    detail: [
      `${RESULTS.period}: revenue ${eur(RESULTS.revenue)} (+${fmtPct(RESULTS.revenueGrowth, 0)})`,
      `Net income ${eur(RESULTS.netIncome)}, ${eur(RESULTS.netIncomeTopicus)} to Topicus.com shareholders`,
      `Constellation: ${fmtPct(OWNERSHIP.csiEconomic)} of the equity, ${fmtPct(OWNERSHIP.csiVotes)} of the votes`,
    ],
    children: [
      {
        id: "nl",
        label: "Topicus (NL)",
        branch: "nl",
        detail: ["Topicus.com B.V., combined with TSS in 2021"],
        children: TOPICUS_NL.sectors.map((s) => ({ id: `nl:${s}`, label: s, branch: "nl", detail: ["Topicus (NL) sector"], href: TOPICUS_NL.url, hint: "Click for topicus.nl" })),
      },
      {
        id: "tss",
        label: "TSS",
        branch: "tss",
        detail: [`${tss.deals.length} acquisitions announced since ${tss.deals.at(-1)?.date.slice(0, 4)}`, `${byCountry.size} countries`],
        children: [
          // Held through TSS Europe B.V.
          {
            id: "stakes",
            label: "Listed stakes",
            branch: "stakes",
            detail: ["Polish listed companies, held through TSS Europe"],
            children: STAKES.map((s) => ({
              id: `s:${s.ticker}`,
              label: `${s.company} ${fmtPct(s.pct, 1)}`,
              branch: "stakes",
              detail: [`${s.ticker} · ${fmtPct(s.pct, 2)} owned`, s.note],
              href: s.page,
              hint: `Click for everything ${s.company} owns`,
            })),
          },
          ...countries.map(([country, deals]) => ({
            id: `c:${country}`,
            label: country,
            branch: "tss",
            detail: [`${deals.length} TSS acquisition${deals.length === 1 ? "" : "s"}`],
            children: [...deals].reverse().map((d) => ({
              id: `d:${d.id}`,
              label: d.company,
              branch: "tss",
              detail: [`${d.country ?? "—"} · joined ${fmtDay(d.date)}`],
              href: d.url,
              hint: "Click for TSS's announcement",
            })),
          })),
        ],
      },
    ],
  };
}

export function TopicusWeb() {
  const [tss, setTss] = useState<TssJson | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    fetch("/topicus/tss.json")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setTss)
      .catch(() => setError(true));
  }, []);
  const tree = useMemo(() => (tss ? buildTree(tss) : null), [tss]);
  const phone = usePhone();

  return (
    <>
      <Ownership />
      <Results />
      {error && <p className="mt-6 text-red-400">Couldn&apos;t load the TSS acquisition list.</p>}
      {!tss && !error && <p className="mt-6 text-muted-foreground">Loading…</p>}
      {tss && tree && (
        <>
          <Legend branches={BRANCHES} />
          {/* Phones: pinch to zoom, tap a company for details */}
          <HoldingsWeb tree={tree} branches={BRANCHES} label="Everything Topicus.com owns" rLeaf={440} zoomable={phone} />
          <div className="mt-10 grid gap-10 lg:grid-cols-[2fr_1fr]">
            <Deals tss={tss} />
            <div className="space-y-10">
              <Spend />
              <Stakes />
            </div>
          </div>
        </>
      )}
    </>
  );
}

// Constellation → Topicus.com Inc. → Topicus Coop → the businesses
function Ownership() {
  const others = OWNERSHIP.coop.slice(1);
  const box = "rounded-md border border-border px-3 py-2";
  const arrow = <span aria-hidden className="hidden text-muted-foreground sm:block">→</span>;
  return (
    <section className="mt-6">
      <h2 className="text-sm font-medium text-muted-foreground">Who owns it, as of {OWNERSHIP.asOf}</h2>
      <div className="mt-2 flex flex-col gap-2 text-sm sm:flex-row sm:items-center">
        <div className={box}>
          <p className="font-medium">Constellation Software</p>
          <p className="text-xs text-muted-foreground">
            {fmtPct(OWNERSHIP.csiEconomic)} of the equity, {fmtPct(OWNERSHIP.csiVotes)} of the votes
          </p>
        </div>
        {arrow}
        <div className={box}>
          <p className="font-medium">Topicus.com Inc. (TSXV:TOI)</p>
          <p className="text-xs text-muted-foreground">owns {fmtPct(OWNERSHIP.coop[0].pct, 2)} of Topicus Coop</p>
        </div>
        {arrow}
        <div className={box}>
          <p className="font-medium">Topicus Coop</p>
          <p className="text-xs text-muted-foreground">
            also {others.map((o) => `${o.holder} ${fmtPct(o.pct, 2)}`).join(", ")}
          </p>
        </div>
        {arrow}
        <div className={box}>
          <p className="font-medium">The businesses</p>
          <p className="text-xs text-muted-foreground">Topicus (NL), TSS, Sygnity</p>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        From the{" "}
        <a href={SOURCES.mda.url} target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline">
          {SOURCES.mda.label}
        </a>{" "}
        and the{" "}
        <a href={SOURCES.csi.url} target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline">
          {SOURCES.csi.label}
        </a>
        .
      </p>
    </section>
  );
}

function Results() {
  const stats = [
    { label: "Revenue", value: eur(RESULTS.revenue), sub: `+${fmtPct(RESULTS.revenueGrowth, 0)}` },
    { label: "Net income", value: eur(RESULTS.netIncome), sub: `${eur(RESULTS.netIncomeTopicus)} to Topicus.com shareholders` },
    { label: "FCFA2S", value: eur(RESULTS.fcfa2s), sub: "free cash flow available to shareholders" },
  ];
  return (
    <section className="mt-6">
      <h2 className="text-sm font-medium text-muted-foreground">{RESULTS.period}</h2>
      <dl className="mt-2 grid gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-md border border-border px-3 py-2">
            <dt className="text-xs text-muted-foreground">{s.label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{s.value}</dd>
            <dd className="text-xs text-muted-foreground">{s.sub}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function heading(branch: string, text: string) {
  return (
    <h2 className="flex items-center gap-2 text-lg font-semibold">
      <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLOR[branch] }} />
      {text}
    </h2>
  );
}

function Deals({ tss }: { tss: TssJson }) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const rows = query ? tss.deals.filter((d) => `${d.company} ${d.country} ${d.title}`.toLowerCase().includes(query)) : tss.deals;
  const perYear = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of tss.deals) m.set(d.date.slice(0, 4), (m.get(d.date.slice(0, 4)) ?? 0) + 1);
    return [...m].sort((a, b) => b[0].localeCompare(a[0]));
  }, [tss]);
  return (
    // min-w-0: the table's min width mustn't widen the grid column past a phone screen
    <section className="min-w-0">
      {heading("tss", "TSS acquisitions")}
      <p className="mt-1 text-xs text-muted-foreground">
        Every acquisition announced in{" "}
        <a href={SOURCES.tss.url} target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline">
          {SOURCES.tss.label}
        </a>{" "}
        since 2016, refreshed {tss.updated}. Topicus (NL)&apos;s own deals and older TSS ones aren&apos;t on that list.
      </p>
      <p className="mt-2 text-xs text-muted-foreground tabular-nums">
        Per year: {perYear.map(([y, n]) => `${y} ${n}`).join(" · ")}
      </p>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search company or country"
        className="mt-3 w-full rounded-md border border-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-foreground/40 sm:w-72"
        aria-label="Search TSS acquisitions"
      />
      <div className="mt-3 max-h-[640px] overflow-auto rounded-md border border-border">
        <table className="w-full min-w-[520px] text-sm tabular-nums">
          <thead className="sticky top-0 bg-background">
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-medium">Joined</th>
              <th className="px-3 py-2 font-medium">Company</th>
              <th className="px-3 py-2 font-medium">Country</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className="border-b border-border/30 even:bg-muted/20">
                <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">{fmtDay(d.date)}</td>
                <td className="px-3 py-1.5">
                  <a href={d.url} target="_blank" rel="noopener noreferrer" title={d.title} className="font-medium hover:underline">
                    {d.company}
                  </a>
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">{d.country ?? "—"}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={3} className="px-3 py-3 text-muted-foreground">
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

function Spend() {
  return (
    <section>
      <h2 className="text-lg font-semibold">Acquisition spend</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Cash paid for acquisitions each year, including holdbacks for earlier deals, from Topicus&apos;s year-end MD&amp;As.
        2021–22 aren&apos;t on its site.
      </p>
      <table className="mt-3 w-full text-sm tabular-nums">
        <tbody>
          {ACQUISITION_SPEND.map((r) => (
            <tr key={r.year} className="border-b border-border/30">
              <td className="py-1.5 pr-3 text-muted-foreground">
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline">
                  {r.year}
                </a>
              </td>
              <td className="py-1.5 text-right font-medium">{eur(r.spend)}</td>
              <td className="py-1.5 pl-3 text-xs text-muted-foreground">{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Stakes() {
  return (
    <section>
      {heading("stakes", "Listed stakes")}
      <ul className="mt-3 space-y-1 text-sm">
        {STAKES.map((s) => (
          <li key={s.ticker} className="flex justify-between gap-4">
            <span>
              <Link href={`/finance?ticker=${encodeURIComponent(s.ticker)}`} className="font-medium text-emerald-400 hover:underline">
                {s.ticker}
              </Link>
              <span className="text-muted-foreground"> - </span>
              <Link href={s.page} className="text-muted-foreground hover:text-foreground hover:underline">
                {s.company}
              </Link>
            </span>
            <span className="tabular-nums text-muted-foreground">{fmtPct(s.pct, 2)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">{STAKES.map((s) => `${s.company}: ${s.note}`).join(". ")}.</p>
    </section>
  );
}

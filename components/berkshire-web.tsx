"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { HoldingsWeb, Legend, type BranchStyle, type TreeNode } from "@/components/holdings-web";
import { issuerKey, type LatestHoldingsJson, type SuperinvestorsJson } from "@/lib/superinvestors";
import { holdingsOutside13F } from "@/lib/major-holders";
import { ACQUIRED, BUSINESSES_SOURCE, CASH, LETTERS_URL, SEGMENTS, WIKIPEDIA_URL, type Acquisition } from "@/lib/berkshire";
import { fmtMoney, fmtPct, fmtQuarter } from "@/components/superinvestors";

// Everything Berkshire owns as a radial tree: owned businesses by 10-K
// segment, US stocks from the 13F, stakes outside 13F, cash. Branch hues are
// Tailwind 600 steps, validated as a categorical set on both themes; every
// node is also direct-labeled, and the list below is the table view.

type Branch = "business" | "stock" | "outside" | "cash";

const BRANCHES: (BranchStyle & { id: Branch })[] = [
  { id: "business", label: "Owned businesses", color: "var(--color-emerald-600)" },
  { id: "stock", label: "US stocks (13F)", color: "var(--color-sky-600)" },
  { id: "outside", label: "Stakes outside 13F", color: "var(--color-amber-600)" },
  { id: "cash", label: "Cash & T-bills", color: "var(--color-violet-600)" },
];
const COLOR = Object.fromEntries(BRANCHES.map((b) => [b.id, b.color])) as Record<Branch, string>;

interface StockRow {
  key: string;
  ticker: string | null;
  name: string;
  value: number;
  w: number;
}

function useBuffett() {
  const [data, setData] = useState<{ index: SuperinvestorsJson; latest: LatestHoldingsJson } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    Promise.all([
      fetch("/superinvestors.json").then((r) => (r.ok ? r.json() : Promise.reject())),
      fetch("/superinvestors/latest.json").then((r) => (r.ok ? r.json() : Promise.reject())),
    ])
      .then(([index, latest]) => setData({ index, latest }))
      .catch(() => setError(true));
  }, []);
  return { data, error };
}

// Buffett's 13F by company, share classes combined, labelled by the larger class
function stockRows(latest: LatestHoldingsJson): StockRow[] {
  const byIssuer = new Map<string, StockRow & { classV: number }>();
  for (const p of latest.holdings.buffett ?? []) {
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

// "Since 2022 (with Alleghany)†" — † when the year isn't from Berkshire's documents
function since(a: Acquisition | undefined) {
  if (!a?.year) return null;
  return `${a.year}${a.via ? ` (with ${a.via})` : ""}${a.checked ? "" : "†"}`;
}

function buildTree(stocks: StockRow[], period: string, total: number): TreeNode {
  const outside = holdingsOutside13F("buffett");
  const operating = SEGMENTS.reduce((s, g) => s + g.earnings, 0);
  const biz = (name: string, segment: string): TreeNode => {
    const a = ACQUIRED[name];
    const year = since(a);
    return {
      id: `b:${name}`,
      label: name,
      branch: "business",
      detail: [segment, ...(year ? [`Since ${year}`] : []), ...(a?.price ? [a.price] : []), ...(a?.note ? [a.note] : [])],
    };
  };
  return {
    id: "root",
    label: "Berkshire Hathaway",
    href: "/finance?ticker=BRK-B",
    hint: "Click for the BRK-B five-factor analysis",
    detail: [
      `Operating businesses: ${fmtMoney(operating)} after-tax earnings (2025)`,
      `US stocks: ${fmtMoney(total)} (13F, ${fmtQuarter(period)})`,
      `Cash & T-bills: ${fmtMoney(CASH.value)}`,
    ],
    children: [
      {
        id: "business",
        label: "Owned businesses",
        branch: "business",
        detail: [`${fmtMoney(operating)} after-tax earnings in 2025`, `${SEGMENTS.length} segments`],
        // A one-business segment (BNSF, McLane, Pilot) is a leaf itself
        children: SEGMENTS.map((s) => ({
          id: `s:${s.id}`,
          label: s.name,
          branch: "business" as const,
          detail: [
            `${fmtMoney(s.earnings)} after-tax earnings in 2025`,
            ...(s.businesses?.length === 1 ? biz(s.businesses[0], s.name).detail!.slice(1) : []),
          ],
          children: s.businesses?.length === 1 ? undefined : s.groups
            ? s.groups.map((g) =>
                g.businesses.length === 1
                  ? biz(g.businesses[0], s.name)
                  : {
                      id: `g:${s.id}:${g.name}`,
                      label: g.name,
                      branch: "business" as const,
                      detail: [`${s.name} · ${g.businesses.length} businesses`],
                      children: g.businesses.map((b) => biz(b, `${s.name} · ${g.name}`)),
                    }
              )
            : s.businesses!.map((b) => biz(b, s.name)),
        })),
      },
      {
        id: "stock",
        label: "US stocks",
        branch: "stock",
        detail: [`${fmtMoney(total)} across ${stocks.length} companies`, `13F for ${fmtQuarter(period)}`],
        children: stocks.map((s) => ({
          id: `t:${s.key}`,
          label: s.ticker ?? s.name,
          branch: "stock" as const,
          detail: [s.name, `${fmtMoney(s.value)} · ${fmtPct(s.w, 2)} of the 13F`],
          href: s.ticker ? `/finance?ticker=${encodeURIComponent(s.ticker)}` : undefined,
          hint: "Click for the stock page",
        })),
      },
      {
        id: "outside",
        label: "Outside 13F",
        branch: "outside",
        detail: ["Stakes from company and regulatory filings"],
        children: outside.map((h) => ({
          id: `o:${h.ticker}`,
          label: h.company ?? h.ticker,
          branch: "outside" as const,
          detail: [`${h.ticker} · ${fmtPct(h.pct, 2)} of the company`, `as of ${h.asOf}`],
          href: `/finance?ticker=${encodeURIComponent(h.ticker)}`,
          hint: "Click for the stock page",
        })),
      },
      {
        id: "cash",
        label: `Cash & T-bills ${fmtMoney(CASH.value)}`,
        branch: "cash",
        detail: [`as of ${CASH.asOf}, net of unsettled T-bill purchases`, CASH.label],
      },
    ],
  };
}

export function BerkshireWeb() {
  const { data, error } = useBuffett();
  const summary = data?.index.managers.find((m) => m.id === "buffett");
  const stocks = useMemo(() => (data ? stockRows(data.latest) : []), [data]);

  if (error) return <p className="text-red-400">Couldn&apos;t load holdings data.</p>;
  if (!data || !summary) return <p className="text-muted-foreground">Loading…</p>;

  const tree = buildTree(stocks, summary.period, summary.totalValue);
  return (
    <>
      <Legend branches={BRANCHES} />
      <div className="hidden md:block">
        <HoldingsWeb tree={tree} branches={BRANCHES} label="Everything Berkshire Hathaway owns" />
      </div>
      <p className="mt-4 text-sm text-muted-foreground md:hidden">The web needs a wider screen; everything is listed below.</p>
      <Lists stocks={stocks} period={summary.period} total={summary.totalValue} />
    </>
  );
}

function Lists({ stocks, period, total }: { stocks: StockRow[]; period: string; total: number }) {
  const outside = holdingsOutside13F("buffett");
  const heading = (b: Branch, text: string) => (
    <h2 className="flex items-center gap-2 text-lg font-semibold">
      <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLOR[b] }} />
      {text}
    </h2>
  );
  return (
    <div className="mt-10 grid gap-10 lg:grid-cols-2">
      <section>
        {heading("business", "Owned businesses")}
        <p className="mt-1 text-xs text-muted-foreground">
          After-tax earnings for 2025 by 10-K segment ·{" "}
          <a href={BUSINESSES_SOURCE.url} target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline">
            {BUSINESSES_SOURCE.label}
          </a>
        </p>
        <dl className="mt-3 space-y-3 text-sm">
          {SEGMENTS.map((s) => (
            <div key={s.id}>
              <dt className="flex justify-between gap-4 font-medium">
                <span>{s.name}</span>
                <span className="tabular-nums text-muted-foreground">{fmtMoney(s.earnings)}</span>
              </dt>
              <dd className="mt-0.5 text-muted-foreground">
                {s.groups
                  ? s.groups.map((g) => (
                      <span key={g.name} className="block">
                        <span className="text-foreground/80">{g.name}:</span> {withYears(g.businesses)}
                      </span>
                    ))
                  : withYears(s.businesses!)}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="space-y-10">
        <section>
          {heading("stock", "US stocks")}
          <p className="mt-1 text-xs text-muted-foreground">
            {fmtMoney(total)} in {stocks.length} companies, 13F for {fmtQuarter(period)} ·{" "}
            <Link href="/superinvestors?m=buffett" className="hover:text-foreground hover:underline">
              full holdings
            </Link>
          </p>
          <ol className="mt-3 columns-2 gap-6 text-sm sm:columns-3">
            {stocks.map((s) => (
              <li key={s.key} className="flex justify-between gap-2 break-inside-avoid py-0.5">
                {s.ticker ? (
                  <Link href={`/finance?ticker=${encodeURIComponent(s.ticker)}`} className="font-medium text-emerald-400 hover:underline" title={s.name}>
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
        </section>

        <section>
          {heading("outside", "Stakes outside 13F")}
          <p className="mt-1 text-xs text-muted-foreground">Share of each company, from its own or regulatory filings</p>
          <ul className="mt-3 space-y-1 text-sm">
            {outside.map((h) => (
              <li key={h.ticker} className="flex justify-between gap-4">
                <span>
                  <Link href={`/finance?ticker=${encodeURIComponent(h.ticker)}`} className="font-medium text-emerald-400 hover:underline">
                    {h.ticker}
                  </Link>
                  <span className="text-muted-foreground"> - {h.company}</span>
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {fmtPct(h.pct, 2)} · {h.asOf}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          {heading("cash", "Cash & T-bills")}
          <p className="mt-2 text-sm">
            <span className="font-medium">{fmtMoney(CASH.value)}</span>{" "}
            <span className="text-muted-foreground">
              as of {CASH.asOf}, net of unsettled T-bill purchases ·{" "}
              <a href={CASH.url} target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline">
                {CASH.label}
              </a>
            </span>
          </p>
        </section>

        <p className="text-xs text-muted-foreground">
          Not shown: Occidental preferred stock and warrants, bonds, and businesses the 10-K doesn&apos;t name. Kraft Heinz and
          Occidental common are in the 13F list.
        </p>
      </div>

      <AcquisitionHistory />
    </div>
  );
}

// "GEICO (1996), General Re (1998)"
function withYears(names: string[]) {
  return names.map((n) => (ACQUIRED[n]?.year ? `${n} (${ACQUIRED[n].year})` : n)).join(", ");
}

function AcquisitionHistory() {
  const rows = SEGMENTS.flatMap((s) =>
    (s.groups ? s.groups.flatMap((g) => g.businesses.map((b) => [b, s.groups!.length > 1 ? `${s.name} · ${g.name}` : s.name])) : s.businesses!.map((b) => [b, s.name])).map(
      ([name, segment]) => ({ name, segment, a: ACQUIRED[name] })
    )
  ).sort((x, y) => (x.a?.year ?? 9999) - (y.a?.year ?? 9999) || x.name.localeCompare(y.name));
  return (
    <section className="lg:col-span-2">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLOR.business }} />
        Acquisition history
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        The year each business joined Berkshire (when the deal closed), and the price where Berkshire states one, from{" "}
        <a href={LETTERS_URL} target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline">
          Buffett&apos;s letters
        </a>{" "}
        and Berkshire&apos;s 10-K and 10-Q. † = year from{" "}
        <a href={WIKIPEDIA_URL} target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline">
          Wikipedia&apos;s list
        </a>
        , not found in Berkshire&apos;s documents.
      </p>
      <div className="mt-3 overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[720px] text-sm tabular-nums">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-medium">Year</th>
              <th className="px-3 py-2 font-medium">Business</th>
              <th className="px-3 py-2 font-medium">Segment</th>
              <th className="px-3 py-2 font-medium">Price (as Berkshire states it)</th>
              <th className="px-3 py-2 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ name, segment, a }) => (
              <tr key={name} className="border-b border-border/30 even:bg-muted/20">
                <td className="px-3 py-1.5 text-muted-foreground">
                  {a?.year ?? "—"}
                  {a && !a.checked && a.year ? "†" : ""}
                </td>
                <td className="px-3 py-1.5">
                  <span className="font-medium">{name}</span>
                  {a?.via && <span className="text-muted-foreground"> · with {a.via}</span>}
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">{segment}</td>
                <td className="px-3 py-1.5">
                  {a?.price}
                  {a?.note && <span className="text-muted-foreground">{a.price ? " · " : ""}{a.note}</span>}
                  {!a?.price && !a?.note && <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">{a?.checked ? a.src : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

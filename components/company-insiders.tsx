"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { filingIndexUrl, MIN_BUY_VALUE, type CompanyInsiderBuy, type CompanyInsidersJson } from "@/lib/insiders";
import { isForeignListing } from "@/lib/major-holders";
import { fmtMoney, fmtPct, fmtPrice, frame, table, td, th, wide, zebra } from "@/components/superinvestors";

// Insiders buying their own company's stock on the open market (Form 4 code
// P) over the last two years — the per-stock view of /insiders.

const CLUSTER_DAYS = 30;
const CLUSTER_MIN = 3; // distinct insiders buying within CLUSTER_DAYS
const ROWS_SHOWN = 15;

// One request per ticker shared by the snapshot card and the section below
// (the first lookup can take ~20s, so don't run it twice)
const requests = new Map<string, Promise<CompanyInsidersJson | null>>();

function fetchInsiders(ticker: string) {
  let p = requests.get(ticker);
  if (!p) {
    p = fetch(`/api/stock/insiders?ticker=${encodeURIComponent(ticker)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d: CompanyInsidersJson | null) => {
        // Incomplete answers aren't cached server-side; let a remount retry
        if (!d || d.pending) requests.delete(ticker);
        return d;
      })
      .catch(() => {
        requests.delete(ticker);
        return null;
      });
    requests.set(ticker, p);
  }
  return p;
}

// Mounted with key={ticker}, so state starts fresh per ticker
// Form 4s exist only for SEC registrants, so a foreign listing skips the lookup
export function useCompanyInsiders(ticker: string) {
  const foreign = isForeignListing(ticker);
  const [data, setData] = useState<CompanyInsidersJson | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!foreign) fetchInsiders(ticker).then((d) => (d ? setData(d) : setFailed(true)));
  }, [ticker, foreign]);
  return { data, failed, foreign, loading: !foreign && !data && !failed };
}

const DAY_MS = 86_400_000;
const dayNum = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY_MS;

// Accessions of buys that sit in a cluster: CLUSTER_MIN+ different insiders
// buying within CLUSTER_DAYS of each other
export function clusterBuys(buys: CompanyInsiderBuy[]): Set<string> {
  const asc = [...buys].sort((a, b) => a.lastTrade.localeCompare(b.lastTrade));
  const out = new Set<string>();
  for (let i = 0; i < asc.length; i++) {
    const end = dayNum(asc[i].lastTrade) + CLUSTER_DAYS;
    const group = asc.slice(i).filter((b) => dayNum(b.lastTrade) <= end);
    if (new Set(group.map((b) => b.ownerCik)).size >= CLUSTER_MIN) for (const b of group) out.add(b.accession);
  }
  return out;
}

export function fmtValue(n: number) {
  return n < 1e3 ? `$${Math.round(n)}` : fmtMoney(n);
}

// How much the purchase grew the insider's stake (null if they had none
// before, or holdings weren't reported)
function stakeIncrease(b: CompanyInsiderBuy): number | null {
  if (b.sharesAfter == null) return null;
  const before = b.sharesAfter - b.shares;
  return before > 0 ? b.shares / before : null;
}

const monthYear = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" });

export function CompanyInsiders({ ticker }: { ticker: string }) {
  const { data, failed, foreign, loading } = useCompanyInsiders(ticker);
  const [showSmall, setShowSmall] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const all = useMemo(() => data?.buys ?? [], [data]);
  const clusters = useMemo(() => clusterBuys(all), [all]);
  const small = all.filter((b) => b.value < MIN_BUY_VALUE).length;
  const rows = showSmall ? all : all.filter((b) => b.value >= MIN_BUY_VALUE);
  const shown = showAll ? rows : rows.slice(0, ROWS_SHOWN);

  const yearAgo = data ? new Date((dayNum(data.to) - 365) * DAY_MS).toISOString().split("T")[0] : "";
  const sized = all.filter((b) => b.value >= MIN_BUY_VALUE);
  const lastYear = sized.filter((b) => b.lastTrade >= yearAgo);
  const total = (list: CompanyInsiderBuy[]) => list.reduce((s, b) => s + b.value, 0);
  const people = (list: CompanyInsiderBuy[]) => new Set(list.map((b) => b.ownerCik)).size;
  const clusterMonths = [...new Set(all.filter((b) => clusters.has(b.accession)).map((b) => monthYear(b.lastTrade)))];

  if (foreign) return null;

  return (
    <section id="insiders" className="scroll-mt-20 pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold">Insider buying at {ticker}</h2>
        <Link href="/insiders" className="text-xs text-muted-foreground hover:text-foreground hover:underline">
          Market-wide insider buys →
        </Link>
      </div>

      {loading && (
        <p className="mt-2 animate-pulse text-sm text-muted-foreground">
          Reading {ticker}&apos;s Form 4 filings from SEC EDGAR… the first lookup of a ticker can take ~20 seconds.
        </p>
      )}
      {failed && <p className="mt-2 text-sm text-muted-foreground">Insider filings unavailable for {ticker} (not an SEC filer, or EDGAR didn&apos;t answer).</p>}

      {data && (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            {!sized.length ? (
              <>
                No open-market purchases of {fmtValue(MIN_BUY_VALUE)}+ by officers, directors or 10% owners since {data.from}
                {small > 0 && <> ({small} smaller)</>} — {data.form4s} Form 4s checked.
              </>
            ) : (
              <>
                Last 12 months: <span className="text-emerald-400">{fmtMoney(total(lastYear))}</span> bought by{" "}
                <span className="text-foreground">{people(lastYear)}</span> insider{people(lastYear) === 1 ? "" : "s"}
                {" · "}2 years: {fmtMoney(total(sized))} by {people(sized)}
                {clusterMonths.length > 0 && (
                  <>
                    {" · "}
                    <span className="text-yellow-500/90">cluster buying {clusterMonths.join(", ")}</span>
                  </>
                )}
              </>
            )}
          </p>
          {data.pending > 0 && (
            <p className="mt-1 text-xs text-yellow-500/80">
              {data.pending} of {data.form4s} filings not read yet — reload in a minute for the full history.
            </p>
          )}

          {rows.length > 0 && (
            <div className={`mt-4 ${frame}`}>
              <table className={table}>
                <thead>
                  <tr className="text-left">
                    <th className={th}>Trade<br />Date</th>
                    <th className={th}>Insider</th>
                    <th className={`${th} ${wide}`}>Role</th>
                    <th className={`${th} text-right ${wide}`}>Shares</th>
                    <th className={`${th} text-right`}>Avg<br />Price</th>
                    <th className={`${th} text-right`}>Value</th>
                    <th className={`${th} text-right ${wide}`}>Stake<br />Increase</th>
                    <th className={`${th} text-right`}>Since<br />Buy</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((b) => {
                    const inc = stakeIncrease(b);
                    return (
                      <tr key={b.accession} className={`border-b border-border/30 ${zebra}`}>
                        <td className={`${td} whitespace-nowrap`}>
                          <a
                            href={filingIndexUrl(b.issuerCik, b.accession)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline"
                            title={`Filed ${b.filed}${b.firstTrade !== b.lastTrade ? ` · trades ${b.firstTrade} → ${b.lastTrade}` : ""}`}
                          >
                            {b.lastTrade}
                          </a>
                          {clusters.has(b.accession) && (
                            <span className="ml-1.5 text-[10px] text-yellow-500/90" title={`${CLUSTER_MIN}+ insiders bought within ${CLUSTER_DAYS} days`}>
                              cluster
                            </span>
                          )}
                        </td>
                        <td className={td}>
                          <span className="font-medium">{b.owner}</span>
                          {!b.direct && <span className="text-[10px] text-muted-foreground"> (indirect)</span>}
                          <span className="block text-[10px] text-muted-foreground sm:hidden">{b.role}</span>
                        </td>
                        <td className={`${td} text-muted-foreground ${wide}`}>{b.role}</td>
                        <td className={`${td} text-right ${wide}`}>{b.shares.toLocaleString()}</td>
                        <td className={`${td} text-right`}>{fmtPrice(b.avgPrice)}</td>
                        <td className={`${td} text-right font-medium`}>{fmtValue(b.value)}</td>
                        <td className={`${td} text-right ${wide}`}>{inc == null ? "—" : `+${fmtPct(inc, inc < 0.1 ? 1 : 0)}`}</td>
                        <td className={`${td} text-right ${b.ret == null ? "" : b.ret >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {b.ret == null ? "—" : `${b.ret >= 0 ? "+" : ""}${fmtPct(b.ret)}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground/70">
            <p>
              Open-market purchases (Form 4 code P) since {data.from}; grants, option exercises and sales excluded. Since Buy is
              total return from the trade date.
            </p>
            <span className="flex gap-3">
              {small > 0 && (
                <button type="button" onClick={() => setShowSmall((v) => !v)} className="hover:text-foreground hover:underline">
                  {showSmall ? "Hide" : "Show"} {small} under {fmtValue(MIN_BUY_VALUE)}
                </button>
              )}
              {rows.length > ROWS_SHOWN && (
                <button type="button" onClick={() => setShowAll((v) => !v)} className="hover:text-foreground hover:underline">
                  {showAll ? "Show fewer" : `Show all ${rows.length}`}
                </button>
              )}
            </span>
          </div>
        </>
      )}
    </section>
  );
}

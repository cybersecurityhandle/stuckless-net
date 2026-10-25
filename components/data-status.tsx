"use client";

import { useEffect, useState } from "react";
import type { JobStatus, StatusJson } from "@/scripts/status";

// Each dataset's own "updated" date, plus the last run of the job that
// writes it. The VPS cron runs daily at 22:30 UTC; anything older than
// MAX_AGE_DAYS (weekends included) means a run is failing.

interface Dataset {
  name: string;
  url: string;
  job: string;
  maxAgeDays: number;
  // Pull the date (and an optional detail) out of the file
  read: (d: Record<string, unknown>) => { date: string | null; detail?: string };
}

const updated = (d: Record<string, unknown>) => ({ date: (d.updated as string) ?? null });

const DATASETS: Dataset[] = [
  {
    name: "Superinvestor index (83 managers)",
    url: "/superinvestors.json",
    job: "refresh-13f",
    maxAgeDays: 3,
    read: (d) => ({
      date: (d.updated as string) ?? null,
      detail: (d.failed as string[])?.length ? `failed: ${(d.failed as string[]).join(", ")}` : undefined,
    }),
  },
  { name: "Latest holdings + quotes", url: "/superinvestors/latest.json", job: "refresh-13f", maxAgeDays: 3, read: updated },
  {
    name: "Insider buys (Form 4)",
    url: "/insider-buys.json",
    job: "refresh-insiders",
    maxAgeDays: 3,
    read: (d) => ({ date: (d.updated as string) ?? null, detail: `filings through ${d.to as string}` }),
  },
  { name: "Superinvestor Form 4s + 13D/13G", url: "/superinvestors/realtime.json", job: "refresh-insiders", maxAgeDays: 3, read: updated },
  { name: "Copycat backtest", url: "/superinvestors/backtest.json", job: "refresh-backtest", maxAgeDays: 8, read: updated },
  { name: "Portfolio five factors", url: "/superinvestors/fivefactor.json", job: "refresh-fivefactor", maxAgeDays: 8, read: updated },
  { name: "Watchlist", url: "/watchlist.json", job: "refresh-watchlist", maxAgeDays: 3, read: updated },
  { name: "S&P 500 screener", url: "/sp500-screener.json", job: "refresh-sp500", maxAgeDays: 3, read: updated },
];

function ageDays(date: string) {
  return Math.floor((Date.now() - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
}

export function DataStatus() {
  const [rows, setRows] = useState<{ ds: Dataset; date: string | null; detail?: string; error?: boolean }[] | null>(null);
  const [jobs, setJobs] = useState<StatusJson>({});

  useEffect(() => {
    fetch("/status.json")
      .then((r) => (r.ok ? r.json() : {}))
      .then((d: StatusJson) => setJobs(d))
      .catch(() => {});
    Promise.all(
      DATASETS.map((ds) =>
        fetch(ds.url, { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : Promise.reject()))
          .then((d: Record<string, unknown>) => ({ ds, ...ds.read(d) }))
          .catch(() => ({ ds, date: null, error: true }))
      )
    ).then(setRows);
  }, []);

  const stale = rows?.filter((r) => !r.date || ageDays(r.date) > r.ds.maxAgeDays).length ?? 0;

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Data status</h1>
      <p className="mt-2 text-muted-foreground">
        Every dataset on the site and when it was last refreshed. The VPS cron runs nightly at 22:30 UTC.
      </p>
      {rows && (
        <p className={`mt-3 text-sm font-medium ${stale ? "text-red-400" : "text-emerald-400"}`}>
          {stale ? `⚠ ${stale} dataset${stale > 1 ? "s are" : " is"} stale or missing` : "✓ All datasets fresh"}
        </p>
      )}

      <div className="mt-6 overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border bg-card text-left text-[12.5px] text-foreground/80">
              <th className="px-3 py-2 font-semibold">Dataset</th>
              <th className="px-3 py-2 font-semibold">Updated</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Last job run</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map(({ ds, date, detail, error }) => {
              const age = date ? ageDays(date) : null;
              const ok = age != null && age <= ds.maxAgeDays;
              const job: JobStatus | undefined = jobs[ds.job];
              return (
                <tr key={ds.url} className="border-b border-border/30 even:bg-muted/20">
                  <td className="px-3 py-2">
                    <div className="font-medium">{ds.name}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">{ds.url}</div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {date ?? "—"}
                    {age != null && <span className="text-muted-foreground"> ({age === 0 ? "today" : `${age}d ago`})</span>}
                    {detail && <div className="text-[11px] text-muted-foreground">{detail}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <span className={ok ? "text-emerald-400" : "text-red-400"}>
                      {error ? "✗ missing" : ok ? "✓ fresh" : `✗ stale (> ${ds.maxAgeDays}d)`}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {job ? (
                      <>
                        <span className={job.ok ? "text-emerald-400" : "text-red-400"}>{job.ok ? "ok" : "failed"}</span>
                        <span className="text-muted-foreground">
                          {" "}· {new Date(job.ranAt).toISOString().slice(0, 16).replace("T", " ")} UTC · {job.seconds}s
                        </span>
                        <div className="text-muted-foreground">{job.summary}</div>
                      </>
                    ) : (
                      <span className="text-muted-foreground">{ds.job} — no run recorded</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

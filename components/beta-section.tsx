"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { WatchRow } from "@/lib/watchlist-data";

/* Short-horizon beta, quarantined from the five-factor and quality views.
 * Beta measures covariance with the market — how a stock wiggles — which is
 * the institutional definition of risk, not this site's. It lives in its own
 * tab for exactly that reason. */

interface WatchlistJson {
  updated: string;
  rows: WatchRow[];
}

function betaColor(b: number): string {
  if (b >= 1.3) return "text-red-400";
  if (b >= 0.8) return "text-foreground";
  return "text-emerald-400";
}

export function BetaSection() {
  const [rows, setRows] = useState<WatchRow[] | null>(null);
  const [updated, setUpdated] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/watchlist.json");
        if (res.ok) {
          const data: WatchlistJson = await res.json();
          setUpdated(data.updated);
          setRows(data.rows);
        } else {
          setRows([]);
        }
      } catch {
        setRows([]);
      }
    })();
  }, []);

  const withBeta = (rows ?? [])
    .filter((r) => r.beta12w != null)
    .sort((a, b) => (b.beta12w as number) - (a.beta12w as number));

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">
            Trailing 12-week beta vs the S&amp;P 500, computed from ~60 daily returns — the
            short-horizon convention risk desks use for current positioning. β = 1 moves with
            the market; β = 1.5 amplifies a 10% market move to ~15%; β &lt; 1 dampens it.
            Foreign listings are regressed in local currency against ^GSPC (rough but conventional).
            {updated && <span className="text-muted-foreground/60"> Data as of {updated}.</span>}
          </p>
          <p className="mt-2 text-xs text-muted-foreground/70">
            Editorial note: beta measures how a stock <em>wiggles</em>, not whether the business
            fails. A halved price on an unchanged business raises its beta and lowers its risk.
            This tab exists for translation into institutional dialect, not for decisions.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 overflow-x-auto">
          <Table className="min-w-[500px]">
            <TableHeader>
              <TableRow>
                <TableHead>Ticker</TableHead>
                <TableHead>Company</TableHead>
                <TableHead className="text-right">β (12w daily)</TableHead>
                <TableHead className="text-right">Implied move on a −10% market</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows === null && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              )}
              {rows !== null && withBeta.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    No beta data yet — it appears after the next data refresh.
                  </TableCell>
                </TableRow>
              )}
              {withBeta.map((r) => (
                <TableRow key={r.ticker}>
                  <TableCell className="font-semibold text-emerald-400">{r.ticker}</TableCell>
                  <TableCell className="max-w-[240px] truncate text-muted-foreground">{r.name}</TableCell>
                  <TableCell className={`text-right font-mono ${betaColor(r.beta12w as number)}`}>
                    {(r.beta12w as number).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">
                    {((r.beta12w as number) * -10).toFixed(1)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-3 text-[10px] text-muted-foreground/60">
            12-week betas are regime-dependent and noisy — a takeover pins beta near 0, a
            drawdown inflates it. For cost-of-capital work institutions typically use 2–5 year
            windows instead.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

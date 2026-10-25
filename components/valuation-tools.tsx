"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Forward-looking companions to the backward five-factor table:
//  - Cyclical check: P/E vs history reads cyclicals backwards (peak earnings
//    → low P/E), so show a P/E on normalized (average-margin) earnings
//  - Reverse DCF: the EPS growth today's price implies
//  - Expected return: the five factors run forward — your assumptions in,
//    an annual return out, decomposed the same way

export interface ValuationYear {
  year: number;
  revenue: number;
  netIncome: number;
  sharesOutstanding: number;
  eps: number;
  price: number;
  dividendsPerShare: number;
  salesPerShare: number;
  netMargin: number;
  peMultiple: number;
}

const HISTORY = 10; // years of history the defaults are drawn from

/* ── Math ──────────────────────────────────────── */

function cagr(start: number, end: number, years: number): number | null {
  if (start <= 0 || end <= 0 || years <= 0) return null;
  return (end / start) ** (1 / years) - 1;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}

/**
 * Growth g such that price = PV(dividends for n years) + PV(exit value),
 * EPS compounding at g. Bisection — the PV is monotonic in g.
 */
function impliedGrowth(price: number, eps0: number, r: number, n: number, exitPe: number, payout: number): number | null {
  if (eps0 <= 0 || price <= 0) return null;
  const pv = (g: number) => {
    let total = 0;
    for (let t = 1; t <= n; t++) total += (eps0 * (1 + g) ** t * payout) / (1 + r) ** t;
    return total + (eps0 * (1 + g) ** n * exitPe) / (1 + r) ** n;
  };
  let lo = -0.5;
  let hi = 1.5;
  if (pv(lo) > price || pv(hi) < price) return null;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (pv(mid) < price) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/* ── Formatting ────────────────────────────────── */

const pct = (n: number | null | undefined, d = 1) => (n == null ? "—" : `${(n * 100).toFixed(d)}%`);
const signed = (n: number | null | undefined, d = 1) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${(n * 100).toFixed(d)}%`);
const times = (n: number | null | undefined) => (n == null ? "—" : `${n.toFixed(1)}×`);

function PctInput({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <label className="block" title={hint}>
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <span className="flex h-9 items-center rounded-md border border-border bg-card px-2 text-sm">
        <input
          type="number"
          step="0.5"
          value={Number((value * 100).toFixed(2))}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
          className="w-full bg-transparent tabular-nums outline-none"
        />
        <span className="text-muted-foreground">%</span>
      </span>
    </label>
  );
}

function NumInput({ label, value, onChange, suffix, step = 1 }: { label: string; value: number; onChange: (v: number) => void; suffix: string; step?: number }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <span className="flex h-9 items-center rounded-md border border-border bg-card px-2 text-sm">
        <input
          type="number"
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full bg-transparent tabular-nums outline-none"
        />
        <span className="text-muted-foreground">{suffix}</span>
      </span>
    </label>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium tabular-nums ${tone === "pos" ? "text-emerald-400" : tone === "neg" ? "text-red-400" : ""}`}>{value}</span>
    </div>
  );
}

/* ── Component ─────────────────────────────────── */

export function ValuationTools({ years, currentPrice, ticker }: { years: ValuationYear[]; currentPrice: number | null; ticker: string }) {
  const h = useMemo(() => {
    const ys = years.slice(-HISTORY - 1);
    const first = ys[0];
    const last = ys[ys.length - 1];
    const n = last.year - first.year;
    const margins = ys.map((y) => y.netMargin);
    const meanMargin = margins.reduce((a, b) => a + b, 0) / margins.length;
    const sd = Math.sqrt(margins.reduce((a, m) => a + (m - meanMargin) ** 2, 0) / margins.length);
    const revDrops = ys.slice(1).filter((y, i) => y.revenue < ys[i].revenue * 0.9).length;
    const lossYears = ys.filter((y) => y.eps <= 0).length;
    const marginCv = meanMargin > 0 ? sd / meanMargin : null;
    const pes = ys.map((y) => y.peMultiple).filter((p) => p > 0 && p < 200);
    const price = currentPrice ?? last.price;
    const sps = last.revenue / last.sharesOutstanding;
    const normEps = meanMargin * sps;
    return {
      n,
      first,
      last,
      price,
      salesG: cagr(first.revenue, last.revenue, n),
      shareChg: cagr(first.sharesOutstanding, last.sharesOutstanding, n),
      epsG: cagr(first.eps, last.eps, n),
      spsG: cagr(first.salesPerShare, last.salesPerShare, n),
      meanMargin,
      medianMargin: median(margins),
      marginCv,
      revDrops,
      lossYears,
      // Margin swings, revenue drawdowns or losses = earnings that mean-revert
      cyclical: (marginCv != null && marginCv > 0.4) || revDrops >= 2 || (lossYears >= 1 && (marginCv ?? 1) > 0.3),
      medianPe: median(pes),
      currentPe: last.eps > 0 ? price / last.eps : null,
      normEps,
      normPe: normEps > 0 ? price / normEps : null,
      payout: last.eps > 0 ? clamp(last.dividendsPerShare / last.eps, 0, 1) : 0,
      divYield: price > 0 ? last.dividendsPerShare / price : 0,
      sps,
    };
  }, [years, currentPrice]);

  // Reverse DCF inputs
  const [reqReturn, setReqReturn] = useState(0.1);
  const [dcfYears, setDcfYears] = useState(10);
  const [dcfExitPe, setDcfExitPe] = useState(Math.round(clamp(h.medianPe ?? 15, 8, 30)));
  // Cyclicals: discount from normalized, not peak/trough, earnings
  const eps0 = h.cyclical && h.normEps > 0 ? h.normEps : h.last.eps;
  const implied = impliedGrowth(h.price, eps0, reqReturn, dcfYears, dcfExitPe, h.payout);

  // Expected-return inputs (defaults = the company's own last decade)
  const [horizon, setHorizon] = useState(10);
  const [salesG, setSalesG] = useState(clamp(h.salesG ?? 0.05, -0.05, 0.25));
  const [shareChg, setShareChg] = useState(clamp(h.shareChg ?? 0, -0.08, 0.08));
  const [endMargin, setEndMargin] = useState(h.medianMargin ?? h.last.netMargin);
  const [exitPe, setExitPe] = useState(Math.round(clamp(h.medianPe ?? 15, 8, 30)));
  const [divYield, setDivYield] = useState(h.divYield);

  const fwd = useMemo(() => {
    const epsN = ((h.sps * (1 + salesG) ** horizon) / (1 + shareChg) ** horizon) * endMargin;
    const priceN = epsN * exitPe;
    const priceRet = priceN > 0 && h.price > 0 ? (priceN / h.price) ** (1 / horizon) - 1 : null;
    const margin0 = h.last.netMargin;
    return {
      epsN,
      priceN,
      priceRet,
      total: priceRet != null ? priceRet + divYield : null,
      sales: salesG,
      shares: -shareChg / (1 + shareChg),
      margin: margin0 > 0 && endMargin > 0 ? (endMargin / margin0) ** (1 / horizon) - 1 : null,
      pe: h.currentPe && exitPe > 0 ? (exitPe / h.currentPe) ** (1 / horizon) - 1 : null,
    };
  }, [h, salesG, shareChg, endMargin, exitPe, divYield, horizon]);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Cyclical check */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Cyclical check — {ticker}</CardTitle>
          <p className="text-xs text-muted-foreground">
            For cyclicals a low P/E often marks peak earnings. Normalized P/E prices the stock on its
            average margin instead.
          </p>
        </CardHeader>
        <CardContent>
          <div
            className={`mb-3 inline-block rounded border px-2 py-0.5 text-xs font-medium ${
              h.cyclical ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-400" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
            }`}
          >
            {h.cyclical ? "⚠ Likely cyclical" : "✓ Steady earner"}
          </div>
          <Row label={`Margin swing (CV, ${h.n}y)`} value={h.marginCv != null ? h.marginCv.toFixed(2) : "n/m"} />
          <Row label="Revenue drops > 10%" value={String(h.revDrops)} />
          <Row label="Loss years" value={String(h.lossYears)} />
          <div className="my-2 border-t border-border" />
          <Row label="P/E on reported EPS" value={times(h.currentPe)} />
          <Row label={`Normalized P/E (avg ${pct(h.meanMargin)} margin)`} value={times(h.normPe)} />
          <Row label="Median P/E, history" value={times(h.medianPe)} />
          {h.cyclical && h.currentPe != null && h.normPe != null && (
            <p className="mt-2 text-[11px] text-yellow-400/80">
              {h.normPe > h.currentPe * 1.15
                ? "Earnings look above normal — the reported P/E flatters the stock."
                : h.normPe < h.currentPe * 0.85
                  ? "Earnings look depressed — the reported P/E overstates how expensive it is."
                  : "Earnings are near their normal level."}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Reverse DCF */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">What&apos;s priced in</CardTitle>
          <p className="text-xs text-muted-foreground">
            The EPS growth today&apos;s price implies for your required return, then exiting at a normal multiple.
          </p>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid grid-cols-3 gap-2">
            <PctInput label="Required return" value={reqReturn} onChange={setReqReturn} />
            <NumInput label="Years" value={dcfYears} onChange={(v) => setDcfYears(clamp(Math.round(v), 3, 20))} suffix="y" />
            <NumInput label="Exit P/E" value={dcfExitPe} onChange={(v) => setDcfExitPe(clamp(v, 3, 60))} suffix="×" step={0.5} />
          </div>
          <div className="rounded-md border border-border bg-muted/20 p-3 text-center">
            <div className="text-xs text-muted-foreground">Implied EPS growth</div>
            <div className="text-2xl font-semibold tabular-nums">{implied != null ? `${pct(implied)}/yr` : "n/m"}</div>
            <div className="text-[11px] text-muted-foreground">
              for {dcfYears} years from {h.cyclical && h.normEps > 0 ? "normalized" : "trailing"} EPS {eps0.toFixed(2)}
            </div>
          </div>
          <div className="mt-3">
            <Row label={`Historical EPS growth (${h.n}y)`} value={h.epsG != null ? `${pct(h.epsG)}/yr` : "n/m"} />
            <Row label={`Historical sales/share growth (${h.n}y)`} value={h.spsG != null ? `${pct(h.spsG)}/yr` : "n/m"} />
          </div>
          {implied != null && h.epsG != null && (
            <p className={`mt-2 text-[11px] ${implied > h.epsG + 0.02 ? "text-red-400/90" : implied < h.epsG - 0.02 ? "text-emerald-400/90" : "text-muted-foreground"}`}>
              {implied > h.epsG + 0.02
                ? "The price needs faster growth than the company has delivered."
                : implied < h.epsG - 0.02
                  ? "The price assumes less growth than the company has delivered."
                  : "The price roughly assumes the historical growth rate continues."}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Forward five factors */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Expected return — five factors forward</CardTitle>
          <p className="text-xs text-muted-foreground">
            Defaults are this company&apos;s last {h.n} years; change any assumption.
          </p>
        </CardHeader>
        <CardContent>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <PctInput label="Sales growth" value={salesG} onChange={setSalesG} />
            <PctInput label="Share count/yr" value={shareChg} onChange={setShareChg} hint="Negative = buybacks" />
            <PctInput label="End net margin" value={endMargin} onChange={setEndMargin} />
            <NumInput label="Exit P/E" value={exitPe} onChange={(v) => setExitPe(clamp(v, 1, 80))} suffix="×" step={0.5} />
            <PctInput label="Dividend yield" value={divYield} onChange={setDivYield} />
            <NumInput label="Horizon" value={horizon} onChange={(v) => setHorizon(clamp(Math.round(v), 1, 20))} suffix="y" />
          </div>
          <Row label="Dollar sales" value={signed(fwd.sales)} tone={fwd.sales >= 0 ? "pos" : "neg"} />
          <Row label="Share count" value={signed(fwd.shares)} tone={fwd.shares >= 0 ? "pos" : "neg"} />
          <Row label="Margin" value={fwd.margin != null ? signed(fwd.margin) : "n/m"} tone={(fwd.margin ?? 0) >= 0 ? "pos" : "neg"} />
          <Row label="P/E multiple" value={fwd.pe != null ? signed(fwd.pe) : "n/m"} tone={(fwd.pe ?? 0) >= 0 ? "pos" : "neg"} />
          <Row label="Dividends" value={signed(divYield)} tone="pos" />
          <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
            <span className="text-sm font-medium">Expected annual return</span>
            <span className={`text-lg font-semibold tabular-nums ${(fwd.total ?? 0) >= 0.1 ? "text-emerald-400" : (fwd.total ?? 0) >= 0 ? "" : "text-red-400"}`}>
              {fwd.total != null ? pct(fwd.total) : "n/m"}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Year-{horizon} EPS {fwd.epsN.toFixed(2)} × {exitPe}× = {fwd.priceN.toFixed(0)} vs {h.price.toFixed(0)} today.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

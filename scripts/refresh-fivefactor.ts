/**
 * Portfolio five-factor attribution for favorite managers: run the
 * Bloomstran decomposition (sales growth, share count, margin, P/E,
 * dividends) on each of their top holdings over the last WINDOW fiscal
 * years, then weight by current portfolio weight. Answers "did this
 * portfolio's businesses compound, or did multiples do the work?"
 *
 * Calls the site's own /api/stock (like refresh-watchlist). Writes
 * public/superinvestors/fivefactor.json.
 *
 * Usage:
 *   npm run refresh-fivefactor
 *   API_BASE_URL=http://localhost:3000 npm run refresh-fivefactor
 */

import { recordStatus } from "./status";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { Factors, FiveFactorJson, LatestHoldingsJson, SuperinvestorsJson } from "../lib/superinvestors";

const BASE_URL = process.env.API_BASE_URL ?? "https://stuckless.net";
const TOP_N = 10;
const WINDOW = 5; // years
const BATCH_SIZE = 4;
const DELAY_MS = 1000;
// Data-quality guards: a factor beyond ±100%/yr or a 20%+ "dividend yield"
// is a data artifact (one coal stock reported 575%); thin coverage isn't a
// portfolio answer
const MAX_FACTOR = 1;
const MAX_DIV_YIELD = 0.2;
const MIN_COVERAGE = 0.3;

interface Year {
  year: number;
  revenue: number;
  sharesOutstanding: number;
  netMargin: number;
  peMultiple: number;
  dividendYield: number;
}

const ann = (ratio: number, years: number) => ratio ** (1 / years) - 1;

// Annualized factors between two fiscal years; null when a factor isn't
// meaningful (negative margin or P/E at either end)
function factors(a: Year, b: Year): Factors | null {
  const n = b.year - a.year;
  if (n <= 0 || a.revenue <= 0 || b.revenue <= 0 || a.sharesOutstanding <= 0 || b.sharesOutstanding <= 0) return null;
  if (a.netMargin <= 0 || b.netMargin <= 0 || a.peMultiple <= 0 || b.peMultiple <= 0) return null;
  const sales = ann(b.revenue / a.revenue, n);
  const shareChg = ann(b.sharesOutstanding / a.sharesOutstanding, n);
  const shares = -shareChg / (1 + shareChg);
  const margin = ann(b.netMargin / a.netMargin, n);
  const pe = ann(b.peMultiple / a.peMultiple, n);
  const dividends = (a.dividendYield + b.dividendYield) / 2;
  if ([sales, shares, margin, pe].some((x) => Math.abs(x) > MAX_FACTOR) || dividends > MAX_DIV_YIELD) return null;
  return { sales, shares, margin, pe, dividends, total: (1 + sales) * (1 + shares) * (1 + margin) * (1 + pe) - 1 + dividends };
}

async function stock(ticker: string): Promise<Year[] | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/stock?ticker=${encodeURIComponent(ticker)}`, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return null;
    const d = (await res.json()) as { years?: Year[] };
    return d.years?.length ? d.years : null;
  } catch {
    return null;
  }
}

const startedAt = Date.now();

async function main() {
  const started = startedAt;
  const index = JSON.parse(readFileSync(join(process.cwd(), "public", "superinvestors.json"), "utf8")) as SuperinvestorsJson;
  const latest = JSON.parse(readFileSync(join(process.cwd(), "public", "superinvestors", "latest.json"), "utf8")) as LatestHoldingsJson;
  const favs = index.managers.filter((m) => m.favorite);

  const picks = new Map<string, { ticker: string; weight: number }[]>();
  for (const m of favs) {
    picks.set(
      m.id,
      (latest.holdings[m.id] ?? [])
        .map((p) => ({ ticker: latest.securities[p.k]?.t ?? "", weight: p.w }))
        .filter((p) => p.ticker)
        .slice(0, TOP_N)
    );
  }
  const tickers = [...new Set([...picks.values()].flat().map((p) => p.ticker))];
  console.log(`Five factors for ${favs.length} managers, ${tickers.length} holdings via ${BASE_URL}\n`);

  const byTicker = new Map<string, Factors | null>();
  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (t) => {
        const years = await stock(t);
        if (!years || years.length < 2) return byTicker.set(t, null);
        const last = years[years.length - 1];
        const first = [...years].reverse().find((y) => y.year <= last.year - WINDOW) ?? years[0];
        byTicker.set(t, factors(first, last));
      })
    );
    process.stdout.write(`  ${Math.min(i + BATCH_SIZE, tickers.length)}/${tickers.length}\r`);
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  const out: FiveFactorJson = { updated: new Date().toISOString().split("T")[0], window: WINDOW, managers: {} };
  for (const m of favs) {
    const holdings = picks
      .get(m.id)!
      .map((p) => ({ ...p, factors: byTicker.get(p.ticker) }))
      .filter((p): p is { ticker: string; weight: number; factors: Factors } => !!p.factors);
    const covered = holdings.reduce((s, p) => s + p.weight, 0);
    if (covered < MIN_COVERAGE) {
      console.log(`${m.name}: skipped — only ${(covered * 100).toFixed(0)}% of the portfolio decomposable`);
      continue;
    }
    const avg = (k: keyof Factors) => holdings.reduce((s, p) => s + p.factors[k] * p.weight, 0) / covered;
    out.managers[m.id] = {
      coverage: Math.round(covered * 1e3) / 1e3,
      factors: { sales: avg("sales"), shares: avg("shares"), margin: avg("margin"), pe: avg("pe"), dividends: avg("dividends"), total: avg("total") },
      holdings,
    };
    const f = out.managers[m.id].factors;
    console.log(
      `${m.name}: total ${(f.total * 100).toFixed(1)}%/yr = sales ${(f.sales * 100).toFixed(1)} · shares ${(f.shares * 100).toFixed(1)} · ` +
        `margin ${(f.margin * 100).toFixed(1)} · P/E ${(f.pe * 100).toFixed(1)} · div ${(f.dividends * 100).toFixed(1)} (coverage ${(covered * 100).toFixed(0)}%)`
    );
  }
  writeFileSync(join(process.cwd(), "public", "superinvestors", "fivefactor.json"), JSON.stringify(out));
  recordStatus("refresh-fivefactor", started, true, `${Object.keys(out.managers).length} managers decomposed`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  recordStatus("refresh-fivefactor", startedAt, false, err.message);
  process.exit(1);
});

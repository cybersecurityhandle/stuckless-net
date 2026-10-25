/**
 * Copycat backtest: what if you bought each manager's disclosed 13F the day
 * it became public, held until their next filing, and repeated?
 *
 * Uses each quarter's top positions (by value, up to TOP_N) weighted as
 * filed, monthly dividend-adjusted closes from Yahoo, and SPY over the same
 * dates as the benchmark. Positions without Yahoo history (delisted names,
 * no ticker) are dropped and the rest renormalized — reported as coverage.
 *
 * Reads public/superinvestors/{id}.json; writes
 * public/superinvestors/backtest.json. Prices cache in data/price-cache/
 * (gitignored; first run ~15–20 min, then only recent months refetch).
 *
 * Usage:
 *   npm run refresh-backtest
 */

import { recordStatus } from "./status";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { MANAGERS, type BacktestJson, type BacktestManager, type ManagerHistoryJson } from "../lib/superinvestors";

const TOP_N = 30; // positions per quarter (typically 85–100% of a portfolio)
const PRICE_CACHE = join(process.cwd(), "data", "price-cache", "monthly.json");
const PRICE_REFRESH_DAYS = 7;
const BENCHMARK = "SPY";
const FROM = "2013-01-01";

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function isoDate(d: Date) {
  return d.toISOString().split("T")[0];
}

/* ── Prices ────────────────────────────────────────────────── */

interface PriceCache {
  [ticker: string]: { fetched: string; closes: [string, number][] | null };
}

let yahoo: { chart: (t: string, o: object) => Promise<unknown> } | null = null;

async function monthlyCloses(ticker: string, cache: PriceCache, today: string): Promise<[string, number][] | null> {
  const stale = isoDate(new Date(Date.now() - PRICE_REFRESH_DAYS * 86_400_000));
  const hit = cache[ticker];
  if (hit && hit.fetched > stale) return hit.closes;
  if (!yahoo) {
    const { default: YahooFinance } = await import("yahoo-finance2");
    yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] }) as unknown as typeof yahoo;
  }
  let closes: [string, number][] | null = null;
  try {
    await sleep(200);
    const chart = (await yahoo!.chart(ticker, { period1: FROM, interval: "1mo", return: "array" })) as {
      quotes?: { date: Date | string; adjclose?: number; close?: number }[];
    };
    closes = (chart.quotes ?? [])
      .map((q) => [isoDate(new Date(q.date)), q.adjclose ?? q.close ?? 0] as [string, number])
      .filter(([, c]) => c > 0);
    if (!closes.length) closes = null;
  } catch {
    closes = null;
  }
  cache[ticker] = { fetched: today, closes };
  return closes;
}

// Monthly bars are dated the 1st; use the last bar on or before the date
function priceAt(closes: [string, number][], date: string): number | null {
  let out: number | null = null;
  for (const [d, c] of closes) {
    if (d > date) break;
    out = c;
  }
  return out;
}

/* ── Backtest ──────────────────────────────────────────────── */

function cagr(points: [string, number][]): number | null {
  if (points.length < 2) return null;
  const years = (Date.parse(points[points.length - 1][0]) - Date.parse(points[0][0])) / (365.25 * 86_400_000);
  if (years < 1) return null;
  return points[points.length - 1][1] ** (1 / years) - 1;
}

async function backtest(h: ManagerHistoryJson, cache: PriceCache, today: string): Promise<BacktestManager | null> {
  // Oldest first; each quarter becomes investable on its filing date
  const quarters = [...h.quarters].reverse().filter((q) => q.total > 0);
  if (quarters.length < 3) return null;
  const bench = await monthlyCloses(BENCHMARK, cache, today);
  if (!bench) throw new Error("no benchmark prices");

  let value = 1;
  let benchValue = 1;
  const points: [string, number][] = [];
  const benchPoints: [string, number][] = [];
  const coverages: number[] = [];
  let peak = 1;
  let maxDrawdown = 0;

  // When a quarter became public. An amendment filed years later replaces
  // the quarter's "filed" date and would scramble the order, so cap it at
  // the original deadline (45 days after quarter end, plus slack)
  const available = (q: (typeof quarters)[number]) => {
    const deadline = new Date(`${q.period}T00:00:00Z`);
    deadline.setUTCDate(deadline.getUTCDate() + 50);
    const d = isoDate(deadline);
    return q.filed < d ? q.filed : d;
  };

  for (const [i, q] of quarters.entries()) {
    const start = available(q);
    const end = quarters[i + 1] ? available(quarters[i + 1]) : today;
    if (end <= start) continue;
    const longs = q.positions.filter((p) => !p.k.includes("|")).slice(0, TOP_N);
    let covered = 0;
    let weighted = 0;
    for (const p of longs) {
      const t = h.securities[p.k]?.t;
      if (!t) continue;
      const closes = await monthlyCloses(t, cache, today);
      const p0 = closes ? priceAt(closes, start) : null;
      const p1 = closes ? priceAt(closes, end) : null;
      if (!p0 || !p1) continue;
      const w = p.v / q.total;
      covered += w;
      weighted += w * (p1 / p0 - 1);
    }
    if (!points.length) {
      points.push([start, 1]);
      benchPoints.push([start, 1]);
    }
    coverages.push(covered);
    if (covered > 0) value *= 1 + weighted / covered;
    const b0 = priceAt(bench, start);
    const b1 = priceAt(bench, end);
    if (b0 && b1) benchValue *= b1 / b0;
    points.push([end, Math.round(value * 1e4) / 1e4]);
    benchPoints.push([end, Math.round(benchValue * 1e4) / 1e4]);
    peak = Math.max(peak, value);
    maxDrawdown = Math.min(maxDrawdown, value / peak - 1);
  }
  if (points.length < 3) return null;
  const c = cagr(points);
  const b = cagr(benchPoints);
  return {
    start: points[0][0],
    points,
    bench: benchPoints,
    cagr: c != null ? Math.round(c * 1e4) / 1e4 : null,
    benchCagr: b != null ? Math.round(b * 1e4) / 1e4 : null,
    excess: c != null && b != null ? Math.round((c - b) * 1e4) / 1e4 : null,
    maxDrawdown: Math.round(maxDrawdown * 1e4) / 1e4,
    coverage: Math.round((coverages.reduce((a, x) => a + x, 0) / coverages.length) * 1e3) / 1e3,
    periods: points.length - 1,
  };
}

const startedAt = Date.now();

async function main() {
  const started = startedAt;
  const today = isoDate(new Date());
  const cache: PriceCache = existsSync(PRICE_CACHE) ? JSON.parse(readFileSync(PRICE_CACHE, "utf8")) : {};
  const out: BacktestJson = { updated: today, bench: BENCHMARK, managers: {} };
  console.log(`Copycat backtest for ${MANAGERS.length} managers (prices cached: ${Object.keys(cache).length})\n`);

  for (const m of MANAGERS) {
    const path = join(process.cwd(), "public", "superinvestors", `${m.id}.json`);
    if (!existsSync(path)) continue;
    try {
      const r = await backtest(JSON.parse(readFileSync(path, "utf8")), cache, today);
      if (r) {
        out.managers[m.id] = r;
        console.log(
          `${m.name}: ${r.start} → CAGR ${((r.cagr ?? 0) * 100).toFixed(1)}% vs SPY ${((r.benchCagr ?? 0) * 100).toFixed(1)}%, ` +
            `coverage ${(r.coverage * 100).toFixed(0)}%`
        );
      }
    } catch (err) {
      console.log(`${m.name}: FAILED ${(err as Error).message}`);
    }
    // Save prices as we go — the first run is long
    mkdirSync(join(process.cwd(), "data", "price-cache"), { recursive: true });
    writeFileSync(PRICE_CACHE, JSON.stringify(cache));
  }
  writeFileSync(join(process.cwd(), "public", "superinvestors", "backtest.json"), JSON.stringify(out));
  console.log(`\nWrote ${Object.keys(out.managers).length} backtests to public/superinvestors/backtest.json`);
  recordStatus("refresh-backtest", started, true, `${Object.keys(out.managers).length} managers backtested`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  recordStatus("refresh-backtest", startedAt, false, err.message);
  process.exit(1);
});

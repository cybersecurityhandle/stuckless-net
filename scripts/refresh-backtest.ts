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
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { MANAGERS, type BacktestJson, type BacktestManager, type ManagerHistoryJson } from "../lib/superinvestors";
import { availableOn, isoDate, loadPriceCache, monthlyCloses, priceAt, savePriceCache, type PriceCache } from "./prices";

const TOP_N = 30; // positions per quarter (typically 85–100% of a portfolio)
const BENCHMARK = "SPY";

/* ── Backtest ──────────────────────────────────────────────── */

function cagr(points: [string, number][]): number | null {
  if (points.length < 2) return null;
  const years = (Date.parse(points[points.length - 1][0]) - Date.parse(points[0][0])) / (365.25 * 86_400_000);
  if (years < 1) return null;
  return points[points.length - 1][1] ** (1 / years) - 1;
}

async function backtest(
  h: ManagerHistoryJson,
  cache: PriceCache,
  today: string,
  deadlineDays: number
): Promise<BacktestManager | null> {
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

  const available = (q: (typeof quarters)[number]) => availableOn(q, deadlineDays);

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
  const cache = loadPriceCache();
  const out: BacktestJson = { updated: today, bench: BENCHMARK, managers: {} };
  console.log(`Copycat backtest for ${MANAGERS.length} managers (prices cached: ${Object.keys(cache).length})\n`);

  for (const m of MANAGERS) {
    const path = join(process.cwd(), "public", "superinvestors", `${m.id}.json`);
    if (!existsSync(path)) continue;
    try {
      const r = await backtest(JSON.parse(readFileSync(path, "utf8")), cache, today, m.nport ? 65 : 50);
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
    savePriceCache(cache);
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

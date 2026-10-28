/**
 * Isolation vs performance: do managers whose portfolios look like nobody
 * else's do better or worse, following their 13Fs, than those in a crowd?
 *
 * Isolation, per quarter end: cosine similarity of issuer-level weights (as
 * on the similarity map, but recomputed for every past quarter among the
 * managers who filed it) — the average vs every other manager, and vs the
 * single closest one. Low = lone wolf, high = part of a cluster.
 *
 * Returns: the copycat method from refresh-backtest (top 30 positions as
 * weighted, bought when public, held to the next filing, dividend-adjusted
 * monthly closes), chained over the four quarter ends of each calendar year
 * and compared with SPY over the same windows. A year counts only if all
 * four quarters are priced (≥50% coverage) and the last one has been held
 * to a next filing.
 *
 * Reads public/superinvestors/{id}.json and the backtest's price cache;
 * writes public/superinvestors/isolation.json. Run after refresh-backtest
 * (then almost every price is cached).
 *
 * Usage:
 *   npm run refresh-isolation
 */

import { recordStatus } from "./status";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import {
  MANAGERS,
  issuerKey,
  type HistoryQuarter,
  type IsolationGroup,
  type IsolationJson,
  type IsolationStats,
  type IsolationYear,
  type ManagerHistoryJson,
} from "../lib/superinvestors";
import { availableOn, isoDate, loadPriceCache, monthlyCloses, priceAt, savePriceCache, type PriceCache } from "./prices";

const TOP_N = 30; // same as the backtest
const BENCHMARK = "SPY";
const MIN_COVERAGE = 0.5; // quarters priced below this drop the year
const MIN_PEERS = 10; // quarter ends with fewer filers don't get an isolation score
const MIN_YEARS = 3; // managers with fewer complete years are left out
const FIRST_YEAR = 2014; // prices start 2013; earlier quarters are sparse

interface Loaded {
  id: string;
  h: ManagerHistoryJson;
  deadlineDays: number;
  byPeriod: Map<string, HistoryQuarter>;
}

const r4 = (x: number) => Math.round(x * 1e4) / 1e4;

/* ── Isolation ─────────────────────────────────────────────── */

function weights(m: Loaded, q: HistoryQuarter) {
  const v = new Map<string, number>();
  for (const p of q.positions) {
    if (p.k.includes("|")) continue; // options
    const key = issuerKey(p.k, m.h.securities[p.k]);
    v.set(key, (v.get(key) ?? 0) + p.v / q.total);
  }
  return v;
}

// period → manager id → [avg, max] cosine vs the other filers that quarter
function isolationByQuarter(all: Loaded[]) {
  const periods = new Set<string>();
  for (const m of all) for (const p of m.byPeriod.keys()) periods.add(p);
  const out = new Map<string, Map<string, [number, number]>>();
  for (const period of [...periods].sort()) {
    const filers = all.filter((m) => m.byPeriod.has(period));
    if (filers.length < MIN_PEERS) continue;
    const vecs = filers.map((m) => weights(m, m.byPeriod.get(period)!));
    const norm = vecs.map((v) => Math.sqrt([...v.values()].reduce((s, x) => s + x * x, 0)) || 1);
    const n = filers.length;
    const sim: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dot = 0;
        const [a, b] = vecs[i].size < vecs[j].size ? [vecs[i], vecs[j]] : [vecs[j], vecs[i]];
        for (const [k, x] of a) dot += x * (b.get(k) ?? 0);
        sim[i][j] = sim[j][i] = dot / (norm[i] * norm[j]);
      }
    }
    const row = new Map<string, [number, number]>();
    filers.forEach((m, i) => {
      const others = sim[i].filter((_, j) => j !== i);
      row.set(m.id, [others.reduce((s, x) => s + x, 0) / others.length, Math.max(...others)]);
    });
    out.set(period, row);
  }
  return out;
}

/* ── Returns ───────────────────────────────────────────────── */

async function quarterReturn(
  m: Loaded,
  q: HistoryQuarter,
  next: HistoryQuarter,
  bench: [string, number][],
  cache: PriceCache,
  today: string
): Promise<{ ret: number; bench: number; coverage: number } | null> {
  const start = availableOn(q, m.deadlineDays);
  const end = availableOn(next, m.deadlineDays);
  if (end <= start) return null;
  let covered = 0;
  let weighted = 0;
  for (const p of q.positions.filter((p) => !p.k.includes("|")).slice(0, TOP_N)) {
    const t = m.h.securities[p.k]?.t;
    if (!t) continue;
    const closes = await monthlyCloses(t, cache, today);
    const p0 = closes ? priceAt(closes, start) : null;
    const p1 = closes ? priceAt(closes, end) : null;
    if (!p0 || !p1) continue;
    const w = p.v / q.total;
    covered += w;
    weighted += w * (p1 / p0 - 1);
  }
  const b0 = priceAt(bench, start);
  const b1 = priceAt(bench, end);
  if (covered < MIN_COVERAGE || !b0 || !b1) return null;
  return { ret: weighted / covered, bench: b1 / b0 - 1, coverage: covered };
}

async function managerYears(
  m: Loaded,
  iso: Map<string, Map<string, [number, number]>>,
  bench: [string, number][],
  cache: PriceCache,
  today: string
): Promise<IsolationYear[]> {
  const quarters = [...m.h.quarters].reverse().filter((q) => q.total > 0); // oldest first
  const byYear = new Map<number, { q: HistoryQuarter; next?: HistoryQuarter }[]>();
  quarters.forEach((q, i) => {
    const y = Number(q.period.slice(0, 4));
    if (y < FIRST_YEAR) return;
    byYear.set(y, [...(byYear.get(y) ?? []), { q, next: quarters[i + 1] }]);
  });
  const out: IsolationYear[] = [];
  for (const [year, qs] of byYear) {
    if (qs.length !== 4 || qs.some((x) => !x.next)) continue;
    let ret = 1;
    let b = 1;
    let cov = 0;
    let avg = 0;
    let max = 0;
    let ok = true;
    for (const { q, next } of qs) {
      const s = iso.get(q.period)?.get(m.id);
      const r = s && (await quarterReturn(m, q, next!, bench, cache, today));
      if (!s || !r) {
        ok = false;
        break;
      }
      ret *= 1 + r.ret;
      b *= 1 + r.bench;
      cov += r.coverage / 4;
      avg += s[0] / 4;
      max += s[1] / 4;
    }
    if (!ok) continue;
    out.push({
      year,
      ret: r4(ret - 1),
      bench: r4(b - 1),
      excess: r4(ret - b),
      avgSim: r4(avg),
      maxSim: r4(max),
      coverage: Math.round(cov * 1e3) / 1e3,
    });
  }
  return out.sort((a, b) => a.year - b.year);
}

/* ── Statistics ────────────────────────────────────────────── */

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
}

function pearson(x: number[], y: number[]) {
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

// Ranks with ties averaged
function ranks(xs: number[]) {
  const order = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(xs.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    for (let k = i; k <= j; k++) r[order[k][1]] = (i + j) / 2;
    i = j + 1;
  }
  return r;
}

interface Row {
  id: string;
  sim: number; // the isolation measure being tested
  avgExcess: number;
  years: { year: number; sim: number; excess: number }[];
}

// Sorted most isolated (lowest overlap) first, split into equal-ish groups
function groups(rows: Row[], labels: string[]): IsolationGroup[] {
  const sorted = [...rows].sort((a, b) => a.sim - b.sim);
  return labels.map((label, g) => {
    const part = sorted.slice(Math.round((g * sorted.length) / labels.length), Math.round(((g + 1) * sorted.length) / labels.length));
    const ex = part.map((r) => r.avgExcess);
    return {
      label,
      ids: part.map((r) => r.id),
      sim: [r4(part[0].sim), r4(part[part.length - 1].sim)],
      meanExcess: r4(mean(ex)),
      medianExcess: r4(median(ex)),
      beat: ex.filter((x) => x > 0).length,
    };
  });
}

function metricStats(rows: Row[]): IsolationStats {
  const x = rows.map((r) => r.sim);
  const y = rows.map((r) => r.avgExcess);
  const loo = x.map((_, i) => pearson(x.filter((_, j) => j !== i), y.filter((_, j) => j !== i)));
  // Pooled: demean within each year, so a year when everyone lagged SPY
  // (or the crowd was unusually similar) doesn't masquerade as a relationship
  const all = rows.flatMap((r) => r.years);
  const yearMean = new Map<number, { sim: number; ex: number }>();
  for (const yr of new Set(all.map((v) => v.year))) {
    const ys = all.filter((v) => v.year === yr);
    yearMean.set(yr, { sim: mean(ys.map((v) => v.sim)), ex: mean(ys.map((v) => v.excess)) });
  }
  const pooled = pearson(
    all.map((v) => v.sim - yearMean.get(v.year)!.sim),
    all.map((v) => v.excess - yearMean.get(v.year)!.ex)
  );
  return {
    pearson: r4(pearson(x, y)),
    spearman: r4(pearson(ranks(x), ranks(y))),
    looMin: r4(Math.min(...loo)),
    looMax: r4(Math.max(...loo)),
    pooled: r4(pooled),
    halves: groups(rows, ["Isolated half", "Clustered half"]),
    quartiles: groups(rows, ["Most isolated", "Q2", "Q3", "Most clustered"]),
  };
}

/* ── Main ──────────────────────────────────────────────────── */

const startedAt = Date.now();

async function main() {
  const today = isoDate(new Date());
  const cache = loadPriceCache();
  const bench = await monthlyCloses(BENCHMARK, cache, today);
  if (!bench) throw new Error("no benchmark prices");

  const all: Loaded[] = [];
  for (const m of MANAGERS) {
    const path = join(process.cwd(), "public", "superinvestors", `${m.id}.json`);
    if (!existsSync(path)) continue;
    const h: ManagerHistoryJson = JSON.parse(readFileSync(path, "utf8"));
    const byPeriod = new Map(h.quarters.filter((q) => q.total > 0).map((q) => [q.period, q]));
    all.push({ id: m.id, h, deadlineDays: m.nport ? 65 : 50, byPeriod });
  }
  const iso = isolationByQuarter(all);
  console.log(`Isolation for ${all.length} managers over ${iso.size} quarter ends\n`);

  const out: IsolationJson = {
    updated: today,
    bench: BENCHMARK,
    minYears: MIN_YEARS,
    years: [0, 0],
    managers: {},
    stats: undefined as unknown as IsolationJson["stats"],
  };
  for (const m of all) {
    const years = await managerYears(m, iso, bench, cache, today);
    savePriceCache(cache);
    if (years.length < MIN_YEARS) {
      console.log(`${m.id}: ${years.length} complete years — skipped`);
      continue;
    }
    const r = {
      avgSim: r4(mean(years.map((y) => y.avgSim))),
      maxSim: r4(mean(years.map((y) => y.maxSim))),
      avgExcess: r4(mean(years.map((y) => y.excess))),
      years,
    };
    out.managers[m.id] = r;
    console.log(
      `${m.id}: ${years.length} yrs, avg sim ${r.avgSim.toFixed(3)}, closest ${r.maxSim.toFixed(3)}, ` +
        `excess ${(r.avgExcess * 100).toFixed(1)}%/yr`
    );
  }

  const entries = Object.entries(out.managers);
  if (entries.length < 8) throw new Error(`only ${entries.length} managers with ${MIN_YEARS}+ years`);
  const rowsBy = (key: "avgSim" | "maxSim"): Row[] =>
    entries.map(([id, r]) => ({
      id,
      sim: r[key],
      avgExcess: r.avgExcess,
      years: r.years.map((y) => ({ year: y.year, sim: y[key], excess: y.excess })),
    }));
  const allYears = entries.flatMap(([, r]) => r.years.map((y) => y.year));
  out.years = [Math.min(...allYears), Math.max(...allYears)];
  out.stats = {
    managers: entries.length,
    managerYears: allYears.length,
    avg: metricStats(rowsBy("avgSim")),
    closest: metricStats(rowsBy("maxSim")),
  };
  writeFileSync(join(process.cwd(), "public", "superinvestors", "isolation.json"), JSON.stringify(out));

  const s = out.stats;
  console.log(`\n${s.managers} managers, ${s.managerYears} manager-years, ${out.years[0]}–${out.years[1]}`);
  for (const [name, m] of [["vs everyone", s.avg], ["vs closest", s.closest]] as const) {
    console.log(
      `${name}: r=${m.pearson} (Spearman ${m.spearman}, leave-one-out ${m.looMin}…${m.looMax}), manager-years r=${m.pooled}`
    );
    for (const g of [...m.halves, ...m.quartiles]) {
      console.log(
        `  ${g.label.padEnd(15)} n=${g.ids.length} overlap ${g.sim[0].toFixed(3)}–${g.sim[1].toFixed(3)}: ` +
          `mean ${(g.meanExcess * 100).toFixed(1)}%, median ${(g.medianExcess * 100).toFixed(1)}%, ${g.beat} beat`
      );
    }
  }
  recordStatus("refresh-isolation", startedAt, true, `${s.managers} managers, ${s.managerYears} manager-years, r=${s.avg.pearson}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  recordStatus("refresh-isolation", startedAt, false, err.message);
  process.exit(1);
});

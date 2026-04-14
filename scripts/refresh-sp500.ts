/**
 * Refresh S&P 500 screener data.
 *
 * Fetches the current S&P 500 constituent list, calls the stock API for each
 * ticker, computes quality metrics, and writes the results to
 * public/sp500-screener.json so the screener can load it instantly.
 *
 * Usage:
 *   npm run refresh-sp500
 *
 * Against local dev server (faster, no production load):
 *   API_BASE_URL=http://localhost:3000 npm run refresh-sp500
 *
 * Re-run quarterly or after major earnings seasons.
 */

import { writeFileSync } from "fs";
import { join } from "path";

const BASE_URL = process.env.API_BASE_URL ?? "https://stuckless.net";
const BATCH_SIZE = 5;
const DELAY_MS = 2000;

/* ── Types ─────────────────────────────────────────────────── */

interface Constituent {
  ticker: string;
  name: string;
  sector: string;
}

interface YearData {
  year: number;
  revenue: number;
  netIncome: number;
  sharesOutstanding: number;
  eps: number;
  price: number;
  netMargin: number;
  equity?: number;
  longTermDebt?: number;
}

interface StockData {
  ticker: string;
  name: string;
  years: YearData[];
}

export interface ScreenerRow {
  ticker: string;
  name: string;
  sector: string;
  price: number;
  roe: number | null;
  roce: number | null;
  margin: number;
  margin5yr: number;
  epsCAGR: number | null;
  revCAGR: number | null;
  buybackYield: number | null;
  qualityScore: number;
}

/* ── S&P 500 constituent list ───────────────────────────────── */

async function fetchConstituents(): Promise<Constituent[]> {
  const url =
    "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch S&P 500 list: ${res.status}`);
  const text = await res.text();

  const lines = text.trim().split("\n");
  // Detect column indices from header
  const header = parseCSVLine(lines[0]).map((h) => h.toLowerCase());
  const symbolIdx = header.findIndex((h) => h.includes("symbol"));
  const nameIdx = header.findIndex((h) => h.includes("name") || h.includes("security"));
  const sectorIdx = header.findIndex((h) => h.includes("sector"));

  return lines
    .slice(1)
    .map((line) => {
      const cols = parseCSVLine(line);
      return {
        ticker: (cols[symbolIdx] ?? "").trim().replace(/\./g, "-"), // BRK.B → BRK-B for Yahoo
        name: (cols[nameIdx] ?? "").trim(),
        sector: (cols[sectorIdx] ?? "").trim(),
      };
    })
    .filter((c) => c.ticker);
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;
  for (const c of line) {
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      fields.push(field);
      field = "";
    } else {
      field += c;
    }
  }
  fields.push(field);
  return fields;
}

/* ── Metrics computation (mirrors stock-screener.tsx) ────────── */

function cagr(start: number, end: number, years: number): number | null {
  if (years <= 0 || start <= 0 || end <= 0) return null;
  return Math.pow(end / start, 1 / years) - 1;
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function r3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function computeMetrics(data: StockData, sector: string): ScreenerRow | null {
  const years = data.years;
  if (years.length < 2) return null;

  const latest = years[years.length - 1];
  const fiveAgo = years.find((y) => y.year === latest.year - 5) ?? years[0];
  const span = latest.year - fiveAgo.year;

  const roe =
    latest.equity && latest.equity > 0
      ? latest.netIncome / latest.equity
      : null;

  const capitalEmployed = (latest.equity ?? 0) + (latest.longTermDebt ?? 0);
  const roce = capitalEmployed > 0 ? latest.netIncome / capitalEmployed : null;

  const margin = latest.netMargin;
  const recentYears = years.filter((y) => y.year >= latest.year - 4);
  const margin5yr =
    recentYears.reduce((s, y) => s + y.netMargin, 0) / recentYears.length;

  const epsCAGR =
    fiveAgo.eps > 0 && latest.eps > 0
      ? cagr(fiveAgo.eps, latest.eps, span)
      : null;
  const revCAGR = cagr(fiveAgo.revenue, latest.revenue, span);
  const buybackYield =
    fiveAgo.sharesOutstanding > 0 && span > 0
      ? (fiveAgo.sharesOutstanding - latest.sharesOutstanding) /
        fiveAgo.sharesOutstanding /
        span
      : null;

  let score = 0;
  let weights = 0;
  if (roe !== null) { score += Math.min(roe, 1) * 25; weights += 25; }
  if (roce !== null) { score += Math.min(roce, 1) * 20; weights += 20; }
  score += Math.min(Math.max(margin, 0), 0.5) * 2 * 15; weights += 15;
  if (epsCAGR !== null) { score += Math.min(Math.max(epsCAGR, 0), 0.5) * 2 * 15; weights += 15; }
  if (revCAGR !== null) { score += Math.min(Math.max(revCAGR, 0), 0.5) * 2 * 15; weights += 15; }
  if (buybackYield !== null) { score += Math.min(Math.max(buybackYield, 0), 0.1) * 10 * 10; weights += 10; }
  const qualityScore = weights > 0 ? Math.round((score / weights) * 1000) / 10 : 0;

  return {
    ticker: data.ticker,
    name: data.name || sector,
    sector,
    price: r2(latest.price),
    roe: roe !== null ? r3(roe) : null,
    roce: roce !== null ? r3(roce) : null,
    margin: r3(margin),
    margin5yr: r3(margin5yr),
    epsCAGR: epsCAGR !== null ? r3(epsCAGR) : null,
    revCAGR: revCAGR !== null ? r3(revCAGR) : null,
    buybackYield: buybackYield !== null ? r3(buybackYield) : null,
    qualityScore,
  };
}

/* ── API fetch ──────────────────────────────────────────────── */

async function fetchStock(ticker: string): Promise<StockData | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/stock?ticker=${encodeURIComponent(ticker)}`, {
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as StockData;
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/* ── Main ───────────────────────────────────────────────────── */

async function main() {
  console.log(`Fetching S&P 500 constituents from GitHub datasets...`);
  const constituents = await fetchConstituents();
  console.log(`Found ${constituents.length} tickers`);
  console.log(`API base: ${BASE_URL}`);
  console.log(`Batch size: ${BATCH_SIZE}, delay: ${DELAY_MS}ms\n`);

  const results: ScreenerRow[] = [];
  const failed: string[] = [];
  const startTime = Date.now();

  for (let i = 0; i < constituents.length; i += BATCH_SIZE) {
    const batch = constituents.slice(i, i + BATCH_SIZE);
    const pct = Math.floor((i / constituents.length) * 100);
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const eta =
      i > 0
        ? Math.round(((Date.now() - startTime) / i) * (constituents.length - i) / 1000)
        : "?";

    process.stdout.write(
      `[${pct}%] [${elapsed}s elapsed, ~${eta}s left] ${batch.map((c) => c.ticker).join(", ")}          \r`
    );

    const batchResults = await Promise.all(
      batch.map(async ({ ticker, name, sector }) => {
        const data = await fetchStock(ticker);
        if (!data) {
          failed.push(ticker);
          return null;
        }
        data.name = data.name || name;
        return computeMetrics(data, sector);
      })
    );

    for (const row of batchResults) {
      if (row) results.push(row);
    }

    if (i + BATCH_SIZE < constituents.length) {
      await sleep(DELAY_MS);
    }
  }

  // Sort best quality first
  results.sort((a, b) => b.qualityScore - a.qualityScore);

  const output = {
    updated: new Date().toISOString().split("T")[0],
    count: results.length,
    failed: failed.length,
    stocks: results,
  };

  const outPath = join(process.cwd(), "public", "sp500-screener.json");
  writeFileSync(outPath, JSON.stringify(output));

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n\nCompleted in ${elapsed}s`);
  console.log(`  Fetched : ${results.length} stocks`);
  console.log(`  Failed  : ${failed.length}${failed.length ? ` — ${failed.join(", ")}` : ""}`);
  console.log(`  Written : public/sp500-screener.json`);
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});

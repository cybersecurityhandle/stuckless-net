/**
 * Refresh watchlist data.
 *
 * Fetches every seed watchlist ticker from the stock API, computes the
 * watchlist row metrics, and writes public/watchlist.json so the Watchlist
 * tab loads instantly from a static file instead of querying EDGAR/Yahoo
 * per ticker.
 *
 * Usage:
 *   npm run refresh-watchlist
 *
 * Against local dev server:
 *   API_BASE_URL=http://localhost:3000 npm run refresh-watchlist
 *
 * Re-run whenever you want fresh prices (e.g. weekly, or after adding seeds).
 */

import { writeFileSync } from "fs";
import { join } from "path";
import { WATCHLIST_TICKERS, buildRow, type StockData, type WatchRow } from "../lib/watchlist-data";

const BASE_URL = process.env.API_BASE_URL ?? "https://stuckless.net";
const BATCH_SIZE = 4;
const DELAY_MS = 1000;

async function fetchStock(ticker: string): Promise<StockData | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/stock?ticker=${encodeURIComponent(ticker)}`, {
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as StockData;
    if (!data.years || data.years.length < 2) return null;
    return data;
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`Refreshing ${WATCHLIST_TICKERS.length} watchlist tickers via ${BASE_URL}\n`);

  const rows: WatchRow[] = [];
  const failed: string[] = [];

  for (let i = 0; i < WATCHLIST_TICKERS.length; i += BATCH_SIZE) {
    const batch = WATCHLIST_TICKERS.slice(i, i + BATCH_SIZE);
    process.stdout.write(`  ${batch.join(", ")}\n`);
    const results = await Promise.all(
      batch.map(async (t) => {
        const data = await fetchStock(t);
        if (!data) {
          failed.push(t);
          return null;
        }
        return buildRow(t, data);
      })
    );
    for (const r of results) if (r) rows.push(r);
    if (i + BATCH_SIZE < WATCHLIST_TICKERS.length) await sleep(DELAY_MS);
  }

  const output = {
    updated: new Date().toISOString().split("T")[0],
    count: rows.length,
    failed,
    rows,
  };

  const outPath = join(process.cwd(), "public", "watchlist.json");
  writeFileSync(outPath, JSON.stringify(output));
  console.log(`\nWrote ${rows.length} rows to public/watchlist.json`);
  if (failed.length) console.log(`Failed: ${failed.join(", ")}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});

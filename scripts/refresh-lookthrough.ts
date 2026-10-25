/**
 * Refresh look-through earnings for holding companies (lib/lookthrough.ts).
 *
 * For each holdco's Dec-31 13F, every holding's calendar-year EPS, DPS,
 * year-end price and share count come from the stock API. Equivalent shares
 * held = 13F value / year-end price (split-safe); retained earnings =
 * shares × (EPS − DPS), skipping equity-method investees; scaled up for
 * holdings without data, then taxed at the dividends-received rate.
 * Writes data/lookthrough.json.
 *
 * Usage:
 *   npm run refresh-lookthrough
 *
 * Against local dev server:
 *   API_BASE_URL=http://localhost:3000 npm run refresh-lookthrough
 *
 * Changes once a year (Q4 13Fs are filed by mid-February).
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import {
  EQUITY_METHOD,
  LOOK_THROUGH_HOLDCOS,
  lookThroughTaxRate,
  type LookThroughJson,
  type LookThroughYear,
} from "../lib/lookthrough";

const BASE_URL = process.env.API_BASE_URL ?? "https://stuckless.net";
const BATCH_SIZE = 4;

interface ApiYear {
  year: number;
  eps: number;
  dividendsPerShare: number;
  price: number;
  sharesOutstanding: number;
}

interface ApiStock {
  currency: string;
  years: ApiYear[];
  calendarYears?: ApiYear[];
}

interface ManagerFile {
  securities: Record<string, { t?: string }>;
  quarters: { period: string; positions: { k: string; v: number }[] }[];
}

async function fetchStock(ticker: string): Promise<ApiStock | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/stock?ticker=${encodeURIComponent(ticker)}`, {
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as ApiStock;
    return data.years?.length ? data : null;
  } catch {
    return null;
  }
}

// Calendar year first — 13F values are as of Dec 31 — then fiscal
function yearOf(stock: ApiStock, year: number): ApiYear | undefined {
  return stock.calendarYears?.find((y) => y.year === year) ?? stock.years.find((y) => y.year === year);
}

async function main() {
  const out: LookThroughJson = { updated: new Date().toISOString().slice(0, 10), holdcos: {} };

  for (const manager of new Set(Object.values(LOOK_THROUGH_HOLDCOS))) {
    const file: ManagerFile = JSON.parse(
      readFileSync(join(process.cwd(), "public", "superinvestors", `${manager}.json`), "utf8")
    );
    const yearEnds = file.quarters.filter((q) => q.period.endsWith("-12-31"));
    const tickers = [
      ...new Set(
        yearEnds.flatMap((q) => q.positions.map((p) => file.securities[p.k]?.t).filter((t): t is string => !!t))
      ),
    ];
    console.log(`${manager}: ${yearEnds.length} year-end 13Fs, ${tickers.length} tickers`);

    const stocks = new Map<string, ApiStock>();
    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      const batch = tickers.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(batch.map(fetchStock));
      batch.forEach((t, j) => {
        // USD only: 13F values are dollars, so a foreign-currency EPS would mislead
        if (results[j] && results[j]!.currency === "USD") stocks.set(t, results[j]!);
      });
    }

    const years: Record<string, LookThroughYear> = {};
    for (const q of yearEnds) {
      const year = Number(q.period.slice(0, 4));
      let retained = 0;
      let portfolio = 0;
      let fairValue = 0; // portfolio less equity-method stakes
      let covered = 0;
      const equityMethod: string[] = [];
      for (const p of q.positions) {
        portfolio += p.v;
        const t = file.securities[p.k]?.t;
        const since = t ? EQUITY_METHOD[manager]?.[t] : undefined;
        if (since != null && year >= since) {
          equityMethod.push(t!);
          continue;
        }
        fairValue += p.v;
        const y = t ? stocks.get(t) && yearOf(stocks.get(t)!, year) : undefined;
        if (!y || !(y.price > 0)) continue;
        retained += (p.v / y.price) * (y.eps - (y.dividendsPerShare ?? 0));
        covered += p.v;
      }
      // Holdings without data assumed to retain at the covered holdings' rate
      const scaled = covered > 0 ? (retained * fairValue) / covered : 0;
      years[year] = {
        lookThrough: Math.round(scaled * (1 - lookThroughTaxRate(year))),
        portfolio,
        covered: fairValue > 0 ? Math.round((covered / fairValue) * 1000) / 1000 : 0,
        equityMethod,
      };
      console.log(
        `  ${year}: look-through $${(years[year].lookThrough / 1e9).toFixed(2)}B on $${(portfolio / 1e9).toFixed(1)}B` +
          ` (${(years[year].covered * 100).toFixed(0)}% covered)${equityMethod.length ? `, equity-method: ${equityMethod.join(", ")}` : ""}`
      );
    }
    out.holdcos[manager] = years;
  }

  writeFileSync(join(process.cwd(), "data", "lookthrough.json"), JSON.stringify(out, null, 1) + "\n");
  console.log("\nWrote data/lookthrough.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

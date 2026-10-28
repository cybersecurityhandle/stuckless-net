/**
 * Monthly dividend-adjusted closes from Yahoo, converted to USD, cached in
 * data/price-cache/monthly.json (gitignored). Shared by the copycat backtest
 * and the isolation study so both price a 13F the same way.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { HistoryQuarter } from "../lib/superinvestors";

const PRICE_CACHE = join(process.cwd(), "data", "price-cache", "monthly.json");
const PRICE_REFRESH_DAYS = 7;
const FROM = "2013-01-01";

export function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function isoDate(d: Date) {
  return d.toISOString().split("T")[0];
}

export interface PriceCache {
  // usd: closes already converted from a non-USD listing (absent on old entries)
  [ticker: string]: { fetched: string; closes: [string, number][] | null; usd?: boolean };
}

export function loadPriceCache(): PriceCache {
  return existsSync(PRICE_CACHE) ? JSON.parse(readFileSync(PRICE_CACHE, "utf8")) : {};
}

export function savePriceCache(cache: PriceCache) {
  mkdirSync(join(process.cwd(), "data", "price-cache"), { recursive: true });
  writeFileSync(PRICE_CACHE, JSON.stringify(cache));
}

let yahoo: { chart: (t: string, o: object) => Promise<unknown> } | null = null;

export async function monthlyCloses(ticker: string, cache: PriceCache, today: string): Promise<[string, number][] | null> {
  const stale = isoDate(new Date(Date.now() - PRICE_REFRESH_DAYS * 86_400_000));
  const hit = cache[ticker];
  // Non-US listings (TAVHL.IS, CSU.TO) cached before USD conversion refetch once
  const foreign = ticker.includes(".") && !ticker.endsWith("=X");
  if (hit && hit.fetched > stale && (!foreign || hit.usd)) return hit.closes;
  if (!yahoo) {
    const { default: YahooFinance } = await import("yahoo-finance2");
    yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] }) as unknown as typeof yahoo;
  }
  let closes: [string, number][] | null = null;
  try {
    await sleep(200);
    const chart = (await yahoo!.chart(ticker, { period1: FROM, interval: "1mo", return: "array" })) as {
      meta?: { currency?: string };
      quotes?: { date: Date | string; adjclose?: number; close?: number }[];
    };
    closes = (chart.quotes ?? [])
      .map((q) => [isoDate(new Date(q.date)), q.adjclose ?? q.close ?? 0] as [string, number])
      .filter(([, c]) => c > 0);
    if (!closes.length) closes = null;
    closes &&= await toUsd(closes, chart.meta?.currency ?? "USD", cache, today);
  } catch {
    closes = null;
  }
  cache[ticker] = { fetched: today, closes, ...(foreign ? { usd: true } : {}) };
  return closes;
}

/**
 * Holdings are weighted in USD, so a lira-priced stock's return has to be in
 * USD too — TAVHL in TRY overstates the copycat's return by the lira's fall.
 * Each month's close × that month's FX close; minor units (GBp) are /100.
 */
async function toUsd(closes: [string, number][], currency: string, cache: PriceCache, today: string) {
  if (currency === "USD") return closes;
  const minor: Record<string, string> = { GBp: "GBP", GBX: "GBP", ZAc: "ZAR", ILA: "ILS" };
  const major = minor[currency] ?? currency.toUpperCase();
  const fx = await monthlyCloses(`${major}USD=X`, cache, today);
  if (!fx) return null; // no rate history — drop rather than mix currencies
  const scale = minor[currency] ? 0.01 : 1;
  const out: [string, number][] = [];
  for (const [d, c] of closes) {
    const rate = priceAt(fx, d) ?? fx[0][1]; // FX history can start later
    out.push([d, c * rate * scale]);
  }
  return out;
}

// Monthly bars are dated the 1st; use the last bar on or before the date
export function priceAt(closes: [string, number][], date: string): number | null {
  let out: number | null = null;
  for (const [d, c] of closes) {
    if (d > date) break;
    out = c;
  }
  return out;
}

/**
 * When a quarter became public. An amendment filed years later replaces the
 * quarter's "filed" date and would scramble the order, so cap it at the
 * original deadline (45 days after quarter end for a 13F, 60 for an N-PORT,
 * plus slack — pass 50 or 65).
 */
export function availableOn(q: Pick<HistoryQuarter, "period" | "filed">, deadlineDays: number) {
  const deadline = new Date(`${q.period}T00:00:00Z`);
  deadline.setUTCDate(deadline.getUTCDate() + deadlineDays);
  const d = isoDate(deadline);
  return q.filed < d ? q.filed : d;
}

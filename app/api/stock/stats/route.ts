import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Dataroma-style snapshot stats. Kept apart from /api/stock so the heavy,
// Redis-cached five-factor payload isn't refetched for price-driven numbers.

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
};

export interface StockStats {
  ticker: string;
  name: string | null;
  currency: string;
  financialCurrency: string | null; // reporting currency, when Yahoo knows it
  sector: string | null;
  industry: string | null;
  price: number | null;
  changePct: number | null; // today, fraction
  marketCap: number | null;
  low52: number | null;
  high52: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  priceToBook: number | null;
  eps: number | null; // trailing 12m, GAAP
  dividendYield: number | null; // fraction
  profitMargin: number | null;
  operatingMargin: number | null;
  roe: number | null;
  debtToEquity: number | null; // ratio (Yahoo reports percent)
  revenue: number | null;
  freeCashflow: number | null;
  beta: number | null;
  employees: number | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

const num = (v: any): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker")?.trim().toUpperCase();
  if (!ticker) return NextResponse.json({ error: "Provide ?ticker=" }, { status: 400 });

  try {
    const { default: YahooFinance } = await import("yahoo-finance2");
    const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
    const r: any = await yahooFinance.quoteSummary(ticker, {
      modules: ["price", "summaryDetail", "defaultKeyStatistics", "financialData", "assetProfile"],
    });
    const p = r.price ?? {};
    const s = r.summaryDetail ?? {};
    const k = r.defaultKeyStatistics ?? {};
    const f = r.financialData ?? {};
    const a = r.assetProfile ?? {};
    const de = num(f.debtToEquity);
    // Yahoo divides a class-B price by class-A book value for BRK-B
    // (P/B ≈ 0.001) — drop impossible values rather than show them
    const pb = num(k.priceToBook);

    const stats: StockStats = {
      ticker,
      name: p.longName ?? p.shortName ?? null,
      currency: p.currency ?? "USD",
      financialCurrency: f.financialCurrency ?? null,
      sector: a.sector ?? null,
      industry: a.industry ?? null,
      price: num(p.regularMarketPrice),
      changePct: num(p.regularMarketChangePercent),
      marketCap: num(p.marketCap),
      low52: num(s.fiftyTwoWeekLow),
      high52: num(s.fiftyTwoWeekHigh),
      trailingPE: num(s.trailingPE),
      forwardPE: num(s.forwardPE),
      priceToBook: pb != null && pb >= 0.05 ? pb : null,
      eps: num(k.trailingEps),
      dividendYield: num(s.dividendYield) ?? num(s.trailingAnnualDividendYield),
      profitMargin: num(f.profitMargins),
      operatingMargin: num(f.operatingMargins),
      roe: num(f.returnOnEquity),
      debtToEquity: de != null ? de / 100 : null,
      revenue: num(f.totalRevenue),
      freeCashflow: num(f.freeCashflow),
      beta: num(s.beta),
      employees: num(a.fullTimeEmployees),
    };
    return NextResponse.json(stats, { headers: CACHE_HEADERS });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch stats";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

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
      modules: ["price", "summaryDetail", "defaultKeyStatistics", "financialData", "assetProfile", "earningsTrend"],
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
    const price = num(p.regularMarketPrice);
    const trailingEps = num(k.trailingEps);
    // Listings that report in another currency (ADRs): Yahoo's forwardEps can
    // be the home share's estimate converted but not divided by the ADR ratio
    // (NTDOY: $2.14 vs $0.66 trailing, forward P/E 6x instead of ~23x). When
    // the implied forward EPS is >3x off trailing, fall back to the current
    // fiscal-year estimate — whose currency also varies by ADR (BABA's is in
    // CNY), so only when it's within 2x of trailing — else show nothing
    let forwardPE = num(s.forwardPE);
    const within = (a: number, b: number, x: number) => a > 0 && b > 0 && a / b < x && b / a < x;
    if (f.financialCurrency && p.currency && f.financialCurrency !== p.currency && price != null && trailingEps != null && trailingEps > 0) {
      if (forwardPE == null || !within(price / forwardPE, trailingEps, 3)) {
        const est = num(r.earningsTrend?.trend?.find((t: any) => t.period === "0y")?.earningsEstimate?.avg);
        forwardPE = est != null && within(est, trailingEps, 2) ? price / est : null;
      }
    }
    // Yahoo sends 0 rather than nothing when it lacks a margin (Nintendo)
    const margin = (v: any) => (num(v) === 0 ? null : num(v));

    const stats: StockStats = {
      ticker,
      name: p.longName ?? p.shortName ?? null,
      currency: p.currency ?? "USD",
      financialCurrency: f.financialCurrency ?? null,
      sector: a.sector ?? null,
      industry: a.industry ?? null,
      price,
      changePct: num(p.regularMarketChangePercent),
      marketCap: num(p.marketCap),
      low52: num(s.fiftyTwoWeekLow),
      high52: num(s.fiftyTwoWeekHigh),
      trailingPE: num(s.trailingPE),
      forwardPE,
      priceToBook: pb != null && pb >= 0.05 ? pb : null,
      eps: trailingEps,
      dividendYield: num(s.dividendYield) ?? num(s.trailingAnnualDividendYield),
      profitMargin: margin(f.profitMargins),
      operatingMargin: margin(f.operatingMargins),
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

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Weekly closes since 2013 for the superinvestor-moves chart (matches the 13F
// history window). Split-adjusted by Yahoo, so markers sit on a continuous line.

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=172800",
};
const FROM = "2013-01-01";

export interface PriceHistory {
  ticker: string;
  currency: string;
  points: [string, number][]; // [YYYY-MM-DD, close]
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker")?.trim().toUpperCase();
  if (!ticker) return NextResponse.json({ error: "Provide ?ticker=" }, { status: 400 });

  try {
    const { default: YahooFinance } = await import("yahoo-finance2");
    const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
    const chart: any = await yahooFinance.chart(ticker, { period1: FROM, interval: "1wk", return: "array" } as any);
    const points: [string, number][] = (chart?.quotes ?? [])
      .filter((q: any) => q.close != null)
      .map((q: any) => [new Date(q.date).toISOString().split("T")[0], Math.round(q.close * 100) / 100]);
    const body: PriceHistory = { ticker, currency: chart?.meta?.currency ?? "USD", points };
    return NextResponse.json(body, { headers: CACHE_HEADERS });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch history";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

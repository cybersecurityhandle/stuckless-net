import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
};

async function getYahooFinance() {
  const { default: YahooFinance } = await import("yahoo-finance2");
  return new YahooFinance({ suppressNotices: ["yahooSurvey"] });
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker");
  const search = searchParams.get("search");

  try {
    const yahooFinance = await getYahooFinance();

    if (search) {
      const result: any = await yahooFinance.search(search);
      const equities = (result.quotes || [])
        .filter((q: any) => q.quoteType === "EQUITY")
        .slice(0, 8)
        .map((q: any) => ({
          symbol: q.symbol,
          name: q.shortname || q.longname || q.symbol,
          exchange: q.exchDisp || q.exchange,
        }));
      return NextResponse.json(equities);
    }

    if (!ticker) {
      return NextResponse.json({ error: "Provide ?ticker= or ?search=" }, { status: 400 });
    }

    // Use fundamentalsTimeSeries (the old quoteSummary financial statement
    // submodules stopped returning data in Nov 2024)
    const [fundamentals, summary, historical]: [any[], any, any[]] = await Promise.all([
      yahooFinance.fundamentalsTimeSeries(ticker, {
        period1: new Date(new Date().getFullYear() - 6, 0, 1),
        period2: new Date(),
        type: "annual",
        module: "all",
      }),
      yahooFinance.quoteSummary(ticker, { modules: ["price"] }),
      yahooFinance.historical(ticker, {
        period1: new Date(new Date().getFullYear() - 6, 0, 1),
        period2: new Date(),
        interval: "1mo",
      }),
    ]);

    const years = [];

    for (const entry of fundamentals) {
      const endDate = entry.date instanceof Date ? entry.date : new Date(entry.date);
      const year = endDate.getFullYear();

      const revenue = entry.totalRevenue;
      const netIncome = entry.netIncome;
      // ordinarySharesNumber = actual outstanding shares (excludes treasury)
      const sharesOut = entry.ordinarySharesNumber;

      if (!revenue || !netIncome || !sharesOut) continue;

      // Use reported diluted EPS if available, else calculate
      const eps = entry.dilutedEPS || netIncome / sharesOut;

      // Dividends: cashDividendsPaid or commonStockDividendPaid (negative = paid out)
      const dividendsPaid = Math.abs(
        entry.cashDividendsPaid || entry.commonStockDividendPaid || 0
      );
      const dps = sharesOut > 0 ? dividendsPaid / sharesOut : 0;

      // Find closest historical price to fiscal year end
      const yearEndPrice = getClosestPrice(historical, endDate);
      if (!yearEndPrice) continue;

      const salesPerShare = revenue / sharesOut;
      const netMargin = netIncome / revenue;
      const pe = eps > 0 ? yearEndPrice / eps : 0;
      const divYield = yearEndPrice > 0 ? dps / yearEndPrice : 0;

      years.push({
        year,
        endDate: endDate.toISOString().split("T")[0],
        revenue,
        netIncome,
        sharesOutstanding: sharesOut,
        eps: Math.round(eps * 100) / 100,
        price: Math.round(yearEndPrice * 100) / 100,
        dividendsPerShare: Math.round(dps * 1000) / 1000,
        salesPerShare: Math.round(salesPerShare * 100) / 100,
        netMargin: Math.round(netMargin * 10000) / 10000,
        peMultiple: Math.round(pe * 100) / 100,
        dividendYield: Math.round(divYield * 10000) / 10000,
      });
    }

    years.sort((a, b) => a.year - b.year);

    return NextResponse.json(
      {
        ticker: ticker.toUpperCase(),
        name: summary.price?.longName || summary.price?.shortName || ticker.toUpperCase(),
        currency: summary.price?.currency || "USD",
        years,
      },
      { headers: CACHE_HEADERS }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch stock data";
    console.error("Stock API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function getClosestPrice(historical: any[], targetDate: Date): number {
  let closest: any = null;
  let minDiff = Infinity;

  for (const day of historical) {
    const d = day.date instanceof Date ? day.date : new Date(day.date);
    const diff = Math.abs(d.getTime() - targetDate.getTime());
    if (diff < minDiff && day.close) {
      minDiff = diff;
      closest = day;
    }
  }

  return closest?.close || 0;
}

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
};

async function getYahooFinance() {
  const { default: YahooFinance } = await import("yahoo-finance2");
  return new YahooFinance();
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker");
  const search = searchParams.get("search");

  try {
    const yahooFinance = await getYahooFinance();

    if (search) {
      /* eslint-disable @typescript-eslint/no-explicit-any */
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

    const summary: any = await yahooFinance.quoteSummary(ticker, {
      modules: [
        "incomeStatementHistory",
        "balanceSheetHistory",
        "cashflowStatementHistory",
        "price",
      ],
    });

    // Fetch monthly historical prices for year-end lookups
    const sixYearsAgo = new Date();
    sixYearsAgo.setFullYear(sixYearsAgo.getFullYear() - 6);

    const historical: any[] = await yahooFinance.historical(ticker, {
      period1: sixYearsAgo,
      period2: new Date(),
      interval: "1mo",
    });

    const incomeStmts: any[] = summary.incomeStatementHistory?.incomeStatementHistory || [];
    const balanceSheets: any[] = summary.balanceSheetHistory?.balanceSheetHistory || [];
    const cashFlows: any[] = summary.cashflowStatementHistory?.cashflowStatementHistory || [];

    const years = [];

    for (const stmt of incomeStmts) {
      const endDate = stmt.endDate instanceof Date ? stmt.endDate : new Date(stmt.endDate);
      const year = endDate.getFullYear();

      const revenue = stmt.totalRevenue;
      const netIncome = stmt.netIncome;
      if (!revenue || !netIncome) continue;

      // Find matching balance sheet by fiscal year
      const bs = balanceSheets.find((b: any) => {
        const d = b.endDate instanceof Date ? b.endDate : new Date(b.endDate);
        return d.getFullYear() === year;
      });

      const sharesOut = bs?.commonStockSharesOutstanding || bs?.shareIssued;
      if (!sharesOut) continue;

      // Find matching cash flow for dividends
      const cf = cashFlows.find((c: any) => {
        const d = c.endDate instanceof Date ? c.endDate : new Date(c.endDate);
        return d.getFullYear() === year;
      });

      const dividendsPaid = Math.abs(cf?.dividendsPaid || 0);
      const dps = sharesOut > 0 ? dividendsPaid / sharesOut : 0;

      // Find closest historical price to fiscal year end
      const yearEndPrice = getClosestPrice(historical, endDate);
      if (!yearEndPrice) continue;

      const eps = netIncome / sharesOut;
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
        dividendsPerShare: Math.round(dps * 100) / 100,
        salesPerShare: Math.round(salesPerShare * 100) / 100,
        netMargin: Math.round(netMargin * 10000) / 10000,
        peMultiple: Math.round(pe * 100) / 100,
        dividendYield: Math.round(divYield * 10000) / 10000,
      });
      /* eslint-enable @typescript-eslint/no-explicit-any */
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getClosestPrice(historical: any[], targetDate: Date): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

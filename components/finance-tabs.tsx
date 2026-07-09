"use client";

import { useState, useEffect } from "react";
import { MortgageCalculator } from "./mortgage-calculator";
import { StockAnalyzer } from "./stock-analyzer";
import { Watchlist } from "./watchlist";
import { BetaSection } from "./beta-section";

const tabs = [
  { id: "stocks" as const, label: "Five-Factor Analysis" },
  { id: "watchlist" as const, label: "Watchlist" },
  { id: "beta" as const, label: "Beta" },
  { id: "mortgage" as const, label: "Rent vs Buy" },
];

type TabId = (typeof tabs)[number]["id"];

export function FinanceTabs() {
  const [active, setActive] = useState<TabId>("stocks");
  // Wrapped in an object so clicking the same ticker twice still re-triggers
  const [analyzerTicker, setAnalyzerTicker] = useState<{ sym: string } | null>(null);

  function openInAnalyzer(sym: string) {
    setAnalyzerTicker({ sym });
    setActive("stocks");
  }

  // Deep link: /finance?ticker=XXX opens the analyzer with that ticker
  // (e.g. from a screener row click)
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("ticker");
    if (t) openInAnalyzer(t.toUpperCase());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div className="mb-8 flex gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={`px-4 pb-2 text-sm font-medium transition-colors ${
              active === tab.id
                ? "border-b-2 border-emerald-500 text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {active === "mortgage" && (
        <>
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">Rent vs Buy Calculator</h1>
            <p className="mt-2 text-muted-foreground">
              Calculating affordable house price in the GTA, Ontario. Compare the long-term
              financial outcome of renting versus buying.
            </p>
          </div>
          <MortgageCalculator />
        </>
      )}

      {active === "watchlist" && (
        <>
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">Quality Watchlist</h1>
            <p className="mt-2 text-muted-foreground">
              The best businesses are rarely cheap. Track them here and watch for the moments
              when their valuation dips below their own historical norm.
            </p>
          </div>
          <Watchlist onOpenAnalyzer={openInAnalyzer} />
        </>
      )}

      {active === "beta" && (
        <>
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">Short-Horizon Beta</h1>
            <p className="mt-2 text-muted-foreground">
              12-week beta vs the S&amp;P 500 for the watchlist names — volatility statistics
              in institutional dialect, deliberately kept away from the five factors.
            </p>
          </div>
          <BetaSection />
        </>
      )}

      {active === "stocks" && (
        <>
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">Five-Factor Stock Analysis</h1>
            <p className="mt-2 text-muted-foreground">
              Decompose stock returns into five fundamental drivers using Semper Augustus&apos;s
              methodology &mdash; dollar sales growth, share count, margin, P/E multiple, and
              dividend yield.
            </p>
          </div>
          <StockAnalyzer externalTicker={analyzerTicker} />
        </>
      )}
    </div>
  );
}

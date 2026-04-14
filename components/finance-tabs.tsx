"use client";

import { useState } from "react";
import { MortgageCalculator } from "./mortgage-calculator";
import { StockAnalyzer } from "./stock-analyzer";

const tabs = [
  { id: "mortgage" as const, label: "Rent vs Buy" },
  { id: "stocks" as const, label: "Five-Factor Analysis" },
];

export function FinanceTabs() {
  const [active, setActive] = useState<"mortgage" | "stocks">("mortgage");

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

      {active === "mortgage" ? (
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
      ) : (
        <>
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">Five-Factor Stock Analysis</h1>
            <p className="mt-2 text-muted-foreground">
              Decompose stock returns into five fundamental drivers using Semper Augustus&apos;s
              methodology &mdash; dollar sales growth, share count, margin, P/E multiple, and
              dividend yield.
            </p>
          </div>
          <StockAnalyzer />
        </>
      )}
    </div>
  );
}

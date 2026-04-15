"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

function fmt(n: number) {
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
}

export function MortgageCalculator() {
  // === House (Buy) ===
  const [homePrice, setHomePrice] = useState(900000);
  const [downPaymentPct, setDownPaymentPct] = useState(20);
  const [interestRate, setInterestRate] = useState(4.5);
  const [loanTermYears, setLoanTermYears] = useState(25);
  const [propertyTaxRate, setPropertyTaxRate] = useState(0.65);
  const [homeInsurance, setHomeInsurance] = useState(1800);
  const [maintenancePct, setMaintenancePct] = useState(1);

  // === Apartment/Condo (Rent) ===
  const [monthlyRent, setMonthlyRent] = useState(2500);
  const [rentInsurance, setRentInsurance] = useState(300);
  const [rentIncreasePct, setRentIncreasePct] = useState(3);

  // === Contingent Help ===
  const [parentalGift, setParentalGift] = useState(50000);
  const [basementRent, setBasementRent] = useState(1500);

  // === Income & Assumptions ===
  const [annualIncome, setAnnualIncome] = useState(85000);
  const [homeAppreciationPct, setHomeAppreciationPct] = useState(3);
  const [investReturnPct, setInvestReturnPct] = useState(7);
  const [yearsToCompare, setYearsToCompare] = useState(10);

  const results = useMemo(() => {
    // ── Scenario A: Buy standard ──────────────────────────────
    const downPayment = homePrice * (downPaymentPct / 100);
    const loanAmount = homePrice - downPayment;
    const monthlyRate = interestRate / 100 / 12;
    const numPayments = loanTermYears * 12;

    const monthlyMortgage =
      monthlyRate > 0
        ? (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
          (Math.pow(1 + monthlyRate, numPayments) - 1)
        : loanAmount / numPayments;

    const monthlyPropertyTax = (homePrice * (propertyTaxRate / 100)) / 12;
    const monthlyHomeInsurance = homeInsurance / 12;
    const monthlyMaintenance = (homePrice * (maintenancePct / 100)) / 12;
    const totalMonthlyOwn = monthlyMortgage + monthlyPropertyTax + monthlyHomeInsurance + monthlyMaintenance;

    // ── Scenario B: Rent + invest ─────────────────────────────
    const monthlyRentInsurance = rentInsurance / 12;

    // ── Scenario C: Buy with contingent help ─────────────────
    const boostedDown = downPayment + parentalGift;
    const boostedLoan = Math.max(0, homePrice - boostedDown);
    const boostedMortgage =
      boostedLoan === 0
        ? 0
        : monthlyRate > 0
        ? (boostedLoan * monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
          (Math.pow(1 + monthlyRate, numPayments) - 1)
        : boostedLoan / numPayments;
    // Net monthly after basement income
    const totalMonthlyBoosted = boostedMortgage + monthlyPropertyTax + monthlyHomeInsurance + monthlyMaintenance - basementRent;

    // ── Year-by-year ──────────────────────────────────────────
    const chartData = [];
    let currentRent = monthlyRent;
    let remainingBalance = loanAmount;
    let boostedBalance = boostedLoan;
    let currentHomeValue = homePrice;
    let investmentBalance = downPayment;

    for (let year = 1; year <= yearsToCompare; year++) {
      // Standard buy: amortise
      for (let m = 0; m < 12; m++) {
        const interest = remainingBalance * monthlyRate;
        remainingBalance = Math.max(0, remainingBalance - (monthlyMortgage - interest));
      }
      // Boosted buy: amortise (lower loan)
      for (let m = 0; m < 12; m++) {
        const interest = boostedBalance * monthlyRate;
        boostedBalance = Math.max(0, boostedBalance - (boostedMortgage - interest));
      }

      currentHomeValue *= 1 + homeAppreciationPct / 100;
      const homeEquity = currentHomeValue - remainingBalance;
      const boostedEquity = currentHomeValue - boostedBalance;

      // Rent + invest
      const totalMonthlyRent = currentRent + monthlyRentInsurance;
      const monthlySavings = Math.max(0, totalMonthlyOwn - totalMonthlyRent);
      for (let m = 0; m < 12; m++) {
        investmentBalance *= 1 + investReturnPct / 100 / 12;
        investmentBalance += monthlySavings;
      }

      currentRent *= 1 + rentIncreasePct / 100;

      chartData.push({
        year: `Yr ${year}`,
        "Buy (Equity)": Math.round(homeEquity),
        "Rent + Stocks": Math.round(investmentBalance),
        "Buy w/ Help (Equity)": Math.round(boostedEquity),
      });
    }

    const finalOwnEquity = currentHomeValue - remainingBalance;
    const finalBoostedEquity = currentHomeValue - boostedBalance;
    const finalRentWealth = investmentBalance;

    const best = Math.max(finalOwnEquity, finalBoostedEquity, finalRentWealth);
    const verdict =
      best === finalBoostedEquity ? "BUY W/ HELP" :
      best === finalOwnEquity ? "BUY HOUSE" : "RENT + INVEST";

    const monthlyIncome = annualIncome / 12;
    const totalMonthlyRent = monthlyRent + monthlyRentInsurance;
    const ownPctIncome = (totalMonthlyOwn / monthlyIncome) * 100;
    const rentPctIncome = (totalMonthlyRent / monthlyIncome) * 100;
    const boostedPctIncome = (Math.max(0, totalMonthlyBoosted) / monthlyIncome) * 100;
    const monthlySavingsInitial = Math.max(0, totalMonthlyOwn - totalMonthlyRent);

    return {
      monthlyMortgage,
      boostedMortgage,
      totalMonthlyOwn,
      totalMonthlyRent,
      totalMonthlyBoosted,
      ownPctIncome,
      rentPctIncome,
      boostedPctIncome,
      chartData,
      finalOwnEquity,
      finalBoostedEquity,
      finalRentWealth,
      verdict,
      downPayment,
      boostedDown,
      monthlySavingsInitial,
      finalInvestmentBalance: investmentBalance,
    };
  }, [
    homePrice, downPaymentPct, interestRate, loanTermYears,
    propertyTaxRate, homeInsurance, maintenancePct,
    monthlyRent, rentInsurance, rentIncreasePct,
    parentalGift, basementRent,
    homeAppreciationPct, investReturnPct, yearsToCompare, annualIncome,
  ]);

  const verdictColor =
    results.verdict === "BUY W/ HELP" ? "text-amber-400" :
    results.verdict === "BUY HOUSE" ? "text-emerald-500" : "text-violet-400";

  return (
    <div className="space-y-8">
      {/* Inputs */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {/* House (Buy) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">House (Buy)</CardTitle>
            <p className="text-xs text-muted-foreground">Property tax + maintenance included</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Home Price" value={homePrice} onChange={setHomePrice} prefix="$" hint="Purchase price of the house you're considering" />
            <Field label="Down Payment %" value={downPaymentPct} onChange={setDownPaymentPct} suffix="%" hint="20%+ avoids CMHC mortgage insurance in Canada" />
            <Field label="Interest Rate" value={interestRate} onChange={setInterestRate} suffix="%" step={0.1} hint="Current fixed mortgage rate from your bank" />
            <Field label="Mortgage Term (years)" value={loanTermYears} onChange={setLoanTermYears} hint="Amortization period — 25 yrs is standard in Canada" />
            <Field label="Property Tax Rate" value={propertyTaxRate} onChange={setPropertyTaxRate} suffix="%" step={0.05} hint="GTA averages 0.6-0.8% of assessed home value" />
            <Field label="Home Insurance / yr" value={homeInsurance} onChange={setHomeInsurance} prefix="$" hint="Annual homeowner's insurance premium" />
            <Field label="Maintenance / yr" value={maintenancePct} onChange={setMaintenancePct} suffix="% of home" step={0.1} hint="Rule of thumb: 1% of home value for repairs & upkeep" />
          </CardContent>
        </Card>

        {/* Rent */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Apartment / Condo (Rent)</CardTitle>
            <p className="text-xs text-muted-foreground">No property tax or maintenance</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Monthly Rent" value={monthlyRent} onChange={setMonthlyRent} prefix="$" hint="What you'd pay to rent a comparable unit in the GTA" />
            <Field label="Tenant Insurance / yr" value={rentInsurance} onChange={setRentInsurance} prefix="$" hint="Renter's insurance — covers your belongings & liability" />
            <Field label="Annual Rent Increase" value={rentIncreasePct} onChange={setRentIncreasePct} suffix="%" step={0.1} hint="Ontario guideline is ~2.5%, but new builds are exempt" />
          </CardContent>
        </Card>

        {/* Contingent Help */}
        <Card className="border-amber-500/30">
          <CardHeader>
            <CardTitle className="text-sm text-amber-400">Buy w/ Contingent Help</CardTitle>
            <p className="text-xs text-muted-foreground">Parental gift + basement rental income</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Parental Gift / Assist" value={parentalGift} onChange={setParentalGift} prefix="$" hint="Extra down payment from family — reduces loan size" />
            <Field label="Basement Rent / mo" value={basementRent} onChange={setBasementRent} prefix="$" hint="Monthly rental income from a basement suite or spare unit" />
            <div className="pt-2 border-t border-border/50 space-y-1">
              <p className="text-[10px] text-muted-foreground/60">Boosted down payment</p>
              <p className="text-sm font-bold text-amber-400">{fmt(results.boostedDown)}</p>
              <p className="text-[10px] text-muted-foreground/60">Net monthly (after basement income)</p>
              <p className="text-sm font-bold text-amber-400">{fmt(Math.max(0, results.totalMonthlyBoosted))}</p>
            </div>
          </CardContent>
        </Card>

        {/* Assumptions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Assumptions</CardTitle>
            <p className="text-xs text-muted-foreground">Market & investment projections</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Annual Income (gross)" value={annualIncome} onChange={setAnnualIncome} prefix="$" hint="Pre-tax salary — used to calculate housing affordability" />
            <Field label="Home Appreciation" value={homeAppreciationPct} onChange={setHomeAppreciationPct} suffix="% / yr" step={0.1} hint="How fast the home gains value — GTA avg ~3-5% historically" />
            <Field label="Investment Return" value={investReturnPct} onChange={setInvestReturnPct} suffix="% / yr" step={0.1} hint="Expected return if you invest savings instead — S&P 500 avg ~7%" />
            <Field label="Years to Compare" value={yearsToCompare} onChange={setYearsToCompare} hint="How many years to project — longer favors buying" />
          </CardContent>
        </Card>
      </div>

      {/* Verdict */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-4 py-6 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Buy monthly cost</p>
            <p className="text-xl font-bold">{fmt(results.totalMonthlyOwn)}</p>
            <p className={`text-xs mt-1 ${results.ownPctIncome > 30 ? "text-red-400" : "text-emerald-400"}`}>
              {results.ownPctIncome.toFixed(0)}% of income {results.ownPctIncome > 30 ? "(stretched)" : "(healthy)"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Rent monthly cost</p>
            <p className="text-xl font-bold">{fmt(results.totalMonthlyRent)}</p>
            <p className={`text-xs mt-1 ${results.rentPctIncome > 30 ? "text-red-400" : "text-emerald-400"}`}>
              {results.rentPctIncome.toFixed(0)}% of income {results.rentPctIncome > 30 ? "(stretched)" : "(healthy)"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Buy w/ help (net)</p>
            <p className="text-xl font-bold text-amber-400">{fmt(Math.max(0, results.totalMonthlyBoosted))}</p>
            <p className={`text-xs mt-1 ${results.boostedPctIncome > 30 ? "text-red-400" : "text-emerald-400"}`}>
              {results.boostedPctIncome.toFixed(0)}% of income {results.boostedPctIncome > 30 ? "(stretched)" : "(healthy)"}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">After {yearsToCompare} years, best path</p>
            <p className={`text-2xl font-bold ${verdictColor}`}>{results.verdict}</p>
            <div className="mt-1 text-[10px] text-muted-foreground space-y-0.5">
              <p>Buy: {fmt(results.finalOwnEquity)}</p>
              <p>Buy w/ help: {fmt(results.finalBoostedEquity)}</p>
              <p>Rent+Stocks: {fmt(results.finalRentWealth)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stock Portfolio breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Stock Portfolio (if renting)</CardTitle>
          <p className="text-xs text-muted-foreground">
            If you rent instead of buying, your down payment and monthly savings get invested in equities
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Down payment invested</p>
              <p className="text-lg font-bold">{fmt(results.downPayment)}</p>
              <p className="text-[10px] text-muted-foreground/60">Lump sum invested on day one instead of buying</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Monthly savings invested</p>
              <p className="text-lg font-bold">{fmt(results.monthlySavingsInitial)}</p>
              <p className="text-[10px] text-muted-foreground/60">Difference between owning cost and renting cost, invested monthly</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Portfolio after {yearsToCompare} yrs</p>
              <p className="text-lg font-bold text-violet-400">{fmt(results.finalInvestmentBalance)}</p>
              <p className="text-[10px] text-muted-foreground/60">Total equity portfolio value at {investReturnPct}% annual return</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Net Worth Over Time: All Three Scenarios</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={results.chartData}>
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#a1a1aa" }} />
              <YAxis
                tick={{ fontSize: 11, fill: "#a1a1aa" }}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#18181b",
                  border: "1px solid #27272a",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(value) => fmt(Number(value))}
              />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Bar dataKey="Buy (Equity)" fill="#10b981" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Rent + Stocks" fill="#7c3aed" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Buy w/ Help (Equity)" fill="#f59e0b" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  prefix,
  suffix,
  step = 1,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
  hint?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      <div className="flex items-center gap-1">
        {prefix && <span className="text-xs text-muted-foreground">{prefix}</span>}
        <Input
          type="number"
          value={value}
          step={step}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="h-8 text-sm"
        />
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </div>
      {hint && <p className="mt-0.5 text-[10px] text-muted-foreground/60">{hint}</p>}
    </div>
  );
}

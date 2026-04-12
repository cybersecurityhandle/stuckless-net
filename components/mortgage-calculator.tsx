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

  // === Assumptions ===
  const [homeAppreciationPct, setHomeAppreciationPct] = useState(3);
  const [investReturnPct, setInvestReturnPct] = useState(7);
  const [yearsToCompare, setYearsToCompare] = useState(10);

  const results = useMemo(() => {
    const downPayment = homePrice * (downPaymentPct / 100);
    const loanAmount = homePrice - downPayment;
    const monthlyRate = interestRate / 100 / 12;
    const numPayments = loanTermYears * 12;

    // Monthly mortgage payment (P&I)
    const monthlyMortgage =
      monthlyRate > 0
        ? (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
          (Math.pow(1 + monthlyRate, numPayments) - 1)
        : loanAmount / numPayments;

    // House monthly costs
    const monthlyPropertyTax = (homePrice * (propertyTaxRate / 100)) / 12;
    const monthlyHomeInsurance = homeInsurance / 12;
    const monthlyMaintenance = (homePrice * (maintenancePct / 100)) / 12;
    const totalMonthlyOwn = monthlyMortgage + monthlyPropertyTax + monthlyHomeInsurance + monthlyMaintenance;

    // Condo/Apartment monthly costs (rent + tenant insurance)
    const monthlyRentInsurance = rentInsurance / 12;

    // Year-by-year comparison
    const chartData = [];
    let currentRent = monthlyRent;
    let remainingBalance = loanAmount;
    let currentHomeValue = homePrice;
    let investmentBalance = downPayment; // If renting, invest the down payment instead

    for (let year = 1; year <= yearsToCompare; year++) {
      // Owning: mortgage + property tax + insurance + maintenance
      for (let m = 0; m < 12; m++) {
        const interestPayment = remainingBalance * monthlyRate;
        const principalPayment = monthlyMortgage - interestPayment;
        remainingBalance = Math.max(0, remainingBalance - principalPayment);
      }

      // Home appreciation
      currentHomeValue *= 1 + homeAppreciationPct / 100;
      const homeEquity = currentHomeValue - remainingBalance;

      // If renting, invest the down payment + monthly savings
      const totalMonthlyRent = currentRent + monthlyRentInsurance;
      const monthlySavings = Math.max(0, totalMonthlyOwn - totalMonthlyRent);
      for (let m = 0; m < 12; m++) {
        investmentBalance *= 1 + investReturnPct / 100 / 12;
        investmentBalance += monthlySavings;
      }

      // Rent increases annually
      currentRent *= 1 + rentIncreasePct / 100;

      chartData.push({
        year: `Yr ${year}`,
        "House (Equity)": Math.round(homeEquity),
        "Condo (Investments)": Math.round(investmentBalance),
      });
    }

    const finalOwnEquity = currentHomeValue - remainingBalance;
    const finalRentWealth = investmentBalance;
    const verdict = finalOwnEquity > finalRentWealth ? "BUY HOUSE" : "RENT CONDO";
    const difference = Math.abs(finalOwnEquity - finalRentWealth);

    return {
      monthlyMortgage,
      totalMonthlyOwn,
      totalMonthlyRent: monthlyRent + monthlyRentInsurance,
      chartData,
      finalOwnEquity,
      finalRentWealth,
      verdict,
      difference,
    };
  }, [
    homePrice, downPaymentPct, interestRate, loanTermYears,
    propertyTaxRate, homeInsurance, maintenancePct,
    monthlyRent, rentInsurance, rentIncreasePct, homeAppreciationPct,
    investReturnPct, yearsToCompare,
  ]);

  return (
    <div className="space-y-8">
      {/* Inputs */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* House (Buy) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">House (Buy)</CardTitle>
            <p className="text-xs text-muted-foreground">Property tax + maintenance included</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Home Price" value={homePrice} onChange={setHomePrice} prefix="$" />
            <Field label="Down Payment %" value={downPaymentPct} onChange={setDownPaymentPct} suffix="%" />
            <Field label="Interest Rate" value={interestRate} onChange={setInterestRate} suffix="%" step={0.1} />
            <Field label="Mortgage Term (years)" value={loanTermYears} onChange={setLoanTermYears} />
            <Field label="Property Tax Rate" value={propertyTaxRate} onChange={setPropertyTaxRate} suffix="%" step={0.05} />
            <Field label="Home Insurance / yr" value={homeInsurance} onChange={setHomeInsurance} prefix="$" />
            <Field label="Maintenance / yr" value={maintenancePct} onChange={setMaintenancePct} suffix="% of home" step={0.1} />
          </CardContent>
        </Card>

        {/* Apartment/Condo (Rent) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Apartment / Condo (Rent)</CardTitle>
            <p className="text-xs text-muted-foreground">No property tax or maintenance</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Monthly Rent" value={monthlyRent} onChange={setMonthlyRent} prefix="$" />
            <Field label="Tenant Insurance / yr" value={rentInsurance} onChange={setRentInsurance} prefix="$" />
            <Field label="Annual Rent Increase" value={rentIncreasePct} onChange={setRentIncreasePct} suffix="%" step={0.1} />
          </CardContent>
        </Card>

        {/* Assumptions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Assumptions</CardTitle>
            <p className="text-xs text-muted-foreground">Market & investment projections</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Home Appreciation" value={homeAppreciationPct} onChange={setHomeAppreciationPct} suffix="% / yr" step={0.1} />
            <Field label="Investment Return" value={investReturnPct} onChange={setInvestReturnPct} suffix="% / yr" step={0.1} />
            <Field label="Years to Compare" value={yearsToCompare} onChange={setYearsToCompare} />
          </CardContent>
        </Card>
      </div>

      {/* Verdict */}
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-6 sm:flex-row sm:justify-between">
          <div className="text-center sm:text-left">
            <p className="text-xs text-muted-foreground">House monthly cost</p>
            <p className="text-xl font-bold">{fmt(results.totalMonthlyOwn)}</p>
            <p className="text-xs text-muted-foreground mt-1">Mortgage + tax + insurance + maintenance</p>
          </div>
          <div className="text-center sm:text-left">
            <p className="text-xs text-muted-foreground">Condo monthly cost</p>
            <p className="text-xl font-bold">{fmt(results.totalMonthlyRent)}</p>
            <p className="text-xs text-muted-foreground mt-1">Rent + tenant insurance</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">After {yearsToCompare} years, better to</p>
            <p className={`text-2xl font-bold ${results.verdict === "BUY HOUSE" ? "text-emerald-500" : "text-blue-500"}`}>
              {results.verdict}
            </p>
            <p className="text-xs text-muted-foreground">by {fmt(results.difference)}</p>
          </div>
        </CardContent>
      </Card>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Net Worth: House Equity vs Condo + Investments</CardTitle>
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
              <Bar dataKey="House (Equity)" fill="#10b981" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Condo (Investments)" fill="#3b82f6" radius={[3, 3, 0, 0]} />
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
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
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
    </div>
  );
}

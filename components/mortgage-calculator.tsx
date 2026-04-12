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
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function MortgageCalculator() {
  // Defaults based on GTA Ontario market
  const [homePrice, setHomePrice] = useState(900000);
  const [downPaymentPct, setDownPaymentPct] = useState(20);
  const [interestRate, setInterestRate] = useState(4.5);
  const [loanTermYears, setLoanTermYears] = useState(25);
  const [propertyTaxRate, setPropertyTaxRate] = useState(0.65);
  const [homeInsurance, setHomeInsurance] = useState(1800);
  const [maintenancePct, setMaintenancePct] = useState(1);
  const [monthlyRent, setMonthlyRent] = useState(2500);
  const [rentIncreasePct, setRentIncreasePct] = useState(3);
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

    const monthlyPropertyTax = (homePrice * (propertyTaxRate / 100)) / 12;
    const monthlyInsurance = homeInsurance / 12;
    const monthlyMaintenance = (homePrice * (maintenancePct / 100)) / 12;

    const totalMonthlyOwn = monthlyMortgage + monthlyPropertyTax + monthlyInsurance + monthlyMaintenance;

    // Year-by-year comparison
    const chartData = [];
    let totalRentPaid = 0;
    let totalOwnCost = 0;
    let currentRent = monthlyRent;
    let remainingBalance = loanAmount;
    let currentHomeValue = homePrice;
    let investmentBalance = downPayment; // If renting, invest the down payment instead

    for (let year = 1; year <= yearsToCompare; year++) {
      // Renting: pay rent + invest the difference
      const yearlyRent = currentRent * 12;
      totalRentPaid += yearlyRent;

      // Owning: mortgage + taxes + insurance + maintenance
      let yearlyOwn = 0;
      let yearlyPrincipal = 0;
      for (let m = 0; m < 12; m++) {
        const interestPayment = remainingBalance * monthlyRate;
        const principalPayment = monthlyMortgage - interestPayment;
        remainingBalance = Math.max(0, remainingBalance - principalPayment);
        yearlyPrincipal += principalPayment;
        yearlyOwn += totalMonthlyOwn;
      }
      totalOwnCost += yearlyOwn;

      // Home appreciation
      currentHomeValue *= 1 + homeAppreciationPct / 100;
      const homeEquity = currentHomeValue - remainingBalance;

      // If renting, invest the down payment + monthly savings
      const monthlySavings = Math.max(0, totalMonthlyOwn - currentRent);
      for (let m = 0; m < 12; m++) {
        investmentBalance *= 1 + investReturnPct / 100 / 12;
        investmentBalance += monthlySavings;
      }

      // Rent increases
      currentRent *= 1 + rentIncreasePct / 100;

      // Net worth comparison
      const ownNetWorth = homeEquity;
      const rentNetWorth = investmentBalance;

      chartData.push({
        year: `Yr ${year}`,
        "Own (Equity)": Math.round(ownNetWorth),
        "Rent (Investments)": Math.round(rentNetWorth),
      });
    }

    const finalOwnEquity = currentHomeValue - remainingBalance;
    const finalRentWealth = investmentBalance;
    const verdict = finalOwnEquity > finalRentWealth ? "BUY" : "RENT";
    const difference = Math.abs(finalOwnEquity - finalRentWealth);

    return {
      monthlyMortgage,
      totalMonthlyOwn,
      chartData,
      finalOwnEquity,
      finalRentWealth,
      verdict,
      difference,
    };
  }, [
    homePrice, downPaymentPct, interestRate, loanTermYears,
    propertyTaxRate, homeInsurance, maintenancePct,
    monthlyRent, rentIncreasePct, homeAppreciationPct,
    investReturnPct, yearsToCompare,
  ]);

  return (
    <div className="space-y-8">
      {/* Inputs */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Buying inputs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Buying Costs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Home Price" value={homePrice} onChange={setHomePrice} prefix="$" />
            <Field label="Down Payment %" value={downPaymentPct} onChange={setDownPaymentPct} suffix="%" />
            <Field label="Interest Rate" value={interestRate} onChange={setInterestRate} suffix="%" step={0.1} />
            <Field label="Loan Term (years)" value={loanTermYears} onChange={setLoanTermYears} />
            <Field label="Property Tax Rate" value={propertyTaxRate} onChange={setPropertyTaxRate} suffix="%" step={0.1} />
            <Field label="Home Insurance / yr" value={homeInsurance} onChange={setHomeInsurance} prefix="$" />
            <Field label="Maintenance %" value={maintenancePct} onChange={setMaintenancePct} suffix="%" step={0.1} />
          </CardContent>
        </Card>

        {/* Renting inputs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Renting Costs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Monthly Rent" value={monthlyRent} onChange={setMonthlyRent} prefix="$" />
            <Field label="Annual Rent Increase" value={rentIncreasePct} onChange={setRentIncreasePct} suffix="%" step={0.1} />
          </CardContent>
        </Card>

        {/* Assumptions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Assumptions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Home Appreciation" value={homeAppreciationPct} onChange={setHomeAppreciationPct} suffix="%" step={0.1} />
            <Field label="Investment Return" value={investReturnPct} onChange={setInvestReturnPct} suffix="%" step={0.1} />
            <Field label="Years to Compare" value={yearsToCompare} onChange={setYearsToCompare} />
          </CardContent>
        </Card>
      </div>

      {/* Verdict */}
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-6 sm:flex-row sm:justify-between">
          <div className="text-center sm:text-left">
            <p className="text-sm text-muted-foreground">Monthly mortgage payment (P&I)</p>
            <p className="text-2xl font-bold">{fmt(results.monthlyMortgage)}</p>
          </div>
          <div className="text-center sm:text-left">
            <p className="text-sm text-muted-foreground">Total monthly cost to own</p>
            <p className="text-2xl font-bold">{fmt(results.totalMonthlyOwn)}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">After {yearsToCompare} years, better to</p>
            <p className={`text-3xl font-bold ${results.verdict === "BUY" ? "text-emerald-500" : "text-blue-500"}`}>
              {results.verdict}
            </p>
            <p className="text-xs text-muted-foreground">by {fmt(results.difference)}</p>
          </div>
        </CardContent>
      </Card>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Net Worth Over Time: Own vs Rent</CardTitle>
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
              <Bar dataKey="Own (Equity)" fill="#10b981" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Rent (Investments)" fill="#3b82f6" radius={[3, 3, 0, 0]} />
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

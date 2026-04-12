import type { Metadata } from "next";
import { MortgageCalculator } from "@/components/mortgage-calculator";

export const metadata: Metadata = {
  title: "Finance | Stuckless",
  description: "Rent vs Buy mortgage calculator — compare the true cost of owning vs renting",
};

export default function FinancePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Rent vs Buy Calculator</h1>
        <p className="mt-2 text-muted-foreground">
          Calculating affordable house price in the GTA, Ontario. Compare the long-term financial outcome of renting versus buying.
        </p>
      </div>
      <MortgageCalculator />
    </div>
  );
}

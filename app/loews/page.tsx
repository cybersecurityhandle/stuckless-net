import type { Metadata } from "next";
import { CompanyHoldingsView } from "@/components/company-holdings";
import { LOEWS } from "@/lib/loews";

export const metadata: Metadata = {
  alternates: { canonical: "/loews" },
  title: "Loews Corporation | Stuckless",
  description: "Everything Loews owns: CNA, Boardwalk, Loews Hotels, Altium, and the deals behind them",
};

export default function Page() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight">Everything {LOEWS.short} owns</h1>
      <p className="mt-2 max-w-3xl text-muted-foreground">Loews&apos; subsidiaries and the acquisitions its 10-Ks describe, including those made through CNA, Boardwalk, Loews Hotels and Altium. Hover a node for details.</p>
      <CompanyHoldingsView config={LOEWS} />
    </div>
  );
}

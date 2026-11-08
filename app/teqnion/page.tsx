import type { Metadata } from "next";
import { CompanyHoldingsView } from "@/components/company-holdings";
import { TEQNION } from "@/lib/teqnion";

export const metadata: Metadata = {
  alternates: { canonical: "/teqnion" },
  title: "Teqnion | Stuckless",
  description: "Everything Teqnion owns: its niche industrial companies in Sweden, the UK and Ireland",
};

export default function Page() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight">Everything {TEQNION.short} owns</h1>
      <p className="mt-2 max-w-3xl text-muted-foreground">
        Teqnion&apos;s niche industrial companies in Sweden, the UK and Ireland, from its 2025 annual report. Hover a node for details.
      </p>
      <CompanyHoldingsView config={TEQNION} />
    </div>
  );
}

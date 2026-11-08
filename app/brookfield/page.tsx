import type { Metadata } from "next";
import { CompanyHoldingsView } from "@/components/company-holdings";
import { BROOKFIELD } from "@/lib/brookfield";

export const metadata: Metadata = {
  alternates: { canonical: "/brookfield" },
  title: "Brookfield Corporation | Stuckless",
  description: "Everything Brookfield Corporation owns: its stakes in BAM, Brookfield Wealth Solutions and its operating affiliates, and their acquisitions since 2023",
};

export default function Page() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight">Everything {BROOKFIELD.short} owns</h1>
      <p className="mt-2 max-w-3xl text-muted-foreground">
        Brookfield&apos;s principal subsidiaries and what they have bought since 2023, from its annual information form and 2026 quarterly reports. Hover a node for details.
      </p>
      <CompanyHoldingsView config={BROOKFIELD} />
    </div>
  );
}

import type { Metadata } from "next";
import { CompanyHoldingsView } from "@/components/company-holdings";
import { MARKEL } from "@/lib/markel";

export const metadata: Metadata = {
  alternates: { canonical: "/markel" },
  title: "Markel Group | Stuckless",
  description: "Everything Markel Group owns: Markel Insurance, the Markel Ventures and financial businesses, its Hagerty stake and its US stocks",
};

export default function Page() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight">Everything {MARKEL.short} owns</h1>
      <p className="mt-2 max-w-3xl text-muted-foreground">
        {MARKEL.name}&apos;s insurance operations, the businesses it owns, its stakes outside the 13F and its US stocks. Hover a
        node for details; click a listed company for its stock page.
      </p>
      <CompanyHoldingsView config={MARKEL} />
    </div>
  );
}

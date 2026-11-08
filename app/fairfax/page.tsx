import type { Metadata } from "next";
import { CompanyHoldingsView } from "@/components/company-holdings";
import { FAIRFAX } from "@/lib/fairfax";

export const metadata: Metadata = {
  alternates: { canonical: "/fairfax" },
  title: "Fairfax Financial | Stuckless",
  description: "Everything Fairfax Financial owns: its insurance subsidiaries, non-insurance companies, associates like Eurobank and Poseidon, and its US stocks",
};

export default function Page() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight">Everything {FAIRFAX.short} owns</h1>
      <p className="mt-2 max-w-3xl text-muted-foreground">
        {FAIRFAX.name}&apos;s insurance operations, the businesses it owns, its stakes outside the 13F and its US stocks. Hover a
        node for details; click a listed company for its stock page.
      </p>
      <CompanyHoldingsView config={FAIRFAX} />
    </div>
  );
}

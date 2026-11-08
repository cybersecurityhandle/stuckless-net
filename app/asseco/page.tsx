import type { Metadata } from "next";
import { CompanyHoldingsView } from "@/components/company-holdings";
import { ASSECO } from "@/lib/asseco";

export const metadata: Metadata = {
  alternates: { canonical: "/asseco" },
  title: "Asseco Poland | Stuckless",
  description: "Everything Asseco Poland owns: its Polish, international and Formula Systems companies, with stakes",
};

export default function Page() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight">Everything {ASSECO.short} owns</h1>
      <p className="mt-2 max-w-3xl text-muted-foreground">
        Asseco&apos;s group structure from its H1 2026 report: companies it holds directly, through Asseco International, and through Formula Systems. Hover a node for details.
      </p>
      <CompanyHoldingsView config={ASSECO} />
    </div>
  );
}

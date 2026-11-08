import type { Metadata } from "next";
import { CompanyHoldingsView } from "@/components/company-holdings";
import { PINETREE } from "@/lib/pinetree";

export const metadata: Metadata = {
  alternates: { canonical: "/pinetree" },
  title: "Pinetree Capital | Stuckless",
  description: "Everything Pinetree Capital owns: its minority stakes in listed software companies, and every position it has held since 2020",
};

export default function Page() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight">Everything {PINETREE.short} owns</h1>
      <p className="mt-2 max-w-3xl text-muted-foreground">
        Pinetree&apos;s minority stakes in software companies, as named in its 2025 annual MD&amp;A, and every holding since 2020. Hover a node for details.
      </p>
      <CompanyHoldingsView config={PINETREE} />
    </div>
  );
}

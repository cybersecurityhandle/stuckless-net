import type { Metadata } from "next";
import { CompanyHoldingsView } from "@/components/company-holdings";
import { SYGNITY } from "@/lib/sygnity";

export const metadata: Metadata = {
  alternates: { canonical: "/sygnity" },
  title: "Sygnity | Stuckless",
  description: "Everything Sygnity owns: its Polish, Baltic and German software companies, and its acquisitions since 2024",
};

export default function Page() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight">Everything {SYGNITY.short} owns</h1>
      <p className="mt-2 max-w-3xl text-muted-foreground">
        Sygnity&apos;s subsidiaries from its H1 2026 report, and the software companies it has bought since 2024. Topicus owns 72.68% of it. Hover a node for details.
      </p>
      <CompanyHoldingsView config={SYGNITY} />
    </div>
  );
}

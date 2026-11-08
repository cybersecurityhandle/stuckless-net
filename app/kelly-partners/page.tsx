import type { Metadata } from "next";
import { CompanyHoldingsView } from "@/components/company-holdings";
import { KELLY_PARTNERS } from "@/lib/kelly-partners";

export const metadata: Metadata = {
  alternates: { canonical: "/kelly-partners" },
  title: "Kelly Partners Group | Stuckless",
  description: "Everything Kelly Partners owns: its 51%-owned accounting partnerships, other businesses by country, and every deal it announced",
};

export default function Page() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight">Everything {KELLY_PARTNERS.short} owns</h1>
      <p className="mt-2 max-w-3xl text-muted-foreground">
        Kelly Partners&apos; accounting firms and other businesses from its FY2026 annual report, and every deal it has announced
        on the ASX. Hover a node for details.
      </p>
      <CompanyHoldingsView config={KELLY_PARTNERS} />
    </div>
  );
}

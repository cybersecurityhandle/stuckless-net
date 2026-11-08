import type { Metadata } from "next";
import { CompanyHoldingsView } from "@/components/company-holdings";
import { BOSTON_OMAHA } from "@/lib/boston-omaha";

export const metadata: Metadata = {
  alternates: { canonical: "/boston-omaha" },
  title: "Boston Omaha | Stuckless",
  description: "Everything Boston Omaha owns: billboards, broadband, surety insurance, and every deal and stake",
};

export default function Page() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight">Everything {BOSTON_OMAHA.short} owns</h1>
      <p className="mt-2 max-w-3xl text-muted-foreground">Boston Omaha&apos;s businesses and every acquisition and minority stake its 10-Ks describe. Hover a node for details.</p>
      <CompanyHoldingsView config={BOSTON_OMAHA} />
    </div>
  );
}

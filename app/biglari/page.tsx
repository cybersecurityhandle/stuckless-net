import type { Metadata } from "next";
import { CompanyHoldingsView } from "@/components/company-holdings";
import { BIGLARI } from "@/lib/biglari";

export const metadata: Metadata = {
  alternates: { canonical: "/biglari" },
  title: "Biglari Holdings | Stuckless",
  description: "Everything Biglari Holdings owns: restaurants, insurance, oil and gas, and media",
};

export default function Page() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight">Everything {BIGLARI.short} owns</h1>
      <p className="mt-2 max-w-3xl text-muted-foreground">Biglari Holdings&apos; subsidiaries and the deals its 10-Ks describe since 2018. Hover a node for details.</p>
      <CompanyHoldingsView config={BIGLARI} />
    </div>
  );
}

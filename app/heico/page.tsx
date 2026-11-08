import type { Metadata } from "next";
import { CompanyHoldingsView } from "@/components/company-holdings";
import { HEICO } from "@/lib/heico";

export const metadata: Metadata = {
  alternates: { canonical: "/heico" },
  title: "HEICO | Stuckless",
  description: "Everything HEICO has bought: every acquisition its 10-Ks name since 2000, by decade",
};

export default function Page() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight">Everything {HEICO.short} owns</h1>
      <p className="mt-2 max-w-3xl text-muted-foreground">HEICO&apos;s two operating groups and every acquisition its 10-Ks name since 2000 — HEICO typically buys most of a niche aerospace or electronics business and leaves the founders a stake. Hover a node for details.</p>
      <CompanyHoldingsView config={HEICO} />
    </div>
  );
}

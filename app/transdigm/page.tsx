import type { Metadata } from "next";
import { CompanyHoldingsView } from "@/components/company-holdings";
import { TRANSDIGM } from "@/lib/transdigm";

export const metadata: Metadata = {
  alternates: { canonical: "/transdigm" },
  title: "TransDigm Group | Stuckless",
  description: "Everything TransDigm has bought: every acquisition its 10-Ks name",
};

export default function Page() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight">Everything {TRANSDIGM.short} owns</h1>
      <p className="mt-2 max-w-3xl text-muted-foreground">Every acquisition TransDigm&apos;s 10-Ks name — proprietary aerospace components, bought one niche at a time. Hover a node for details.</p>
      <CompanyHoldingsView config={TRANSDIGM} />
    </div>
  );
}

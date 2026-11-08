import type { Metadata } from "next";
import { CompanyHoldingsView } from "@/components/company-holdings";
import { BROWN_BROWN } from "@/lib/brown-brown";

export const metadata: Metadata = {
  alternates: { canonical: "/brown-brown" },
  title: "Brown & Brown | Stuckless",
  description: "Brown & Brown's named acquisitions out of 717 insurance intermediaries bought",
};

export default function Page() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight">Everything {BROWN_BROWN.short} owns</h1>
      <p className="mt-2 max-w-3xl text-muted-foreground">Brown & Brown has bought 717 insurance intermediaries. These are the ones its filings name, with the cash paid where stated. Hover a node for details.</p>
      <CompanyHoldingsView config={BROWN_BROWN} />
    </div>
  );
}

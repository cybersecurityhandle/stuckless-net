import type { Metadata } from "next";
import { CompanyHoldingsView } from "@/components/company-holdings";
import { ROPER } from "@/lib/roper";

export const metadata: Metadata = {
  alternates: { canonical: "/roper" },
  title: "Roper Technologies | Stuckless",
  description: "Everything Roper has bought: every acquisition its 10-Ks name since 2000",
};

export default function Page() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight">Everything {ROPER.short} owns</h1>
      <p className="mt-2 max-w-3xl text-muted-foreground">Every acquisition Roper&apos;s 10-Ks name since 2000, from industrial instruments to the vertical software it owns today. Hover a node for details.</p>
      <CompanyHoldingsView config={ROPER} />
    </div>
  );
}

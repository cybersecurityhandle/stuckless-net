import type { Metadata } from "next";
import { CompanyHoldingsView } from "@/components/company-holdings";
import { LUMINE } from "@/lib/lumine";

export const metadata: Metadata = {
  alternates: { canonical: "/lumine" },
  title: "Lumine Group | Stuckless",
  description: "Everything Lumine Group owns: its communications and media software companies and when each was bought",
};

export default function Page() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight">Everything {LUMINE.short} owns</h1>
      <p className="mt-2 max-w-3xl text-muted-foreground">
        Lumine&apos;s communications and media software companies, from its own site and press releases. Hover a node for details.
      </p>
      <CompanyHoldingsView config={LUMINE} />
    </div>
  );
}

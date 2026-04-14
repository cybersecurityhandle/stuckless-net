import type { Metadata } from "next";
import { FinanceTabs } from "@/components/finance-tabs";

export const metadata: Metadata = {
  title: "Finance | Stuckless",
  description: "Financial tools — Rent vs Buy calculator and Five-Factor stock analysis",
};

export default function FinancePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <FinanceTabs />
    </div>
  );
}

import type { Metadata } from "next";
import { DataStatus } from "@/components/data-status";

export const metadata: Metadata = {
  title: "Data Status | Stuckless",
  description: "Freshness of every dataset and the last run of each refresh job",
};

export default function StatusPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <DataStatus />
    </div>
  );
}

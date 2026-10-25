import type { Metadata } from "next";
import { InsiderFeed } from "@/components/insider-feed";

export const metadata: Metadata = {
  title: "Insider Buys | Stuckless",
  description: "Open-market insider purchases from SEC Form 4 filings",
};

export default function InsidersPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <InsiderFeed />
    </div>
  );
}

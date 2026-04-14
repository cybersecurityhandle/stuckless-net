import type { Metadata } from "next";
import { StockScreener } from "@/components/stock-screener";

export const metadata: Metadata = {
  title: "Screener | Stuckless",
  description: "Stock quality screener — compare ROCE, margins, earnings growth, and buybacks",
};

export default function ScreenerPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <StockScreener />
    </div>
  );
}

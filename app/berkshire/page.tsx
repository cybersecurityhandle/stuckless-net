import type { Metadata } from "next";
import { BerkshireWeb } from "@/components/berkshire-web";

export const metadata: Metadata = {
  title: "Berkshire Hathaway | Stuckless",
  description: "Everything Berkshire Hathaway owns: operating businesses, US stocks, stakes outside the 13F, and cash",
};

export default function BerkshirePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight">Everything Berkshire owns</h1>
      <p className="mt-2 max-w-3xl text-muted-foreground">
        Its operating businesses, the US stocks in its 13F, known stakes the 13F can&apos;t show, and its cash. Hover a
        node for details; click a stock to open its page.
      </p>
      <BerkshireWeb />
    </div>
  );
}

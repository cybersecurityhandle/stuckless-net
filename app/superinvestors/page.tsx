import { Suspense } from "react";
import type { Metadata } from "next";
import { Superinvestors } from "@/components/superinvestors";

export const metadata: Metadata = {
  title: "Superinvestors | Stuckless",
  description: "Quarterly 13F holdings of Buffett, Bloomstran, Gayner, Watsa, Pabrai and Einhorn",
};

export default function SuperinvestorsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* useSearchParams needs a Suspense boundary on a statically rendered page */}
      <Suspense>
        <Superinvestors />
      </Suspense>
    </div>
  );
}

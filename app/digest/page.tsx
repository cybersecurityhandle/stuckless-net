import type { Metadata } from "next";
import { WeeklyDigest } from "@/components/weekly-digest";

export const metadata: Metadata = {
  title: "Weekly Digest | Stuckless",
  description: "The last seven days: new 13Fs, superinvestor trades and stakes, cluster and insider buys",
};

export default function DigestPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <WeeklyDigest />
    </div>
  );
}

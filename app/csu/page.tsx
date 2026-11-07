import type { Metadata } from "next";
import { CsuWeb } from "@/components/csu-web";

export const metadata: Metadata = {
  title: "Constellation Software | Stuckless",
  description: "Everything Constellation Software owns: its nine operating groups and every company they list",
};

export default function CsuPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight">Everything Constellation owns</h1>
      <p className="mt-2 max-w-3xl text-muted-foreground">
        Constellation Software&apos;s nine operating groups and every company they list on their websites. Hover a group for
        details; click it for its portfolio, or search the full list below.
      </p>
      <CsuWeb />
    </div>
  );
}

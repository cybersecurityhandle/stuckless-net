import type { Metadata } from "next";
import { TopicusWeb } from "@/components/topicus-web";

export const metadata: Metadata = {
  title: "Topicus.com | Stuckless",
  description: "Everything Topicus.com owns: Topicus (NL), every TSS acquisition since 2016, and its stakes in Sygnity and Asseco",
};

export default function TopicusPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight">Everything Topicus owns</h1>
      <p className="mt-2 max-w-3xl text-muted-foreground">
        Topicus.com, Constellation Software&apos;s European arm: the Dutch Topicus business, every company its TSS group has
        announced buying since 2016, and its listed stakes. Hover a node for details; click a company for its announcement.
      </p>
      <TopicusWeb />
    </div>
  );
}

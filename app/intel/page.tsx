import type { Metadata } from "next";
import { CveFeed } from "@/components/cve-feed";
import { CveSearch } from "@/components/cve-search";
import { ThreatActors } from "@/components/threat-actors";
import { ThreatChart } from "@/components/threat-chart";

export const metadata: Metadata = {
  title: "Threat Intel | Stuckless",
  description: "Cybersecurity threat intelligence dashboard — CVEs, threat actors, and analytics",
};

export default function ThreatIntelPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Threat Intelligence</h1>
        <p className="mt-2 text-muted-foreground">
          The newest CVEs from the NVD (refreshed every 5 minutes), vulnerability search, and a threat actor directory.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Main column */}
        <div className="min-w-0 space-y-8">
          {/* CVE Search */}
          <section>
            <h2 className="mb-4 text-lg font-semibold">CVE Search</h2>
            <CveSearch />
          </section>

          {/* Threat Actors */}
          <section>
            <h2 className="mb-4 text-lg font-semibold">Threat Actors</h2>
            <ThreatActors />
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-8">
          {/* Chart */}
          <section>
            <ThreatChart />
          </section>

          {/* Live Feed */}
          <section>
            <h2 className="mb-1 text-lg font-semibold">Latest CVEs</h2>
            <p className="mb-4 text-xs text-muted-foreground">Published in the last 7 days · click for NVD details</p>
            <CveFeed />
          </section>
        </div>
      </div>
    </div>
  );
}

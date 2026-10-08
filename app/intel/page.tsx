import type { Metadata } from "next";
import { CveFeed } from "@/components/intel/cve-feed";
import { CveSearch } from "@/components/intel/cve-search";
import { KevList } from "@/components/intel/kev-list";
import { StatTiles } from "@/components/intel/stat-tiles";
import { ThreatActors } from "@/components/intel/threat-actors";
import { getIntelSnapshot } from "@/lib/intel";
import { threatActors, threatActorsUpdated } from "@/lib/mitre";
import { formatUtc } from "@/lib/severity";

export const metadata: Metadata = {
  title: "Threat Intel | Stuckless",
  description:
    "Live threat intelligence: newest CVEs, actively exploited vulnerabilities, exploit probability, and threat actor profiles.",
};

// Rebuilt in the background at most every 5 minutes.
export const revalidate = 300;

const SOURCES = [
  { key: "nvd", label: "NVD" },
  { key: "kev", label: "CISA KEV" },
  { key: "epss", label: "FIRST EPSS" },
] as const;

export default async function ThreatIntelPage() {
  const snapshot = await getIntelSnapshot();

  return (
    <div className="scanlines min-h-[calc(100vh-4rem)] bg-black">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6 lg:px-8">
        <header>
          <p className="font-mono text-sm text-green-400">
            <span className="text-glow-subtle">root@stuckless:~$</span>{" "}
            <span className="text-green-300">./threat-intel --live</span>
          </p>
          <h1 className="text-glow mt-3 font-mono text-3xl font-bold tracking-tight text-green-400 sm:text-4xl">
            Threat Intelligence
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">
            What&apos;s being disclosed, what&apos;s being exploited, and who&apos;s behind it. Built from public feeds
            and refreshed every 5 minutes.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[11px] text-zinc-500">
            {SOURCES.map((s) => {
              const up = snapshot.sources[s.key];
              return (
                <span key={s.key} className="inline-flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2" aria-hidden>
                    {up && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-50" />}
                    <span className={`relative inline-flex h-2 w-2 rounded-full ${up ? "bg-green-500" : "bg-rose-500"}`} />
                  </span>
                  {s.label}
                  <span className={up ? "text-green-500/70" : "text-rose-400"}>{up ? "online" : "offline"}</span>
                </span>
              );
            })}
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-green-500/60" aria-hidden />
              MITRE ATT&amp;CK
            </span>
            <span className="text-zinc-600">snapshot {formatUtc(snapshot.generatedAt)}</span>
          </div>
        </header>

        <StatTiles snapshot={snapshot} actorCount={threatActors.length} />

        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-6">
            <KevList rows={snapshot.kev} available={snapshot.sources.kev} stats={snapshot.kevStats} />
            <CveSearch />
          </div>
          <div className="min-w-0 lg:sticky lg:top-6">
            <CveFeed cves={snapshot.cves} available={snapshot.sources.nvd} />
          </div>
        </div>

        <ThreatActors actors={threatActors} updated={threatActorsUpdated} />

        <p className="font-mono text-[11px] text-zinc-600">
          {"// "}Sources: NIST National Vulnerability Database · CISA Known Exploited Vulnerabilities catalog · FIRST
          Exploit Prediction Scoring System · MITRE ATT&amp;CK®. Not affiliated with any of them.
        </p>
      </div>
    </div>
  );
}

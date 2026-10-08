import { ExternalLink } from "lucide-react";
import type { KevRow } from "@/lib/intel";
import { formatUtc, nvdUrl } from "@/lib/severity";
import { EpssMeter, Panel, RansomwareBadge } from "@/components/intel/primitives";

const KEV_CATALOG = "https://www.cisa.gov/known-exploited-vulnerabilities-catalog";

export function KevList({
  rows,
  available,
  stats,
}: {
  rows: KevRow[];
  available: boolean;
  stats: { added: number } | null;
}) {
  return (
    <Panel
      label="exploited in the wild"
      title="CISA Known Exploited Vulnerabilities"
      aside={
        available && stats ? (
          <span>
            {stats.added} added in 30 days ·{" "}
            <a href={KEV_CATALOG} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-green-400">
              full catalog <ExternalLink className="h-3 w-3" />
            </a>
          </span>
        ) : undefined
      }
    >
      {!available ? (
        <p className="p-4 text-sm text-zinc-500">CISA&apos;s feed is unreachable right now. It will be back on the next refresh.</p>
      ) : (
        <ol className="divide-y divide-green-500/10">
          {rows.map((k) => (
            <li key={k.cveID}>
              <a
                href={nvdUrl(k.cveID)}
                target="_blank"
                rel="noopener noreferrer"
                className="grid gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-green-500/[0.04] focus-visible:bg-green-500/[0.04] focus-visible:outline-none sm:grid-cols-[96px_1fr]"
              >
                <div className="font-mono text-[11px] text-zinc-500 sm:pt-0.5">
                  <span className="text-zinc-400">{formatUtc(k.dateAdded, false)}</span>
                  <span className="sm:hidden"> · </span>
                  <span className="sm:block">due {formatUtc(k.dueDate, false)}</span>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-mono text-sm font-medium text-zinc-100">{k.cveID}</span>
                    <span className="text-sm text-zinc-400">
                      {k.vendorProject} · {k.product}
                    </span>
                    {k.knownRansomwareCampaignUse === "Known" && <RansomwareBadge />}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-500">{k.shortDescription}</p>
                  <div className="mt-1.5">
                    <EpssMeter epss={k.epss} percentile={k.epssPercentile} />
                  </div>
                </div>
              </a>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

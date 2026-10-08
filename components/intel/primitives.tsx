import { Flame, ShieldAlert } from "lucide-react";
import type { CVE } from "@/lib/nvd";
import { formatEpss, severityBadge, severityLabel } from "@/lib/severity";

export function Panel({
  label,
  title,
  aside,
  children,
  className = "",
}: {
  label: string;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`border border-green-500/15 bg-zinc-950/80 ${className}`}>
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-green-500/10 px-4 py-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-green-500/60">{"// "}{label}</p>
          <h2 className="mt-0.5 font-mono text-base font-semibold text-zinc-100">{title}</h2>
        </div>
        {aside && <div className="font-mono text-[11px] text-zinc-500">{aside}</div>}
      </header>
      {children}
    </section>
  );
}

export function SeverityBadge({ cve }: { cve: Pick<CVE, "severity" | "score"> }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 font-mono text-[11px] font-medium ${severityBadge[cve.severity]}`}>
      {severityLabel(cve)}
    </span>
  );
}

export function KevBadge() {
  return (
    <span
      title="Listed in the CISA Known Exploited Vulnerabilities catalog"
      className="inline-flex shrink-0 items-center gap-1 rounded border border-rose-500/40 bg-rose-500/10 px-1.5 py-0.5 font-mono text-[11px] font-medium text-rose-300"
    >
      <ShieldAlert className="h-3 w-3" aria-hidden />
      EXPLOITED
    </span>
  );
}

export function RansomwareBadge() {
  return (
    <span
      title="Known to be used in ransomware campaigns (CISA)"
      className="inline-flex shrink-0 items-center gap-1 rounded border border-orange-500/40 bg-orange-500/10 px-1.5 py-0.5 font-mono text-[11px] font-medium text-orange-300"
    >
      <Flame className="h-3 w-3" aria-hidden />
      RANSOMWARE
    </span>
  );
}

/** EPSS probability as a small meter; the bar length is the percentile among all scored CVEs. */
export function EpssMeter({ epss, percentile }: { epss: number | null | undefined; percentile: number | null | undefined }) {
  if (epss == null || percentile == null) {
    return <span className="font-mono text-[11px] text-zinc-600">EPSS —</span>;
  }
  const tone = epss >= 0.5 ? "bg-rose-500" : epss >= 0.1 ? "bg-orange-500" : epss >= 0.01 ? "bg-yellow-400" : "bg-zinc-500";
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono text-[11px] text-zinc-400"
      title={`EPSS ${formatEpss(epss)} chance of exploitation in the next 30 days · higher than ${Math.round(percentile * 100)}% of CVEs`}
    >
      EPSS
      <span className="relative h-1.5 w-10 overflow-hidden rounded-full bg-zinc-800" aria-hidden>
        <span className={`absolute inset-y-0 left-0 rounded-full ${tone}`} style={{ width: `${Math.max(4, percentile * 100)}%` }} />
      </span>
      <span className="tabular-nums text-zinc-300">{formatEpss(epss)}</span>
    </span>
  );
}

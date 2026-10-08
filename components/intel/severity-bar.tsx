import type { CVE } from "@/lib/nvd";
import { SEVERITIES, severityHex } from "@/lib/severity";

const LABEL: Record<CVE["severity"], string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  NONE: "Unscored",
};

/** Share of the newest CVEs by severity: one stacked bar with a counted legend. */
export function SeverityBar({ cves }: { cves: CVE[] }) {
  const counts = SEVERITIES.map((s) => ({ s, n: cves.filter((c) => c.severity === s).length })).filter((c) => c.n > 0);
  const total = cves.length;
  if (total === 0) return null;

  return (
    <div>
      <div className="flex h-3 gap-0.5" role="img" aria-label={counts.map((c) => `${LABEL[c.s]} ${c.n}`).join(", ")}>
        {counts.map((c) => (
          <div
            key={c.s}
            className="group relative h-full first:rounded-l last:rounded-r"
            style={{ width: `${(c.n / total) * 100}%`, backgroundColor: severityHex[c.s] }}
          >
            <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono text-[11px] text-zinc-200 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              {LABEL[c.s]}: {c.n} ({Math.round((c.n / total) * 100)}%)
            </span>
          </div>
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {counts.map((c) => (
          <li key={c.s} className="flex items-center gap-1.5 font-mono text-[11px] text-zinc-400">
            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: severityHex[c.s] }} aria-hidden />
            {LABEL[c.s]} <span className="tabular-nums text-zinc-200">{c.n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

import type { CVE } from "@/lib/nvd";

export const SEVERITIES: CVE["severity"][] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE"];

export const severityHex: Record<CVE["severity"], string> = {
  // Validated on #09090b: adjacent pairs separable under normal and CVD vision.
  CRITICAL: "#e11d48",
  HIGH: "#f97316",
  MEDIUM: "#facc15",
  LOW: "#3b82f6",
  NONE: "#52525b",
};

export const severityBadge: Record<CVE["severity"], string> = {
  CRITICAL: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  HIGH: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  MEDIUM: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  LOW: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  NONE: "bg-muted text-muted-foreground border-border",
};

export function severityLabel(cve: Pick<CVE, "severity" | "score">) {
  if (cve.severity === "NONE") return "Unscored";
  return cve.score !== null ? `${cve.severity} ${cve.score.toFixed(1)}` : cve.severity;
}

export function nvdUrl(id: string) {
  return `https://nvd.nist.gov/vuln/detail/${id}`;
}

export function timeAgo(iso: string) {
  // NVD timestamps are UTC without a zone suffix.
  const then = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(then).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatEpss(epss: number) {
  const pct = epss * 100;
  if (pct < 0.1) return "<0.1%";
  return pct < 10 ? `${pct.toFixed(1)}%` : `${Math.round(pct)}%`;
}

/** Server-safe absolute timestamp, e.g. "Oct 8, 14:16 UTC". */
export function formatUtc(iso: string, withTime = true) {
  const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    ...(withTime && { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
    timeZone: "UTC",
  }) + (withTime ? " UTC" : "");
}

import type { CVE } from "@/lib/nvd";

export const SEVERITIES: CVE["severity"][] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE"];

export const severityHex: Record<CVE["severity"], string> = {
  CRITICAL: "#dc2626",
  HIGH: "#f97316",
  MEDIUM: "#eab308",
  LOW: "#3b82f6",
  NONE: "#6b7280",
};

export const severityBadge: Record<CVE["severity"], string> = {
  CRITICAL: "bg-red-500/15 text-red-400 border-red-500/30",
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

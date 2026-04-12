export interface CVE {
  id: string;
  description: string;
  published: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NONE";
  score: number | null;
  references: string[];
}

const NVD_BASE = "https://services.nvd.nist.gov/rest/json/cves/2.0";

function extractSeverity(cveItem: Record<string, unknown>): { severity: CVE["severity"]; score: number | null } {
  const metrics = cveItem.metrics as Record<string, unknown> | undefined;
  if (!metrics) return { severity: "NONE", score: null };

  // Try CVSS 3.1 first, then 3.0, then 2.0
  for (const key of ["cvssMetricV31", "cvssMetricV30"]) {
    const metricArray = metrics[key] as Array<Record<string, unknown>> | undefined;
    if (metricArray?.[0]) {
      const cvssData = metricArray[0].cvssData as Record<string, unknown>;
      return {
        severity: (cvssData.baseSeverity as string)?.toUpperCase() as CVE["severity"] ?? "NONE",
        score: cvssData.baseScore as number ?? null,
      };
    }
  }

  const v2 = metrics.cvssMetricV2 as Array<Record<string, unknown>> | undefined;
  if (v2?.[0]) {
    const cvssData = v2[0].cvssData as Record<string, unknown>;
    const score = cvssData.baseScore as number;
    let severity: CVE["severity"] = "NONE";
    if (score >= 9) severity = "CRITICAL";
    else if (score >= 7) severity = "HIGH";
    else if (score >= 4) severity = "MEDIUM";
    else if (score > 0) severity = "LOW";
    return { severity, score };
  }

  return { severity: "NONE", score: null };
}

function parseCVE(vuln: Record<string, unknown>): CVE {
  const cve = vuln.cve as Record<string, unknown>;
  const descriptions = cve.descriptions as Array<{ lang: string; value: string }>;
  const enDesc = descriptions?.find((d) => d.lang === "en")?.value ?? "";
  const refs = cve.references as Array<{ url: string }> | undefined;
  const { severity, score } = extractSeverity(cve);

  return {
    id: cve.id as string,
    description: enDesc,
    published: cve.published as string,
    severity,
    score,
    references: refs?.slice(0, 3).map((r) => r.url) ?? [],
  };
}

export async function fetchRecentCVEs(count = 20): Promise<CVE[]> {
  const url = `${NVD_BASE}?resultsPerPage=${count}`;
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`NVD API error: ${res.status}`);
  const data = await res.json();
  const vulnerabilities = data.vulnerabilities as Array<Record<string, unknown>> ?? [];
  return vulnerabilities.map(parseCVE);
}

export async function searchCVEs(keyword: string, count = 20): Promise<CVE[]> {
  const url = `${NVD_BASE}?keywordSearch=${encodeURIComponent(keyword)}&resultsPerPage=${count}`;
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`NVD API error: ${res.status}`);
  const data = await res.json();
  const vulnerabilities = data.vulnerabilities as Array<Record<string, unknown>> ?? [];
  return vulnerabilities.map(parseCVE);
}

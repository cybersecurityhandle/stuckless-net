export interface CVE {
  id: string;
  description: string;
  published: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NONE";
  score: number | null;
  cvssVersion: string | null;
  references: string[];
  /** FIRST EPSS exploit probability (0-1), when scored. */
  epss?: number | null;
  epssPercentile?: number | null;
  /** Listed in the CISA Known Exploited Vulnerabilities catalog. */
  kev?: boolean;
  ransomware?: boolean;
}

const NVD_BASE = "https://services.nvd.nist.gov/rest/json/cves/2.0";
const CVE_ID = /^CVE-\d{4}-\d{4,}$/i;
const REVALIDATE = 300;

// Newest scoring standard first; fresh CVEs often only carry CVSS 4.0.
const CVSS_KEYS = [
  ["cvssMetricV40", "4.0"],
  ["cvssMetricV31", "3.1"],
  ["cvssMetricV30", "3.0"],
] as const;

function severityFromScore(score: number): CVE["severity"] {
  if (score >= 9) return "CRITICAL";
  if (score >= 7) return "HIGH";
  if (score >= 4) return "MEDIUM";
  if (score > 0) return "LOW";
  return "NONE";
}

function extractSeverity(cveItem: Record<string, unknown>): Pick<CVE, "severity" | "score" | "cvssVersion"> {
  const metrics = cveItem.metrics as Record<string, unknown> | undefined;
  if (!metrics) return { severity: "NONE", score: null, cvssVersion: null };

  for (const [key, version] of CVSS_KEYS) {
    const metricArray = metrics[key] as Array<Record<string, unknown>> | undefined;
    const cvssData = metricArray?.[0]?.cvssData as Record<string, unknown> | undefined;
    if (cvssData) {
      const score = (cvssData.baseScore as number) ?? null;
      const severity = (cvssData.baseSeverity as string | undefined)?.toUpperCase() as CVE["severity"] | undefined;
      return {
        severity: severity ?? (score !== null ? severityFromScore(score) : "NONE"),
        score,
        cvssVersion: version,
      };
    }
  }

  const v2 = metrics.cvssMetricV2 as Array<Record<string, unknown>> | undefined;
  if (v2?.[0]) {
    const score = (v2[0].cvssData as Record<string, unknown>).baseScore as number;
    return { severity: severityFromScore(score), score, cvssVersion: "2.0" };
  }

  return { severity: "NONE", score: null, cvssVersion: null };
}

function parseCVE(vuln: Record<string, unknown>): CVE {
  const cve = vuln.cve as Record<string, unknown>;
  const descriptions = cve.descriptions as Array<{ lang: string; value: string }>;
  const enDesc = descriptions?.find((d) => d.lang === "en")?.value ?? "";
  const refs = cve.references as Array<{ url: string }> | undefined;

  return {
    id: cve.id as string,
    description: enDesc,
    published: cve.published as string,
    ...extractSeverity(cve),
    references: refs?.slice(0, 3).map((r) => r.url) ?? [],
  };
}

async function nvdFetch(params: URLSearchParams) {
  const headers: HeadersInit = {};
  if (process.env.NVD_API_KEY) headers.apiKey = process.env.NVD_API_KEY;
  const res = await fetch(`${NVD_BASE}?${params}`, { headers, next: { revalidate: REVALIDATE } });
  if (!res.ok) throw new Error(`NVD API error: ${res.status}`);
  return res.json() as Promise<{ totalResults: number; vulnerabilities?: Array<Record<string, unknown>> }>;
}

// NVD returns results oldest-first, so read the total, then fetch the last page and reverse it.
async function fetchNewest(params: URLSearchParams, count: number): Promise<{ total: number; cves: CVE[] }> {
  params.set("noRejected", "");
  params.set("resultsPerPage", "1");
  const { totalResults } = await nvdFetch(params);
  if (totalResults === 0) return { total: 0, cves: [] };

  params.set("resultsPerPage", String(count));
  params.set("startIndex", String(Math.max(0, totalResults - count)));
  const data = await nvdFetch(params);
  return { total: totalResults, cves: (data.vulnerabilities ?? []).map(parseCVE).reverse() };
}

/** Newest CVEs published in the last 7 days, plus the 7-day total. */
export async function fetchRecentCVEs(count = 50): Promise<{ total: number; cves: CVE[] }> {
  // Floor the window end to the cache interval so the URL (and cache key) is stable.
  const end = new Date(Math.floor(Date.now() / (REVALIDATE * 1000)) * REVALIDATE * 1000);
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    pubStartDate: start.toISOString(),
    pubEndDate: end.toISOString(),
  });
  return fetchNewest(params, count);
}

export async function searchCVEs(query: string, count = 25): Promise<CVE[]> {
  const q = query.trim();
  if (CVE_ID.test(q)) {
    const data = await nvdFetch(new URLSearchParams({ cveId: q.toUpperCase() }));
    return (data.vulnerabilities ?? []).map(parseCVE);
  }
  return (await fetchNewest(new URLSearchParams({ keywordSearch: q }), count)).cves;
}

import { fetchEpss, type EpssScore } from "@/lib/epss";
import { fetchKev, kevStats, newestKev, type KevCatalog, type KevEntry } from "@/lib/kev";
import { fetchRecentCVEs, type CVE } from "@/lib/nvd";

export type KevRow = KevEntry & { epss: number | null; epssPercentile: number | null };

export interface IntelSnapshot {
  generatedAt: string;
  sources: { nvd: boolean; kev: boolean; epss: boolean };
  cves: CVE[];
  cveTotal7d: number | null;
  kev: KevRow[];
  kevStats: ReturnType<typeof kevStats> | null;
}

/** Tag CVEs with EPSS scores and KEV membership. Missing data leaves fields null. */
export function enrichCVEs(cves: CVE[], epss: Map<string, EpssScore> | null, kev: KevCatalog | null): CVE[] {
  const kevById = kev ? new Map(kev.vulnerabilities.map((v) => [v.cveID, v])) : null;
  return cves.map((cve) => {
    const score = epss?.get(cve.id);
    const listed = kevById?.get(cve.id);
    return {
      ...cve,
      epss: score?.epss ?? null,
      epssPercentile: score?.percentile ?? null,
      kev: Boolean(listed),
      ransomware: listed?.knownRansomwareCampaignUse === "Known",
    };
  });
}

export async function enrichWithExploitData(cves: CVE[]): Promise<CVE[]> {
  const [epss, kev] = await Promise.allSettled([fetchEpss(cves.map((c) => c.id)), fetchKev()]);
  return enrichCVEs(
    cves,
    epss.status === "fulfilled" ? epss.value : null,
    kev.status === "fulfilled" ? kev.value : null
  );
}

/** Everything the intel page renders. Each source fails independently. */
export async function getIntelSnapshot(): Promise<IntelSnapshot> {
  const [nvd, kev] = await Promise.allSettled([fetchRecentCVEs(50), fetchKev()]);
  const recent = nvd.status === "fulfilled" ? nvd.value : null;
  const catalog = kev.status === "fulfilled" ? kev.value : null;
  const kevNewest = catalog ? newestKev(catalog, 8) : [];

  const ids = [...(recent?.cves.map((c) => c.id) ?? []), ...kevNewest.map((k) => k.cveID)];
  const epss = await fetchEpss(ids).catch(() => null);

  return {
    generatedAt: new Date().toISOString(),
    sources: { nvd: Boolean(recent), kev: Boolean(catalog), epss: Boolean(epss) },
    cves: recent ? enrichCVEs(recent.cves, epss, catalog) : [],
    cveTotal7d: recent?.total ?? null,
    kev: kevNewest.map((k) => ({
      ...k,
      epss: epss?.get(k.cveID)?.epss ?? null,
      epssPercentile: epss?.get(k.cveID)?.percentile ?? null,
    })),
    kevStats: catalog ? kevStats(catalog) : null,
  };
}

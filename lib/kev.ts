export interface KevEntry {
  cveID: string;
  vendorProject: string;
  product: string;
  vulnerabilityName: string;
  dateAdded: string;
  shortDescription: string;
  dueDate: string;
  knownRansomwareCampaignUse: "Known" | "Unknown";
}

export interface KevCatalog {
  catalogVersion: string;
  dateReleased: string;
  count: number;
  vulnerabilities: KevEntry[];
}

const KEV_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";

// The catalog (~2.4 MB) exceeds the 2 MB Next fetch-cache limit, so memoize per instance instead.
let memo: { at: number; data: KevCatalog } | null = null;
const TTL_MS = 60 * 60 * 1000;

export async function fetchKev(): Promise<KevCatalog> {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.data;
  const res = await fetch(KEV_URL, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`CISA KEV error: ${res.status}`);
  const data = (await res.json()) as KevCatalog;
  memo = { at: Date.now(), data };
  return data;
}

export function newestKev(catalog: KevCatalog, count: number): KevEntry[] {
  return [...catalog.vulnerabilities]
    .sort((a, b) => b.dateAdded.localeCompare(a.dateAdded) || b.cveID.localeCompare(a.cveID))
    .slice(0, count);
}

export function kevStats(catalog: KevCatalog, days = 30) {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const recent = catalog.vulnerabilities.filter((v) => v.dateAdded >= cutoff);
  return {
    total: catalog.count,
    added: recent.length,
    ransomwareAdded: recent.filter((v) => v.knownRansomwareCampaignUse === "Known").length,
    ransomwareTotal: catalog.vulnerabilities.filter((v) => v.knownRansomwareCampaignUse === "Known").length,
  };
}

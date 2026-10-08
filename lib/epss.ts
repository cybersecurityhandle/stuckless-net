export interface EpssScore {
  epss: number;
  percentile: number;
}

const EPSS_URL = "https://api.first.org/data/v1/epss";
const BATCH = 100;

// FIRST EPSS: probability a CVE is exploited in the next 30 days. New CVEs may not be scored yet.
export async function fetchEpss(ids: string[]): Promise<Map<string, EpssScore>> {
  const scores = new Map<string, EpssScore>();
  const unique = [...new Set(ids)];
  const batches = [];
  for (let i = 0; i < unique.length; i += BATCH) batches.push(unique.slice(i, i + BATCH));

  await Promise.all(
    batches.map(async (batch) => {
      const res = await fetch(`${EPSS_URL}?cve=${batch.join(",")}&limit=${BATCH}`, { next: { revalidate: 3600 } });
      if (!res.ok) throw new Error(`EPSS error: ${res.status}`);
      const { data } = (await res.json()) as { data: Array<{ cve: string; epss: string; percentile: string }> };
      for (const row of data) scores.set(row.cve, { epss: Number(row.epss), percentile: Number(row.percentile) });
    })
  );
  return scores;
}

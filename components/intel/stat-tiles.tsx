import type { IntelSnapshot } from "@/lib/intel";

type Tile = { label: string; value: number | null; detail: string; accent: string };

export function StatTiles({ snapshot, actorCount }: { snapshot: IntelSnapshot; actorCount: number }) {
  const { cveTotal7d, kevStats } = snapshot;
  const tiles: Tile[] = [
    {
      label: "New CVEs",
      value: cveTotal7d,
      detail: "published to the NVD in 7 days",
      accent: "text-zinc-100",
    },
    {
      label: "Newly exploited",
      value: kevStats?.added ?? null,
      detail: "added to CISA KEV in 30 days",
      accent: "text-rose-400",
    },
    {
      label: "Ransomware-linked",
      value: kevStats?.ransomwareTotal ?? null,
      detail: kevStats ? `of ${kevStats.total.toLocaleString("en-US")} known exploited CVEs` : "known exploited CVEs",
      accent: "text-orange-400",
    },
    {
      label: "Threat groups",
      value: actorCount,
      detail: "tracked in MITRE ATT&CK",
      accent: "text-green-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden border border-green-500/15 bg-green-500/10 lg:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="bg-zinc-950 px-4 py-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-zinc-500">{t.label}</p>
          <p className={`mt-1 font-mono text-3xl font-semibold tabular-nums ${t.accent}`}>
            {t.value === null ? "—" : t.value.toLocaleString("en-US")}
          </p>
          <p className="mt-1 text-xs text-zinc-500">{t.detail}</p>
        </div>
      ))}
    </div>
  );
}

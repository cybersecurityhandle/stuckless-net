import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getRedis, readStats, type Stats } from "@/lib/analytics";

export const dynamic = "force-dynamic";

/* Private visit analytics dashboard.
 * Access: /analytics?key=<ANALYTICS_SECRET> — 404s without the right key. */

const SERIES = {
  visits: "#059669", // validated on dark surface #18181b
  uniques: "#3b82f6",
};

function flag(cc: string): string {
  if (!/^[A-Z]{2}$/i.test(cc)) return "🌐";
  return String.fromCodePoint(
    ...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
  );
}

function fmtDay(day: string): string {
  const d = new Date(day + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function fmtTime(ts: number): string {
  return new Date(ts).toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key } = await searchParams;
  const secret = process.env.ANALYTICS_SECRET;
  if (!secret || key !== secret) notFound();

  const redis = getRedis();
  if (!redis) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-2xl font-bold">Analytics not configured</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Set <code>UPSTASH_REDIS_REST_URL</code> and <code>UPSTASH_REDIS_REST_TOKEN</code> in
          the environment (Vercel project settings) to enable visit tracking.
        </p>
      </main>
    );
  }

  const stats: Stats = await readStats(redis, 30);
  const today = stats.days[stats.days.length - 1];
  const last7 = stats.days.slice(-7).reduce((s, d) => s + d.visits, 0);
  const last30 = stats.days.reduce((s, d) => s + d.visits, 0);
  const maxDay = Math.max(1, ...stats.days.map((d) => d.visits));
  const maxCountry = Math.max(1, ...stats.countries.map((c) => c.count));
  const maxPath = Math.max(1, ...stats.paths.map((p) => p.count));

  const tiles = [
    { label: "All-time visits", value: stats.total },
    { label: "Today", value: today?.visits ?? 0, sub: `${today?.uniques ?? 0} unique` },
    { label: "Last 7 days", value: last7 },
    { label: "Last 30 days", value: last30 },
  ];

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Visits logged server-side to Redis — nothing stored in git. Bots and prefetches
          excluded.
        </p>
      </div>

      {/* Stat tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">{t.label}</p>
              <p className="mt-1 text-3xl font-bold tabular-nums">{t.value.toLocaleString()}</p>
              {"sub" in t && t.sub && (
                <p className="mt-1 text-xs text-muted-foreground">{t.sub}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Daily visits — grouped bars, 30 days */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Daily Visits — Last 30 Days</CardTitle>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES.visits }} />
              Visits
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES.uniques }} />
              Unique IPs
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex h-40 items-end gap-[3px] border-b border-border">
            {stats.days.map((d) => (
              <div
                key={d.day}
                className="flex h-full flex-1 items-end justify-center gap-[2px]"
                title={`${fmtDay(d.day)}: ${d.visits} visits, ${d.uniques} unique`}
              >
                <div
                  className="w-full max-w-[10px] rounded-t-[4px]"
                  style={{
                    background: SERIES.visits,
                    height: `${Math.max(d.visits > 0 ? 3 : 0, (d.visits / maxDay) * 100)}%`,
                  }}
                />
                <div
                  className="w-full max-w-[10px] rounded-t-[4px]"
                  style={{
                    background: SERIES.uniques,
                    height: `${Math.max(d.uniques > 0 ? 3 : 0, (d.uniques / maxDay) * 100)}%`,
                  }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>{fmtDay(stats.days[0].day)}</span>
            <span>{fmtDay(stats.days[stats.days.length - 1].day)}</span>
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              Table view
            </summary>
            <table className="mt-2 text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pr-6 font-medium">Day</th>
                  <th className="pr-6 text-right font-medium">Visits</th>
                  <th className="text-right font-medium">Unique</th>
                </tr>
              </thead>
              <tbody>
                {[...stats.days].reverse().map((d) => (
                  <tr key={d.day}>
                    <td className="pr-6 text-muted-foreground">{d.day}</td>
                    <td className="pr-6 text-right tabular-nums">{d.visits}</td>
                    <td className="text-right tabular-nums">{d.uniques}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </CardContent>
      </Card>

      {/* Countries + paths */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Top Countries</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.countries.length === 0 && (
              <p className="text-xs text-muted-foreground">No data yet.</p>
            )}
            {stats.countries.map((c) => (
              <div key={c.name} className="flex items-center gap-3 text-xs">
                <span className="w-16 shrink-0 truncate" title={c.name}>
                  {flag(c.name)} {c.name}
                </span>
                <div className="h-3 flex-1 overflow-hidden rounded-r-[4px]">
                  <div
                    className="h-full rounded-r-[4px]"
                    style={{
                      background: SERIES.visits,
                      width: `${(c.count / maxCountry) * 100}%`,
                    }}
                  />
                </div>
                <span className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">
                  {c.count.toLocaleString()}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Top Pages</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.paths.length === 0 && (
              <p className="text-xs text-muted-foreground">No data yet.</p>
            )}
            {stats.paths.map((p) => (
              <div key={p.name} className="flex items-center gap-3 text-xs">
                <span className="w-28 shrink-0 truncate font-mono" title={p.name}>
                  {p.name}
                </span>
                <div className="h-3 flex-1 overflow-hidden rounded-r-[4px]">
                  <div
                    className="h-full rounded-r-[4px]"
                    style={{
                      background: SERIES.visits,
                      width: `${(p.count / maxPath) * 100}%`,
                    }}
                  />
                </div>
                <span className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">
                  {p.count.toLocaleString()}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Recent visits */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Recent Visits</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="pb-2 pr-3 font-medium">Time</th>
                <th className="pb-2 pr-3 font-medium">IP</th>
                <th className="pb-2 pr-3 font-medium">Location</th>
                <th className="pb-2 pr-3 font-medium">Path</th>
                <th className="pb-2 font-medium">User Agent</th>
              </tr>
            </thead>
            <tbody>
              {stats.recent.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-3 text-muted-foreground">
                    No visits recorded yet.
                  </td>
                </tr>
              )}
              {stats.recent.map((v, i) => (
                <tr key={`${v.ts}-${i}`} className="border-b border-border/50">
                  <td className="py-1.5 pr-3 font-mono text-muted-foreground">{fmtTime(v.ts)}</td>
                  <td className="py-1.5 pr-3 font-mono">{v.ip}</td>
                  <td className="py-1.5 pr-3">
                    {flag(v.country)} {[v.city, v.region, v.country].filter(Boolean).join(", ")}
                  </td>
                  <td className="py-1.5 pr-3 font-mono">{v.path}</td>
                  <td className="max-w-[280px] truncate py-1.5 text-muted-foreground" title={v.ua}>
                    {v.ua}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </main>
  );
}

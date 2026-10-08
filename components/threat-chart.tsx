"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { useRecentCVEs } from "@/lib/use-recent-cves";
import { SEVERITIES, severityHex } from "@/lib/severity";

export function ThreatChart() {
  const { cves, loading, error } = useRecentCVEs();

  const data = SEVERITIES.map((severity) => ({
    name: severity === "NONE" ? "N/A" : severity,
    severity,
    count: cves?.filter((c) => c.severity === severity).length ?? 0,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Severity breakdown</CardTitle>
        <CardDescription className="text-xs">
          {cves ? `Newest ${cves.length} CVEs on the NVD` : "Newest CVEs on the NVD"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-[220px] animate-pulse rounded-md bg-muted/50" />
        ) : error ? (
          <p className="text-sm text-muted-foreground">Chart unavailable right now.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: "#a1a1aa" }}
                tickLine={false}
                axisLine={{ stroke: "#27272a" }}
                interval={0}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#a1a1aa" }} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                contentStyle={{
                  backgroundColor: "#18181b",
                  border: "1px solid #27272a",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                labelStyle={{ color: "#fafafa" }}
                itemStyle={{ color: "#a1a1aa" }}
              />
              <Bar dataKey="count" name="CVEs" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {data.map((entry) => (
                  <Cell key={entry.severity} fill={severityHex[entry.severity]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

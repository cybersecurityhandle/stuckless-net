"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import type { CVE } from "@/lib/nvd";

const COLORS: Record<string, string> = {
  CRITICAL: "#dc2626",
  HIGH: "#f97316",
  MEDIUM: "#eab308",
  LOW: "#3b82f6",
  NONE: "#6b7280",
};

export function ThreatChart() {
  const [data, setData] = useState<{ name: string; count: number }[]>([]);

  useEffect(() => {
    fetch("/api/cves")
      .then((res) => res.json())
      .then((cves: CVE[]) => {
        if (!Array.isArray(cves)) return;
        const counts: Record<string, number> = {
          CRITICAL: 0,
          HIGH: 0,
          MEDIUM: 0,
          LOW: 0,
          NONE: 0,
        };
        cves.forEach((c) => {
          counts[c.severity] = (counts[c.severity] || 0) + 1;
        });
        setData(
          Object.entries(counts)
            .filter(([, v]) => v > 0)
            .map(([name, count]) => ({ name, count }))
        );
      });
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">CVE Severity Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading chart...</p>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data}>
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#a1a1aa" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#a1a1aa" }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#18181b",
                  border: "1px solid #27272a",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {data.map((entry) => (
                  <Cell key={entry.name} fill={COLORS[entry.name] || "#6b7280"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { useEffect, useState } from "react";
import type { CVE } from "@/lib/nvd";

// The feed and the chart share one request per page load.
let pending: Promise<CVE[]> | null = null;

function loadRecentCVEs() {
  pending ??= fetch("/api/cves")
    .then((res) => res.json())
    .then((data) => {
      if (!Array.isArray(data)) throw new Error(data?.error ?? "Failed to load CVEs");
      return data as CVE[];
    })
    .catch((err) => {
      pending = null;
      throw err;
    });
  return pending;
}

export function useRecentCVEs() {
  const [cves, setCves] = useState<CVE[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    loadRecentCVEs()
      .then((data) => active && setCves(data))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, []);

  return { cves, error, loading: cves === null && !error };
}

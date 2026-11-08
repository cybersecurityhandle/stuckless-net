import type { MetadataRoute } from "next";

const BASE = "https://stuckless.net";

// Public pages. /status (internal data freshness) and the ?ticker= / ?m=
// variants of /finance and /superinvestors are left out. Data pages change
// daily with the refresh deploy; the rest rarely.
const PAGES: { path: string; changeFrequency: "daily" | "weekly" | "monthly"; priority: number }[] = [
  { path: "", changeFrequency: "daily", priority: 1 },
  { path: "/superinvestors", changeFrequency: "daily", priority: 0.9 },
  { path: "/berkshire", changeFrequency: "weekly", priority: 0.8 },
  { path: "/csu", changeFrequency: "weekly", priority: 0.8 },
  { path: "/topicus", changeFrequency: "weekly", priority: 0.8 },
  { path: "/markel", changeFrequency: "weekly", priority: 0.8 },
  { path: "/fairfax", changeFrequency: "weekly", priority: 0.8 },
  { path: "/heico", changeFrequency: "monthly", priority: 0.6 },
  { path: "/roper", changeFrequency: "monthly", priority: 0.6 },
  { path: "/transdigm", changeFrequency: "monthly", priority: 0.6 },
  { path: "/brown-brown", changeFrequency: "monthly", priority: 0.6 },
  { path: "/loews", changeFrequency: "monthly", priority: 0.6 },
  { path: "/boston-omaha", changeFrequency: "monthly", priority: 0.6 },
  { path: "/biglari", changeFrequency: "monthly", priority: 0.6 },
  { path: "/kelly-partners", changeFrequency: "monthly", priority: 0.6 },
  { path: "/teqnion", changeFrequency: "monthly", priority: 0.6 },
  { path: "/insiders", changeFrequency: "daily", priority: 0.7 },
  { path: "/digest", changeFrequency: "weekly", priority: 0.7 },
  { path: "/screener", changeFrequency: "daily", priority: 0.7 },
  { path: "/finance", changeFrequency: "daily", priority: 0.7 },
  { path: "/intel", changeFrequency: "daily", priority: 0.7 },
  { path: "/about", changeFrequency: "monthly", priority: 0.5 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PAGES.map((p) => ({ url: `${BASE}${p.path}`, lastModified, changeFrequency: p.changeFrequency, priority: p.priority }));
}

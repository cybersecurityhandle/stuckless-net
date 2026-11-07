import type { MetadataRoute } from "next";

// /api/ is data for the pages' own scripts, not pages
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: "https://stuckless.net/sitemap.xml",
  };
}

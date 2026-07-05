import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { getRedis, recordVisit } from "@/lib/analytics";

/* Visit tracking: logs page views to Upstash Redis in the background.
 * No-ops when UPSTASH_REDIS_REST_* env vars are absent (e.g. local dev). */

const BOT_UA =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|lighthouse|pingdom|uptime/i;

export function proxy(req: NextRequest, event: NextFetchEvent) {
  const res = NextResponse.next();

  if (req.method !== "GET") return res;
  // Skip router prefetches — only count real views
  if (req.headers.get("next-router-prefetch") || req.headers.get("purpose") === "prefetch") {
    return res;
  }
  const ua = req.headers.get("user-agent") ?? "";
  if (BOT_UA.test(ua)) return res;

  const redis = getRedis();
  if (!redis) return res;

  const ip =
    (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const decode = (s: string | null) => {
    try {
      return s ? decodeURIComponent(s) : "";
    } catch {
      return s ?? "";
    }
  };

  event.waitUntil(
    recordVisit(redis, {
      ts: Date.now(),
      ip,
      country: req.headers.get("x-vercel-ip-country") ?? "",
      region: decode(req.headers.get("x-vercel-ip-country-region")),
      city: decode(req.headers.get("x-vercel-ip-city")),
      path: req.nextUrl.pathname,
      ua: ua.slice(0, 200),
      referer: req.headers.get("referer") ?? "",
    }).catch(() => {
      // Analytics must never break page loads
    })
  );

  return res;
}

export const config = {
  // Pages only: skip API routes, Next internals, the analytics dashboard
  // itself, and any file with an extension (public/ assets)
  matcher: ["/((?!api|_next|analytics|favicon.ico|.*\\..*).*)"],
};

import { Redis } from "@upstash/redis";

/* Upstash Redis client for the stock API payload cache. Returns null when the
 * env vars are absent (e.g. local dev), and callers then skip caching. */
export function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

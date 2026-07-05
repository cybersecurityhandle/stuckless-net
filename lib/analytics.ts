import { Redis } from "@upstash/redis";

/* Visit analytics backed by Upstash Redis (nothing stored in git or on disk).
 *
 * Keys:
 *   va:total          — all-time visit counter
 *   va:day:{date}     — per-day visit counter        (400-day TTL)
 *   va:uniq:{date}    — per-day unique IPs (HyperLogLog, 400-day TTL)
 *   va:countries      — zset country → visits
 *   va:paths          — zset path → visits
 *   va:recent         — list of recent visits as JSON (capped)
 */

export interface Visit {
  ts: number;
  ip: string;
  country: string;
  region: string;
  city: string;
  path: string;
  ua: string;
  referer: string;
}

export interface DayStat {
  day: string;
  visits: number;
  uniques: number;
}

export interface Stats {
  total: number;
  days: DayStat[];
  countries: { name: string; count: number }[];
  paths: { name: string; count: number }[];
  recent: Visit[];
}

const RECENT_MAX = 500;
const DAY_TTL_S = 400 * 24 * 60 * 60;

export function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function dayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export async function recordVisit(redis: Redis, v: Visit): Promise<void> {
  const day = dayKey(v.ts);
  const p = redis.pipeline();
  p.incr("va:total");
  p.incr(`va:day:${day}`);
  p.expire(`va:day:${day}`, DAY_TTL_S);
  p.pfadd(`va:uniq:${day}`, v.ip);
  p.expire(`va:uniq:${day}`, DAY_TTL_S);
  p.zincrby("va:countries", 1, v.country || "unknown");
  p.zincrby("va:paths", 1, v.path);
  p.lpush("va:recent", JSON.stringify(v));
  p.ltrim("va:recent", 0, RECENT_MAX - 1);
  await p.exec();
}

function parseZset(flat: unknown[]): { name: string; count: number }[] {
  const out: { name: string; count: number }[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    out.push({ name: String(flat[i]), count: Number(flat[i + 1]) });
  }
  return out;
}

export async function readStats(redis: Redis, numDays = 30): Promise<Stats> {
  const now = Date.now();
  const days: string[] = [];
  for (let i = numDays - 1; i >= 0; i--) {
    days.push(dayKey(now - i * 86400000));
  }

  const p = redis.pipeline();
  p.get("va:total");
  for (const d of days) p.get(`va:day:${d}`);
  for (const d of days) p.pfcount(`va:uniq:${d}`);
  p.zrange("va:countries", 0, 19, { rev: true, withScores: true });
  p.zrange("va:paths", 0, 19, { rev: true, withScores: true });
  p.lrange("va:recent", 0, 99);
  const res = await p.exec<unknown[]>();

  const total = Number(res[0] ?? 0);
  const dayStats: DayStat[] = days.map((day, i) => ({
    day,
    visits: Number(res[1 + i] ?? 0),
    uniques: Number(res[1 + numDays + i] ?? 0),
  }));

  const countries = parseZset(res[1 + 2 * numDays] as unknown[]);
  const paths = parseZset(res[2 + 2 * numDays] as unknown[]);

  // @upstash/redis may auto-deserialize JSON list entries
  const recent: Visit[] = ((res[3 + 2 * numDays] as unknown[]) ?? []).map((x) =>
    typeof x === "string" ? (JSON.parse(x) as Visit) : (x as Visit)
  );

  return { total, days: dayStats, countries, paths, recent };
}

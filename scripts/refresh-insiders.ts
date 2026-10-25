/**
 * Refresh the insider-buys feed.
 *
 * Walks EDGAR's daily form index for the last WINDOW_DAYS, parses every
 * Form 4, keeps open-market purchases (transaction code P), and writes
 * public/insider-buys.json.
 *
 * Each finished day is cached in data/form4/YYYY-MM-DD.json (commit them —
 * a day's filings never change), so after the first run (~25 min for a
 * 30-day backfill) only new days are fetched: a few hundred to ~1,500
 * filings each.
 *
 * Usage:
 *   npm run refresh-insiders
 *   WINDOW_DAYS=90 npm run refresh-insiders   # longer backfill
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { MIN_BUY_VALUE, type InsiderBuy, type InsiderBuysJson } from "../lib/insiders";

const SEC_HEADERS = { "User-Agent": "stuckless.net admin@stuckless.net" };
const SEC_INTERVAL_MS = 125; // ≤ 8 req/s across all workers (SEC limit is 10)
const WORKERS = 4;
const WINDOW_DAYS = Number(process.env.WINDOW_DAYS ?? 30);
const DAY_CACHE = join(process.cwd(), "data", "form4");
// The daily index for a date can appear late; don't cache a missing index
// as "no filings" until it's this old
const MISSING_INDEX_GRACE_DAYS = 4;

/* ── Helpers ───────────────────────────────────────────────── */

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

let nextSlot = 0;

// Global rate limit shared by the concurrent workers
async function sec(url: string): Promise<Response | null> {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + SEC_INTERVAL_MS;
  await sleep(wait);
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: SEC_HEADERS, signal: AbortSignal.timeout(30_000) }).catch(() => null);
    // EDGAR answers 403 (not 404) for some missing archive paths
    if (res?.status === 404 || res?.status === 403) return null;
    if (res?.ok) return res;
    await sleep(2000 * (attempt + 1)); // 429 / 5xx / network
  }
  throw new Error(`failed: ${url}`);
}

function isoDate(d: Date) {
  return d.toISOString().split("T")[0];
}

function tag(xml: string, name: string): string | undefined {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? m[1].trim() : undefined;
}

// Form 4 wraps most leaf values as <x><value>…</value></x>
function val(xml: string, name: string): string | undefined {
  const inner = tag(xml, name);
  if (inner == null) return undefined;
  return (tag(inner, "value") ?? inner).trim() || undefined;
}

function decode(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

const flag = (s: string | undefined) => s === "1" || s?.toLowerCase() === "true";

/* ── Form 4 parsing ────────────────────────────────────────── */

function parseForm4(txt: string, accession: string, filed: string): InsiderBuy | null {
  const doc = tag(txt, "ownershipDocument");
  if (!doc || tag(doc, "documentType") !== "4") return null;

  const purchases = [...doc.matchAll(/<nonDerivativeTransaction>([\s\S]*?)<\/nonDerivativeTransaction>/g)]
    .map((m) => m[1])
    .filter((t) => tag(tag(t, "transactionCoding") ?? "", "transactionCode") === "P" && val(t, "transactionAcquiredDisposedCode") === "A");
  if (!purchases.length) return null;

  let shares = 0;
  let value = 0;
  let sharesAfter: number | null = null;
  const dates: string[] = [];
  let direct = true;
  for (const t of purchases) {
    const n = Number(val(t, "transactionShares") ?? 0);
    const p = Number(val(t, "transactionPricePerShare") ?? 0);
    if (!(n > 0) || !(p > 0)) continue;
    shares += n;
    value += n * p;
    const after = Number(val(t, "sharesOwnedFollowingTransaction"));
    if (Number.isFinite(after)) sharesAfter = after;
    const d = val(t, "transactionDate");
    if (d) dates.push(d.slice(0, 10));
    if (val(t, "directOrIndirectOwnership") === "I") direct = false;
  }
  if (!shares || value < MIN_BUY_VALUE) return null;

  const owners = [...doc.matchAll(/<reportingOwner>([\s\S]*?)<\/reportingOwner>/g)].map((m) => m[1]);
  const o = owners[0] ?? "";
  const rel = tag(o, "reportingOwnerRelationship") ?? "";
  const isDirector = flag(tag(rel, "isDirector"));
  const isOfficer = flag(tag(rel, "isOfficer"));
  const isTenPct = flag(tag(rel, "isTenPercentOwner"));
  const title = decode(tag(rel, "officerTitle") ?? "");
  const role =
    (isOfficer && title) ||
    [isOfficer && "Officer", isDirector && "Director", isTenPct && "10% Owner"].filter(Boolean).join(", ") ||
    decode(tag(rel, "otherText") ?? "Other");
  const ticker = (tag(tag(doc, "issuer") ?? "", "issuerTradingSymbol") ?? "").toUpperCase().replace(/[^A-Z0-9.-]/g, "");
  dates.sort();

  return {
    accession,
    filed,
    issuerCik: Number(tag(doc, "issuerCik")),
    issuer: decode(tag(doc, "issuerName") ?? ""),
    // Some filers put "NONE" / "[NONE]" / "N/A" in the symbol field
    ticker: ticker && !/^(NONE|NA)$/.test(ticker) ? ticker.replace(".", "-") : null,
    owner: decode(tag(o, "rptOwnerName") ?? "") + (owners.length > 1 ? ` +${owners.length - 1}` : ""),
    ownerCik: Number(tag(o, "rptOwnerCik")),
    role,
    isDirector,
    isOfficer,
    isTenPct,
    firstTrade: dates[0] ?? filed,
    lastTrade: dates[dates.length - 1] ?? filed,
    shares,
    avgPrice: value / shares,
    value,
    sharesAfter,
    direct,
  };
}

/* ── Daily index ───────────────────────────────────────────── */

async function processDay(date: string): Promise<InsiderBuy[] | null> {
  const [y, m, d] = date.split("-");
  const qtr = Math.ceil(Number(m) / 3);
  const res = await sec(`https://www.sec.gov/Archives/edgar/daily-index/${y}/QTR${qtr}/form.${y}${m}${d}.idx`);
  if (!res) return null; // weekend, holiday, or not published yet

  // Each line: form type, company, CIK, date, path. A Form 4 is listed once
  // per filer of record (issuer and owner) under different CIK paths —
  // dedupe by accession.
  const paths = new Map<string, string>();
  for (const line of (await res.text()).split("\n")) {
    if (!line.startsWith("4 ")) continue;
    const p = line.match(/edgar\/data\/\S+\.txt/)?.[0];
    const accession = p?.match(/(\d{10}-\d{2}-\d{6})\.txt$/)?.[1];
    if (p && accession) paths.set(accession, p);
  }

  const todo = [...paths];
  const buys: InsiderBuy[] = [];
  let failures = 0;
  await Promise.all(
    Array.from({ length: WORKERS }, async () => {
      for (let next = todo.pop(); next; next = todo.pop()) {
        const [accession, p] = next;
        try {
          const txt = await (await sec(`https://www.sec.gov/Archives/${p}`))?.text();
          const buy = txt ? parseForm4(txt, accession, date) : null;
          if (buy) buys.push(buy);
        } catch {
          failures++;
        }
      }
    })
  );
  // Don't cache a day with gaps — it'll be retried next run
  if (failures) throw new Error(`${failures} of ${paths.size} filings failed`);
  console.log(`  ${date}: ${paths.size} Form 4s, ${buys.length} purchases ≥ $${MIN_BUY_VALUE / 1000}K`);
  return buys;
}

/* ── Main ──────────────────────────────────────────────────── */

async function main() {
  mkdirSync(DAY_CACHE, { recursive: true });
  const today = new Date();
  const days: string[] = [];
  for (let i = 1; i <= WINDOW_DAYS; i++) {
    const d = new Date(today.getTime() - i * 86_400_000);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) days.push(isoDate(d));
  }
  console.log(`Refreshing insider buys for ${days[days.length - 1]} → ${days[0]}\n`);

  const graceCutoff = isoDate(new Date(today.getTime() - MISSING_INDEX_GRACE_DAYS * 86_400_000));
  const all: InsiderBuy[] = [];
  for (const date of days) {
    const path = join(DAY_CACHE, `${date}.json`);
    if (existsSync(path)) {
      all.push(...(JSON.parse(readFileSync(path, "utf8")) as InsiderBuy[]));
      continue;
    }
    try {
      const buys = await processDay(date);
      if (buys === null && date > graceCutoff) continue; // index may still be coming
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify(buys ?? []) + "\n");
      all.push(...(buys ?? []));
    } catch (err) {
      console.log(`  ${date}: FAILED (${(err as Error).message}) — will retry next run`);
    }
  }

  const buys = dedupe(all.filter((b) => b.ticker)); // no ticker = non-traded REIT/BDC
  buys.sort((a, b) => b.filed.localeCompare(a.filed) || b.value - a.value);
  const output: InsiderBuysJson = {
    updated: isoDate(today),
    from: days[days.length - 1],
    to: days[0],
    buys,
  };
  writeFileSync(join(process.cwd(), "public", "insider-buys.json"), JSON.stringify(output));
  console.log(`\nWrote ${buys.length} purchases to public/insider-buys.json (${all.length} before dedupe/filter)`);
}

/**
 * Affiliated entities (fund, GP, parent) each file a Form 4 for the same
 * trade — keep one row per identical purchase and note the extra filers.
 */
function dedupe(buys: InsiderBuy[]): InsiderBuy[] {
  const groups = new Map<string, InsiderBuy[]>();
  for (const b of buys) {
    const key = `${b.issuerCik}|${b.lastTrade}|${b.shares}|${b.avgPrice.toFixed(4)}`;
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }
  return [...groups.values()].map(([first, ...rest]) =>
    rest.length ? { ...first, owner: `${first.owner} (+${rest.length} related filer${rest.length > 1 ? "s" : ""})` } : first
  );
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});

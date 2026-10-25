/**
 * Refresh the insider-buys feed and the superinvestor real-time feed.
 *
 * Walks EDGAR's daily form index for the last WINDOW_DAYS and:
 *   - parses every Form 4: open-market purchases (code P) by anyone go to
 *     public/insider-buys.json; buys and sells (P/S) by the tracked managers
 *     themselves go to public/superinvestors/realtime.json
 *   - picks up 13D/13G filings (old SC 13D and new SCHEDULE 13D forms) filed
 *     by a tracked manager — 5%+ stakes, disclosed within days
 * then enriches each insider buy with current price / 52-week range and the
 * insider's track record (their earlier open-market buys, scored by 6- and
 * 12-month returns).
 *
 * Caches (commit them — filings never change):
 *   data/form4/YYYY-MM-DD.json    one parsed day (v2: buys, trades, stakes)
 *   data/insider-history.json     each insider's past buys + their returns
 * First run ~30 min (30-day backfill + track records); then a few minutes.
 *
 * Usage:
 *   npm run refresh-insiders
 *   WINDOW_DAYS=90 npm run refresh-insiders   # longer backfill
 */

import { recordStatus } from "./status";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import {
  MIN_BUY_VALUE,
  type InsiderBuy,
  type InsiderBuysJson,
  type RealtimeJson,
  type StakeFiling,
  type SuperTrade,
  type TrackRecord,
} from "../lib/insiders";
import { MANAGERS } from "../lib/superinvestors";

const SEC_HEADERS = { "User-Agent": "stuckless.net admin@stuckless.net" };
const SEC_INTERVAL_MS = 125; // ≤ 8 req/s across all workers (SEC limit is 10)
const WORKERS = 4;
const WINDOW_DAYS = Number(process.env.WINDOW_DAYS ?? 30);
const DAY_CACHE = join(process.cwd(), "data", "form4");
const DAY_CACHE_VERSION = 2;
const HISTORY_CACHE = join(process.cwd(), "data", "insider-history.json");
// The daily index for a date can appear late; don't cache a missing index
// as "no filings" until it's this old
const MISSING_INDEX_GRACE_DAYS = 4;
// Track records: how far back, how many past filings per insider, refetch age
const TRACK_YEARS = 6;
const TRACK_MAX_FILINGS = 60;
const TRACK_REFRESH_DAYS = 30;

const STAKE_FORMS = new Map([
  ["SC 13D", "13D"],
  ["SC 13D/A", "13D/A"],
  ["SC 13G", "13G"],
  ["SC 13G/A", "13G/A"],
  ["SCHEDULE 13D", "13D"],
  ["SCHEDULE 13D/A", "13D/A"],
  ["SCHEDULE 13G", "13G"],
  ["SCHEDULE 13G/A", "13G/A"],
]);

// 13F filer CIK → manager id (Form 4 reporting owners and 13D/G filers use
// the same entity CIKs)
const MANAGER_BY_CIK = new Map<number, string>();
for (const m of MANAGERS) for (const cik of m.ciks) MANAGER_BY_CIK.set(cik, m.id);

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

function addMonths(iso: string, months: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return isoDate(d);
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

function readJson<T>(path: string, fallback: T): T {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback;
}

/* ── Form 4 parsing ────────────────────────────────────────── */

interface Txn {
  shares: number;
  price: number;
  after: number | null;
  date: string | null;
  indirect: boolean;
}

// Non-derivative transactions with the given code and acquired/disposed flag
function txns(doc: string, code: "P" | "S", ad: "A" | "D"): Txn[] {
  return [...doc.matchAll(/<nonDerivativeTransaction>([\s\S]*?)<\/nonDerivativeTransaction>/g)]
    .map((m) => m[1])
    .filter((t) => tag(tag(t, "transactionCoding") ?? "", "transactionCode") === code && val(t, "transactionAcquiredDisposedCode") === ad)
    .map((t) => {
      const after = Number(val(t, "sharesOwnedFollowingTransaction"));
      return {
        shares: Number(val(t, "transactionShares") ?? 0),
        price: Number(val(t, "transactionPricePerShare") ?? 0),
        after: Number.isFinite(after) ? after : null,
        date: val(t, "transactionDate")?.slice(0, 10) ?? null,
        indirect: val(t, "directOrIndirectOwnership") === "I",
      };
    })
    .filter((t) => t.shares > 0 && t.price > 0);
}

function sum(list: Txn[]) {
  const shares = list.reduce((s, t) => s + t.shares, 0);
  const value = list.reduce((s, t) => s + t.shares * t.price, 0);
  const dates = list.map((t) => t.date).filter((d): d is string => !!d).sort();
  return { shares, value, dates, after: list.length ? list[list.length - 1].after : null };
}

interface ParsedForm4 {
  buy: InsiderBuy | null; // open-market purchase ≥ MIN_BUY_VALUE, by anyone
  trades: SuperTrade[]; // P/S by a tracked manager
  // Every purchase regardless of size — for track records
  rawBuy: { ownerCik: number; date: string; ticker: string | null; price: number } | null;
}

function parseForm4(txt: string, accession: string, filed: string): ParsedForm4 | null {
  const doc = tag(txt, "ownershipDocument");
  if (!doc || tag(doc, "documentType") !== "4") return null;

  const owners = [...doc.matchAll(/<reportingOwner>([\s\S]*?)<\/reportingOwner>/g)].map((m) => m[1]);
  const o = owners[0] ?? "";
  const ownerCik = Number(tag(o, "rptOwnerCik"));
  const rawTicker = (tag(tag(doc, "issuer") ?? "", "issuerTradingSymbol") ?? "").toUpperCase().replace(/[^A-Z0-9.-]/g, "");
  // Some filers put "NONE" / "[NONE]" / "N/A" in the symbol field
  const ticker = rawTicker && !/^(NONE|NA)$/.test(rawTicker) ? rawTicker.replace(".", "-") : null;
  const issuerCik = Number(tag(doc, "issuerCik"));
  const issuer = decode(tag(doc, "issuerName") ?? "");
  const ownerName = decode(tag(o, "rptOwnerName") ?? "") + (owners.length > 1 ? ` +${owners.length - 1}` : "");

  const purchases = txns(doc, "P", "A");
  const bought = sum(purchases);
  const out: ParsedForm4 = { buy: null, trades: [], rawBuy: null };

  if (bought.shares) {
    out.rawBuy = { ownerCik, date: bought.dates[bought.dates.length - 1] ?? filed, ticker, price: bought.value / bought.shares };
  }

  if (bought.shares && bought.value >= MIN_BUY_VALUE) {
    const rel = tag(o, "reportingOwnerRelationship") ?? "";
    const isDirector = flag(tag(rel, "isDirector"));
    const isOfficer = flag(tag(rel, "isOfficer"));
    const isTenPct = flag(tag(rel, "isTenPercentOwner"));
    const title = decode(tag(rel, "officerTitle") ?? "");
    const role =
      (isOfficer && title) ||
      [isOfficer && "Officer", isDirector && "Director", isTenPct && "10% Owner"].filter(Boolean).join(", ") ||
      decode(tag(rel, "otherText") ?? "Other");
    out.buy = {
      accession,
      filed,
      issuerCik,
      issuer,
      ticker,
      owner: ownerName,
      ownerCik,
      role,
      isDirector,
      isOfficer,
      isTenPct,
      firstTrade: bought.dates[0] ?? filed,
      lastTrade: bought.dates[bought.dates.length - 1] ?? filed,
      shares: bought.shares,
      avgPrice: bought.value / bought.shares,
      value: bought.value,
      sharesAfter: bought.after,
      direct: !purchases.some((t) => t.indirect),
    };
  }

  // A tracked manager among the reporting owners → keep both sides, any size
  const managerId = owners.map((x) => MANAGER_BY_CIK.get(Number(tag(x, "rptOwnerCik")))).find(Boolean);
  if (managerId) {
    for (const [side, list] of [["buy", purchases], ["sell", txns(doc, "S", "D")]] as const) {
      const t = sum(list);
      if (!t.shares) continue;
      out.trades.push({
        accession,
        filed,
        managerId,
        owner: ownerName,
        issuerCik,
        issuer,
        ticker,
        side,
        shares: t.shares,
        avgPrice: t.value / t.shares,
        value: t.value,
        sharesAfter: t.after,
        lastTrade: t.dates[t.dates.length - 1] ?? filed,
      });
    }
  }
  return out.buy || out.trades.length || out.rawBuy ? out : null;
}

/* ── 13D / 13G ─────────────────────────────────────────────── */

let tickerByCik: Map<number, string> | null = null;

async function cikTicker(cik: number): Promise<string | null> {
  if (!tickerByCik) {
    tickerByCik = new Map();
    const data = await (await sec("https://www.sec.gov/files/company_tickers.json"))!.json();
    for (const e of Object.values(data) as { cik_str: number; ticker: string }[]) {
      if (!tickerByCik.has(e.cik_str)) tickerByCik.set(e.cik_str, e.ticker);
    }
  }
  return tickerByCik.get(cik) ?? null;
}

// Percent of class: XML <classPercent> / <percentOfClass> (2024+ SCHEDULE
// 13D/G) or the cover-page "PERCENT OF CLASS REPRESENTED BY AMOUNT IN ROW
// (11)" in older text filings
function stakePct(txt: string): number | null {
  const xml = txt.match(/<(?:\w+:)?(?:classPercent|percentOfClass)>\s*([\d.]+)/i);
  if (xml) return Number(xml[1]);
  const text = txt
    .replace(/<[^>]+>/g, " ")
    .match(/PERCENT\s+OF\s+CLASS\s+REPRESENTED\s+BY\s+AMOUNT\s+IN\s+ROW\s*\(?\s*(?:11|9)\s*\)?[^0-9]{0,120}?([\d.]+)\s*%/i);
  return text ? Number(text[1]) : null;
}

/* ── Daily index ───────────────────────────────────────────── */

interface Day {
  v: number;
  buys: InsiderBuy[];
  trades: SuperTrade[];
  stakes: StakeFiling[];
  rawBuys: NonNullable<ParsedForm4["rawBuy"]>[];
}

async function processDay(date: string): Promise<Day | null> {
  const [y, m, d] = date.split("-");
  const qtr = Math.ceil(Number(m) / 3);
  const res = await sec(`https://www.sec.gov/Archives/edgar/daily-index/${y}/QTR${qtr}/form.${y}${m}${d}.idx`);
  if (!res) return null; // weekend, holiday, or not published yet

  // Each line: form type, company, CIK, date, path. A filing is listed once
  // per filer of record (issuer/subject and owner/filer) — group by accession.
  const form4 = new Map<string, string>();
  const stakeLines = new Map<string, { form: string; path: string; entities: { name: string; cik: number }[] }>();
  for (const line of (await res.text()).split("\n")) {
    const lm = line.match(/^(\S+(?: \S+)?)\s{2,}(.+?)\s{2,}(\d+)\s+(\d{8})\s+(edgar\/data\/\S+\.txt)/);
    if (!lm) continue;
    const [, form, company, cik, , path] = lm;
    const accession = path.match(/(\d{10}-\d{2}-\d{6})\.txt$/)?.[1];
    if (!accession) continue;
    if (form === "4") form4.set(accession, path);
    else if (STAKE_FORMS.has(form)) {
      const e = stakeLines.get(accession) ?? { form: STAKE_FORMS.get(form)!, path, entities: [] };
      e.entities.push({ name: company.trim(), cik: Number(cik) });
      stakeLines.set(accession, e);
    }
  }

  const day: Day = { v: DAY_CACHE_VERSION, buys: [], trades: [], stakes: [], rawBuys: [] };
  const todo = [...form4];
  let failures = 0;
  await Promise.all(
    Array.from({ length: WORKERS }, async () => {
      for (let next = todo.pop(); next; next = todo.pop()) {
        const [accession, p] = next;
        try {
          const txt = await (await sec(`https://www.sec.gov/Archives/${p}`))?.text();
          const parsed = txt ? parseForm4(txt, accession, date) : null;
          if (parsed?.buy) day.buys.push(parsed.buy);
          if (parsed?.trades.length) day.trades.push(...parsed.trades);
          if (parsed?.rawBuy) day.rawBuys.push(parsed.rawBuy);
        } catch {
          failures++;
        }
      }
    })
  );

  // Only stakes filed by a tracked manager — a handful a day at most
  for (const [accession, e] of stakeLines) {
    const filer = e.entities.find((x) => MANAGER_BY_CIK.has(x.cik));
    const subject = e.entities.find((x) => !MANAGER_BY_CIK.has(x.cik));
    if (!filer || !subject) continue;
    try {
      const txt = (await (await sec(`https://www.sec.gov/Archives/${e.path}`))?.text()) ?? "";
      day.stakes.push({
        accession,
        filed: date,
        managerId: MANAGER_BY_CIK.get(filer.cik)!,
        form: e.form,
        subjectCik: subject.cik,
        subject: decode(subject.name),
        ticker: await cikTicker(subject.cik),
        pct: stakePct(txt),
        filerCik: filer.cik,
      });
    } catch {
      failures++;
    }
  }

  // Don't cache a day with gaps — it'll be retried next run
  if (failures) throw new Error(`${failures} of ${form4.size + stakeLines.size} filings failed`);
  console.log(
    `  ${date}: ${form4.size} Form 4s → ${day.buys.length} buys ≥ $${MIN_BUY_VALUE / 1000}K, ` +
      `${day.trades.length} superinvestor trades, ${day.stakes.length} stakes`
  );
  return day;
}

/* ── Track records ─────────────────────────────────────────── */

// Per insider: when fetched, and each past buy [date, ticker, r6, r12]
interface History {
  fetched: string;
  buys: [string, string, number | null, number | null][];
}

let yahoo: { chart: (t: string, o: object) => Promise<unknown>; quote: (t: string[], o?: object) => Promise<unknown> } | null =
  null;

async function yf() {
  if (!yahoo) {
    const { default: YahooFinance } = await import("yahoo-finance2");
    yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] }) as unknown as typeof yahoo;
  }
  return yahoo!;
}

const closesCache = new Map<string, [string, number][] | null>();

// Weekly split-adjusted closes, so returns survive splits
async function weeklyCloses(ticker: string): Promise<[string, number][] | null> {
  if (closesCache.has(ticker)) return closesCache.get(ticker)!;
  let out: [string, number][] | null = null;
  try {
    await sleep(250);
    const chart = (await (await yf()).chart(ticker, {
      period1: `${new Date().getUTCFullYear() - TRACK_YEARS - 1}-01-01`,
      interval: "1wk",
      return: "array",
    })) as { quotes?: { date: Date | string; adjclose?: number; close?: number }[] };
    out = (chart.quotes ?? [])
      .map((q) => [isoDate(new Date(q.date)), q.adjclose ?? q.close ?? 0] as [string, number])
      .filter(([, c]) => c > 0);
  } catch {
    out = null; // delisted / unknown to Yahoo
  }
  closesCache.set(ticker, out);
  return out;
}

function closeOnOrAfter(closes: [string, number][], date: string): number | null {
  for (const [d, c] of closes) if (d >= date) return c;
  return null;
}

async function scoreBuy(date: string, ticker: string, today: string): Promise<[number | null, number | null]> {
  const closes = await weeklyCloses(ticker);
  if (!closes) return [null, null];
  const base = closeOnOrAfter(closes, date);
  if (!base) return [null, null];
  const ret = (months: number) => {
    const at = addMonths(date, months);
    if (at > today) return null;
    const c = closeOnOrAfter(closes, at);
    return c ? Math.round((c / base - 1) * 1e4) / 1e4 : null;
  };
  return [ret(6), ret(12)];
}

/**
 * Fill each insider's history from their own filing list (EDGAR files Form 4s
 * under the reporting owner's CIK too), parse the purchases, and score them.
 */
async function updateHistories(ownerCiks: number[], histories: Record<string, History>, today: string) {
  const stale = new Date(Date.now() - TRACK_REFRESH_DAYS * 86_400_000).toISOString().split("T")[0];
  const since = `${new Date().getUTCFullYear() - TRACK_YEARS}-01-01`;
  const todo = ownerCiks.filter((c) => !histories[c] || histories[c].fetched < stale);
  if (todo.length) console.log(`\nTrack records: fetching ${todo.length} insiders' filing histories`);

  for (const [n, cik] of todo.entries()) {
    try {
      const sub = await (await sec(`https://data.sec.gov/submissions/CIK${String(cik).padStart(10, "0")}.json`))?.json();
      const r = sub?.filings?.recent;
      const filings: { acc: string; date: string }[] = [];
      for (let i = 0; r && i < r.form.length; i++) {
        if (r.form[i] === "4" && r.filingDate[i] >= since) filings.push({ acc: r.accessionNumber[i], date: r.filingDate[i] });
      }
      const known = new Set((histories[cik]?.buys ?? []).map((b) => `${b[0]}|${b[1]}`));
      const buys = [...(histories[cik]?.buys ?? [])];
      for (const f of filings.slice(0, TRACK_MAX_FILINGS)) {
        // Archives path works under any of the filing's CIKs
        const txt = await (await sec(`https://www.sec.gov/Archives/edgar/data/${cik}/${f.acc.replace(/-/g, "")}/${f.acc}.txt`))?.text();
        const parsed = txt ? parseForm4(txt, f.acc, f.date) : null;
        const raw = parsed?.rawBuy;
        if (!raw?.ticker || known.has(`${raw.date}|${raw.ticker}`)) continue;
        known.add(`${raw.date}|${raw.ticker}`);
        buys.push([raw.date, raw.ticker, null, null]);
      }
      histories[cik] = { fetched: today, buys };
    } catch (err) {
      console.log(`  insider ${cik}: ${(err as Error).message}`);
    }
    if ((n + 1) % 50 === 0) console.log(`  ${n + 1}/${todo.length}`);
  }

  // Score anything old enough that isn't scored yet
  for (const h of Object.values(histories)) {
    for (const b of h.buys) {
      if (b[3] != null) continue;
      if (addMonths(b[0], 6) > today) continue;
      [b[2], b[3]] = await scoreBuy(b[0], b[1], today);
    }
  }
}

function trackRecord(h: History | undefined, before: string): TrackRecord | undefined {
  if (!h) return undefined;
  const past = h.buys.filter((b) => b[0] < before);
  const r6 = past.map((b) => b[2]).filter((x): x is number => x != null);
  const r12 = past.map((b) => b[3]).filter((x): x is number => x != null);
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1e4) / 1e4 : null);
  return {
    n: past.length,
    avg6: avg(r6),
    avg12: avg(r12),
    hit12: r12.length ? Math.round((r12.filter((x) => x > 0).length / r12.length) * 100) / 100 : null,
  };
}

/* ── Quotes (context) ──────────────────────────────────────── */

async function quotes(tickers: string[]) {
  const out = new Map<string, { price: number; low52: number | null; high52: number | null }>();
  for (let i = 0; i < tickers.length; i += 50) {
    try {
      const rows = (await (await yf()).quote(tickers.slice(i, i + 50), { return: "array" })) as {
        symbol: string;
        regularMarketPrice?: number;
        fiftyTwoWeekLow?: number;
        fiftyTwoWeekHigh?: number;
      }[];
      for (const r of rows) {
        if (r.regularMarketPrice) out.set(r.symbol, { price: r.regularMarketPrice, low52: r.fiftyTwoWeekLow ?? null, high52: r.fiftyTwoWeekHigh ?? null });
      }
    } catch (err) {
      console.log(`  quotes batch failed: ${(err as Error).message}`);
    }
    await sleep(500);
  }
  return out;
}

/* ── Main ──────────────────────────────────────────────────── */

const startedAt = Date.now();

async function main() {
  const started = startedAt;
  mkdirSync(DAY_CACHE, { recursive: true });
  const today = new Date();
  const todayIso = isoDate(today);
  const days: string[] = [];
  for (let i = 1; i <= WINDOW_DAYS; i++) {
    const d = new Date(today.getTime() - i * 86_400_000);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) days.push(isoDate(d));
  }
  console.log(`Refreshing insider feeds for ${days[days.length - 1]} → ${days[0]}\n`);

  const graceCutoff = isoDate(new Date(today.getTime() - MISSING_INDEX_GRACE_DAYS * 86_400_000));
  const all: Day = { v: DAY_CACHE_VERSION, buys: [], trades: [], stakes: [], rawBuys: [] };
  for (const date of days) {
    const path = join(DAY_CACHE, `${date}.json`);
    const cached = readJson<Day | InsiderBuy[] | null>(path, null);
    // v1 caches (a bare array of buys) lack trades/stakes — reprocess
    let day = cached && !Array.isArray(cached) && cached.v === DAY_CACHE_VERSION ? cached : null;
    if (!day) {
      try {
        day = await processDay(date);
        if (day === null && date > graceCutoff) continue; // index may still be coming
        day ??= { v: DAY_CACHE_VERSION, buys: [], trades: [], stakes: [], rawBuys: [] };
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, JSON.stringify(day) + "\n");
      } catch (err) {
        console.log(`  ${date}: FAILED (${(err as Error).message}) — will retry next run`);
        continue;
      }
    }
    all.buys.push(...day.buys);
    all.trades.push(...day.trades);
    all.stakes.push(...day.stakes);
  }

  const buys = dedupe(all.buys.filter((b) => b.ticker)); // no ticker = non-traded REIT/BDC
  buys.sort((a, b) => b.filed.localeCompare(a.filed) || b.value - a.value);

  // Context: current price and 52-week range
  const q = await quotes([...new Set(buys.map((b) => b.ticker!))]);
  for (const b of buys) {
    const x = q.get(b.ticker!);
    if (x) Object.assign(b, { now: x.price, low52: x.low52, high52: x.high52 });
  }

  // Track records for everyone in the feed (cached; only new insiders fetched)
  const histories = readJson<Record<string, History>>(HISTORY_CACHE, {});
  await updateHistories([...new Set(buys.map((b) => b.ownerCik))], histories, todayIso);
  writeFileSync(HISTORY_CACHE, JSON.stringify(histories) + "\n");
  const windowStart = days[days.length - 1];
  for (const b of buys) {
    const t = trackRecord(histories[b.ownerCik], windowStart);
    if (t) b.track = t;
  }

  const output: InsiderBuysJson = { updated: todayIso, from: days[days.length - 1], to: days[0], buys };
  writeFileSync(join(process.cwd(), "public", "insider-buys.json"), JSON.stringify(output));

  // Same trade reported by several affiliated manager entities → keep one
  const seen = new Set<string>();
  const trades = all.trades
    .filter((t) => {
      const key = `${t.managerId}|${t.issuerCik}|${t.side}|${t.lastTrade}|${t.shares}`;
      return !seen.has(key) && seen.add(key);
    })
    .sort((a, b) => b.filed.localeCompare(a.filed) || b.value - a.value);
  const stakes = all.stakes.sort((a, b) => b.filed.localeCompare(a.filed));
  const realtime: RealtimeJson = { updated: todayIso, from: days[days.length - 1], to: days[0], trades, stakes };
  mkdirSync(join(process.cwd(), "public", "superinvestors"), { recursive: true });
  writeFileSync(join(process.cwd(), "public", "superinvestors", "realtime.json"), JSON.stringify(realtime));

  console.log(
    `\nWrote ${buys.length} purchases to public/insider-buys.json (${all.buys.length} before dedupe/filter), ` +
      `${trades.length} superinvestor trades + ${stakes.length} stakes to public/superinvestors/realtime.json`
  );
  recordStatus("refresh-insiders", started, true, `${buys.length} insider buys, ${trades.length} superinvestor trades, ${stakes.length} stakes`);
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
  recordStatus("refresh-insiders", startedAt, false, err.message);
  process.exit(1);
});

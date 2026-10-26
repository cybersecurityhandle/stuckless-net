/**
 * Refresh superinvestor 13F holdings.
 *
 * For each manager in lib/superinvestors.ts, pulls every quarterly 13F-HR
 * since Q2 2013 (when EDGAR info tables became XML), merging 13F-HR/A
 * amendments, maps CUSIPs to tickers, computes quarter-over-quarter changes,
 * and writes:
 *   public/superinvestors.json        latest quarter for all managers
 *   public/superinvestors/{id}.json   full history per manager
 *
 * Parsed filings are cached in data/13f-cache/ (gitignored — filings are
 * immutable, so only new ones are fetched after the first run, which takes a
 * few minutes). CUSIP → ticker hits are cached in data/cusip-tickers.json and
 * misses in data/cusip-misses.json (retried after 30 days); Yahoo split
 * histories in data/splits.json. Commit all three.
 * Set OPENFIGI_API_KEY for higher OpenFIGI rate limits.
 *
 * Usage:
 *   npm run refresh-13f
 */

import { recordStatus } from "./status";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import {
  cleanCompanyTitle,
  CUSIP_OVERRIDES,
  PREFERRED_CUSIPS,
  MANAGERS,
  NAME_FIXES,
  type HistoryPosition,
  type HistoryQuarter,
  type LatestHoldingsJson,
  type LatestPosition,
  type Manager,
  type ManagerHistoryJson,
  type ManagerSummary,
  type EventsJson,
  type Quote,
  type SuperinvestorsJson,
  issuerKey,
  portfolioImpact,
  prettyIssuer,
} from "../lib/superinvestors";

const SEC_HEADERS = { "User-Agent": "stuckless.net admin@stuckless.net" };
const SEC_DELAY_MS = 150; // SEC fair-access limit is 10 req/s
const HISTORY_FROM = "2013-06-30"; // first quarter of mandatory XML info tables
const DATA_DIR = join(process.cwd(), "data");
const FILING_CACHE = join(DATA_DIR, "13f-cache", "v1"); // bump on parser changes
const TICKER_CACHE = join(DATA_DIR, "cusip-tickers.json");
const MISS_CACHE = join(DATA_DIR, "cusip-misses.json");
const MISS_RETRY_DAYS = 30;

// Filings made on/after this date report <value> in dollars; earlier ones
// in thousands of dollars
const DOLLAR_VALUES_FROM = "2023-01-03";

// Exact share-count ratios treated as stock splits (when the per-share price
// moved the other way)
const SPLIT_RATIOS = [1.5, 2, 3, 4, 5, 6, 7, 8, 10, 15, 20, 25, 30, 40, 50, 100];

/* ── Types ─────────────────────────────────────────────────── */

interface Filing {
  cik: number;
  form: string;
  filed: string;
  period: string;
  accession: string;
}

interface RawRow {
  issuer: string;
  class: string;
  cusip: string;
  value: number;
  shares: number;
  putCall?: "PUT" | "CALL";
  ticker?: string; // N-PORT only: Yahoo symbol derived from the filed ticker
}

interface CachedFiling {
  amendmentType?: string;
  // N-PORT only: report date (the series filing list has none), fund size,
  // and the quarter's net subscriptions (sales + reinvestments − redemptions)
  period?: string;
  netAssets?: number;
  netFlow?: number;
  rows: RawRow[] | null;
}

interface Quarter {
  period: string;
  latest: Filing;
  positions: Map<string, RawRow>;
  flow?: number; // funds: 1 + net flows / prior net assets (see change())
}

/* ── Helpers ───────────────────────────────────────────────── */

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// EDGAR throws intermittent 503s / 429s under sustained load — back off and
// retry rather than failing the whole manager
async function sec(url: string): Promise<Response> {
  let status = 0;
  for (let attempt = 0; attempt < 4; attempt++) {
    await sleep(attempt ? 3000 * 2 ** (attempt - 1) : SEC_DELAY_MS);
    const res = await fetch(url, { headers: SEC_HEADERS, signal: AbortSignal.timeout(30_000) }).catch(() => null);
    if (res?.ok) return res;
    status = res?.status ?? 0;
    if (res && res.status < 500 && res.status !== 429) break; // 404 etc. — not transient
  }
  throw new Error(`${status || "network error"} ${url}`);
}

function readJson<T>(path: string, fallback: T): T {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback;
}

function writeJson(path: string, data: unknown, pretty = false) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, pretty ? JSON.stringify(data, null, 1) + "\n" : JSON.stringify(data));
}

function sortKeys<T>(obj: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
}

// 13F XML uses varying namespace prefixes (ns1:, n1:, none)
function tag(xml: string, name: string): string | undefined {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${name}>([\\s\\S]*?)</(?:\\w+:)?${name}>`, "i"));
  return m ? m[1].trim() : undefined;
}

// Some filing agents wrap text in CDATA: <nameOfIssuer><![CDATA[TE CONNECTIVITY PLC]]>
function decode(s: string) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .trim()
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/* ── EDGAR ─────────────────────────────────────────────────── */

async function listFilings(cik: number): Promise<Filing[]> {
  const padded = String(cik).padStart(10, "0");
  const data = await (await sec(`https://data.sec.gov/submissions/CIK${padded}.json`)).json();
  // "recent" holds the last 1000 filings; heavy filers (Berkshire's Form 4s)
  // push older 13Fs into overflow pages
  const pages = [data.filings.recent];
  for (const f of data.filings.files as { name: string }[]) {
    pages.push(await (await sec(`https://data.sec.gov/submissions/${f.name}`)).json());
  }
  const out: Filing[] = [];
  for (const r of pages) {
    for (let i = 0; i < r.form.length; i++) {
      if (r.form[i] !== "13F-HR" && r.form[i] !== "13F-HR/A") continue;
      if (r.reportDate[i] < HISTORY_FROM) continue;
      out.push({ cik, form: r.form[i], filed: r.filingDate[i], period: r.reportDate[i], accession: r.accessionNumber[i] });
    }
  }
  return out;
}

/* ── N-PORT (fund series) ──────────────────────────────────── */

// Yahoo exchange suffix by N-PORT currency, where one exchange dominates.
// CAD is ambiguous (TSX .TO vs TSXV .V), so Canadian names go in
// CUSIP_OVERRIDES; anything else unmapped logs as unresolved.
const NPORT_SUFFIX: Record<string, string> = {
  TRY: ".IS",
  INR: ".NS",
  HKD: ".HK",
  PLN: ".WA",
  JPY: ".T",
  GBP: ".L",
  KRW: ".KS",
};

function nportTicker(filed: string | undefined, cur: string, country: string): string | undefined {
  if (!filed) return undefined;
  if (cur === "USD") return filed.replace("/", "-"); // BRK/B → BRK-B
  if (cur === "EUR" && country === "IT") return `${filed}.MI`;
  const suffix = NPORT_SUFFIX[cur];
  if (!suffix) return undefined;
  return cur === "HKD" ? `${filed.padStart(4, "0")}${suffix}` : `${filed}${suffix}`;
}

/**
 * A series' N-PORT-P filings. The trust files one per series per quarter;
 * EDGAR's company browser accepts a series ID as the CIK and lists only that
 * series. The report date is inside the filing, so each is parsed here
 * (cached) rather than in loadFiling.
 */
async function listNportFilings(trustCik: number, seriesId: string): Promise<Filing[]> {
  const url = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${seriesId}&type=NPORT-P&dateb=&owner=include&count=100&output=atom`;
  const atom = await (await sec(url)).text();
  const out: Filing[] = [];
  for (const [, entry] of atom.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const form = tag(entry, "filing-type");
    const accession = tag(entry, "accession-number");
    const filed = tag(entry, "filing-date");
    if (!form?.startsWith("NPORT-P") || !accession || !filed) continue;
    const f: Filing = { cik: trustCik, form, filed, period: "", accession };
    const cached = await loadFiling(f, seriesId);
    if (!cached.period || cached.period < HISTORY_FROM) continue;
    out.push({ ...f, period: cached.period });
  }
  return out;
}

/** Long common-stock holdings from an N-PORT-P, values already in USD */
async function fetchNport(f: Filing, seriesId: string): Promise<CachedFiling> {
  const xml = await (await sec(`${filingBaseUrl(f)}/primary_doc.xml`)).text();
  if (tag(xml, "seriesId") !== seriesId) throw new Error(`${f.accession} is not series ${seriesId}`);
  const rows: RawRow[] = [];
  for (const m of xml.matchAll(/<invstOrSec>([\s\S]*?)<\/invstOrSec>/g)) {
    const t = m[1];
    // Common equity only (no cash sweep, bonds, preferreds or derivatives),
    // like the 13F side
    if (tag(t, "assetCat") !== "EC" || tag(t, "payoffProfile") !== "Long" || tag(t, "units") !== "NS") continue;
    const cusip = (tag(t, "cusip") ?? "").toUpperCase();
    const isin = t.match(/<isin value="([^"]+)"/)?.[1];
    // Non-US listings have no CUSIP ("N/A", "000000000") — key them by ISIN
    const key = /^[0-9A-Z]{8}\d$/.test(cusip) && cusip !== "000000000" ? cusip : isin;
    if (!key) continue;
    const cur = t.match(/curCd="([A-Z]{3})"/)?.[1] ?? tag(t, "curCd") ?? "USD";
    rows.push({
      issuer: decode(tag(t, "title") || tag(t, "name") || ""),
      class: "COM",
      cusip: key,
      value: Number(tag(t, "valUSD") ?? 0),
      shares: Number(tag(t, "balance") ?? 0),
      ticker: nportTicker(t.match(/<ticker value="([^"]+)"/)?.[1], cur, tag(t, "invCountry") ?? ""),
    });
  }
  let netFlow = 0;
  for (const [, attrs] of xml.matchAll(/<mon[123]Flow([^>]*)\/?>/g)) {
    const num = (a: string) => Number(attrs.match(new RegExp(`${a}="([^"]*)"`))?.[1] ?? 0);
    netFlow += num("sales") + num("reinvestment") - num("redemption");
  }
  return { period: tag(xml, "repPdDate"), netAssets: Number(tag(xml, "netAssets") ?? 0), netFlow, rows };
}

async function fetchInfoTable(f: Filing): Promise<RawRow[] | null> {
  const base = filingBaseUrl(f);
  const index = await (await sec(`${base}/index.json`)).json();
  // Info table filename varies by filing agent (infotable.xml, 56757.xml, ...)
  const name = (index.directory.item as { name: string }[])
    .map((i) => i.name)
    .find((n) => n.toLowerCase().endsWith(".xml") && n.toLowerCase() !== "primary_doc.xml");
  if (!name) return null;

  const xml = await (await sec(`${base}/${name}`)).text();
  const rows: RawRow[] = [];
  for (const m of xml.matchAll(/<(?:\w+:)?infoTable>([\s\S]*?)<\/(?:\w+:)?infoTable>/gi)) {
    const t = m[1];
    const putCall = tag(t, "putCall")?.toUpperCase();
    rows.push({
      issuer: decode(tag(t, "nameOfIssuer") ?? ""),
      class: decode(tag(t, "titleOfClass") ?? ""),
      cusip: (tag(t, "cusip") ?? "").toUpperCase(),
      value: Number(tag(t, "value") ?? 0),
      shares: Number(tag(t, "sshPrnamt") ?? 0),
      putCall: putCall === "PUT" || putCall === "CALL" ? putCall : undefined,
    });
  }
  return scaleValues(rows, f);
}

/**
 * Convert <value> to dollars. The rule is thousands before 2023 and dollars
 * after, but some filers got it wrong — so check the median implied share
 * price and override the rule when it's implausible.
 */
function scaleValues(rows: RawRow[], f: Filing): RawRow[] {
  let scale = f.filed >= DOLLAR_VALUES_FROM ? 1 : 1000;
  const prices = rows.filter((r) => r.shares > 0 && !r.putCall).map((r) => r.value / r.shares);
  if (prices.length) {
    const med = median(prices) * scale;
    if (scale === 1000 && med > 20_000) scale = 1;
    else if (scale === 1 && med < 0.05) scale = 1000;
    if (scale !== (f.filed >= DOLLAR_VALUES_FROM ? 1 : 1000)) {
      console.log(`  ${f.period} ${f.accession}: value units look wrong, using ×${scale}`);
    }
  }
  return rows.map((r) => ({ ...r, value: r.value * scale }));
}

function filingBaseUrl(f: Filing) {
  return `https://www.sec.gov/Archives/edgar/data/${f.cik}/${f.accession.replace(/-/g, "")}`;
}

async function loadFiling(f: Filing, seriesId?: string): Promise<CachedFiling> {
  const path = join(FILING_CACHE, `${f.accession}.json`);
  if (seriesId) {
    if (existsSync(path)) return readJson<CachedFiling>(path, { rows: null });
    const parsed = await fetchNport(f, seriesId);
    writeJson(path, parsed);
    return parsed;
  }
  if (existsSync(path)) {
    // Filings cached before CDATA stripping was added
    const cached = readJson<CachedFiling>(path, { rows: null });
    for (const r of cached.rows ?? []) {
      r.issuer = decode(r.issuer);
      r.class = decode(r.class);
    }
    return cached;
  }

  const cached: CachedFiling = { rows: await fetchInfoTable(f) };
  if (f.form === "13F-HR/A") {
    const xml = await (await sec(`${filingBaseUrl(f)}/primary_doc.xml`)).text();
    cached.amendmentType = (tag(xml, "amendmentType") ?? "").toUpperCase();
  }
  writeJson(path, cached);
  return cached;
}

/**
 * Holdings for one quarter: the original 13F-HR, then amendments in filing
 * order — RESTATEMENT replaces everything, NEW HOLDINGS adds positions (e.g.
 * released from confidential treatment). Some filers label full re-filings
 * as NEW HOLDINGS (Check Capital Q2 2026, twice — the second dropping 36
 * small positions), so an amendment worth 90%+ of the quarter is treated as
 * a restatement (as Dataroma does), and otherwise its rows replace existing
 * rows for the same security rather than double-counting them.
 */
async function quarterRows(filings: Filing[]): Promise<{ rows: RawRow[]; latest: Filing }> {
  // Same-day amendments are ordered by accession number (filing sequence)
  const sorted = [...filings].sort((a, b) => a.filed.localeCompare(b.filed) || a.accession.localeCompare(b.accession));
  const key = (r: RawRow) => `${r.cusip}|${r.putCall ?? ""}`;
  let rows: RawRow[] = [];
  let latest = sorted[0];
  for (const f of sorted) {
    const { rows: filed, amendmentType } = await loadFiling(f);
    if (!filed) continue; // cover-page-only amendment
    const total = (rs: RawRow[]) => rs.reduce((s, r) => s + r.value, 0);
    // N-PORT amendments are complete re-filings
    if (f.form === "13F-HR" || f.form.startsWith("NPORT") || amendmentType?.includes("RESTATEMENT") || total(filed) >= 0.9 * total(rows)) {
      rows = filed;
    } else {
      const amended = new Set(filed.map(key));
      rows = [...rows.filter((r) => !amended.has(key(r))), ...filed];
    }
    latest = f;
  }
  return { rows: fixUnits(rows, latest).filter((r) => !isDebt(r) && !isPreferred(r)), latest };
}

/**
 * Convertible bonds and notes are reported by principal amount, so their
 * "share price" is ~$1 and they'd skew weights (Oaktree files ~90). The
 * sshPrnamtType flag isn't in the filing cache, so go by class title
 * ("CONVERTIBLE BOND", "NOTE 3.875%11/3", "NOTE12/0") plus a per-unit value
 * near par — bond ETFs ("SHORT TRM BOND") trade per share well above $10.
 */
function isDebt(r: RawRow) {
  return (
    /\bNOTE|\bBOND|\bDEBENTURE|\bDEBT\b/i.test(r.class) &&
    !/\bPFD|\bPREF/i.test(r.class) &&
    r.shares > 0 &&
    r.value / r.shares < 10
  );
}

/**
 * Preferred shares, convertible or not, including preferred ADRs (ITUB,
 * GGB). Holdings are common stock only, as on Dataroma — Torray's Alphabet
 * and KKR preferreds otherwise shifted every weight ~10%.
 */
function isPreferred(r: RawRow) {
  return (
    PREFERRED_CUSIPS.has(r.cusip) ||
    /\bPFD|\bPREF|\bDEP(OSITARY)?\s*SH/i.test(r.class) ||
    /\bPFD\b|\bPREFERRED\b/i.test(r.issuer)
  );
}

/**
 * Warrants, rights and SPAC units have their own CUSIPs but name matching
 * gives them the common stock's ticker (Alvotech's warrants as ALVO), which
 * then borrows its price and merges its shares. They keep no ticker.
 */
function isWarrantLike(r: RawRow) {
  // SPAC units only ("UNIT 99/99/9999", bare "UNITS") — not partnership
  // units ("UNIT LTD PARTNR", "COM UNITS LP"), which are the common equity
  return /W(AR)?R(AN)?TS?\b|\*W\b|\bWTS?\b|\bRIGHTS?\b|\bRTS?\b|\bUNIT\s*99|^UNITS?$/i.test(r.class.trim());
}

/**
 * Second units check on the merged quarter (cached rows included): a
 * portfolio's median holding can't plausibly trade below $0.50 or above
 * $5,000. Catches filers that kept reporting in thousands after 2023
 * (Baupost, Li Lu, Tweedy: medians $0.05–0.35) when scaleValues' wider bands
 * miss them. Not $1 — Oaktree's distressed book genuinely medians ~$0.99.
 */
function fixUnits(rows: RawRow[], f: Filing): RawRow[] {
  const prices = rows.filter((r) => r.shares > 0 && !r.putCall).map((r) => r.value / r.shares);
  if (!prices.length) return rows;
  const med = median(prices);
  const factor = med < 0.5 ? 1000 : med > 5000 ? 1 / 1000 : 1;
  if (factor === 1) return rows;
  console.log(`  ${f.period} ${f.accession}: median price $${med.toFixed(3)}, rescaling ×${factor}`);
  return rows.map((r) => ({ ...r, value: r.value * factor }));
}

/* ── Aggregation ───────────────────────────────────────────── */

function positionKey(r: RawRow) {
  return r.putCall ? `${r.cusip}|${r.putCall}` : r.cusip;
}

// One position per CUSIP (+ put/call); filers split rows across sub-managers
function aggregate(rows: RawRow[]): Map<string, RawRow> {
  const map = new Map<string, RawRow>();
  for (const r of rows) {
    const key = positionKey(r);
    const cur = map.get(key);
    if (cur) {
      cur.value += r.value;
      cur.shares += r.shares;
    } else {
      map.set(key, { ...r });
    }
  }
  return map;
}

function longTotal(map: Map<string, RawRow>) {
  let total = 0;
  for (const r of map.values()) if (!r.putCall) total += r.value;
  return total;
}

/* ── Stock splits ──────────────────────────────────────────── */

// A quarter-over-quarter per-share price move beyond this factor (either
// way) makes a position a split candidate
const SPLIT_CANDIDATE_MOVE = 1.4;
const SPLIT_CACHE = join(DATA_DIR, "splits.json");

interface SplitCacheEntry {
  fetched: string;
  splits: { date: string; ratio: number }[];
}

let splitCache: Record<string, SplitCacheEntry> | null = null;
let yahoo: { chart: (t: string, o: object) => Promise<unknown> } | null = null;

// Yahoo split history, cached; refetched only when the cached copy predates
// the quarter in question
async function splitsFor(ticker: string, needThrough: string): Promise<SplitCacheEntry["splits"] | null> {
  splitCache ??= readJson<Record<string, SplitCacheEntry>>(SPLIT_CACHE, {});
  const hit = splitCache[ticker];
  if (hit && hit.fetched > needThrough) return hit.splits;
  if (!yahoo) {
    const { default: YahooFinance } = await import("yahoo-finance2");
    yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] }) as unknown as typeof yahoo;
  }
  try {
    await sleep(300);
    const chart = (await yahoo!.chart(ticker, {
      period1: "2013-01-01",
      interval: "1mo",
      events: "splits",
      return: "array",
    })) as { events?: { splits?: { date: Date | string; numerator: number; denominator: number }[] } };
    const splits = (chart.events?.splits ?? []).map((s) => ({
      date: new Date(s.date).toISOString().split("T")[0],
      ratio: s.numerator / s.denominator,
    }));
    splitCache[ticker] = { fetched: new Date().toISOString().split("T")[0], splits };
    return splits;
  } catch {
    return null; // delisted / unknown to Yahoo
  }
}

// Current price + 52-week range for every current holding (Dataroma's
// "current price / ± reported" columns). Batched; failures just omit a ticker.
async function fetchQuotes(tickers: string[]): Promise<Record<string, Quote>> {
  const { default: YahooFinance } = await import("yahoo-finance2");
  const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] }) as unknown as {
    quote: (t: string[], o?: object) => Promise<Record<string, unknown>[]>;
  };
  const out: Record<string, Quote> = {};
  for (let i = 0; i < tickers.length; i += 50) {
    try {
      const rows = (await yf.quote(tickers.slice(i, i + 50), { return: "array" })) as {
        symbol: string;
        regularMarketPrice?: number;
        fiftyTwoWeekLow?: number;
        fiftyTwoWeekHigh?: number;
        epsTrailingTwelveMonths?: number;
        trailingAnnualDividendRate?: number;
        currency?: string;
      }[];
      for (const r of rows) {
        if (!r.regularMarketPrice) continue;
        const fx = await usdRate(yf, r.currency);
        if (fx == null) continue; // no rate — omit rather than mix currencies
        const usd = (x: number | undefined) => (x != null ? x * fx : null);
        out[r.symbol] = {
          price: r.regularMarketPrice * fx,
          low52: usd(r.fiftyTwoWeekLow),
          high52: usd(r.fiftyTwoWeekHigh),
          eps: usd(r.epsTrailingTwelveMonths),
          dps: usd(r.trailingAnnualDividendRate),
        };
      }
    } catch (err) {
      console.log(`  quotes batch ${i / 50 + 1} failed: ${(err as Error).message}`);
    }
    await sleep(500);
  }

  // Note: quote EPS is already per traded share in the quote currency, even
  // for ADRs whose statements are in CNY/TWD (PDD, TSM) — only the quote
  // currency needs converting
  return sortKeys(out);
}

// Holdings are valued in USD (13F and N-PORT alike), so non-US quotes
// (TAVHL.IS in TRY, CSU.TO in CAD) are converted at today's rate. Minor
// units (GBp, ZAc, ILA) are hundredths of the major currency.
const fxRates = new Map<string, number | null>([["USD", 1]]);
async function usdRate(yf: { quote: (t: string[], o?: object) => Promise<Record<string, unknown>[]> }, currency = "USD") {
  const minor: Record<string, string> = { GBp: "GBP", GBX: "GBP", ZAc: "ZAR", ILA: "ILS" };
  const major = minor[currency] ?? currency.toUpperCase();
  const scale = minor[currency] ? 0.01 : 1;
  if (!fxRates.has(major)) {
    try {
      const [q] = (await yf.quote([`${major}USD=X`], { return: "array" })) as { regularMarketPrice?: number }[];
      fxRates.set(major, q?.regularMarketPrice ?? null);
    } catch {
      fxRates.set(major, null);
    }
    if (fxRates.get(major) == null) console.log(`  no ${major}→USD rate; dropping ${major} quotes`);
  }
  const rate = fxRates.get(major);
  return rate != null ? rate * scale : null;
}

function saveSplitCache() {
  if (splitCache) writeJson(SPLIT_CACHE, sortKeys(splitCache), true);
}

// Last-resort rule when Yahoo can't confirm: an exact standard share ratio
// with the per-share price moving the opposite way
function isExactSplit(cur: RawRow, prev: RawRow): boolean {
  const r = cur.shares / prev.shares;
  const ratio = r > 1 ? r : 1 / r;
  if (!SPLIT_RATIOS.some((s) => Math.abs(ratio / s - 1) < 0.001)) return false;
  const priceMove = prev.value / prev.shares / (cur.value / cur.shares);
  const priceRatio = r > 1 ? priceMove : 1 / priceMove;
  return priceRatio > Math.sqrt(ratio);
}

/**
 * Split factor to apply to prior-quarter shares (1 = none). Only positions
 * whose per-share price jumped are checked, and Yahoo's split has to agree
 * with the price move — guards against reused or mis-mapped tickers.
 */
async function splitFactor(cur: RawRow, prev: RawRow, ticker: string | null, from: string, to: string) {
  if (!cur.shares || !prev.shares || !cur.value || !prev.value || cur.putCall) return 1;
  const priceMove = prev.value / prev.shares / (cur.value / cur.shares);
  if (Math.abs(Math.log(priceMove)) < Math.log(SPLIT_CANDIDATE_MOVE)) return 1;

  const splits = ticker ? await splitsFor(ticker, to) : null;
  if (splits) {
    const factor = splits.filter((s) => s.date > from && s.date <= to).reduce((f, s) => f * s.ratio, 1);
    // Yahoo's split plus a big price jump is enough; the remaining price move
    // can be large in a strong quarter (KLAC Q2 2026: 10-for-1 and +105%)
    if (factor !== 1 && Math.abs(Math.log(priceMove / factor)) < Math.log(3)) return factor;
    if (factor !== 1) return 1;
  }
  return isExactSplit(cur, prev) ? cur.shares / prev.shares : 1;
}

async function change(
  cur: RawRow,
  prev: RawRow | undefined,
  ticker: string | null,
  from: string,
  to: string,
  flow?: number
): Promise<Pick<HistoryPosition, "c" | "p">> {
  if (!prev) return { c: "new" };
  if (cur.shares === prev.shares) return {};
  const prevShares = prev.shares * (await splitFactor(cur, prev, ticker, from, to));
  if (flow != null) {
    // A fund buys more of everything with subscriptions (and sells with
    // redemptions), so an add is buying beyond the inflow and a reduce is
    // selling beyond the outflow. Holding steady while new money funds
    // other names is neither. ±5%: flows are never invested exactly pro rata.
    const up = prevShares * Math.max(flow, 1) * 1.05;
    const down = prevShares * Math.min(flow, 1) * 0.95;
    if (cur.shares > up) return { c: "add", p: cur.shares / (up / 1.05) - 1 };
    if (cur.shares < down) return { c: "reduce", p: 1 - cur.shares / (down / 0.95) };
    return {};
  }
  // Fractional-share rounding after a split
  if (Math.abs(cur.shares - prevShares) / prevShares < 0.0005) return {};
  return cur.shares > prevShares
    ? { c: "add", p: (cur.shares - prevShares) / prevShares }
    : { c: "reduce", p: (prevShares - cur.shares) / prevShares };
}

/* ── CUSIP → ticker ────────────────────────────────────────── */

// Suffix/noise tokens dropped before comparing 13F issuer names with SEC
// company titles ("CHUBB LIMITED" ~ "Chubb Ltd")
const NAME_NOISE = new Set(
  "INC CORP CORPORATION CO COMPANY LTD LIMITED PLC PUB PUBLIC NV AG SE SA LLC LP JSC DEL NEW THE HLDGS HLDG HOLDINGS HOLDING IRELAND".split(" ")
);

// 13F issuer-name abbreviations
const NAME_ABBREV: Record<string, string> = {
  INTL: "INTERNATIONAL",
  INDL: "INDUSTRIAL",
  INDS: "INDUSTRIES",
  FINL: "FINANCIAL",
  SVCS: "SERVICES",
  AMER: "AMERICA",
  MGMT: "MANAGEMENT",
  PPTYS: "PROPERTIES",
  CTLS: "CONTROLS",
  ELEC: "ELECTRIC",
  UTD: "UNITED",
};

function normName(s: string): string[] {
  return s
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/\./g, "") // "N.V." → NV before the letter-join below
    .replace(/\b([A-Z])\s([A-Z])\b/g, "$1$2") // "N V" → NV, "S A" → SA
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !NAME_NOISE.has(t))
    .map((t) => NAME_ABBREV[t] ?? t);
}

let secNames: { tokens: string[]; ticker: string }[] | null = null;
let secTitles: Record<string, string> = {}; // ticker → SEC company title

async function loadSecCompanies() {
  if (secNames) return;
  const data = await (await sec("https://www.sec.gov/files/company_tickers.json")).json();
  const seen = new Set<number>();
  secNames = [];
  secTitles = {};
  for (const e of Object.values(data) as { cik_str: number; ticker: string; title: string }[]) {
    secTitles[e.ticker] = e.title;
    // First entry per CIK is the primary listing
    if (seen.has(e.cik_str)) continue;
    seen.add(e.cik_str);
    secNames.push({ tokens: normName(e.title), ticker: e.ticker });
  }
}

// SEC's own company title when the ticker is listed there, else the 13F
// issuer name cleaned up
function displayName(ticker: string | null, issuer: string): string {
  if (ticker && NAME_FIXES[ticker]) return NAME_FIXES[ticker];
  const title = ticker ? secTitles[ticker] : undefined;
  if (title) return cleanCompanyTitle(title);
  // N-PORT names are already mixed case ("TAV Havalimanlari Holding AS")
  return /[a-z]/.test(issuer) ? cleanCompanyTitle(issuer) : prettyIssuer(issuer);
}

/**
 * Fallback when OpenFIGI misses (it has gaps for some US names like XOM and
 * mangles non-US CINS CUSIPs): match the issuer name against SEC's
 * company_tickers.json. Exact normalized match first, then a unique
 * first-two-token match to absorb 13F abbreviations ("PHARMACEUTICAL INDS").
 * Only covers currently listed companies.
 */
async function tickerByName(issuer: string): Promise<string | null> {
  await loadSecCompanies();
  const want = normName(issuer);
  if (!want.length) return null;
  const exact = secNames!.find((n) => n.tokens.join(" ") === want.join(" "));
  if (exact) return exact.ticker;
  if (want.length < 2) return null;
  const prefix = secNames!.filter((n) => n.tokens[0] === want[0] && n.tokens[1] === want[1]);
  return prefix.length === 1 ? prefix[0].ticker : null;
}

/**
 * Resolve every CUSIP once, with all its spellings across all managers
 * (newest first). Name matching is local and free, so it always runs; only
 * the OpenFIGI calls are skipped for recent misses.
 */
async function resolveTickers(
  spellings: Map<string, string[]>,
  cache: Record<string, string>,
  misses: Record<string, string>
) {
  const retryBefore = new Date(Date.now() - MISS_RETRY_DAYS * 86_400_000).toISOString().split("T")[0];
  const today = new Date().toISOString().split("T")[0];
  const byName = async (c: string) => {
    for (const name of spellings.get(c)!) {
      const t = await tickerByName(name);
      if (t) return t;
    }
    return null;
  };

  const todo: string[] = [];
  for (const c of spellings.keys()) {
    if (cache[c] || c in CUSIP_OVERRIDES) continue;
    if (misses[c] && misses[c] > retryBefore) {
      const t = await byName(c); // a newly seen spelling may match
      if (t) {
        cache[c] = t;
        delete misses[c];
      }
    } else {
      todo.push(c);
    }
  }

  const key = process.env.OPENFIGI_API_KEY;
  const batchSize = key ? 100 : 10;
  const delay = key ? 250 : 2500;
  if (todo.length) console.log(`OpenFIGI: resolving ${todo.length} new CUSIPs`);

  for (let i = 0; i < todo.length; i += batchSize) {
    const batch = todo.slice(i, i + batchSize);
    const body = JSON.stringify(batch.map((c) => ({ idType: "ID_CUSIP", idValue: c, exchCode: "US" })));
    let res: Response;
    for (let attempt = 0; ; attempt++) {
      res = await fetch("https://api.openfigi.com/v3/mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(key ? { "X-OPENFIGI-APIKEY": key } : {}) },
        body,
      });
      if (res.status === 429) {
        console.log("  OpenFIGI rate limited, waiting 60s");
        await sleep(60_000);
      } else if (res.status >= 500 && attempt < 3) {
        await sleep(10_000 * (attempt + 1)); // transient server error
      } else break;
    }
    if (!res.ok) throw new Error(`OpenFIGI ${res.status}`);
    const results = (await res.json()) as { data?: { ticker?: string }[] }[];
    for (const [j, c] of batch.entries()) {
      const t = results[j]?.data?.[0]?.ticker ?? (await byName(c));
      if (t) {
        cache[c] = t.replace("/", "-"); // BRK/B → BRK-B (Yahoo format)
        delete misses[c];
      } else {
        misses[c] = today;
      }
    }
    await sleep(delay);
  }
  writeJson(TICKER_CACHE, sortKeys(cache), true);
  writeJson(MISS_CACHE, sortKeys(misses), true);
}

/* ── Build ─────────────────────────────────────────────────── */

async function loadQuarters(m: Manager): Promise<Quarter[]> {
  const filings: Filing[] = [];
  if (m.nport) for (const series of m.nport) filings.push(...(await listNportFilings(m.ciks[0], series)));
  else for (const cik of m.ciks) filings.push(...(await listFilings(cik)));
  const periods = [...new Set(filings.map((f) => f.period))].sort().reverse();
  const quarters: Quarter[] = [];
  for (const period of periods) {
    const { rows, latest } = await quarterRows(filings.filter((f) => f.period === period));
    // Skip placeholder reports (Makaira Q1 2026: one all-zero row)
    if (rows.some((r) => r.value > 0)) quarters.push({ period, latest, positions: aggregate(rows) });
  }
  if (!quarters.length) throw new Error(m.nport ? "no N-PORT-P filings" : "no 13F-HR filings");
  if (m.nport) {
    // Subscriptions buy more of everything — size each quarter's flows
    // against the prior quarter's fund (filings are cached by now)
    const fund = await Promise.all(quarters.map((q) => loadFiling(q.latest)));
    for (let i = 0; i < quarters.length - 1; i++) {
      const prevAssets = fund[i + 1].netAssets;
      if (prevAssets && fund[i].netFlow != null) quarters[i].flow = 1 + fund[i].netFlow! / prevAssets;
    }
  }
  fixUnitsAcrossQuarters(quarters);
  return quarters;
}

/**
 * Third units check: a stock's price never moves 1,000× in a quarter. If the
 * positions a quarter shares with its neighbours imply prices ~1,000× lower,
 * that quarter was filed in thousands. Catches small high-priced portfolios
 * whose shrunken median still clears fixUnits (Spier's 7 stocks around $500).
 * Only scales up, and only quarters whose own median looks low, so a correct
 * quarter between two bad ones is never "fixed" toward them.
 */
function fixUnitsAcrossQuarters(quarters: Quarter[]) {
  const price = (r: RawRow) => r.value / r.shares;
  for (const [i, q] of quarters.entries()) {
    const ratios: number[] = [];
    for (const n of [quarters[i - 1], quarters[i + 1]]) {
      if (!n) continue;
      for (const [k, r] of q.positions) {
        const o = n.positions.get(k);
        if (!r.putCall && o && r.shares && o.shares && r.value && o.value) ratios.push(price(r) / price(o));
      }
    }
    if (ratios.length < 2 || median(ratios) > 0.005) continue;
    const own = [...q.positions.values()].filter((r) => r.shares && !r.putCall).map(price);
    if (median(own) > 5) continue;
    console.log(`  ${q.period} ${q.latest.accession}: prices ~1000× below neighbouring quarters, rescaling ×1000`);
    for (const r of q.positions.values()) r.value *= 1000;
  }
}

async function buildHistory(
  m: Manager,
  quarters: Quarter[],
  tickerOf: (c: string) => string | null
): Promise<ManagerHistoryJson> {
  const securities: ManagerHistoryJson["securities"] = {};
  const compact = (r: RawRow): HistoryPosition => ({ k: positionKey(r), s: r.shares, v: Math.round(r.value) });
  const byValue = (a: HistoryPosition, b: HistoryPosition) => b.v - a.v;

  const tickerFor = (r: RawRow) => (isWarrantLike(r) ? null : tickerOf(r.cusip));
  const out: HistoryQuarter[] = [];
  for (const [i, q] of quarters.entries()) {
    const prevQ = quarters[i + 1];
    const prev = prevQ?.positions;
    // A company that changed CUSIP (new holding company, spin-off, reverse
    // split: XOM, DD, HON, CCL in 2026) is the same holding, not a sale plus
    // a buy — match vanished prior positions by ticker
    const vanished = new Map<string, string>(); // ticker|putCall → prior key
    for (const [key, r] of prev ?? []) {
      const t = tickerFor(r);
      if (t && !q.positions.has(key)) vanished.set(`${t}|${r.putCall ?? ""}`, key);
    }
    const carried = new Set<string>();
    const positions: HistoryPosition[] = [];
    for (const [key, r] of q.positions) {
      const t = tickerFor(r);
      if (!securities[r.cusip]) securities[r.cusip] = { t, n: r.issuer, cl: r.class, d: displayName(t, r.issuer) };
      let before = prev?.get(key);
      if (prev && !before && t) {
        const was = vanished.get(`${t}|${r.putCall ?? ""}`);
        if (was && !carried.has(was)) {
          before = prev.get(was);
          carried.add(was);
        }
      }
      const c = prev ? await change(r, before, t, prevQ.period, q.period, q.flow) : {};
      positions.push({ ...compact(r), ...c });
    }
    const sold = prev
      ? [...prev]
          .filter(([key]) => !q.positions.has(key) && !carried.has(key))
          .map(([, r]) => ({ ...compact(r), c: "sold" as const }))
      : [];
    out.push({
      period: q.period,
      filed: q.latest.filed,
      accession: q.latest.accession,
      cik: q.latest.cik,
      total: Math.round(longTotal(q.positions)),
      ...(q.flow != null ? { flow: Math.round(q.flow * 1e4) / 1e4 } : {}),
      positions: positions.sort(byValue),
      sold: sold.sort(byValue),
    });
  }
  // Sold-out rows reference prior-quarter CUSIPs, already registered above.
  // No timestamp: the file only changes when a filing does (keeps git quiet).
  return { id: m.id, securities: sortKeys(securities), quarters: out };
}

function longPositions(h: ManagerHistoryJson): HistoryPosition[] {
  return h.quarters[0].positions.filter((p) => !p.k.includes("|"));
}

function buildSummary(m: Manager, h: ManagerHistoryJson): ManagerSummary {
  const q = h.quarters[0];
  const prev = h.quarters[1];
  const longs = longPositions(h);
  // Same counting as the manager page's Activity tab
  const moves = [...q.positions, ...q.sold]
    .filter((p) => p.c && !p.k.includes("|"))
    .map((p) => ({ p, impact: portfolioImpact(p, q, prev) }));
  const buys = moves.filter((x) => x.impact > 0).length;
  const big = moves.reduce<(typeof moves)[number] | null>(
    (best, x) => (!best || Math.abs(x.impact) > Math.abs(best.impact) ? x : best),
    null
  );
  return {
    id: m.id,
    name: m.name,
    firm: m.firm,
    favorite: !!m.favorite,
    cik: q.cik,
    period: q.period,
    filed: q.filed,
    totalValue: q.total,
    positions: new Set(longs.map((p) => issuerKey(p.k, h.securities[p.k]))).size, // companies, share classes combined
    firstPeriod: h.quarters[h.quarters.length - 1].period,
    top: longs.slice(0, 3).map((p) => h.securities[p.k].t ?? h.securities[p.k].d),
    ...styleStats(h),
    ...(prev ? { prevTotal: prev.total, buys, sells: moves.length - buys } : {}),
    ...(big?.impact
      ? {
          move: {
            t: h.securities[big.p.k].t,
            d: h.securities[big.p.k].d,
            c: big.p.c!,
            ...(big.p.p != null ? { p: Math.round(big.p.p * 1e4) / 1e4 } : {}),
            impact: Math.round(big.impact * 1e5) / 1e5,
          },
        }
      : {}),
  };
}

interface PositionStats {
  since: string; // quarter the current continuous holding began
  sinceIdx: number; // index into quarters (newest = 0)
  costTotal: number; // est. dollars paid for the shares now held
  partial: boolean; // already held in the first quarter on file
  streak: number;
  shares: number; // as of the last quarter walked
}

/**
 * Walk each position oldest → newest. Average-cost method at quarter-end
 * implied prices: buys add shares × that quarter's price, reduces keep the
 * per-share cost, splits (share change with no recorded activity) leave the
 * dollar total alone. A sale to zero resets everything.
 */
function positionStats(h: ManagerHistoryJson): Map<string, PositionStats> {
  const stats = new Map<string, PositionStats>();
  const n = h.quarters.length;
  for (let i = n - 1; i >= 0; i--) {
    const q = h.quarters[i];
    const held = new Set<string>();
    for (const p of q.positions) {
      held.add(p.k);
      const price = p.s ? p.v / p.s : 0;
      const st = stats.get(p.k);
      if (!st || p.c === "new") {
        stats.set(p.k, {
          since: q.period,
          sinceIdx: i,
          costTotal: p.v,
          partial: i === n - 1,
          streak: p.c === "new" ? 1 : 0,
          shares: p.s,
        });
        continue;
      }
      // Funds: cost follows actual share changes, since flow-driven buys
      // aren't flagged as adds (see change())
      if (q.flow != null) {
        if (p.s > st.shares) st.costTotal += (p.s - st.shares) * price;
        else if (st.shares) st.costTotal *= p.s / st.shares;
        st.shares = p.s;
        st.streak = p.c === "add" ? st.streak + 1 : 0;
        continue;
      }
      st.shares = p.s;
      if (p.c === "add" && p.p) {
        st.costTotal += (p.s - p.s / (1 + p.p)) * price;
        st.streak += 1;
      } else if (p.c === "reduce" && p.p != null && p.p < 1) {
        st.costTotal *= 1 - p.p;
        st.streak = 0;
      } else {
        st.streak = 0; // unchanged (or split — dollar cost unchanged)
      }
    }
    for (const k of [...stats.keys()]) if (!held.has(k)) stats.delete(k); // sold out
  }
  return stats;
}

// Moves big enough to mark on a price chart: anything a favorite does, or
// 0.5%+ of the portfolio for everyone else (keeps the file ~1–2MB)
const EVENT_MIN_IMPACT = 0.005;

function collectEvents(m: Manager, h: ManagerHistoryJson, out: EventsJson) {
  for (const [i, q] of h.quarters.entries()) {
    const prev = h.quarters[i + 1];
    if (!prev) continue;
    for (const p of [...q.positions, ...q.sold]) {
      if (!p.c || p.k.includes("|")) continue;
      const impact = portfolioImpact(p, q, prev);
      if (!m.favorite && Math.abs(impact) < EVENT_MIN_IMPACT) continue;
      const cusip = p.k.split("|")[0];
      (out[issuerKey(cusip, h.securities[cusip])] ??= []).push([
        q.period,
        m.id,
        p.c,
        p.p != null ? Math.round(p.p * 1e3) / 1e3 : null,
        Math.round(impact * 1e5) / 1e5,
      ]);
    }
  }
}

function buildLatest(h: ManagerHistoryJson): LatestPosition[] {
  const q = h.quarters[0];
  const stats = positionStats(h);
  return longPositions(h).map((p) => {
    const st = stats.get(p.k);
    return {
      k: p.k,
      w: q.total ? Math.round((p.v / q.total) * 1e6) / 1e6 : 0,
      s: p.s,
      v: p.v,
      ...(p.c ? { c: p.c } : {}),
      ...(p.p != null ? { p: Math.round(p.p * 1e4) / 1e4 } : {}),
      ...(st && p.s ? { cost: Math.round((st.costTotal / p.s) * 1e4) / 1e4 } : {}),
      ...(st?.partial ? { costPartial: true } : {}),
      ...(st ? { since: st.since } : {}),
      ...(st && st.streak >= 2 ? { streak: st.streak } : {}),
    };
  });
}

// Holding period, turnover and long-held share, from the same walk
function styleStats(h: ManagerHistoryJson): Pick<ManagerSummary, "avgHold" | "holdCapped" | "turnover" | "longHeld"> {
  const q = h.quarters[0];
  if (!q.total) return {};
  const stats = positionStats(h);
  let avgHold = 0;
  let longHeld = 0;
  let holdCapped = false;
  for (const p of longPositions(h)) {
    const st = stats.get(p.k);
    if (!st) continue;
    const w = p.v / q.total;
    const quarters = st.sinceIdx + 1;
    avgHold += w * quarters;
    if (quarters >= 20) longHeld += w;
    if (st.partial) holdCapped = true;
  }
  const recent = h.quarters.slice(0, 4).map((qq, i) => {
    const prev = h.quarters[i + 1];
    if (!prev) return null;
    const moves = [...qq.positions, ...qq.sold].filter((p) => p.c && !p.k.includes("|"));
    return moves.reduce((sum, p) => sum + Math.abs(portfolioImpact(p, qq, prev)), 0) / 2;
  }).filter((x): x is number => x != null);
  return {
    avgHold: Math.round(avgHold * 10) / 10,
    ...(holdCapped ? { holdCapped } : {}),
    ...(recent.length ? { turnover: Math.round((recent.reduce((a, b) => a + b, 0) / recent.length) * 1e4) / 1e4 } : {}),
    longHeld: Math.round(longHeld * 1e4) / 1e4,
  };
}

/* ── Cross-manager stats (after quotes) ────────────────────── */

function lookThrough(positions: LatestPosition[], latest: LatestHoldingsJson): ManagerSummary["lookThrough"] {
  let earnings = 0;
  let dividends = 0;
  let covered = 0;
  let coveredValue = 0;
  for (const p of positions) {
    const t = latest.securities[p.k]?.t;
    const q = t ? latest.quotes[t] : undefined;
    if (!q) continue;
    if (q.dps) dividends += p.s * q.dps;
    // EPS outside ±(price) is almost always a units/currency artifact
    if (q.eps == null || Math.abs(q.eps) > q.price) continue;
    earnings += p.s * q.eps;
    covered += p.w;
    coveredValue += p.s * q.price;
  }
  if (!covered) return undefined;
  return {
    earnings: Math.round(earnings),
    pe: earnings > 0 ? Math.round((coveredValue / earnings) * 10) / 10 : null,
    dividends: Math.round(dividends),
    coverage: Math.round(covered * 1e3) / 1e3,
  };
}

/**
 * Cosine similarity of issuer-level weights (share classes merged), top 3
 * neighbours per manager, plus a 2-D layout by classical MDS on 1 − cosine.
 */
function similarity(summaries: ManagerSummary[], latest: LatestHoldingsJson) {
  const vecs = summaries.map((m) => {
    const v = new Map<string, number>();
    for (const p of latest.holdings[m.id] ?? []) {
      const key = issuerKey(p.k, latest.securities[p.k]);
      v.set(key, (v.get(key) ?? 0) + p.w);
    }
    return v;
  });
  const norm = vecs.map((v) => Math.sqrt([...v.values()].reduce((s, x) => s + x * x, 0)) || 1);
  const n = vecs.length;
  const sim: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let dot = 0;
      const [a, b] = vecs[i].size < vecs[j].size ? [vecs[i], vecs[j]] : [vecs[j], vecs[i]];
      for (const [k, x] of a) dot += x * (b.get(k) ?? 0);
      sim[i][j] = sim[j][i] = dot / (norm[i] * norm[j]);
    }
  }
  summaries.forEach((m, i) => {
    m.similar = summaries
      .map((o, j) => ({ id: o.id, score: Math.round(sim[i][j] * 1000) / 1000 }))
      .filter((x, j) => j !== i && x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  });
  // Classical MDS: double-centre squared distances, top-2 eigenvectors by
  // power iteration with deflation
  const D2 = sim.map((row) => row.map((x) => (1 - x) ** 2));
  const rowMean = D2.map((r) => r.reduce((a, b) => a + b, 0) / n);
  const all = rowMean.reduce((a, b) => a + b, 0) / n;
  const B = D2.map((r, i) => r.map((x, j) => -0.5 * (x - rowMean[i] - rowMean[j] + all)));
  const coords: number[][] = [];
  for (let d = 0; d < 2; d++) {
    let v = Array.from({ length: n }, (_, i) => Math.sin(i + 1 + d));
    let lambda = 0;
    for (let it = 0; it < 300; it++) {
      const w = B.map((r) => r.reduce((s, x, j) => s + x * v[j], 0));
      lambda = Math.sqrt(w.reduce((s, x) => s + x * x, 0)) || 1;
      v = w.map((x) => x / lambda);
    }
    coords.push(v.map((x) => x * Math.sqrt(lambda)));
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) B[i][j] -= lambda * v[i] * v[j];
  }
  summaries.forEach((m, i) => {
    m.xy = [Math.round(coords[0][i] * 1e4) / 1e4, Math.round(coords[1][i] * 1e4) / 1e4];
  });
}

const startedAt = Date.now();

async function main() {
  const started = startedAt;
  const only = process.env.ONLY?.split(","); // e.g. ONLY=buffett,akre for a quick partial run
  const list = only ? MANAGERS.filter((m) => only.includes(m.id)) : MANAGERS;
  console.log(`Refreshing 13F holdings for ${list.length} managers\n`);
  const cache = readJson<Record<string, string>>(TICKER_CACHE, {});
  const misses = readJson<Record<string, string>>(MISS_CACHE, {});
  // N-PORT's own ticker for ISIN-keyed and non-USD holdings. Kept out of
  // OpenFIGI/name matching, which only know US listings (name matching would
  // map Coca-Cola Icecek to KO).
  const hints = new Map<string, string | null>();
  const tickerOf = (c: string) =>
    c in CUSIP_OVERRIDES ? CUSIP_OVERRIDES[c] : hints.has(c) ? hints.get(c)! : (cache[c] ?? null);
  const summaries: ManagerSummary[] = [];
  const latest: LatestHoldingsJson = { updated: today(), securities: {}, holdings: {}, quotes: {} };
  const failed: string[] = [];
  const events: EventsJson = {};
  await loadSecCompanies(); // display names

  // Pass 1: load every manager's quarters (filings are cached on disk) and
  // gather all spellings of each CUSIP, so tickers resolve once with every
  // filer's name variant before any output is built
  const loaded = new Map<string, Quarter[]>();
  const spellings = new Map<string, string[]>();
  for (const m of list) {
    process.stdout.write(`${m.name}${m.firm ? ` (${m.firm})` : ""}\n`);
    try {
      const quarters = await loadQuarters(m);
      loaded.set(m.id, quarters);
      for (const q of quarters) {
        for (const r of q.positions.values()) {
          // ISIN-keyed (no CUSIP) or a non-US listing (TAVHL.IS)
          if (m.nport && (r.cusip.length === 12 || r.ticker?.includes("."))) {
            hints.set(r.cusip, r.ticker ?? null);
            continue;
          }
          const names = spellings.get(r.cusip) ?? [];
          if (!names.includes(r.issuer)) names.push(r.issuer);
          spellings.set(r.cusip, names);
        }
      }
    } catch (err) {
      console.log(`  FAILED: ${(err as Error).message}`);
      failed.push(m.id);
    }
  }
  await resolveTickers(spellings, cache, misses);

  // Pass 2: build outputs
  for (const m of list) {
    const quarters = loaded.get(m.id);
    if (!quarters) continue;
    try {
      const history = await buildHistory(m, quarters, tickerOf);
      saveSplitCache();
      writeIfChanged(join(process.cwd(), "public", "superinvestors", `${m.id}.json`), history);
      const summary = buildSummary(m, history);
      summaries.push(summary);
      latest.holdings[m.id] = buildLatest(history);
      collectEvents(m, history, events);
      for (const p of latest.holdings[m.id]) {
        const s = history.securities[p.k];
        latest.securities[p.k] ??= { t: s.t, d: s.d };
      }

      const unmapped = latest.holdings[m.id].filter((p) => !history.securities[p.k].t);
      console.log(
        `${m.name}: ${quarters.length} quarters (${summary.firstPeriod} → ${summary.period}), ` +
          `${summary.positions} positions, ${fmtB(summary.totalValue)}` +
          (unmapped.length ? `, ${unmapped.length} current without ticker` : "")
      );
      if (m.favorite) for (const p of unmapped) console.log(`  unresolved: ${p.k} ${history.securities[p.k].n}`);
    } catch (err) {
      console.log(`  FAILED: ${(err as Error).message}`);
      failed.push(m.id);
    }
  }

  // Managers not refreshed this run (failed, or outside ONLY=) keep their
  // last good data instead of vanishing from the site
  const indexPath = join(process.cwd(), "public", "superinvestors.json");
  const latestPath = join(process.cwd(), "public", "superinvestors", "latest.json");
  const prevIndex = readJson<SuperinvestorsJson | null>(indexPath, null);
  const prevLatest = readJson<LatestHoldingsJson | null>(latestPath, null);
  const fresh = new Set(summaries.map((s) => s.id));
  for (const m of MANAGERS) {
    const prev = prevIndex?.managers.find((x) => x.id === m.id);
    const holdings = prevLatest?.holdings[m.id];
    if (fresh.has(m.id) || !prev || !holdings) continue;
    // Config may have changed since (e.g. favorites)
    summaries.push({ ...prev, name: m.name, firm: m.firm, favorite: !!m.favorite });
    latest.holdings[m.id] = holdings;
    for (const p of holdings) latest.securities[p.k] ??= prevLatest!.securities[p.k];
  }
  const order = new Map(MANAGERS.map((m, i) => [m.id, i]));
  summaries.sort((a, b) => order.get(a.id)! - order.get(b.id)!);

  const tickers = [...new Set(Object.values(latest.securities).map((s) => s.t).filter((t): t is string => !!t))];
  latest.quotes = await fetchQuotes(tickers);
  for (const m of summaries) {
    const lt = lookThrough(latest.holdings[m.id] ?? [], latest);
    if (lt) m.lookThrough = lt;
  }
  similarity(summaries, latest);
  latest.securities = sortKeys(latest.securities);
  console.log(`\nQuotes: ${Object.keys(latest.quotes).length} of ${tickers.length} tickers`);
  latest.splits = await splitsSinceFiling(latest, summaries);
  saveSplitCache();
  console.log(`Splits since quarter end: ${Object.keys(latest.splits).join(", ") || "none"}`);

  const index: SuperinvestorsJson = { updated: today(), managers: summaries, failed };
  writeJson(indexPath, index);
  writeJson(latestPath, latest);
  // Partial runs (ONLY=) would drop other managers' events — full runs only
  if (!only) {
    // Sharded by the CUSIP's first character (~60KB each) so a stock page
    // loads one small file, not all 2MB
    const shards: Record<string, EventsJson> = {};
    for (const [key, list] of Object.entries(events)) {
      list.sort((x, y) => x[0].localeCompare(y[0]));
      (shards[key[0]] ??= {})[key] = list;
    }
    for (const [c, shard] of Object.entries(shards)) {
      writeIfChanged(join(process.cwd(), "public", "superinvestors", "events", `${c}.json`), sortKeys(shard));
    }
  }
  console.log(`Wrote ${summaries.length} managers to public/superinvestors.json + public/superinvestors/`);
  if (failed.length) console.log(`Failed: ${failed.join(", ")}`);
  recordStatus("refresh-13f", started, !failed.length, `${summaries.length} managers${failed.length ? `, failed: ${failed.join(", ")}` : ""}`);
}

/**
 * Splits after a holder's quarter end, so "± reported price" compares like
 * with like (APH 2-for-1 on 2026-09-03 otherwise reads as -50%). Only
 * positions whose current price is far from the reported one are checked —
 * a split is the usual reason, and that keeps Yahoo lookups to a handful.
 */
async function splitsSinceFiling(latest: LatestHoldingsJson, summaries: ManagerSummary[]) {
  const period = new Map(summaries.map((s) => [s.id, s.period]));
  const since = new Map<string, string>(); // ticker → earliest holder period
  for (const [id, positions] of Object.entries(latest.holdings)) {
    for (const p of positions) {
      const t = latest.securities[p.k]?.t;
      const quote = t ? latest.quotes[t] : undefined;
      if (!t || !quote || !p.s || !p.v) continue;
      const ratio = quote.price / (p.v / p.s);
      if (ratio > 0.6 && ratio < 1.7) continue;
      const from = period.get(id)!;
      if (!since.has(t) || from < since.get(t)!) since.set(t, from);
    }
  }
  const out: NonNullable<LatestHoldingsJson["splits"]> = {};
  for (const [t, from] of [...since].sort()) {
    const splits = (await splitsFor(t, today()))?.filter((s) => s.date > from);
    if (splits?.length) out[t] = splits;
  }
  return out;
}

function today() {
  return new Date().toISOString().split("T")[0];
}

function fmtB(n: number) {
  return n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : `$${(n / 1e6).toFixed(0)}M`;
}

function writeIfChanged(path: string, data: unknown) {
  const next = JSON.stringify(data);
  if (existsSync(path) && readFileSync(path, "utf8") === next) return;
  writeJson(path, data);
}

main().catch((err) => {
  console.error("Error:", err.message);
  recordStatus("refresh-13f", startedAt, false, err.message);
  process.exit(1);
});

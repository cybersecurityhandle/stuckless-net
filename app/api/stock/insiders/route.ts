import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { dedupe, insiderBuy, readForm4 } from "@/lib/form4";
import type { CompanyInsiderBuy, CompanyInsidersJson, InsiderBuy } from "@/lib/insiders";

export const runtime = "nodejs";
export const maxDuration = 120;

// One company's open-market insider purchases over the last YEARS, from its
// own EDGAR filing list. The list doesn't say which Form 4s are purchases
// (most are grants, vesting and tax withholding), so every one is fetched
// once; each parse is kept in Redis for good (filings never change) and later
// lookups only fetch new filings. A big filer (~150 Form 4s) takes ~20s cold.

const VERSION = "1"; // bump on any parsing change: invalidates both caches
const YEARS = 2;
const SEC_HEADERS = { "User-Agent": "stuckless.net admin@stuckless.net" };
const SEC_INTERVAL_MS = 125; // ≤ 8 req/s per instance (SEC limit is 10)
const WORKERS = 4;
const BUDGET_MS = 90_000; // stop fetching here; the rest is picked up next time
const PAYLOAD_TTL_S = 12 * 3600;
const FILINGS_TTL_S = 180 * 86400; // refreshed on every write

/* eslint-disable @typescript-eslint/no-explicit-any */

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const isoDate = (d: Date) => d.toISOString().split("T")[0];

let nextSlot = 0;

// Rate limit shared by the workers (and concurrent requests on this instance)
async function sec(url: string): Promise<Response | null> {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + SEC_INTERVAL_MS;
  await sleep(wait);
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: SEC_HEADERS, signal: AbortSignal.timeout(20_000) }).catch(() => null);
    // EDGAR answers 403 (not 404) for some missing archive paths
    if (res?.status === 404 || res?.status === 403) return null;
    if (res?.ok) return res;
    await sleep(1500 * (attempt + 1)); // 429 / 5xx / network
  }
  throw new Error(`failed: ${url}`);
}

let cikByTicker: Map<string, number> | null = null;

async function tickerCik(ticker: string): Promise<number | null> {
  if (!cikByTicker) {
    const res = await sec("https://www.sec.gov/files/company_tickers.json");
    if (!res) return null;
    cikByTicker = new Map();
    for (const e of Object.values(await res.json()) as { cik_str: number; ticker: string }[]) {
      cikByTicker.set(e.ticker.toUpperCase(), e.cik_str);
    }
  }
  return cikByTicker.get(ticker) ?? cikByTicker.get(ticker.replace(/-/g, "")) ?? null;
}

interface Filing {
  accession: string;
  filed: string;
  doc: string; // archive URL of the bare XML (or full submission)
}

// Form 4s in the company's filing list since `from`. The list also carries
// filings where this CIK is the reporting owner (Berkshire buying OXY) —
// those are dropped after parsing, by issuer CIK.
async function form4Filings(cik: number, from: string): Promise<Filing[]> {
  const pad = String(cik).padStart(10, "0");
  const sub: any = await (await sec(`https://data.sec.gov/submissions/CIK${pad}.json`))?.json();
  if (!sub) return [];
  const pages: any[] = [sub.filings?.recent];
  // Heavy filers (banks) overflow `recent` within a year
  for (const f of sub.filings?.files ?? []) {
    if (f.filingTo >= from) pages.push(await (await sec(`https://data.sec.gov/submissions/${f.name}`))?.json());
  }
  const out: Filing[] = [];
  for (const p of pages) {
    if (!p?.form) continue;
    for (let i = 0; i < p.form.length; i++) {
      if (p.form[i] !== "4" || p.filingDate[i] < from) continue;
      const accession: string = p.accessionNumber[i];
      const base = `https://www.sec.gov/Archives/edgar/data/${cik}/${accession.replace(/-/g, "")}`;
      // primaryDocument is the XSL-rendered view ("xslF345X06/form4.xml");
      // the raw XML sits beside it without the folder
      const primary: string = p.primaryDocument[i] ?? "";
      const doc = primary.endsWith(".xml") ? `${base}/${primary.split("/").pop()}` : `${base}/${accession}.txt`;
      out.push({ accession, filed: p.filingDate[i], doc });
    }
  }
  return [...new Map(out.map((f) => [f.accession, f])).values()];
}

// Daily adjusted closes (splits and dividends), oldest first
async function adjCloses(ticker: string, from: string): Promise<[string, number][]> {
  try {
    const { default: YahooFinance } = await import("yahoo-finance2");
    const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
    const chart: any = await yahooFinance.chart(ticker, { period1: from, interval: "1d" });
    return (chart.quotes ?? [])
      .map((q: any) => [isoDate(new Date(q.date)), q.adjclose ?? q.close ?? 0] as [string, number])
      .filter(([, c]: [string, number]) => c > 0);
  } catch {
    return [];
  }
}

function returnSince(closes: [string, number][], date: string): number | null {
  const base = closes.find(([d]) => d >= date)?.[1];
  const last = closes[closes.length - 1]?.[1];
  return base && last ? Math.round((last / base - 1) * 1e4) / 1e4 : null;
}

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker")?.trim().toUpperCase().replace(/\./g, "-");
  if (!ticker) return NextResponse.json({ error: "Provide ?ticker=" }, { status: 400 });

  const started = Date.now();
  const redis = getRedis();
  const payloadKey = `insiders:${VERSION}:${ticker}`;
  if (redis) {
    try {
      const cached = await redis.get(payloadKey);
      if (cached) {
        return NextResponse.json(typeof cached === "string" ? JSON.parse(cached) : cached, {
          headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=43200" },
        });
      }
    } catch {
      // fall through to a live build
    }
  }

  try {
    const cik = await tickerCik(ticker);
    if (!cik) return NextResponse.json({ error: `${ticker} isn't an SEC filer` }, { status: 404 });

    const to = isoDate(new Date());
    const fromDate = new Date();
    fromDate.setUTCFullYear(fromDate.getUTCFullYear() - YEARS);
    const from = isoDate(fromDate);

    // accession → this issuer's purchase row, or null (no purchase / not the issuer)
    const filingsKey = `insiders:${VERSION}:f4:${cik}`;
    const known = new Map<string, InsiderBuy | null>();
    if (redis) {
      try {
        const h = (await redis.hgetall(filingsKey)) ?? {};
        for (const [acc, v] of Object.entries(h)) {
          const parsed = typeof v === "string" ? JSON.parse(v) : v;
          known.set(acc, (parsed as { b: InsiderBuy | null }).b);
        }
      } catch {
        // start cold
      }
    }

    const filings = await form4Filings(cik, from);
    const todo = filings.filter((f) => !known.has(f.accession));
    const fresh: Record<string, string> = {};
    let pending = 0;
    await Promise.all(
      Array.from({ length: WORKERS }, async () => {
        for (let f = todo.pop(); f; f = todo.pop()) {
          if (Date.now() - started > BUDGET_MS) {
            pending++;
            continue;
          }
          try {
            const txt = await (await sec(f.doc))?.text();
            if (!txt) {
              pending++;
              continue;
            }
            const form = readForm4(txt);
            const buy = form && form.issuerCik === cik ? insiderBuy(form, f.accession, f.filed) : null;
            known.set(f.accession, buy);
            fresh[f.accession] = JSON.stringify({ b: buy });
          } catch {
            pending++;
          }
        }
      })
    );
    if (redis && Object.keys(fresh).length) {
      try {
        await redis.hset(filingsKey, fresh);
        await redis.expire(filingsKey, FILINGS_TTL_S);
      } catch {
        // next request refetches them
      }
    }

    const inWindow = new Set(filings.map((f) => f.accession));
    const buys = dedupe(
      [...known].filter(([acc, b]) => b && inWindow.has(acc)).map(([, b]) => b!)
    ).sort((a, b) => b.lastTrade.localeCompare(a.lastTrade) || b.value - a.value);

    const closes = buys.length ? await adjCloses(ticker, buys[buys.length - 1].firstTrade) : [];
    const payload: CompanyInsidersJson = {
      ticker,
      cik,
      from,
      to,
      form4s: filings.length,
      pending,
      buys: buys.map((b): CompanyInsiderBuy => ({ ...b, ret: returnSince(closes, b.lastTrade) })),
    };

    if (redis && !pending) {
      try {
        await redis.set(payloadKey, JSON.stringify(payload), { ex: PAYLOAD_TTL_S });
      } catch {
        // uncached is fine
      }
    }
    return NextResponse.json(payload, {
      headers: { "Cache-Control": pending ? "no-store" : "public, s-maxage=3600, stale-while-revalidate=43200" },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "SEC request failed" }, { status: 502 });
  }
}

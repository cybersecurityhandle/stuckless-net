/**
 * Refresh TSS acquisitions for /topicus. Total Specific Solutions, the
 * Topicus.com operating group that does most of its buying, announces each
 * deal on its site; its "transaction updates" list goes back to 2016. One
 * page per year, ~12 requests. Writes public/topicus/tss.json.
 *
 * Company names come from the announcement wording ("TSS has acquired X",
 * "X ... has joined TSS"); entries that aren't acquisitions are dropped. The
 * headline is kept so a mis-parsed name can be checked against it.
 *
 * Usage: npm run refresh-tss
 */

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { recordStatus } from "./status";

const BASE = "https://totalspecificsolutions.com/about-us/transaction-updates";
const FIRST_YEAR = 2016;
const HEADERS = { "User-Agent": "stuckless.net (+https://stuckless.net)" };

export interface TssDeal {
  id: number; // the site's transaction id
  company: string;
  date: string; // YYYY-MM-DD
  country: string | null;
  title: string; // headline as published
  url: string;
}

const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

function text(s: string) {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&#8217;|&rsquo;/g, "’")
    .replace(/&#8220;|&#8221;|&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&#8211;|&#8212;|&ndash;|&mdash;/g, "–")
    .replace(/&nbsp;|&bull;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// "Nov 02, 2026" → 2026-11-02
function isoDate(s: string): string | null {
  const m = s.match(/([A-Z][a-z]{2})\w* (\d{1,2}), (\d{4})/);
  return m && MONTHS[m[1]] ? `${m[3]}-${MONTHS[m[1]]}-${m[2].padStart(2, "0")}` : null;
}

// "Total Specific Solutions", "TSS DACH", "Groupe TSS", "Total Specific Solutions in the United Kingdom"
const TSS = String.raw`(?:Groupe\s+)?(?:Total Specific Solutions?|TSS)(?:\s*\([^)]*\))?(?:\s+(?:in\s+)?(?:the\s+)?[A-Z][A-Za-z]+(?: [A-Z][a-z]+)?)?`;
const END = String.raw`(?=,|\.(?:\s|$)|\s+(?:in|from|to|with)\s|$)`;
const PATTERNS = [
  // "TSS has acquired X", "TSS completes the acquisition of X", "TSS acquires a controlling stake in X"
  new RegExp(String.raw`${TSS}\s+(?:has\s+)?(?:acquired|acquires|completes the acquisition of|completed the acquisition of|acquires a controlling stake in)\s+(.+?)${END}`),
  // "X, the ... provider, has joined TSS", "X and Y have joined TSS Spain"
  new RegExp(String.raw`^(.+?)(?:,\s[^,]+,)?\s+(?:has\s+joined|have\s+joined|joins|join|becomes? part of|is now part of)\s+(?:the\s+)?${TSS}`),
  // a TSS company buying: "FDT-System AB, a TSS company, acquires X from Y"
  /\bacquires\s+(?:the\s+)?(.+?)\s+from\s/,
  new RegExp(String.raw`\bhas acquired\s+(?:the\s+)?(.+?)${END}`),
  // "TSS expands its presence in Germany with the acquisition of X"
  new RegExp(String.raw`\bacquisition of\s+(?:the\s+)?(.+?)${END}`),
  // "TSS ... enters the educational vertical with ergovia"
  /\bwith\s+([A-Za-z0-9][\w.&’'-]*(?: [A-Z][\w.&’'-]*){0,3})$/,
];

// Headlines no rule reads right. Name, or null for updates that aren't
// acquisitions. Check new "skipped" lines after each run and add here.
const OVERRIDES: Record<number, string | null> = {
  1: "Kred’it",
  3: "Vicrea",
  4: "Stadsbeheer",
  6: "Dirict",
  15: "ProImpact",
  24: "Emergo Systems",
  46: "Square Information Solutions",
  47: "Salvia Group",
  73: null, // intention only; completed as 76
  76: "Simple SA",
  81: "A.P. System",
  95: null, // tender offer; completed as 102
  96: "Rohde & Schwarz Cybersecurity France",
  102: "Sygnity", // majority stake, consolidated; the stake is also listed separately
  103: "WEBCentric (Price2Spy)",
  142: "Procomp logistics software",
  151: "ICR Evolution & trueIT Systems",
  153: "Hachmeister + Partner",
  154: "iSOFT Nederland & ExpertDoc",
  157: null, // Asseco shares — a stake, listed separately
  163: "Placewise",
  173: "Sobis AP",
  181: "EBG Data",
};

// "the Dutch software company Desyde" → "Desyde"; "business unit Star IMT" → "Star IMT"
function stripDescriptor(name: string) {
  const m = name.match(/^(?:the\s+|a\s+|an\s+)?(?:[\w()&./’'-]+\s+){0,9}?(?:company|provider|vendor|supplier|specialist|developer|leader|firm|business unit|house|platform)\s+(?:of\s+)?(?=[A-Za-z0-9])(.+)$/);
  return (m ? m[1] : name).replace(/^(?:the|a|an)\s+/i, "").trim();
}

const NOT_A_DEAL = /year in review|refinanc|webinar|overview|acquisition update|spin-out|intended combination|five years of|tender offer/i;

function companyName(title: string, desc: string): string | null {
  if (NOT_A_DEAL.test(title)) return null;
  for (const src of [title, desc]) {
    const s = src.replace(/[“”"‘]/g, "");
    for (const re of PATTERNS) {
      const raw = s.match(re)?.[1]?.trim();
      if (!raw) continue;
      const name = stripDescriptor(raw);
      // A lowercase start means no name was given ("the logistic planning solution ...")
      if (name.length <= 60 && /^[A-Za-z0-9]/.test(name) && !/^(?:the|a|an|its|their)\b/.test(name) && !/^(?:Its|Their|Several|Two|Three)\b/.test(name)) return name;
    }
  }
  return null;
}

async function main() {
  const started = Date.now();
  const deals = new Map<number, TssDeal>();
  const skipped: string[] = [];
  for (let year = new Date().getFullYear(); year >= FIRST_YEAR; year--) {
    const res = await fetch(`${BASE}?tyear=${year}`, { headers: HEADERS, redirect: "follow", signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`${res.status} for ${year}`);
    const html = await res.text();
    for (const [, item] of html.matchAll(/<li class="list">([\s\S]*?)<\/li>\s*(?=<li class="list">|<\/ul>)/g)) {
      const id = Number(item.match(/tid=(\d+)/)?.[1]);
      if (!id || deals.has(id)) continue;
      const title = text(item.match(/<span class="title">([\s\S]*?)<\/span>/)?.[1] ?? "");
      const desc = text(item.match(/<span class="desc">([\s\S]*?)<\/span>/)?.[1] ?? "");
      const bottom = text(item.match(/<span class="bottom[^"]*">([\s\S]*)/)?.[1] ?? "");
      const date = isoDate(bottom);
      const company = id in OVERRIDES ? OVERRIDES[id] : companyName(title, desc);
      if (!company || !date) {
        skipped.push(`${id}: ${title}`);
        continue;
      }
      // "Nov 02, 2026 • Sweden" — the country follows the date
      const country = bottom.replace(/^[A-Z][a-z]+ \d{1,2}, \d{4}\s*/, "").trim().split(/\s{2,}|\s+Read more/)[0] || null;
      deals.set(id, { id, company, date, country, title, url: `${BASE}?tid=${id}` });
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  const list = [...deals.values()].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const out = join(process.cwd(), "public", "topicus", "tss.json");
  mkdirSync(join(out, ".."), { recursive: true });
  writeFileSync(out, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), source: BASE, deals: list }, null, 1) + "\n");
  console.log(`${list.length} TSS acquisitions, ${skipped.length} other updates skipped`);
  for (const s of skipped) console.log(`  skipped ${s}`);
  recordStatus("refresh-tss", started, true, `${list.length} TSS acquisitions`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});

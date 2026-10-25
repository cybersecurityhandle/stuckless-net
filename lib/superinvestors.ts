/**
 * Superinvestor 13F tracking — manager list and the shape of the JSON files
 * written by scripts/refresh-13f.ts:
 *   public/superinvestors.json            index of all managers (small)
 *   public/superinvestors/latest.json     everyone's latest holdings, compact,
 *                                         plus current quotes
 *   public/superinvestors/{id}.json       full quarterly history, one manager
 */

export interface Manager {
  id: string;
  name: string; // person, or the firm when Dataroma lists no person
  firm: string; // "" when name is already the firm
  ciks: number[]; // every CIK that has filed this portfolio's 13F-HR, current first
  favorite?: boolean; // "my picks" — pinned in the UI and the default consensus
}

// Dataroma's manager list (Oct 2026) plus Katsenelson, CIKs matched by hand
// against EDGAR. Multiple CIKs = the filer entity changed:
// - Einhorn: Greenlight Capital Inc (1079114) through Q4 2023, then DME
//   Capital Management (1489933), which had only filed 13F-NT until then.
// - Pershing Square: the new Pershing Square Inc. (2026053) files the same
//   portfolio as Pershing Square Capital Management (1336528) from Q2 2025.
// - Spier moved Aquamarine to Zurich (1953324) from Q3 2022.
// - Ruane Cunniff, Appaloosa: reorganized into new LPs in 2018 / 2016.
// - Pabrai files as Dalal Street (1549575); "PABRAI MOHNISH" stopped in 2011.
// Not trackable: Ted Weschler (inside Berkshire's 13F); Todd Combs (left
// Berkshire Dec 2025 for JPMorgan's balance-sheet investment group).
export const MANAGERS: Manager[] = [
  { id: "abrams-bison-investments", name: "Abrams Bison Investments", firm: "", ciks: [1317588] },
  { id: "ako-capital", name: "AKO Capital", firm: "", ciks: [1376879] },
  { id: "alex-roepers", name: "Alex Roepers", firm: "Atlantic Investment Management", ciks: [1063296] },
  { id: "altarock-partners", name: "AltaRock Partners", firm: "", ciks: [1631014] },
  { id: "arnold-van-den-berg", name: "Arnold Van Den Berg", firm: "Century Management", ciks: [1142062] },
  { id: "bill-melinda-gates-foundation-trust", name: "Bill & Melinda Gates Foundation Trust", firm: "", ciks: [1166559] },
  { id: "bill-ackman", name: "Bill Ackman", firm: "Pershing Square Capital Management", ciks: [2026053, 1336528] },
  { id: "bill-miller", name: "Bill Miller", firm: "Miller Value Partners", ciks: [1135778] },
  { id: "bill-nygren", name: "Bill Nygren", firm: "Oakmark Funds", ciks: [813917] },
  { id: "bruce-berkowitz", name: "Bruce Berkowitz", firm: "Fairholme Capital", ciks: [1056831] },
  { id: "bryan-lawrence", name: "Bryan Lawrence", firm: "Oakcliff Capital", ciks: [1657335] },
  { id: "carl-icahn", name: "Carl Icahn", firm: "Icahn Capital Management", ciks: [921669] },
  { id: "chase-coleman", name: "Chase Coleman", firm: "Tiger Global Management", ciks: [1167483] },
  { id: "chris-hohn", name: "Chris Hohn", firm: "TCI Fund Management", ciks: [1647251] },
  { id: "bloomstran", name: "Christopher Bloomstran", firm: "Semper Augustus", ciks: [1115373], favorite: true },
  { id: "christopher-davis", name: "Christopher Davis", firm: "Davis Advisors", ciks: [1036325] },
  { id: "akre", name: "Chuck Akre", firm: "Akre Capital Management", ciks: [1112520], favorite: true },
  { id: "clifford-sosin", name: "Clifford Sosin", firm: "CAS Investment Partners", ciks: [1697591] },
  { id: "daniel-loeb", name: "Daniel Loeb", firm: "Third Point", ciks: [1040273] },
  { id: "david-abrams", name: "David Abrams", firm: "Abrams Capital Management", ciks: [1358706] },
  { id: "einhorn", name: "David Einhorn", firm: "Greenlight Capital", ciks: [1489933, 1079114], favorite: true },
  { id: "david-katz", name: "David Katz", firm: "Matrix Asset Advisors", ciks: [1016287] },
  { id: "david-rolfe", name: "David Rolfe", firm: "Wedgewood Partners", ciks: [859804] },
  { id: "david-tepper", name: "David Tepper", firm: "Appaloosa Management", ciks: [1656456, 1006438] },
  { id: "dennis-hong", name: "Dennis Hong", firm: "ShawSpring Partners", ciks: [1766908] },
  { id: "dodge-cox-funds", name: "Dodge & Cox Funds", firm: "", ciks: [200217] },
  { id: "duan-yongping", name: "Duan Yongping", firm: "H&H International Investment", ciks: [1759760] },
  { id: "first-eagle-investment-management", name: "First Eagle Investment Management", firm: "", ciks: [1325447] },
  { id: "first-pacific-advisors", name: "First Pacific Advisors", firm: "", ciks: [1377581] },
  { id: "francis-chou", name: "Francis Chou", firm: "Chou Associates", ciks: [1389403] },
  { id: "francois-rochon", name: "Francois Rochon", firm: "Giverny Capital", ciks: [1641864] },
  { id: "glenn-greenberg", name: "Glenn Greenberg", firm: "Brave Warrior Advisors", ciks: [1553733] },
  { id: "glenn-welling", name: "Glenn Welling", firm: "Engaged Capital", ciks: [1559771] },
  { id: "greenhaven-associates", name: "Greenhaven Associates", firm: "", ciks: [846222] },
  { id: "greg-alexander", name: "Greg Alexander", firm: "Conifer Management", ciks: [1773994] },
  { id: "guy-spier", name: "Guy Spier", firm: "Aquamarine Capital", ciks: [1953324, 1404599] },
  { id: "harry-burn", name: "Harry Burn", firm: "Sound Shore", ciks: [820124] },
  { id: "henry-ellenbogen", name: "Henry Ellenbogen", firm: "Durable Capital Partners", ciks: [1798849] },
  { id: "hillman-capital-management", name: "Hillman Capital Management", firm: "", ciks: [1314620] },
  { id: "howard-marks", name: "Howard Marks", firm: "Oaktree Capital Management", ciks: [949509] },
  { id: "jensen-investment-management", name: "Jensen Investment Management", firm: "", ciks: [1106129] },
  { id: "john-armitage", name: "John Armitage", firm: "Egerton Capital", ciks: [1581811] },
  { id: "john-rogers", name: "John Rogers", firm: "Ariel Investments", ciks: [936753] },
  { id: "josh-tarasoff", name: "Josh Tarasoff", firm: "Greenlea Lane Capital", ciks: [1766504] },
  { id: "kahn-brothers-group", name: "Kahn Brothers Group", firm: "", ciks: [1039565] },
  { id: "lee-ainslie", name: "Lee Ainslie", firm: "Maverick Capital", ciks: [934639] },
  { id: "leon-cooperman", name: "Leon Cooperman", firm: "", ciks: [898382] },
  { id: "lilu", name: "Li Lu", firm: "Himalaya Capital Management", ciks: [1709323], favorite: true },
  { id: "lindsell-train", name: "Lindsell Train", firm: "", ciks: [1484150] },
  { id: "mairs-power-funds", name: "Mairs & Power Funds", firm: "", ciks: [1070134] },
  { id: "mason-hawkins", name: "Mason Hawkins", firm: "Southeastern Asset Management", ciks: [807985] },
  { id: "pabrai", name: "Mohnish Pabrai", firm: "Pabrai Investments", ciks: [1549575], favorite: true },
  { id: "muhlenkamp", name: "Muhlenkamp", firm: "", ciks: [1133219] },
  { id: "nelson-peltz", name: "Nelson Peltz", firm: "Trian Fund Management", ciks: [1345471] },
  { id: "norbert-lou", name: "Norbert Lou", firm: "Punch Card Management", ciks: [1631664] },
  { id: "pat-dorsey", name: "Pat Dorsey", firm: "Dorsey Asset Management", ciks: [1671657] },
  { id: "polen-capital-management", name: "Polen Capital Management", firm: "", ciks: [1034524] },
  { id: "watsa", name: "Prem Watsa", firm: "Fairfax Financial Holdings", ciks: [915191], favorite: true },
  { id: "richard-pzena", name: "Richard Pzena", firm: "Pzena Investment Management", ciks: [1027796] },
  { id: "robert-vinall", name: "Robert Vinall", firm: "RV Capital GmbH", ciks: [1766596] },
  { id: "ruane-cunniff-lp", name: "Ruane Cunniff LP", firm: "", ciks: [1720792, 728014] },
  { id: "samantha-mclemore", name: "Samantha McLemore", firm: "Patient Capital Management", ciks: [1854794] },
  { id: "sarah-ketterer", name: "Sarah Ketterer", firm: "Causeway Capital Management", ciks: [1165797] },
  { id: "seth-klarman", name: "Seth Klarman", firm: "Baupost Group", ciks: [1061768] },
  { id: "stephen-mandel", name: "Stephen Mandel", firm: "Lone Pine Capital", ciks: [1061165] },
  { id: "steven-check", name: "Steven Check", firm: "Check Capital Management", ciks: [1032814] },
  { id: "terry-smith", name: "Terry Smith", firm: "Fundsmith", ciks: [1569205] },
  { id: "third-avenue-management", name: "Third Avenue Management", firm: "", ciks: [1099281] },
  { id: "gayner", name: "Thomas Gayner", firm: "Markel Group", ciks: [1096343], favorite: true },
  { id: "thomas-russo", name: "Thomas Russo", firm: "Gardner Russo & Quinn", ciks: [860643] },
  { id: "tom-bancroft", name: "Tom Bancroft", firm: "Makaira Partners", ciks: [1540866] },
  { id: "torray-funds", name: "Torray Funds", firm: "", ciks: [98758] },
  { id: "triple-frond-partners", name: "Triple Frond Partners", firm: "", ciks: [1454502] },
  { id: "tweedy-browne", name: "Tweedy Browne", firm: "", ciks: [732905] },
  { id: "valley-forge-capital-management", name: "Valley Forge Capital Management", firm: "", ciks: [1697868] },
  { id: "valueact-capital", name: "ValueAct Capital", firm: "", ciks: [1418814] },
  { id: "viking-global-investors", name: "Viking Global Investors", firm: "", ciks: [1103804] },
  { id: "vulcan-value-partners", name: "Vulcan Value Partners", firm: "", ciks: [1556785] },
  { id: "wallace-weitz", name: "Wallace Weitz", firm: "Weitz Investment Management", ciks: [883965] },
  { id: "buffett", name: "Warren Buffett", firm: "Berkshire Hathaway", ciks: [1067983], favorite: true },
  { id: "william-von-mueffling", name: "William Von Mueffling", firm: "Cantillon Capital Management", ciks: [1279936] },
  { id: "yacktman-asset-management", name: "Yacktman Asset Management", firm: "", ciks: [905567] },
  { id: "katsenelson", name: "Vitaliy Katsenelson", firm: "Investment Management Associates", ciks: [52024], favorite: true },
];

// CUSIPs neither OpenFIGI nor the SEC name match resolves. Ticker in Yahoo
// format, e.g. BRK-B. refresh-13f logs "unresolved:" lines for new ones.
// null = deliberately no ticker (a different security sharing an issuer's
// name, which name matching would otherwise map to the common stock).
export const CUSIP_OVERRIDES: Record<string, string | null> = {
  "30231G102": "XOM", // SEC lists it as ExxonMobil Holdings Corp (new CIK)
  "Y2573F102": "FLEX", // filed under old Flextronics name
  "68634K106": "ORLA", // Orla Mining — not an SEC registrant
  "285512109": "EA", // not in SEC ticker list
  "934423104": "WBD", // not in SEC ticker list
  "489398107": "KW", // not in SEC ticker list
  "530307305": "LBRDK", // Liberty Broadband Series C
  "G4474Y214": "JHG", // Janus Henderson — Jersey CUSIP, NYSE-listed
  "G3421J106": "FERG", // Ferguson plc, now Ferguson Enterprises
  // Class C / class B CUSIPs that name matching mapped to the class A ticker
  "G61188127": "LBTYK", // Liberty Global class C
  "G9001E128": "LILAK", // Liberty Latin America class C
  "38259P706": "GOOG", // pre-2015 Google class C CUSIP, still filed by some
  "08986R101": "BH", // Biglari Holdings class B (~$426, vs BH-A ~$2,100)
};

// Preferred shares filed with a "COM" class title, so the class-title check
// in refresh-13f can't see them. Dataroma counts common stock only; so do we.
export const PREFERRED_CUSIPS = new Set([
  "02079K404", // Alphabet depositary preferred (1/20 share), series A
  "02079K602", // Alphabet depositary preferred, series B
  "42824C208", // HPE 7.625% Series C mandatory convertible preferred
  "48251W500", // KKR 6.25% Series D mandatory convertible preferred
]);

export type ChangeType = "new" | "add" | "reduce" | "sold";

export interface Quote {
  price: number;
  low52: number | null;
  high52: number | null;
}

/* ── superinvestors.json (index) ───────────────── */

export interface ManagerSummary {
  id: string;
  name: string;
  firm: string;
  favorite: boolean;
  cik: number; // filer of the latest quarter
  period: string; // latest quarter end, YYYY-MM-DD
  filed: string;
  totalValue: number; // long-equity value
  positions: number; // companies (share classes combined)
  firstPeriod: string; // earliest quarter in the history file
  top: string[]; // top 3 holdings by value (ticker, or name)
  // vs the prior quarter; absent on a manager's first filing
  prevTotal?: number;
  buys?: number; // positions with a positive portfolio impact
  sells?: number; // every other changed position
  move?: { t: string | null; d: string; c: ChangeType; p?: number; impact: number }; // largest |impact|
}

export interface SuperinvestorsJson {
  updated: string;
  managers: ManagerSummary[];
  failed: string[];
}

/* ── superinvestors/latest.json ────────────────── */

export interface LatestPosition {
  k: string; // CUSIP (long positions only)
  w: number; // weight in the portfolio, 0..1
  s: number; // shares
  v: number; // value, USD (quarter end)
  c?: ChangeType; // vs prior quarter
  p?: number; // add/reduce size, fraction of prior shares
}

export interface LatestHoldingsJson {
  updated: string;
  securities: Record<string, { t: string | null; d: string }>; // by CUSIP
  holdings: Record<string, LatestPosition[]>; // by manager id, weight desc
  quotes: Record<string, Quote>; // by ticker, as of `updated`
  // Splits after a holder's quarter end, by ticker (only where the price moved)
  splits?: Record<string, { date: string; ratio: number }[]>;
}

// Shares-per-old-share from splits after `period` (2 = a 2-for-1 since)
export function splitFactorSince(latest: Pick<LatestHoldingsJson, "splits">, ticker: string | null, period: string) {
  if (!ticker) return 1;
  return (latest.splits?.[ticker] ?? []).filter((s) => s.date > period).reduce((f, s) => f * s.ratio, 1);
}

/* ── Ownership (consensus, stock pages, insider tags) ── */

export interface Owner {
  id: string;
  name: string;
  favorite: boolean;
  w: number; // combined weight across share classes
  c?: ChangeType; // activity on the largest share-class position
  p?: number;
}

// Fund families share one CUSIP issuer code across many different funds
// (Vanguard 922908: VOO, VTI, VUG...), so funds never merge
const FUND_NAME = /\b(ETF|ETFs|Trust|FDS?|FD|Funds?|Index|iShares|SPDR|Vanguard|Invesco|Schwab|Global X|Vaneck)\b/i;

/**
 * One company's share classes get the same key: same CUSIP issuer code (first
 * 6 chars) and the same ticker once a class suffix is dropped — BRK-A/BRK-B,
 * GOOG/GOOGL, FOX/FOXA, UA/UAA, LLYVA/LLYVK. Untickered securities (Alphabet's
 * depositary preferred), warrants (AUROW, FLYX-WS) and funds keep their own.
 */
export function issuerKey(cusip: string, sec: { t: string | null; d: string } | undefined): string {
  const t = sec?.t;
  if (!t || FUND_NAME.test(sec.d)) return cusip;
  const root = t.replace(/-[A-Z]$/, "").replace(/^([A-Z]{2,})[ABCKL]$/, "$1");
  return `${cusip.slice(0, 6)}:${root}`;
}

export interface Issuer {
  key: string; // issuerKey — merges GOOG/GOOGL, BRK-A/B
  ticker: string | null; // most-held class
  name: string;
  owners: Owner[]; // weight desc
}

export function buildIssuers(latest: LatestHoldingsJson, managers: ManagerSummary[]): Map<string, Issuer> {
  const byId = new Map(managers.map((m) => [m.id, m]));
  const issuers = new Map<string, Issuer>();
  const classWeight = new Map<string, number>(); // cusip → total weight, to pick the main class
  for (const [id, positions] of Object.entries(latest.holdings)) {
    const m = byId.get(id);
    if (!m) continue;
    const mine = new Map<string, { w: number; top: LatestPosition }>();
    for (const pos of positions) {
      classWeight.set(pos.k, (classWeight.get(pos.k) ?? 0) + pos.w);
      const key = issuerKey(pos.k, latest.securities[pos.k]);
      const cur = mine.get(key);
      if (!cur) mine.set(key, { w: pos.w, top: pos });
      else {
        cur.w += pos.w;
        if (pos.w > cur.top.w) cur.top = pos;
      }
    }
    for (const [key, { w, top }] of mine) {
      if (!issuers.has(key)) issuers.set(key, { key, ticker: null, name: "", owners: [] });
      issuers.get(key)!.owners.push({ id, name: m.name, favorite: m.favorite, w, c: top.c, p: top.p });
    }
  }
  // Label each issuer by its most-held share class
  const best = new Map<string, string>();
  for (const [cusip, w] of classWeight) {
    const key = issuerKey(cusip, latest.securities[cusip]);
    const cur = best.get(key);
    if (!cur || w > classWeight.get(cur)!) best.set(key, cusip);
  }
  for (const [key, iss] of issuers) {
    const sec = latest.securities[best.get(key)!];
    iss.ticker = sec?.t ?? null;
    iss.name = sec?.d ?? "";
    iss.owners.sort((a, b) => b.w - a.w);
  }
  return issuers;
}

// Ticker → issuer key, via any share class carrying that ticker
export function issuerKeyForTicker(latest: LatestHoldingsJson, ticker: string): string | null {
  for (const [cusip, s] of Object.entries(latest.securities)) if (s.t === ticker) return issuerKey(cusip, s);
  return null;
}

/* ── History (compact — Markel alone is ~7k position-quarters) ── */

export interface HistoryPosition {
  k: string; // CUSIP, or "CUSIP|PUT" / "CUSIP|CALL"
  s: number; // shares
  v: number; // value, USD
  c?: ChangeType; // vs prior quarter; absent = unchanged (or a stock split)
  p?: number; // size of add/reduce as a fraction of prior shares
}

export interface HistoryQuarter {
  period: string;
  filed: string;
  accession: string;
  cik: number;
  total: number; // long-equity value
  positions: HistoryPosition[]; // sorted by value desc
  sold: HistoryPosition[]; // prior-quarter figures
}

// Change in portfolio weight caused by the trade, at this quarter's price
// (Dataroma's "% change to portfolio")
export function portfolioImpact(p: HistoryPosition, q: HistoryQuarter, prev?: HistoryQuarter): number {
  if (p.c === "sold") return prev?.total ? -p.v / prev.total : 0;
  if (!q.total) return 0;
  if (p.c === "new") return p.v / q.total;
  if (p.c === "add" && p.p) return (p.v - p.v / (1 + p.p)) / q.total;
  if (p.c === "reduce" && p.p != null && p.p < 1) return (p.v - p.v / (1 - p.p)) / q.total;
  return 0;
}

export interface ManagerHistoryJson {
  id: string;
  // By CUSIP: ticker, issuer as filed, class, display name
  securities: Record<string, { t: string | null; n: string; cl: string; d: string }>;
  quarters: HistoryQuarter[]; // newest first
}

/* ── Display names ─────────────────────────────── */

// 13F issuer names are all-caps and abbreviated ("BRITISH AMERN TOB PLC")
const ISSUER_WORDS: Record<string, string> = {
  INDS: "Industries",
  INDL: "Industrial",
  INTL: "International",
  PRODS: "Products",
  HLDGS: "Holdings",
  HLDG: "Holding",
  AMERN: "American",
  AMER: "America",
  TOB: "Tobacco",
  TR: "Trust",
  FINL: "Financial",
  SVCS: "Services",
  MGMT: "Management",
  PPTYS: "Properties",
  CTLS: "Controls",
  PUB: "Public",
  PETE: "Petroleum",
  GRP: "Group",
  COS: "Companies",
  MFG: "Manufacturing",
  CORPORATION: "Corp",
  LIMITED: "Ltd",
  LTD: "Ltd",
  INC: "Inc",
  CORP: "Corp",
  OF: "of",
  AND: "and",
  THE: "the",
  ISHARES: "iShares",
  JPMORGAN: "JPMorgan",
};
const KEEP_UPPER = new Set(
  "LP NV SA AG SE PLC ETF SPDR REIT USA US UK II III IV ADR ADS AB ASA SPA QQQ MSCI".split(" ")
);
const DROP_TRAILING = new Set(["DEL", "NEW", "COM", "/DE/", "/DE", "DE"]);

function titleWord(w: string): string {
  const upper = w.toUpperCase();
  if (ISSUER_WORDS[upper]) return ISSUER_WORDS[upper];
  if (KEEP_UPPER.has(upper)) return upper;
  // Short vowel-less tokens are acronyms (CVS, JPM, BNY)
  if (upper.length <= 3 && !/[AEIOUY]/.test(upper)) return upper;
  return w
    .toLowerCase()
    .replace(/(^|[-'&.])([a-z])/g, (_, sep: string, c: string) => sep + c.toUpperCase());
}

/** "BRITISH AMERN TOB PLC" → "British American Tobacco PLC" */
export function prettyIssuer(raw: string): string {
  const words = raw
    .replace(/\b([A-Z]) ([A-Z])\b/g, "$1$2") // "L P" → LP, "N V" → NV
    .split(/\s+/)
    .filter(Boolean);
  while (words.length > 1 && DROP_TRAILING.has(words[words.length - 1].toUpperCase())) words.pop();
  const out = words.map(titleWord);
  // Lowercase connectors only mid-name ("Bank of America", not "The ..."),
  // but keep deliberate lowercase brands ("iShares")
  if (out[0] && out[0] !== "iShares") out[0] = out[0][0].toUpperCase() + out[0].slice(1);
  return out.join(" ");
}

/** SEC company title ("Molina Healthcare, Inc.", "FLEX LTD.") → display name */
export function cleanCompanyTitle(title: string): string {
  const t = title
    .replace(/\bp\.?l\.?c\.?/gi, "PLC")
    .replace(/\bN\.V\./g, "NV")
    .replace(/\bS\.A\./g, "SA")
    .replace(/\bL\.P\./g, "LP")
    .replace(/\s*\/[A-Z]{2,3}\/?\s*$/, "") // "/DE/" state suffix
    .replace(/,/g, "")
    .replace(/\b(Inc|Corp|Ltd|Co|Corporation|Company)\./gi, "$1")
    .replace(/\.$/, "")
    .trim();
  if (!/[a-z]/.test(t)) return prettyIssuer(t);
  // Mixed-case title with a shouted word ("BROOKFIELD Corp"): soften words of
  // 5+ capitals, keeping short acronyms (ASML, CVS), plus the 4-letter words
  // SEC titles shout ("EchoStar CORP", "Edgewell Personal CARE Co")
  return t
    .replace(/\b(?:[A-Z]{5,}|CORP|CARE)\b/g, (w) => w[0] + w.slice(1).toLowerCase())
    .replace(/\bIShares\b/g, "iShares");
}

// Prominent names no casing rule gets right — by ticker
export const NAME_FIXES: Record<string, string> = {
  ASML: "ASML Holding NV",
  KO: "Coca-Cola Co",
  MCO: "Moody's Corp",
  DVA: "DaVita Inc",
  NVDA: "NVIDIA Corp",
  MCD: "McDonald's Corp",
  KOF: "Coca-Cola FEMSA",
  CCEP: "Coca-Cola Europacific Partners",
  TSM: "Taiwan Semiconductor Manufacturing",
  "BRK-A": "Berkshire Hathaway Inc",
  "BRK-B": "Berkshire Hathaway Inc",
  AMZN: "Amazon.com Inc", // SEC title "AMAZON COM INC"
};

export function filingUrl(cik: number, accession: string) {
  return `https://www.sec.gov/Archives/edgar/data/${cik}/${accession.replace(/-/g, "")}/`;
}

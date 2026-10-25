/**
 * Insider open-market purchases (Form 4, transaction code P) — shape of
 * public/insider-buys.json, written by scripts/refresh-insiders.ts.
 */

export interface InsiderBuy {
  accession: string;
  filed: string; // YYYY-MM-DD
  issuerCik: number;
  issuer: string;
  ticker: string | null;
  owner: string; // first reporting owner; "+N" appended for joint filings
  ownerCik: number;
  role: string; // officer title, "Director", "10% Owner", ...
  isDirector: boolean;
  isOfficer: boolean;
  isTenPct: boolean;
  firstTrade: string; // transaction date range
  lastTrade: string;
  shares: number;
  avgPrice: number;
  value: number; // USD
  sharesAfter: number | null; // holdings after the last purchase in the filing
  direct: boolean; // direct vs indirect (trust, family, fund) ownership
  // Context (refresh-insiders, from current quotes)
  now?: number | null; // current price
  low52?: number | null;
  high52?: number | null;
  // This insider's earlier open-market buys (any company, up to ~6 years back)
  track?: TrackRecord;
}

export interface TrackRecord {
  n: number; // past buys with a price history
  avg6: number | null; // average return 6 months after (split-adjusted closes)
  avg12: number | null; // average return 12 months after
  hit12: number | null; // share of buys up after 12 months
}

/* ── superinvestors/realtime.json ──────────────── */

// Faster than 13Fs: the managers' own Form 4s (10%+ holders file within two
// business days) and 13D/13G stakes (5%+, within days)
export interface SuperTrade {
  accession: string;
  filed: string;
  managerId: string;
  owner: string;
  issuerCik: number;
  issuer: string;
  ticker: string | null;
  side: "buy" | "sell";
  shares: number;
  avgPrice: number;
  value: number;
  sharesAfter: number | null;
  lastTrade: string;
}

export interface StakeFiling {
  accession: string;
  filed: string;
  managerId: string;
  form: string; // "13D", "13G/A", ...
  subjectCik: number;
  subject: string;
  ticker: string | null;
  pct: number | null; // percent of class, when parseable
  filerCik: number;
}

export interface RealtimeJson {
  updated: string;
  from: string;
  to: string;
  trades: SuperTrade[];
  stakes: StakeFiling[];
}

export function stakeUrl(s: StakeFiling) {
  return filingIndexUrl(s.filerCik, s.accession);
}

export interface InsiderBuysJson {
  updated: string;
  from: string; // first filing date covered
  to: string;
  buys: InsiderBuy[]; // newest filing first
}

// Below this a purchase is noise (DRIP-sized, token director buys)
export const MIN_BUY_VALUE = 10_000;

export function filingIndexUrl(issuerCik: number, accession: string) {
  return `https://www.sec.gov/Archives/edgar/data/${issuerCik}/${accession.replace(/-/g, "")}/${accession}-index.htm`;
}

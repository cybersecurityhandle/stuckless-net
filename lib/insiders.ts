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

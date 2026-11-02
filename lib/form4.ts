/**
 * Form 4 XML parsing, shared by scripts/refresh-insiders.ts (the market-wide
 * daily feed) and /api/stock/insiders (one company's history).
 */

import type { InsiderBuy } from "./insiders";

export function tag(xml: string, name: string): string | undefined {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? m[1].trim() : undefined;
}

// Form 4 wraps most leaf values as <x><value>…</value></x>
export function val(xml: string, name: string): string | undefined {
  const inner = tag(xml, name);
  if (inner == null) return undefined;
  return (tag(inner, "value") ?? inner).trim() || undefined;
}

export function decode(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

const flag = (s: string | undefined) => s === "1" || s?.toLowerCase() === "true";

export interface Txn {
  shares: number;
  price: number;
  after: number | null;
  date: string | null;
  indirect: boolean;
}

// Non-derivative transactions with the given code and acquired/disposed flag
export function txns(doc: string, code: "P" | "S", ad: "A" | "D"): Txn[] {
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

export function sum(list: Txn[]) {
  const shares = list.reduce((s, t) => s + t.shares, 0);
  const value = list.reduce((s, t) => s + t.shares * t.price, 0);
  const dates = list.map((t) => t.date).filter((d): d is string => !!d).sort();
  return { shares, value, dates, after: list.length ? list[list.length - 1].after : null };
}

export interface Form4 {
  doc: string; // <ownershipDocument> body
  owners: string[]; // <reportingOwner> blocks
  ownerCik: number; // first reporting owner
  ownerName: string; // "+N" appended for joint filings
  issuerCik: number;
  issuer: string;
  ticker: string | null;
}

// Header fields of a Form 4 (full .txt submission or bare XML); null for
// any other ownership document type
export function readForm4(txt: string): Form4 | null {
  const doc = tag(txt, "ownershipDocument");
  if (!doc || tag(doc, "documentType") !== "4") return null;
  const owners = [...doc.matchAll(/<reportingOwner>([\s\S]*?)<\/reportingOwner>/g)].map((m) => m[1]);
  const o = owners[0] ?? "";
  const rawTicker = (tag(tag(doc, "issuer") ?? "", "issuerTradingSymbol") ?? "").toUpperCase().replace(/[^A-Z0-9.-]/g, "");
  // Some filers put "NONE" / "[NONE]" / "N/A" in the symbol field
  const ticker = rawTicker && !/^(NONE|NA)$/.test(rawTicker) ? rawTicker.replace(".", "-") : null;
  return {
    doc,
    owners,
    ownerCik: Number(tag(o, "rptOwnerCik")),
    ownerName: decode(tag(o, "rptOwnerName") ?? "") + (owners.length > 1 ? ` +${owners.length - 1}` : ""),
    issuerCik: Number(tag(doc, "issuerCik")),
    issuer: decode(tag(doc, "issuerName") ?? ""),
    ticker,
  };
}

// The filing's open-market purchases (code P) rolled into one row, any size;
// null when it has none
export function insiderBuy(f: Form4, accession: string, filed: string): InsiderBuy | null {
  const purchases = txns(f.doc, "P", "A");
  const bought = sum(purchases);
  if (!bought.shares) return null;
  const rel = tag(f.owners[0] ?? "", "reportingOwnerRelationship") ?? "";
  const isDirector = flag(tag(rel, "isDirector"));
  const isOfficer = flag(tag(rel, "isOfficer"));
  const isTenPct = flag(tag(rel, "isTenPercentOwner"));
  const title = decode(tag(rel, "officerTitle") ?? "");
  const role =
    (isOfficer && title) ||
    [isOfficer && "Officer", isDirector && "Director", isTenPct && "10% Owner"].filter(Boolean).join(", ") ||
    decode(tag(rel, "otherText") ?? "Other");
  return {
    accession,
    filed,
    issuerCik: f.issuerCik,
    issuer: f.issuer,
    ticker: f.ticker,
    owner: f.ownerName,
    ownerCik: f.ownerCik,
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

/**
 * Affiliated entities (fund, GP, parent) each file a Form 4 for the same
 * trade — keep one row per identical purchase and note the extra filers.
 */
export function dedupe<T extends InsiderBuy>(buys: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const b of buys) {
    const key = `${b.issuerCik}|${b.lastTrade}|${b.shares}|${b.avgPrice.toFixed(4)}`;
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }
  return [...groups.values()].map(([first, ...rest]) =>
    rest.length ? { ...first, owner: `${first.owner} (+${rest.length} related filer${rest.length > 1 ? "s" : ""})` } : first
  );
}

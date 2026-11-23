/**
 * Daily holdings of the Pabrai Wagons ETF (WAGN). Its N-PORT shows up ~60
 * days after each quarter; as a transparent active ETF it also posts every
 * holding daily, as a CSV behind the widget on wagonsetf.com/fund-summary.
 * Writes public/superinvestors/pabrai-wagons-daily.json: one more period on
 * top of the N-PORT history, keyed to match it, with each position's change
 * since the latest N-PORT.
 *
 * The file is dated the next trading day (posted ~01:00 UTC): it is the
 * portfolio going into that day, i.e. the prior close.
 *
 * Usage: npm run refresh-wagn
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { MANAGERS, type DailyHoldingsJson, type HistoryPosition, type ManagerHistoryJson } from "../lib/superinvestors";
import { recordStatus } from "./status";

const ID = "pabrai-wagons";
const SOURCE = "https://www.wagonsetf.com/fund-summary";
const DATA = "https://wagonsetf.filepoint.live/assets/data/FilepointWagonsETF.40P8.P8_";
const HEADERS = { "User-Agent": "stuckless.net (+https://stuckless.net)" };
const SEC_HEADERS = { "User-Agent": "stuckless.net admin@stuckless.net" };
const DIR = join(process.cwd(), "public", "superinvestors");
const OUT = join(DIR, `${ID}-daily.json`);

// Bloomberg exchange code → Yahoo suffix, for holdings the N-PORT history
// hasn't seen (matched ones take the history's ticker). CN is .TO even
// though TSXV names are .V: Topicus and Lumine are matched, not guessed.
const YAHOO_SUFFIX: Record<string, string> = {
  US: "", CN: ".TO", IN: ".NS", TI: ".IS", PW: ".WA", NO: ".OL", LN: ".L", JP: ".T", JT: ".T",
  HK: ".HK", GR: ".DE", GY: ".DE", NA: ".AS", SS: ".ST", AU: ".AX", KS: ".KS", FP: ".PA", IM: ".MI",
};

type Row = Record<string, string>;

function parseCsv(text: string): Row[] {
  const lines: string[][] = [];
  let field = "";
  let line: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      line.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      line.push(field);
      field = "";
      if (line.some((f) => f.trim())) lines.push(line);
      line = [];
    } else field += ch;
  }
  line.push(field);
  if (line.some((f) => f.trim())) lines.push(line);
  const [head, ...rest] = lines;
  return rest.map((l) => Object.fromEntries(head.map((h, i) => [h.trim(), (l[i] ?? "").trim()])));
}

async function csv(name: string): Promise<Row[]> {
  const res = await fetch(`${DATA}${name}.csv`, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${res.status} ${name}.csv`);
  return parseCsv(await res.text());
}

// 11/23/2026 → 2026-11-23
function iso(us: string): string {
  const [m, d, y] = us.split("/");
  if (!y) throw new Error(`bad date ${us}`);
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

const num = (s: string) => Number(s.replace(/[,%]/g, ""));
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

function readJson<T>(path: string): T | null {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : null;
}

// Fund size in the N-PORT the changes are measured against: reused from the
// last run while the base filing is the same, else read from EDGAR
async function baseNetAssets(history: ManagerHistoryJson, prior: DailyHoldingsJson | null): Promise<number> {
  const q = history.quarters[0];
  if (prior?.base === q.period && prior.baseNetAssets) return prior.baseNetAssets;
  const url = `https://www.sec.gov/Archives/edgar/data/${q.cik}/${q.accession.replace(/-/g, "")}/primary_doc.xml`;
  const res = await fetch(url, { headers: SEC_HEADERS, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const m = (await res.text()).match(/<(?:\w+:)?netAssets>([\d.]+)</);
  if (!m) throw new Error(`no netAssets in ${q.accession}`);
  return Number(m[1]);
}

async function main() {
  const started = Date.now();
  const manager = MANAGERS.find((m) => m.id === ID);
  const saved = readJson<ManagerHistoryJson>(join(DIR, `${ID}.json`));
  if (!manager || !saved?.quarters.length) throw new Error(`no N-PORT history for ${ID} — run refresh-13f first`);
  const history = saved;
  const prior = readJson<DailyHoldingsJson>(OUT);

  const [rows, navToday, navHistory] = await Promise.all([csv("ETF_Holdings"), csv("DailyNAV"), csv("DailyNAVHistorical")]);
  if (!rows.length) throw new Error("empty holdings file");
  const asOf = iso(rows[0].Date);
  if (prior && asOf < prior.asOf) throw new Error(`holdings dated ${asOf}, older than the ${prior.asOf} already saved`);
  const netAssets = num(rows[0].NetAssets);
  const sharesOutstanding = num(rows[0].SharesOutstanding);
  const nav = num(navToday[0]?.NAV ?? "") || netAssets / sharesOutstanding;

  // Flows since the N-PORT: fund shares now vs then (then = net assets / NAV)
  const base = history.quarters[0];
  const navAt = navHistory
    .map((r) => ({ date: iso(r["Rate Date"]), nav: num(r.NAV) }))
    .filter((r) => r.date <= base.period && r.nav > 0)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!navAt) throw new Error(`no NAV on or before ${base.period}`);
  const assetsThen = await baseNetAssets(history, prior);
  const flow = sharesOutstanding / (assetsThen / navAt.nav);

  // Common stock only: no cash, currency balances or the treasury sweep fund
  const equities = rows.filter(
    (r) => r.MoneyMarketFlag !== "Y" && !/^CASH|^Cash&Other$/i.test(r.CUSIP) && num(r.Shares) > 0 && num(r.MarketValue) > 0
  );

  // Match each holding to the history's key (CUSIP for US/Canada, ISIN
  // elsewhere): same CUSIP, ISIN built on it, same name, then same ticker
  const baseKeys = base.positions.filter((p) => !p.k.includes("|")).map((p) => p.k);
  const candidates = [...new Set([...baseKeys, ...Object.keys(history.securities)])];
  const used = new Set<string>();
  function matchKey(r: Row): string | null {
    const cusip = r.CUSIP.toUpperCase();
    const symbol = r.StockTicker.split(" ")[0].toUpperCase();
    const tests: ((k: string) => boolean)[] = [
      (k) => k === cusip,
      (k) => k.length === 12 && k.slice(2, 11) === cusip,
      (k) => norm(history.securities[k]?.n ?? "") === norm(r.SecurityName),
      (k) => (history.securities[k]?.t ?? "").split(".")[0].toUpperCase() === symbol,
    ];
    for (const test of tests) {
      const k = candidates.find((c) => !used.has(c) && test(c));
      if (k) return used.add(k), k;
    }
    return null;
  }

  const prevByKey = new Map(base.positions.map((p) => [p.k, p]));
  const securities: DailyHoldingsJson["securities"] = {};
  const positions: HistoryPosition[] = [];
  for (const r of equities) {
    let k = matchKey(r);
    if (!k) {
      k = r.CUSIP.toUpperCase();
      const [symbol, exch = "US"] = r.StockTicker.split(" ");
      const suffix = YAHOO_SUFFIX[exch.toUpperCase()];
      securities[k] = { t: suffix == null ? null : symbol + suffix, n: r.SecurityName, cl: "COM", d: r.SecurityName };
    }
    const s = num(r.Shares);
    const p: HistoryPosition = { k, s, v: Math.round(num(r.MarketValue)) };
    // Same rule as refresh-13f's change() for funds: an add is buying beyond
    // what inflows alone would buy, ±5%. No split check — a split since the
    // N-PORT would read as an add.
    const before = prevByKey.get(k);
    if (!before) p.c = "new";
    else {
      const up = before.s * Math.max(flow, 1) * 1.05;
      const down = before.s * Math.min(flow, 1) * 0.95;
      if (s > up) Object.assign(p, { c: "add", p: s / (up / 1.05) - 1 });
      else if (s < down) Object.assign(p, { c: "reduce", p: 1 - s / (down / 0.95) });
    }
    positions.push(p);
  }
  const held = new Set(positions.map((p) => p.k));
  const sold: HistoryPosition[] = base.positions
    .filter((p) => !p.k.includes("|") && !held.has(p.k))
    .map((p) => ({ k: p.k, s: p.s, v: p.v, c: "sold" }));

  const total = positions.reduce((s, p) => s + p.v, 0);
  // A half-empty or garbled file would show as a mass sell-off
  if (positions.length < 5 || total < 0.5 * netAssets) {
    throw new Error(`only ${positions.length} stocks worth ${Math.round(total)} of ${Math.round(netAssets)} net assets`);
  }

  const out: DailyHoldingsJson = {
    updated: new Date().toISOString(),
    asOf,
    source: SOURCE,
    base: base.period,
    baseNetAssets: assetsThen,
    netAssets,
    nav,
    sharesOutstanding,
    securities,
    quarter: {
      period: asOf,
      filed: asOf,
      accession: "",
      cik: base.cik,
      total,
      flow: Math.round(flow * 1e4) / 1e4,
      positions: positions.sort((a, b) => b.v - a.v),
      sold: sold.sort((a, b) => b.v - a.v),
    },
  };
  writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");

  const changed = positions.filter((p) => p.c).length + sold.length;
  const summary = `WAGN ${asOf}: ${positions.length} stocks, ${changed} changed since the ${base.period} N-PORT`;
  console.log(summary);
  for (const p of [...positions, ...sold]) {
    if (!p.c) continue;
    const s = securities[p.k] ?? history.securities[p.k];
    console.log(`  ${p.c.padEnd(6)} ${(s?.t ?? p.k).padEnd(12)} ${p.p != null ? `${(p.p * 100).toFixed(0)}%` : ""}`);
  }
  recordStatus("refresh-wagn", started, true, summary);
}

const startedAt = Date.now();
main().catch((err) => {
  console.error(err);
  recordStatus("refresh-wagn", startedAt, false, err.message);
  process.exit(1);
});

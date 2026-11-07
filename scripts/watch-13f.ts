/**
 * Spot new 13F filings by tracked managers, minutes after EDGAR accepts them.
 * Prints the manager ids to refresh, comma separated (empty when there's
 * nothing new), for scripts/watch-13f.sh to pass to refresh-13f as ONLY=.
 *
 * One request per run: EDGAR's latest-filings feed. A filing is new when
 * refresh-13f hasn't cached it. The feed holds the last 100 13Fs, more than
 * EDGAR takes in between two runs even on deadline day; anything missed, and
 * N-PORT funds, wait for the daily full refresh.
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { MANAGERS } from "../lib/superinvestors";
import { FILING_CACHE } from "./filing-cache";

const FEED =
  "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=13F-HR&company=&dateb=&owner=include&start=0&count=100&output=atom";

// A filing refresh-13f can't parse would otherwise re-run it on every tick;
// after this many tries it's left to the daily run
const MAX_ATTEMPTS = 5;
const ATTEMPTS_PATH = join(FILING_CACHE, "..", "watch-attempts.json");

async function main() {
  const res = await fetch(FEED, {
    headers: { "User-Agent": "stuckless.net admin@stuckless.net" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`EDGAR feed ${res.status}`);
  const feed = await res.text();

  const byCik = new Map<number, string>();
  for (const m of MANAGERS) if (!m.nport) for (const cik of m.ciks) byCik.set(cik, m.id);

  const attempts: Record<string, number> = existsSync(ATTEMPTS_PATH) ? JSON.parse(readFileSync(ATTEMPTS_PATH, "utf8")) : {};
  const ids = new Set<string>();
  let tried = false;
  for (const [, entry] of feed.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const cik = Number(entry.match(/<title>13F-HR(?:\/A)? - .*\((\d{10})\) \(Filer\)<\/title>/)?.[1]);
    const accession = entry.match(/accession-number=([\d-]+)/)?.[1];
    const id = byCik.get(cik);
    if (!id || !accession || existsSync(join(FILING_CACHE, `${accession}.json`))) continue;
    if ((attempts[accession] ?? 0) >= MAX_ATTEMPTS) continue;
    attempts[accession] = (attempts[accession] ?? 0) + 1;
    tried = true;
    ids.add(id);
  }
  if (tried) writeFileSync(ATTEMPTS_PATH, JSON.stringify(attempts, null, 1) + "\n");
  console.log([...ids].join(","));
}

main().catch((err) => {
  console.error(`${new Date().toISOString()} watch-13f: ${err.message}`);
  process.exit(1);
});

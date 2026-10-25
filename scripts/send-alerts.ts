/**
 * Alerts for what's new since the last run:
 *   - a favorite manager files a new 13F
 *   - a tracked manager's own Form 4 trade, or a 13D/13G stake filing
 *   - a cluster buy (2+ officers/directors in one stock)
 *   - an insider buy in a stock your favorites hold
 *
 * Sends to Telegram only when TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are
 * set; otherwise prints what it would send (dry run). The first run only
 * records what's already there, so you aren't flooded with old items.
 * State: data/alerts-state.json.
 *
 * Usage (after refresh-13f / refresh-insiders):
 *   npm run send-alerts
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { InsiderBuysJson, RealtimeJson } from "../lib/insiders";
import { buildIssuers, type LatestHoldingsJson, type SuperinvestorsJson } from "../lib/superinvestors";

const STATE = join(process.cwd(), "data", "alerts-state.json");
const SITE = "https://stuckless.net";
const MAX_PER_RUN = 25; // a backlog after downtime shouldn't spam the chat

function read<T>(path: string): T | null {
  const p = join(process.cwd(), path);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : null;
}

function money(n: number) {
  return n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${(n / 1e3).toFixed(0)}K`;
}

async function send(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) {
    console.log(`[dry run] ${text}\n`);
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
  });
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${await res.text()}`);
}

async function main() {
  const index = read<SuperinvestorsJson>("public/superinvestors.json");
  const latest = read<LatestHoldingsJson>("public/superinvestors/latest.json");
  const insiders = read<InsiderBuysJson>("public/insider-buys.json");
  const realtime = read<RealtimeJson>("public/superinvestors/realtime.json");
  if (!index || !latest || !insiders) throw new Error("run refresh-13f and refresh-insiders first");

  const firstRun = !existsSync(STATE);
  const seen = new Set<string>(firstRun ? [] : (JSON.parse(readFileSync(STATE, "utf8")) as string[]));
  const byId = new Map(index.managers.map((m) => [m.id, m]));
  const alerts: { key: string; text: string }[] = [];

  // New 13F from a favorite
  for (const m of index.managers.filter((x) => x.favorite)) {
    const move = m.move
      ? ` Biggest move: ${m.move.t ?? m.move.d} ${m.move.c} (${(m.move.impact * 100).toFixed(1)}% of portfolio).`
      : "";
    alerts.push({
      key: `13f|${m.id}|${m.period}`,
      text: `📄 ${m.name} filed a ${m.period} 13F: ${money(m.totalValue)}, ${m.positions} stocks.${move}\n${SITE}/superinvestors?m=${m.id}`,
    });
  }

  // Managers' own Form 4s and 13D/13G
  for (const t of realtime?.trades ?? []) {
    const name = byId.get(t.managerId)?.name ?? t.owner;
    alerts.push({
      key: `trade|${t.accession}|${t.side}`,
      text: `${t.side === "buy" ? "🟢" : "🔴"} ${name} ${t.side === "buy" ? "bought" : "sold"} ${money(t.value)} of ${t.ticker ?? t.issuer} @ $${t.avgPrice.toFixed(2)} (Form 4, ${t.filed})`,
    });
  }
  for (const s of realtime?.stakes ?? []) {
    const name = byId.get(s.managerId)?.name ?? s.managerId;
    alerts.push({
      key: `stake|${s.accession}`,
      text: `📌 ${name} filed a ${s.form} on ${s.ticker ?? s.subject}${s.pct != null ? ` — ${s.pct.toFixed(1)}% of the class` : ""} (${s.filed})`,
    });
  }

  // Cluster buys and favorite-held insider buys
  const officers = insiders.buys.filter((b) => b.ticker && (b.isOfficer || b.isDirector));
  const byTicker = new Map<string, typeof officers>();
  for (const b of officers) byTicker.set(b.ticker!, [...(byTicker.get(b.ticker!) ?? []), b]);
  for (const [ticker, buys] of byTicker) {
    const people = new Set(buys.map((b) => b.ownerCik));
    if (people.size < 2) continue;
    alerts.push({
      key: `cluster|${ticker}|${people.size}`,
      text: `👥 Cluster buy: ${people.size} insiders bought ${ticker} (${money(buys.reduce((s, b) => s + b.value, 0))} total)\n${SITE}/insiders`,
    });
  }
  const issuers = buildIssuers(latest, index.managers.filter((m) => m.favorite));
  const favTicker = new Map<string, string[]>();
  for (const [cusip, sec] of Object.entries(latest.securities)) {
    const owners = issuers.get(cusip.slice(0, 6))?.owners;
    if (sec.t && owners?.length) favTicker.set(sec.t, owners.map((o) => o.name));
  }
  for (const b of officers) {
    const holders = favTicker.get(b.ticker!);
    if (!holders) continue;
    alerts.push({
      key: `favbuy|${b.accession}`,
      text: `⭐ Insider buy in a stock your picks own: ${b.owner} (${b.role}) bought ${money(b.value)} of ${b.ticker} @ $${b.avgPrice.toFixed(2)}. Held by ${holders.join(", ")}.`,
    });
  }

  const fresh = alerts.filter((a) => !seen.has(a.key));
  if (firstRun) {
    console.log(`First run: recorded ${fresh.length} existing items, sent nothing.`);
  } else {
    for (const a of fresh.slice(0, MAX_PER_RUN)) await send(a.text);
    if (fresh.length > MAX_PER_RUN) await send(`…and ${fresh.length - MAX_PER_RUN} more. ${SITE}/superinvestors?m=signals`);
    console.log(`${fresh.length} new alert(s)${process.env.TELEGRAM_BOT_TOKEN ? " sent" : " (dry run — set TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID to send)"}.`);
  }
  for (const a of alerts) seen.add(a.key);
  writeFileSync(STATE, JSON.stringify([...seen].sort(), null, 1) + "\n");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});

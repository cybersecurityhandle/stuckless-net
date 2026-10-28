"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LatestHoldingsJson, SuperinvestorsJson } from "@/lib/superinvestors";

// ⌘K / Ctrl+K (or "/") jump-to: pages, managers, and every stock any tracked
// manager holds. Data loads on first open; the navbar button opens it too
// (via the "open-command-palette" event).

interface Item {
  kind: "page" | "manager" | "stock";
  label: string;
  sub: string;
  href: string;
  search: string; // lowercase haystack
  rank: number; // tie-breaker: lower first
}

const PAGES: Item[] = [
  ["Superinvestors — new filings", "/superinvestors"],
  ["Consensus", "/superinvestors?m=consensus"],
  ["Signals", "/superinvestors?m=signals"],
  ["Compare managers", "/superinvestors?m=compare"],
  ["Similarity map", "/superinvestors?m=map"],
  ["Isolation vs performance", "/superinvestors?m=isolation"],
  ["Copycat backtest", "/superinvestors?m=backtest"],
  ["All managers", "/superinvestors?m=all"],
  ["Insider buys", "/insiders"],
  ["Weekly digest", "/digest"],
  ["Data status", "/status"],
  ["Five-factor analysis", "/finance"],
  ["Screener", "/screener"],
  ["Threat intel", "/intel"],
].map(([label, href], i) => ({ kind: "page" as const, label, sub: "Page", href, search: label.toLowerCase(), rank: i }));

const MAX_RESULTS = 12;

function buildItems(idx: SuperinvestorsJson | null, lat: LatestHoldingsJson | null): Item[] {
  const next = [...PAGES];
  for (const m of idx?.managers ?? []) {
    next.push({
      kind: "manager",
      label: m.name,
      sub: m.firm || "Manager",
      href: `/superinvestors?m=${m.id}`,
      search: `${m.name} ${m.firm}`.toLowerCase(),
      rank: m.favorite ? 0 : 1,
    });
  }
  // Count holders per ticker so widely held names sort first
  const holders = new Map<string, number>();
  for (const list of Object.values(lat?.holdings ?? {})) {
    for (const p of list) {
      const t = lat!.securities[p.k]?.t;
      if (t) holders.set(t, (holders.get(t) ?? 0) + 1);
    }
  }
  const seen = new Set<string>();
  for (const s of Object.values(lat?.securities ?? {})) {
    if (!s.t || seen.has(s.t)) continue;
    seen.add(s.t);
    next.push({
      kind: "stock",
      label: s.t,
      sub: s.d,
      href: `/finance?ticker=${encodeURIComponent(s.t)}`,
      search: `${s.t} ${s.d}`.toLowerCase(),
      rank: -(holders.get(s.t) ?? 0),
    });
  }
  return next;
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [items, setItems] = useState<Item[]>(PAGES);
  const loaded = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Managers + holdings, fetched once on first open
  const load = useCallback(() => {
    if (loaded.current) return;
    loaded.current = true;
    Promise.all([
      fetch("/superinvestors.json").then((r) => (r.ok ? r.json() : null)),
      fetch("/superinvestors/latest.json").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([idx, lat]: [SuperinvestorsJson | null, LatestHoldingsJson | null]) => setItems(buildItems(idx, lat)))
      .catch(() => {});
  }, []);

  const show = useCallback(() => {
    setOpen(true);
    setQuery("");
    setActive(0);
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        show();
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-command-palette", show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-command-palette", show);
    };
  }, [show]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.filter((i) => i.kind === "page").slice(0, MAX_RESULTS);
    const scored = items
      .map((i) => {
        // Exact ticker > prefix > word-start > substring
        const t = i.label.toLowerCase();
        const score =
          i.kind === "stock" && t === q ? 0 : t.startsWith(q) ? 1 : i.search.includes(` ${q}`) ? 2 : i.search.includes(q) ? 3 : -1;
        return { i, score };
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => a.score - b.score || a.i.rank - b.i.rank);
    // A bare ticker that nobody holds still deserves a Five-Factor jump
    const out = scored.slice(0, MAX_RESULTS).map((x) => x.i);
    if (/^[a-z.-]{1,6}$/.test(q) && !out.some((i) => i.kind === "stock" && i.label.toLowerCase() === q)) {
      out.push({ kind: "stock", label: q.toUpperCase(), sub: "Analyze ticker", href: `/finance?ticker=${q.toUpperCase()}`, search: q, rank: 99 });
    }
    return out;
  }, [items, query]);

  const go = (i: Item | undefined) => {
    if (!i) return;
    setOpen(false);
    router.push(i.href);
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 px-4 pt-[12vh]" onClick={() => setOpen(false)}>
      <div className="w-full max-w-xl overflow-hidden rounded-lg border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              go(results[active]);
            }
          }}
          placeholder="Search stocks, managers, pages…"
          className="w-full border-b border-border bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
        />
        <ul className="max-h-[50vh] overflow-y-auto py-1">
          {results.map((i, n) => (
            <li key={`${i.kind}-${i.href}`}>
              <button
                onMouseEnter={() => setActive(n)}
                onClick={() => go(i)}
                className={`flex w-full items-baseline gap-3 px-4 py-2 text-left text-sm ${n === active ? "bg-muted" : ""}`}
              >
                <span className="w-16 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{i.kind}</span>
                <span className={`shrink-0 font-medium ${i.kind === "stock" ? "font-mono text-emerald-400" : ""}`}>{i.label}</span>
                <span className="truncate text-muted-foreground">{i.sub}</span>
              </button>
            </li>
          ))}
          {!results.length && <li className="px-4 py-3 text-sm text-muted-foreground">No matches.</li>}
        </ul>
        <div className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          ↑↓ to move · Enter to open · Esc to close · press / or ⌘K anywhere
        </div>
      </div>
    </div>
  );
}

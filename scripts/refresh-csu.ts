/**
 * Refresh Constellation Software's portfolio for /csu: every company each
 * operating group lists on its own website. Constellation's filings name
 * almost none of its 1,100+ businesses; the groups' sites are the only list.
 * Topicus comes from refresh-tss (public/topicus/tss.json), not from here.
 *
 * Each site is built differently, so each group has its own reader below.
 * Sites change: a reader that comes back with far fewer companies than last
 * time fails that group (its previous list is kept) rather than shrinking it.
 * Writes public/csu/portfolio.json. ~350 requests, a few minutes.
 *
 * Usage: npm run refresh-csu
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { recordStatus } from "./status";

const HEADERS = { "User-Agent": "stuckless.net (+https://stuckless.net)" };
const DELAY_MS = 250;
const OUT = join(process.cwd(), "public", "csu", "portfolio.json");

export interface Company {
  name: string;
  url?: string;
  vertical?: string;
  acquired?: number; // year, where the group's site gives it (Volaris)
  hq?: string;
}

export interface PortfolioJson {
  updated: string;
  groups: Record<string, { updated: string; source: string; companies: Company[] }>;
  failed: string[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string, init?: RequestInit): Promise<string> {
  await sleep(DELAY_MS);
  const res = await fetch(url, { headers: HEADERS, redirect: "follow", signal: AbortSignal.timeout(30_000), ...init });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

function text(s: string) {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;|&#038;/g, "&")
    .replace(/&#0?39;|&#8217;|&rsquo;/g, "’")
    .replace(/&#8211;|&#8212;|&ndash;|&mdash;/g, "–")
    .replace(/&quot;|&#8220;|&#8221;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sitemapUrls(xml: string, match: RegExp) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim()).filter((u) => match.test(u));
}

// Page title minus the group's suffix ("Club Caddie - Jonas Software")
async function titlesOf(urls: string[], suffix: RegExp): Promise<Company[]> {
  const out: Company[] = [];
  for (const url of urls) {
    try {
      const html = await get(url);
      const name = text(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "").replace(suffix, "").trim();
      if (name) out.push({ name, url });
    } catch (err) {
      console.log(`  ${(err as Error).message}`);
    }
  }
  return out;
}

// "../our-brands/x/index.html" against the page it's on
const absolute = (href: string, base: string) => new URL(href, base).toString();

const READERS: Record<string, { source: string; read: () => Promise<Company[]> }> = {
  // One admin-ajax call returns every card, with vertical, year acquired and HQ
  volaris: {
    source: "https://www.volarisgroup.com/portfolio/",
    async read() {
      const body = new URLSearchParams({ action: "vgpf_filter", lang: "en", mode: "all", page: "1" });
      const json = JSON.parse(
        await get("https://www.volarisgroup.com/wp-admin/admin-ajax.php", {
          method: "POST",
          headers: { ...HEADERS, "Content-Type": "application/x-www-form-urlencoded" },
          body,
        })
      );
      return String(json.data?.html ?? "")
        .split(/class="portfolio-wrapper/)
        .slice(1)
        .map((card) => {
          const meta = Object.fromEntries(
            [...card.matchAll(/<li><span>([^<:]+):?<\/span>\s*([^<]*)/g)].map((m) => [m[1].trim(), text(m[2])])
          );
          const site = card.match(/href="(https?:\/\/(?!www\.volarisgroup)[^"]+)"/)?.[1];
          return {
            name: text(card.match(/<h3>([\s\S]*?)<\/h3>/)?.[1] ?? ""),
            url: site,
            vertical: text(card.match(/class="model-tag">([\s\S]*?)<\/span>/)?.[1] ?? "") || undefined,
            acquired: Number(meta.Acquired) || undefined,
            hq: meta.Headquarters || undefined,
          };
        })
        .filter((c) => c.name);
    },
  },
  jonas: {
    source: "https://jonassoftware.com/our-companies",
    async read() {
      const urls = sitemapUrls(await get("https://jonassoftware.com/companies-sitemap.xml"), /\/companies\/[^/]+\/?$/);
      return titlesOf(urls, /\s*[-–|]\s*Jonas Software\s*$/i);
    },
  },
  harris: {
    source: "https://www.harriscomputer.com/",
    async read() {
      const urls = sitemapUrls(await get("https://www.harriscomputer.com/sitemap.xml"), /\/business-units\/[^/]+\/?$/).filter(
        (u) => !/\/(fr|de)\//.test(u)
      );
      return titlesOf(urls, /\s*\|\s*A Division of Harris\s*$/i);
    },
  },
  lumine: {
    source: "https://www.luminegroup.com/our-companies/",
    async read() {
      const html = await get(this.source);
      return [...html.matchAll(/<h3[^>]*article-company__title[^>]*>([\s\S]*?)<\/h3>/g)].map((m) => ({ name: text(m[1]) }));
    },
  },
  modaxo: {
    source: "https://modaxo.com/people-transportation-brands/index.html",
    async read() {
      const html = await get(this.source);
      // Brand cards link under our-brands/; the insight cards at the end don't
      return html
        .split(/class="card-wrapper/)
        .slice(1)
        .map((c) => ({ name: text(c.match(/<h6[^>]*>([\s\S]*?)<\/h6>/)?.[1] ?? ""), href: c.match(/href="([^"]+)"/)?.[1] ?? "" }))
        .filter((c) => c.name && /our-brands\//.test(c.href))
        .map((c) => ({ name: c.name, url: absolute(c.href, this.source) }));
    },
  },
  perseus: {
    source: "https://csiperseus.com/portfolio/",
    async read() {
      const html = await get(this.source);
      return [...html.matchAll(/modal-featured-image-portfolio">\s*<img[^>]*alt="([^"]*)"/g)]
        .map((m) => ({ name: text(m[1]) }))
        .filter((c) => c.name);
    },
  },
  // Logos only: the name is in the image file name ("Top%2BProducer.png")
  andromeda: {
    source: "https://www.csiandromeda.com/our-portfolio",
    async read() {
      const html = await get(this.source);
      return html
        .split("summary-thumbnail-outer-container")
        .slice(1)
        .map((item) => {
          const file = item.match(/data-image="([^"]+)"/)?.[1]?.split("/").pop() ?? "";
          const fromFile = decodeURIComponent(decodeURIComponent(file)).replace(/\+/g, " ").replace(/\.(png|jpe?g|svg|webp)$/i, "").trim();
          const url = item.match(/href="(https?:\/\/[^"]+)"/)?.[1];
          // Some logos keep their design tool's file name ("Untitled design (42)"): use the site instead
          const generic = /^(untitled|image|logo|design)\b/i.test(fromFile);
          const name = generic && url ? new URL(url).hostname.replace(/^www\./, "") : fromFile;
          return { name, url };
        })
        // The gallery opens with Andromeda's own banner
        .filter((c) => c.name && !/^Andromeda\b/i.test(c.name));
    },
  },
  // One page per vertical, logos linking to each company's site with no
  // names anywhere — listed by website
  vela: {
    source: "https://velasoftwaregroup.com/portfolio/",
    async read() {
      const index = await get(this.source);
      const verticals = [...index.matchAll(/<a href="(\/[a-z0-9-]+)">\s*<div class="row1">\s*<label><strong>([^<]+)<\/strong>/g)]
        .filter(([, path]) => path !== "/cant-find-your-vertical")
        .map(([, path, label]) => ({ path, label: text(label) }));
      const seen = new Map<string, Company>();
      for (const v of verticals) {
        const html = (await get(`https://velasoftwaregroup.com${v.path}`)).replace(/<noscript>[\s\S]*?<\/noscript>/g, "");
        for (const [, href] of html.matchAll(/<figure[^>]*>\s*<a href="(https?:\/\/[^"]+)"/g)) {
          // Mail-filter wrappers carry the real domain as a parameter
          const real = href.match(/[?&]domain=([^&/]+)/)?.[1] ?? new URL(href).hostname;
          const host = real.replace(/^www\./, "").replace(/\/$/, "");
          if (!seen.has(host)) seen.set(host, { name: host, url: `https://${host}`, vertical: v.label });
        }
      }
      return [...seen.values()];
    },
  },
};

// A reader returning under half of last time's count has probably broken
const MIN_SHARE = 0.5;

async function main() {
  const started = Date.now();
  const only = process.env.ONLY?.split(",");
  const prev: PortfolioJson | null = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : null;
  const today = new Date().toISOString().slice(0, 10);
  const out: PortfolioJson = { updated: today, groups: { ...(prev?.groups ?? {}) }, failed: [] };
  for (const [id, reader] of Object.entries(READERS)) {
    if (only && !only.includes(id)) continue;
    try {
      const raw = await reader.read();
      // One entry per name
      const companies = [...new Map(raw.map((c) => [c.name.toLowerCase(), c])).values()].sort((a, b) =>
        a.name.localeCompare(b.name, "en", { sensitivity: "base" })
      );
      const before = prev?.groups[id]?.companies.length ?? 0;
      if (!companies.length || companies.length < before * MIN_SHARE) {
        throw new Error(`only ${companies.length} companies (had ${before})`);
      }
      out.groups[id] = { updated: today, source: reader.source, companies };
      console.log(`${id}: ${companies.length}${before ? ` (was ${before})` : ""}`);
    } catch (err) {
      console.log(`${id}: FAILED ${(err as Error).message}`);
      out.failed.push(id);
    }
  }
  mkdirSync(join(OUT, ".."), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  const total = Object.values(out.groups).reduce((s, g) => s + g.companies.length, 0);
  recordStatus("refresh-csu", started, !out.failed.length, `${total} companies${out.failed.length ? `, failed: ${out.failed.join(", ")}` : ""}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});

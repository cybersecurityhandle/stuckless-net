"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Download, Link2, Minus, Plus, RotateCcw, Search, Star, Tag, X } from "lucide-react";
import type { SuperinvestorsJson } from "@/lib/superinvestors";
import { fmtMoney, shortName } from "@/components/superinvestors";

// Managers placed by portfolio similarity (classical MDS on 1 − cosine of
// issuer weights, computed in refresh-13f). Near = owns similar things in
// similar sizes. Axes have no units — only distances mean anything.
// Custom SVG rather than Recharts: zoom with constant-size labels, collision-
// free label placement, and similarity links that light up on hover.

const FAV = "var(--color-emerald-500)";
const OTHER = "var(--color-zinc-500)";
// Managers whose closest match overlaps less than this sit at roughly equal
// distance from everyone; MDS piles them together, which reads as "similar".
// Drawn hollow so the clump isn't misread.
const UNIQUE_BELOW = 0.15;
// Links below this overlap are noise
const LINK_MIN = 0.15;
// Idiosyncratic managers sit on an outer ring this far inside the frame; the
// similarity cloud is fitted inside it with RING_GAP to spare
const RING_INSET = 26;
const RING_GAP = 46;
// Minimum gap between dot edges after de-overlapping the cloud
const DOT_GAP = 8;
const MIN_K = 1;
const MAX_K = 12;
const LABEL_PX = 11;
// Non-favourite labels: the largest few always try, the rest once zoomed in
const ALWAYS_LABEL_TOP = 10;
const LABEL_ALL_FROM_K = 1.8;
// Highlighted managers: ?picks=a,b in the URL (shareable), else this browser's
// last choice, else the site's favourites
const PICKS_KEY = "simmap-picks";

interface Node {
  id: string;
  name: string;
  label: string;
  firm: string;
  favorite: boolean;
  unique: boolean;
  x: number; // data space
  y: number;
  value: number;
  r: number; // screen px, constant across zoom
  top: string[];
  similar: { id: string; score: number }[];
  rank: number; // by portfolio value, 0 = largest
}

interface Link {
  a: string;
  b: string;
  score: number;
}

interface View {
  k: number;
  tx: number;
  ty: number;
}

type Rect = [number, number, number, number]; // x0 y0 x1 y1

// Map labels drop corporate suffixes ("Polen Capital Management" → "Polen");
// the card shows the full name
const SUFFIX = /\s+(Investment Management|Asset Management|Capital Management|Capital Partners|Management|Capital|Investments?|Funds?|Partners|Advisors|Group|Associates|Trust|LP|LLC|Inc\.?)$/;
function mapLabel(name: string) {
  let s = name.replace(/^Bill & Melinda /, "");
  while (SUFFIX.test(s)) s = s.replace(SUFFIX, "");
  // a firm keeps its stripped name ("Kahn Brothers"); a person goes by surname,
  // particles included ("Von Mueffling", "Van Den Berg")
  if (s !== name) return s;
  const parts = name.split(" ");
  if (parts.length >= 3 && /^(Von|Van|De|Del|Da|Di|Le)$/.test(parts[1])) return parts.slice(1).join(" ");
  return shortName(name);
}

const overlaps = (a: Rect, b: Rect) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

export function SimilarityMapView({
  index,
  onSelect,
}: {
  index: SuperinvestorsJson;
  onSelect: (id: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(0);
  const [allNames, setAllNames] = useState(false);
  // All names (e.g. for a screenshot): taller, so the dense cluster has room
  const height = allNames ? Math.max(560, Math.min(900, width * 0.85)) : Math.max(420, Math.min(640, width * 0.72));
  const [view, setView] = useState<View>({ k: 1, tx: 0, ty: 0 });
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [animate, setAnimate] = useState(false);
  const [dragging, setDragging] = useState(false);
  const defaultPicks = useMemo(() => index.managers.filter((m) => m.favorite).map((m) => m.id), [index]);
  const [picks, setPicks] = useState<Set<string>>(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("picks");
      if (q != null) return new Set(q.split(",").filter(Boolean));
      const saved = localStorage.getItem(PICKS_KEY);
      if (saved) return new Set(JSON.parse(saved) as string[]);
    } catch {
      // no storage (private mode) or bad JSON: fall through to the defaults
    }
    return new Set(index.managers.filter((m) => m.favorite).map((m) => m.id));
  });
  const [picksOpen, setPicksOpen] = useState(false);
  const [picksQuery, setPicksQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  const isDefaultPicks = picks.size === defaultPicks.length && defaultPicks.every((id) => picks.has(id));
  useEffect(() => {
    try {
      if (isDefaultPicks) localStorage.removeItem(PICKS_KEY);
      else localStorage.setItem(PICKS_KEY, JSON.stringify([...picks]));
    } catch {
      // storage unavailable: the URL still carries the choice
    }
    const url = new URL(window.location.href);
    if (isDefaultPicks) url.searchParams.delete("picks");
    else url.searchParams.set("picks", [...picks].sort().join(","));
    if (url.href !== window.location.href) window.history.replaceState(null, "", url);
  }, [picks, isDefaultPicks]);
  const togglePick = (id: string) =>
    setPicks((p) => {
      const next = new Set(p);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const t = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const { nodes, byId, links } = useMemo(() => {
    const ms = index.managers.filter((m) => m.xy);
    const maxV = Math.max(...ms.map((m) => m.totalValue));
    const ranked = [...ms].sort((a, b) => b.totalValue - a.totalValue).map((m) => m.id);
    const nodes: Node[] = ms.map((m) => ({
      id: m.id,
      name: m.name,
      label: mapLabel(m.name),
      firm: m.firm,
      favorite: picks.has(m.id),
      unique: (m.similar?.[0]?.score ?? 0) < UNIQUE_BELOW,
      x: m.xy![0],
      y: m.xy![1],
      value: m.totalValue,
      r: 3 + 13 * Math.sqrt(m.totalValue / maxV), // area ∝ portfolio value
      top: m.top ?? [],
      similar: m.similar ?? [],
      rank: ranked.indexOf(m.id),
    }));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const pairs = new Map<string, Link>();
    for (const n of nodes)
      for (const s of n.similar) {
        if (s.score < LINK_MIN || !byId.has(s.id)) continue;
        const [a, b] = n.id < s.id ? [n.id, s.id] : [s.id, n.id];
        const key = `${a}|${b}`;
        if ((pairs.get(key)?.score ?? 0) < s.score) pairs.set(key, { a, b, score: s.score });
      }
    return { nodes, byId, links: [...pairs.values()].sort((a, b) => a.score - b.score) };
  }, [index, picks]);

  // Base screen positions (zoom 1). Idiosyncratic managers have no meaningful
  // MDS position — it piles them all on one spot — so they go on an outer ring,
  // largest first from the top. The rest keep their MDS layout (one scale for
  // both axes so distances stay true), fitted inside the ring, then nudged
  // apart where dots overlap (Pabrai and his ETF are almost identical).
  const ring = useMemo(() => {
    const cx = width / 2;
    const cy = height / 2;
    return { cx, cy, rx: width / 2 - RING_INSET, ry: height / 2 - RING_INSET };
  }, [width, height]);
  const layout = useMemo(() => {
    const out = new Map<string, [number, number]>();
    if (!width) return out;
    const lone = nodes.filter((n) => n.unique).sort((a, b) => a.rank - b.rank);
    lone.forEach((n, i) => {
      // half-step offset leaves a gap at the bottom for the ring's caption
      const t = -Math.PI / 2 + ((i + 0.5) / lone.length) * 2 * Math.PI;
      out.set(n.id, [ring.cx + ring.rx * Math.cos(t), ring.cy + ring.ry * Math.sin(t)]);
    });
    const core = nodes.filter((n) => !n.unique);
    if (!core.length) return out;
    // fit the cloud's bounding box inside the ellipse's inscribed rectangle
    const xs = core.map((n) => n.x);
    const ys = core.map((n) => n.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const hw = (ring.rx - (lone.length ? RING_GAP : 0)) * (lone.length ? Math.SQRT1_2 * 1.25 : 1);
    const hh = (ring.ry - (lone.length ? RING_GAP : 0)) * (lone.length ? Math.SQRT1_2 * 1.25 : 1);
    const sc = Math.min((2 * hw) / (x1 - x0 || 1), (2 * hh) / (y1 - y0 || 1));
    const anchor = core.map((n): [number, number] => [
      ring.cx + (n.x - (x0 + x1) / 2) * sc,
      ring.cy - (n.y - (y0 + y1) / 2) * sc, // y up
    ]);
    const p = anchor.map(([x, y]) => [x, y]);
    for (let it = 0; it < 120; it++) {
      for (let i = 0; i < core.length; i++)
        for (let j = i + 1; j < core.length; j++) {
          let dx = p[j][0] - p[i][0];
          let dy = p[j][1] - p[i][1];
          let d = Math.hypot(dx, dy);
          const min = core[i].r + core[j].r + (allNames ? DOT_GAP * 2 : DOT_GAP);
          if (d >= min) continue;
          if (d < 1e-6) [dx, dy, d] = [Math.cos(i + j), Math.sin(i + j), 1]; // coincident: any direction
          const push = (min - d) / 2;
          p[i][0] -= (dx / d) * push;
          p[i][1] -= (dy / d) * push;
          p[j][0] += (dx / d) * push;
          p[j][1] += (dy / d) * push;
        }
      if (it < 100)
        for (let i = 0; i < core.length; i++) {
          p[i][0] += (anchor[i][0] - p[i][0]) * 0.1;
          p[i][1] += (anchor[i][1] - p[i][1]) * 0.1;
        }
    }
    core.forEach((n, i) => out.set(n.id, [p[i][0], p[i][1]]));
    return out;
  }, [nodes, width, ring, allNames]);

  const pos = useCallback(
    (n: Node): [number, number] => {
      const [x, y] = layout.get(n.id) ?? [ring.cx, ring.cy];
      return [x * view.k + view.tx, y * view.k + view.ty];
    },
    [layout, ring, view]
  );

  const clampView = useCallback(
    (v: View): View => {
      const k = Math.min(MAX_K, Math.max(MIN_K, v.k));
      // keep at least a third of the map on screen
      const minX = width / 3 - width * k;
      const minY = height / 3 - height * k;
      return { k, tx: Math.min(width * 0.67, Math.max(minX, v.tx)), ty: Math.min(height * 0.67, Math.max(minY, v.ty)) };
    },
    [width, height]
  );

  // Eased transition for buttons, double-click and search; drag and wheel
  // set the view directly. Interpolates in log-zoom so the motion feels even.
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  const tween = useRef(0);
  const animateTo = useCallback((target: View) => {
    cancelAnimationFrame(tween.current);
    const from = viewRef.current;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setView(target);
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 450);
      const e = 1 - Math.pow(1 - t, 3);
      const k = Math.exp(Math.log(from.k) + (Math.log(target.k) - Math.log(from.k)) * e);
      // keep the target point's screen path straight: lerp the pre-zoom origin
      const ox = (-from.tx / from.k) + ((-target.tx / target.k) - (-from.tx / from.k)) * e;
      const oy = (-from.ty / from.k) + ((-target.ty / target.k) - (-from.ty / from.k)) * e;
      setView({ k, tx: -ox * k, ty: -oy * k });
      if (t < 1) tween.current = requestAnimationFrame(step);
    };
    tween.current = requestAnimationFrame(step);
  }, []);
  useEffect(() => () => cancelAnimationFrame(tween.current), []);

  const zoomTarget = useCallback(
    (v: View, factor: number, cx: number, cy: number) => {
      const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor));
      const f = k / v.k;
      return clampView({ k, tx: cx - (cx - v.tx) * f, ty: cy - (cy - v.ty) * f });
    },
    [clampView]
  );
  const zoomAt = useCallback(
    (factor: number, cx: number, cy: number) => setView((v) => zoomTarget(v, factor, cx, cy)),
    [zoomTarget]
  );
  const zoomSmooth = useCallback(
    (factor: number, cx: number, cy: number) => animateTo(zoomTarget(viewRef.current, factor, cx, cy)),
    [animateTo, zoomTarget]
  );

  // Ctrl/⌘ + wheel (and trackpad pinch, which arrives as ctrl+wheel) zooms;
  // a plain wheel keeps scrolling the page. Native listener: React's is passive.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const flyTo = useCallback(
    (id: string, k = 3.5) => {
      const n = byId.get(id);
      if (!n) return;
      const [bx, by] = layout.get(n.id) ?? [ring.cx, ring.cy];
      animateTo(clampView({ k, tx: width / 2 - bx * k, ty: height / 2 - by * k }));
      setPinned(id);
    },
    [byId, layout, ring, width, height, clampView, animateTo]
  );

  const focus = hover ?? pinned;
  const focusNode = focus ? byId.get(focus) : undefined;
  const neighbors = useMemo(() => {
    const s = new Set<string>();
    if (!focus) return s;
    for (const l of links) {
      if (l.a === focus) s.add(l.b);
      if (l.b === focus) s.add(l.a);
    }
    return s;
  }, [focus, links]);

  // Greedy label placement in screen space: focus, its neighbours, favourites,
  // then largest portfolios; a label that would collide is skipped (hover shows it)
  const labels = useMemo(() => {
    if (!width) return [];
    const screen = new Map(nodes.map((n) => [n.id, pos(n)]));
    const dots = nodes.map((n) => {
      const [x, y] = screen.get(n.id)!;
      return { id: n.id, rect: [x - n.r, y - n.r, x + n.r, y + n.r] as Rect };
    });
    const priority = (n: Node) =>
      n.id === focus ? 0 : neighbors.has(n.id) ? 1 : n.favorite ? 2 : 3 + n.rank / 1000;
    const candidates = nodes
      .filter(
        (n) =>
          n.id === focus ||
          neighbors.has(n.id) ||
          allNames ||
          (!focus || view.k >= LABEL_ALL_FROM_K
            ? n.favorite || n.unique || n.rank < ALWAYS_LABEL_TOP || view.k >= LABEL_ALL_FROM_K
            : n.favorite)
      )
      .sort((a, b) => priority(a) - priority(b));
    const out: { id: string; x: number; y: number; anchor: "start" | "middle" | "end"; text: string }[] = [];
    const placed: Rect[] = [];
    for (const n of candidates) {
      const [x, y] = screen.get(n.id)!;
      if (x < -50 || x > width + 50 || y < -20 || y > height + 20) continue;
      const w = n.label.length * LABEL_PX * 0.58 + 4;
      const h = LABEL_PX + 2;
      const g = n.r + 3;
      const slots: [number, number, "start" | "middle" | "end", Rect][] = [
        [x, y - g - 2, "middle", [x - w / 2, y - g - h, x + w / 2, y - g]],
        [x + g, y + 4, "start", [x + g, y - h / 2, x + g + w, y + h / 2]],
        [x - g, y + 4, "end", [x - g - w, y - h / 2, x - g, y + h / 2]],
        [x, y + g + h - 2, "middle", [x - w / 2, y + g, x + w / 2, y + g + h]],
        [x + g * 0.7, y - g * 0.7 - 2, "start", [x + g * 0.7, y - g * 0.7 - h, x + g * 0.7 + w, y - g * 0.7]],
        [x - g * 0.7, y - g * 0.7 - 2, "end", [x - g * 0.7 - w, y - g * 0.7 - h, x - g * 0.7, y - g * 0.7]],
        [x + g * 0.7, y + g * 0.7 + h - 2, "start", [x + g * 0.7, y + g * 0.7, x + g * 0.7 + w, y + g * 0.7 + h]],
        [x - g * 0.7, y + g * 0.7 + h - 2, "end", [x - g * 0.7 - w, y + g * 0.7, x - g * 0.7, y + g * 0.7 + h]],
        // further out, for crowded spots
        [x + g + 10, y + 4, "start", [x + g + 10, y - h / 2, x + g + 10 + w, y + h / 2]],
        [x - g - 10, y + 4, "end", [x - g - 10 - w, y - h / 2, x - g - 10, y + h / 2]],
        [x, y + g + h + 8, "middle", [x - w / 2, y + g + 10, x + w / 2, y + g + h + 10]],
      ];
      const inside = ([, , , r]: (typeof slots)[number]) => r[0] >= 2 && r[2] <= width - 2 && r[1] >= 2 && r[3] <= height - 2;
      const slot =
        slots.filter(inside).find(
          ([, , , r]) => !placed.some((p) => overlaps(p, r)) && !dots.some((d) => d.id !== n.id && overlaps(d.rect, r))
        ) ??
        // picks may sit over neighbouring dots rather than go unlabelled
        (n.favorite || allNames ? slots.filter(inside).find(([, , , r]) => !placed.some((p) => overlaps(p, r))) : undefined) ??
        // all names: the least-crowded slot rather than none
        (allNames
          ? (slots.some(inside) ? slots.filter(inside) : slots).reduce((best, sl) =>
              placed.filter((p) => overlaps(p, sl[3])).length < placed.filter((p) => overlaps(p, best[3])).length ? sl : best
            )
          : undefined) ??
        (n.id === focus ? slots[0] : undefined); // focus always gets a label
      if (!slot) continue;
      placed.push(slot[3]);
      out.push({ id: n.id, x: slot[0], y: slot[1], anchor: slot[2], text: n.label });
    }
    return out;
  }, [nodes, pos, focus, neighbors, view.k, width, height, allNames]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return nodes
      .filter((n) => n.name.toLowerCase().includes(q) || n.firm.toLowerCase().includes(q))
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 6);
  }, [query, nodes]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) {
      cancelAnimationFrame(tween.current);
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      setDragging(true);
      setHover(null);
    }
    d.moved = true;
    setView((v) => clampView({ k: v.k, tx: d.tx + dx, ty: d.ty + dy }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (d && !d.moved && e.target === svgRef.current) setPinned(null); // click on empty space
  };

  // The focused manager's own closest matches get bold links and badges; links
  // from managers who list it (Gayner is many people's match) stay faint
  const own = new Set(focusNode?.similar.map((s) => s.id));
  const pickList = useMemo(() => {
    const q = picksQuery.trim().toLowerCase();
    return [...nodes]
      .filter((n) => !q || n.name.toLowerCase().includes(q) || n.firm.toLowerCase().includes(q))
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name));
  }, [nodes, picksQuery]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked: the address bar has the same link
    }
  };

  // PNG for sharing: the SVG with theme colours resolved (CSS variables and
  // classes don't apply inside an <img>), framed with a title and source line
  const downloadPng = async () => {
    const svg = svgRef.current;
    if (!svg || exporting) return;
    setExporting(true);
    try {
      await renderPng(svg);
    } finally {
      setExporting(false);
    }
  };
  const renderPng = async (svg: SVGSVGElement) => {
    const clone = svg.cloneNode(true) as SVGSVGElement;
    const src = svg.querySelectorAll("*");
    const dst = clone.querySelectorAll("*");
    src.forEach((el, i) => {
      const d = dst[i];
      const cs = getComputedStyle(el);
      if (cs.display === "none") d.setAttribute("display", "none");
      for (const a of ["fill", "stroke"])
        if (el.getAttribute(a)?.includes("var(")) d.setAttribute(a, cs.getPropertyValue(a));
      d.removeAttribute("class");
    });
    const rootCs = getComputedStyle(svg);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("style", `font-family: ${rootCs.fontFamily}, Arial, sans-serif`);
    const bg = getComputedStyle(document.body).backgroundColor;
    const fg = getComputedStyle(document.body).color;
    const muted = getComputedStyle(document.documentElement).getPropertyValue("--color-zinc-500").trim() || "#71717a";
    const img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(clone));
    await img.decode();

    const head = 64;
    const foot = 36;
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = (height + head + foot) * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height + head + foot);
    const font = rootCs.fontFamily;
    ctx.fillStyle = fg;
    ctx.font = `600 20px ${font}`;
    ctx.fillText("Superinvestor similarity map", 20, 32);
    ctx.fillStyle = muted;
    ctx.font = `12px ${font}`;
    ctx.fillText(
      `${nodes.length} managers by 13F portfolio overlap · nearby = similar holdings · size = portfolio value · outer ring = no close match`,
      20,
      52
    );
    ctx.drawImage(img, 0, head, width, height);
    const period = index.managers.reduce((p, m) => (m.period > p ? m.period : p), "");
    ctx.font = `12px ${font}`;
    ctx.fillText(`13F holdings through ${period}`, 20, head + height + 24);
    ctx.textAlign = "right";
    ctx.fillStyle = fg;
    ctx.font = `600 12px ${font}`;
    ctx.fillText("stuckless.net/superinvestors", width - 20, head + height + 24);

    // encoding a ~1800px PNG takes a few seconds
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "superinvestor-similarity-map.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const dim = (id: string) => focus != null && id !== focus && !neighbors.has(id);
  const zoomed = view.k > 1.01 || view.tx !== 0 || view.ty !== 0;

  return (
    <div>
      <h2 className="text-xl font-semibold">Similarity map</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Each dot is a manager, sized by portfolio; nearby dots own similar stocks in similar sizes,
        and lines join each manager to their closest matches. The axes have no units — only distance
        matters. Managers with no close match orbit on the outer ring. Hover to trace a
        manager&apos;s neighbours, click to pin.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && matches[0]) {
                flyTo(matches[0].id);
                setQuery("");
              }
              if (e.key === "Escape") setQuery("");
            }}
            placeholder="Find a manager…"
            aria-label="Find a manager on the map"
            className="h-8 w-56 rounded-md border border-border bg-background pl-8 pr-2 text-sm outline-none focus:border-zinc-500"
          />
          {matches.length > 0 && (
            <div className="absolute left-0 top-9 z-20 w-72 overflow-hidden rounded-md border border-border bg-background shadow-lg">
              {matches.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    flyTo(n.id);
                    setQuery("");
                  }}
                  className="flex w-full items-baseline justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <span className="truncate">{n.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{fmtMoney(n.value)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="relative">
          <button onClick={() => setPicksOpen((o) => !o)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm hover:bg-muted" aria-expanded={picksOpen}>
            <Star className="h-3.5 w-3.5 text-emerald-500" />
            Highlight ({picks.size})
          </button>
          {picksOpen && (
            <div className="absolute left-0 top-9 z-30 w-80 rounded-md border border-border bg-background shadow-lg">
              <div className="flex items-center gap-2 border-b border-border p-2">
                <input
                  value={picksQuery}
                  onChange={(e) => setPicksQuery(e.target.value)}
                  placeholder="Filter managers…"
                  aria-label="Filter managers to highlight"
                  autoFocus
                  className="h-7 min-w-0 flex-1 rounded border border-border bg-background px-2 text-sm outline-none focus:border-zinc-500"
                />
                <button aria-label="Close" onClick={() => setPicksOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="max-h-72 overflow-y-auto py-1">
                {pickList.map((n) => (
                  <label key={n.id} className="flex cursor-pointer items-center gap-2 px-3 py-1 text-sm hover:bg-muted">
                    <input type="checkbox" checked={n.favorite} onChange={() => togglePick(n.id)} className="accent-emerald-500" />
                    <span className="min-w-0 flex-1 truncate">{n.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{fmtMoney(n.value)}</span>
                  </label>
                ))}
              </div>
              <div className="flex justify-between border-t border-border p-2 text-xs">
                <button onClick={() => setPicks(new Set(defaultPicks))} disabled={isDefaultPicks} className="text-muted-foreground hover:text-foreground disabled:opacity-40">
                  Reset to default
                </button>
                <button onClick={() => setPicks(new Set())} disabled={!picks.size} className="text-muted-foreground hover:text-foreground disabled:opacity-40">
                  Clear all
                </button>
              </div>
            </div>
          )}
        </div>
        <button onClick={() => setAllNames((v) => !v)} aria-pressed={allNames} className={`inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm hover:bg-muted ${allNames ? "border-zinc-500 bg-muted" : ""}`}>
          <Tag className="h-3.5 w-3.5" />
          All names
        </button>
        <button onClick={downloadPng} disabled={exporting} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm hover:bg-muted disabled:opacity-60">
          <Download className={`h-3.5 w-3.5 ${exporting ? "animate-pulse" : ""}`} />
          {exporting ? "Saving…" : "PNG"}
        </button>
        <button onClick={copyLink} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm hover:bg-muted">
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Link2 className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Link"}
        </button>
        <span className="hidden text-xs text-muted-foreground lg:inline">
          Drag to pan · Ctrl/⌘ + scroll to zoom
        </span>
      </div>

      <div
        ref={wrapRef}
        className="relative mt-3 overflow-hidden rounded-md border border-border bg-[radial-gradient(circle_at_center,var(--color-zinc-900)_0%,transparent_75%)]"
        style={{ height }}
      >
        {width > 0 && (
          <svg
            ref={svgRef}
            width={width}
            height={height}
            className={`select-none ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
            style={{ touchAction: zoomed ? "none" : "pan-y" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={() => setHover(null)}
            onDoubleClick={(e) => {
              const rect = svgRef.current!.getBoundingClientRect();
              zoomSmooth(2, e.clientX - rect.left, e.clientY - rect.top);
            }}
            role="img"
            aria-label="Map of superinvestors by portfolio similarity"
          >
            <defs>
              <pattern id="simmap-dots" width="24" height="24" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="0.8" fill="var(--color-zinc-800)" />
              </pattern>
              <filter id="simmap-glow" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="4" />
              </filter>
            </defs>
            <rect width={width} height={height} fill="url(#simmap-dots)" pointerEvents="none" />

            {/* outer ring for managers without a close match */}
            {nodes.some((n) => n.unique) && (
              <g pointerEvents="none">
                <ellipse
                  cx={ring.cx * view.k + view.tx}
                  cy={ring.cy * view.k + view.ty}
                  rx={ring.rx * view.k}
                  ry={ring.ry * view.k}
                  fill="none"
                  stroke="var(--color-zinc-500)"
                  strokeOpacity={0.35}
                  strokeDasharray="2 5"
                />
                <text
                  x={ring.cx * view.k + view.tx}
                  y={(ring.cy + ring.ry) * view.k + view.ty + 4}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--color-zinc-500)"
                  stroke="var(--background)"
                  strokeWidth={6}
                  paintOrder="stroke"
                  letterSpacing="0.06em"
                >
                  NO CLOSE MATCH · under {Math.round(UNIQUE_BELOW * 100)}% overlap with anyone
                </text>
              </g>
            )}

            {/* links */}
            <g pointerEvents="none">
              {links.map((l) => {
                const a = byId.get(l.a)!;
                const b = byId.get(l.b)!;
                const [x1, y1] = pos(a);
                const [x2, y2] = pos(b);
                const lit = focus != null && (l.a === focus || l.b === focus);
                const strong = lit && own.has(l.a === focus ? l.b : l.a);
                const favLink = a.favorite && b.favorite;
                return (
                  <line
                    key={`${l.a}|${l.b}`}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={lit || favLink ? FAV : "var(--color-zinc-500)"}
                    strokeWidth={strong ? 1 + l.score * 4 : 0.5 + l.score * 2}
                    strokeOpacity={strong ? 0.9 : lit ? 0.3 : focus ? 0.04 : (favLink ? 0.3 : 0.04) + l.score * 0.35}
                    strokeLinecap="round"
                    className="transition-[stroke-opacity] duration-200"
                  />
                );
              })}
            </g>

            {/* overlap % on the focused manager's links */}
            {focusNode && (
              <g pointerEvents="none">
                {links
                  .filter((l) => (l.a === focus && own.has(l.b)) || (l.b === focus && own.has(l.a)))
                  .map((l) => {
                    const [x1, y1] = pos(byId.get(l.a)!);
                    const [x2, y2] = pos(byId.get(l.b)!);
                    // too short to fit a badge without covering the dots (the card lists it)
                    if (Math.hypot(x2 - x1, y2 - y1) < 2 * (byId.get(l.a)!.r + byId.get(l.b)!.r) + 34) return null;
                    const mx = (x1 + x2) / 2;
                    const my = (y1 + y2) / 2;
                    const t = `${Math.round(l.score * 100)}%`;
                    return (
                      <g key={`${l.a}|${l.b}`}>
                        <rect x={mx - 15} y={my - 8} width={30} height={16} rx={8} fill="var(--background)" stroke={FAV} strokeOpacity={0.6} />
                        <text x={mx} y={my + 4} textAnchor="middle" fontSize={10} fontWeight={600} fill={FAV}>
                          {t}
                        </text>
                      </g>
                    );
                  })}
              </g>
            )}

            {/* dots, largest first so small ones stay clickable */}
            <g>
              {[...nodes]
                .sort((a, b) => b.r - a.r)
                .map((n) => {
                  const [x, y] = pos(n);
                  const isFocus = n.id === focus;
                  const color = n.favorite ? FAV : OTHER;
                  // entrance: ripple out from the centre
                  const delay = Math.hypot(x - width / 2, y - height / 2) * 1.2;
                  return (
                    <g
                      key={n.id}
                      transform={`translate(${x},${y})`}
                      onPointerEnter={() => !dragging && setHover(n.id)}
                      onPointerLeave={() => setHover((h) => (h === n.id ? null : h))}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPinned((p) => (p === n.id ? null : n.id));
                      }}
                      className="cursor-pointer"
                      style={{ opacity: dim(n.id) ? 0.18 : 1, transition: "opacity 200ms" }}
                    >
                      <g
                        className="motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out"
                        style={{ transform: animate ? "scale(1)" : "scale(0)", transitionDelay: `${delay}ms` }}
                      >
                        {n.favorite && !n.unique && (
                          <circle r={n.r + 4} fill={FAV} opacity={isFocus ? 0.55 : 0.25} filter="url(#simmap-glow)" className="dark:block hidden" />
                        )}
                        {isFocus && <circle r={n.r + 5} fill="none" stroke={color} strokeWidth={1.5} strokeOpacity={0.8} />}
                        <circle r={Math.max(n.r, 8)} fill="transparent" />
                        <circle
                          r={n.r}
                          fill={n.unique ? "transparent" : color}
                          fillOpacity={n.favorite ? 0.95 : 0.6}
                          stroke={n.unique ? color : "var(--background)"}
                          strokeWidth={n.unique ? 1.5 : 1}
                        />
                      </g>
                    </g>
                  );
                })}
            </g>

            {/* labels */}
            <g pointerEvents="none">
              {labels.map((l) => {
                const n = byId.get(l.id)!;
                const strong = l.id === focus || n.favorite;
                return (
                  <text
                    key={l.id}
                    x={l.x}
                    y={l.y}
                    textAnchor={l.anchor}
                    fontSize={LABEL_PX}
                    fontWeight={l.id === focus ? 600 : 400}
                    fill={strong ? "var(--color-zinc-100)" : "var(--color-zinc-400)"}
                    stroke="var(--background)"
                    strokeWidth={3}
                    paintOrder="stroke"
                    opacity={dim(l.id) ? 0.25 : 1}
                  >
                    {l.text}
                  </text>
                );
              })}
            </g>
          </svg>
        )}

        {/* zoom controls */}
        <div className="absolute right-2 top-2 flex flex-col overflow-hidden rounded-md border border-border bg-background/90 backdrop-blur">
          <button aria-label="Zoom in" onClick={() => zoomSmooth(1.6, width / 2, height / 2)} className="p-1.5 hover:bg-muted">
            <Plus className="h-4 w-4" />
          </button>
          <button aria-label="Zoom out" onClick={() => zoomSmooth(1 / 1.6, width / 2, height / 2)} className="border-t border-border p-1.5 hover:bg-muted">
            <Minus className="h-4 w-4" />
          </button>
          {zoomed && (
            <button aria-label="Reset view" onClick={() => animateTo({ k: 1, tx: 0, ty: 0 })} className="border-t border-border p-1.5 hover:bg-muted">
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* focus card */}
        {focusNode && (
          <div className="absolute bottom-2 left-2 w-[min(300px,calc(100%-1rem))] rounded-md border border-border bg-background/95 p-3 text-xs shadow-lg backdrop-blur">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">{focusNode.name}</div>
                {focusNode.firm && <div className="truncate text-muted-foreground">{focusNode.firm}</div>}
              </div>
              {pinned === focusNode.id && (
                <button aria-label="Unpin" onClick={() => setPinned(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="mt-1.5 text-muted-foreground">
              {fmtMoney(focusNode.value)}
              {focusNode.top.length > 0 && <> · top: {focusNode.top.join(", ")}</>}
            </div>
            {focusNode.unique && (
              <div className="mt-1.5 text-yellow-500/80">
                Idiosyncratic — under {Math.round(UNIQUE_BELOW * 100)}% overlap with anyone, so it sits on the outer ring; its place there isn&apos;t meaningful.
              </div>
            )}
            {focusNode.similar.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {focusNode.similar.map((s) => {
                  const o = byId.get(s.id);
                  if (!o) return null;
                  return (
                    <button
                      key={s.id}
                      onClick={() => flyTo(s.id, Math.max(view.k, 2))}
                      className="rounded-full border border-border px-2 py-0.5 hover:border-zinc-500 hover:text-foreground"
                    >
                      {o.label} <span className="text-emerald-500">{Math.round(s.score * 100)}%</span>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="mt-2.5 flex items-center justify-between gap-2">
              <button
                onClick={() => onSelect(focusNode.id)}
                className="inline-flex items-center gap-1 font-medium text-emerald-500 hover:underline"
              >
                Open portfolio <ArrowRight className="h-3 w-3" />
              </button>
              <button
                onClick={() => togglePick(focusNode.id)}
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                <Star className={`h-3 w-3 ${focusNode.favorite ? "fill-emerald-500 text-emerald-500" : ""}`} />
                {focusNode.favorite ? "Highlighted" : "Highlight"}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: FAV }} />Highlighted</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full opacity-60" style={{ background: OTHER }} />Other managers</span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
          <span className="h-3 w-3 rounded-full bg-zinc-500" />
          Size = portfolio value
        </span>
        <span className="flex items-center gap-1.5"><span className="h-px w-5 bg-zinc-500" />Overlap with closest matches (thicker = more)</span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border-[1.5px]" style={{ borderColor: OTHER }} />
          Outer ring: idiosyncratic, under {Math.round(UNIQUE_BELOW * 100)}% overlap with anyone
        </span>
      </div>
    </div>
  );
}

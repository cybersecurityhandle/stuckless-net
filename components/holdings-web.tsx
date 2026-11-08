"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

// A radial tree of what a company owns (/berkshire, /topicus): root in the
// middle, branches by kind, leaves round the edge with rotated labels. Hover
// lights a node's ancestors and descendants and shows its details; a node
// with an href is a link (outside links open in a new tab). Branch colors are
// passed in, so each page validates its own set.

export interface TreeNode {
  id: string;
  label: string;
  branch?: string; // key into colors
  detail?: string[]; // tooltip lines
  href?: string;
  hint?: string; // tooltip footer for links, e.g. "Click for the stock page"
  children?: TreeNode[];
}

export interface BranchStyle {
  id: string;
  label: string;
  color: string;
}

interface Placed {
  node: TreeNode;
  parent?: Placed;
  depth: number;
  angle: number; // radians, clockwise from 12 o'clock
  r: number;
  leaf: boolean;
}

const GAP_SLOTS = 2.5; // empty leaf slots between branches
const PAD = 175; // room for leaf labels
const LABEL_MAX = 28; // longer leaf labels are cut; the tooltip has the full name
const DEFAULT_RINGS = [0, 0.29, 0.53, 0.75]; // radius of each depth, as a share of the leaf ring
const MAX_ZOOM = 14;

// Rounded: a server-rendered web must produce the same path strings in the
// browser, and sin/cos can differ in the last digits between the two
const round = (x: number) => Math.round(x * 100) / 100;

function polar(angle: number, r: number): [number, number] {
  return [round(r * Math.sin(angle)), round(-r * Math.cos(angle))];
}

// Leaves evenly round the circle, a gap between branches; each parent at the
// middle of its children. Inner rings scale with the leaf radius.
function layout(root: TreeNode, rLeaf: number, rings: number[]): Placed[] {
  const radii = rings.map((f) => f * rLeaf);
  const count = (n: TreeNode): number => (n.children?.length ? n.children.reduce((s, c) => s + count(c), 0) : 1);
  const slots = count(root) + GAP_SLOTS * (root.children?.length ?? 0);
  const step = (2 * Math.PI) / slots;
  let cursor = GAP_SLOTS / 2;
  const out: Placed[] = [];
  const walk = (n: TreeNode, depth: number, parent?: Placed): Placed => {
    const p: Placed = { node: n, parent, depth, angle: 0, r: 0, leaf: !n.children?.length };
    out.push(p);
    if (p.leaf) {
      p.angle = (cursor + 0.5) * step;
      cursor += 1;
      p.r = rLeaf;
    } else {
      const kids = n.children!.map((c) => walk(c, depth + 1, p));
      p.angle = (kids[0].angle + kids[kids.length - 1].angle) / 2;
      p.r = radii[Math.min(depth, radii.length - 1)];
    }
    if (depth === 1) cursor += GAP_SLOTS;
    return p;
  };
  walk(root, 0);
  return out;
}

// Curved link: leave the parent radially, arrive at the child radially
function linkPath(a: Placed, b: Placed) {
  const mid = (a.r + b.r) / 2;
  const [x0, y0] = polar(a.angle, a.r);
  const [x1, y1] = polar(a.angle, mid);
  const [x2, y2] = polar(b.angle, mid);
  const [x3, y3] = polar(b.angle, b.r);
  return `M${x0},${y0}C${x1},${y1} ${x2},${y2} ${x3},${y3}`;
}

// Zoomable view: center (x, y) in drawing units and zoom s (1 = whole web).
// The center may only move as far as keeps the drawing filling the frame.
interface View {
  x: number;
  y: number;
  s: number;
}
function clampView(v: View, size: number): View {
  const s = Math.min(MAX_ZOOM, Math.max(1, v.s));
  const lim = size / 2 - size / (2 * s);
  const c = (n: number) => Math.min(lim, Math.max(-lim, n));
  return { x: c(v.x), y: c(v.y), s };
}
// Zoom by f keeping drawing point p where it is on screen
function zoomAt(v: View, p: { x: number; y: number }, f: number, size: number): View {
  const s = Math.min(MAX_ZOOM, Math.max(1, v.s * f));
  const k = v.s / s;
  return clampView({ x: p.x + (v.x - p.x) * k, y: p.y + (v.y - p.y) * k, s }, size);
}

// Phones get webs in the zoomable frame: at that width a fitted web's labels
// are too small to read
const PHONE = "(max-width: 767px)";
export function usePhone() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(PHONE);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(PHONE).matches,
    () => false
  );
}

export function Legend({ branches }: { branches: BranchStyle[] }) {
  return (
    <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
      {branches.map((b) => (
        <li key={b.id} className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />
          {b.label}
        </li>
      ))}
    </ul>
  );
}

export function HoldingsWeb({
  tree,
  branches,
  label,
  rLeaf = 360,
  leafFont = 11,
  rings = DEFAULT_RINGS,
  linkOpacity = 0.45,
  zoomable = false,
}: {
  tree: TreeNode;
  branches: BranchStyle[];
  label: string; // accessible name of the drawing
  rLeaf?: number; // leaf ring radius; raise it for more leaves
  leafFont?: number;
  rings?: number[]; // radius of each depth as a share of rLeaf, root first
  linkOpacity?: number;
  zoomable?: boolean; // framed, with wheel or pinch zoom and drag to pan, for big webs or phones
}) {
  const router = useRouter();
  const color = useMemo(() => Object.fromEntries(branches.map((b) => [b.id, b.color])), [branches]);
  const placed = useMemo(() => layout(tree, rLeaf, rings), [tree, rLeaf, rings]);
  const size = 2 * (rLeaf + PAD);
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ p: Placed; x: number; y: number } | null>(null);

  // Zoom and pan (zoomable only). Group labels and dots keep a readable screen
  // size when zoomed out; leaf labels scale with the drawing, so they read
  // once zoomed in. One pointer pans; two (a pinch) zoom about their midpoint.
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, s: 1 });
  const [framePx, setFramePx] = useState(0);
  // Pointers down now, and the view and pointer positions when the gesture
  // last changed shape (a finger added or lifted)
  const gesture = useRef<{
    pts: Map<number, { x: number; y: number }>;
    base: { view: View; pts: Map<number, { x: number; y: number }>; pinchAt?: { x: number; y: number } };
    moved: boolean;
  } | null>(null);
  const [dragged, setDragged] = useState(false); // the last press became a drag
  const [touch, setTouch] = useState(false); // the last press was a finger: first tap shows details, second opens
  useEffect(() => {
    const svg = svgRef.current;
    if (!zoomable || !svg) return;
    const ro = new ResizeObserver(([e]) => setFramePx(Math.min(e.contentRect.width, e.contentRect.height)));
    ro.observe(svg);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const m = svg.getScreenCTM();
      if (!m) return;
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
      setHover(null);
      setView((v) => zoomAt(v, p, Math.exp(-e.deltaY * 0.0015), size));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      ro.disconnect();
      svg.removeEventListener("wheel", onWheel);
    };
  }, [zoomable, size]);
  const side = zoomable ? size / view.s : size;
  const unitsPerPx = zoomable && framePx ? side / framePx : 1;
  const keep = Math.max(1, unitsPerPx); // scale for labels that keep their screen size

  // Hovered node's ancestors and descendants stay lit
  const lit = useMemo(() => {
    if (!hover) return null;
    const ids = new Set<string>();
    for (let p: Placed | undefined = hover.p; p; p = p.parent) ids.add(p.node.id);
    const down = (n: TreeNode) => {
      ids.add(n.id);
      n.children?.forEach(down);
    };
    down(hover.p.node);
    return ids;
  }, [hover]);

  const show = (p: Placed, el: Element) => {
    const rect = box.current!.getBoundingClientRect();
    const target = el.getBoundingClientRect();
    // Keep the tooltip (up to 256px wide, centered on x) inside the frame
    const x = target.left + target.width / 2 - rect.left;
    const half = Math.min(128, rect.width / 2);
    setHover({ p, x: Math.min(Math.max(x, half), rect.width - half), y: target.top - rect.top });
  };
  const enter = (p: Placed) => (e: React.PointerEvent | React.FocusEvent) => {
    if ("pointerType" in e && e.pointerType !== "mouse") return;
    // A tap focuses the node too; on touch the tap itself decides (see tap)
    if (e.type === "focus" && touch) return;
    if (gesture.current?.moved) return;
    show(p, e.currentTarget);
  };
  const open = (href: string) =>
    /^https?:/.test(href) ? window.open(href, "_blank", "noopener,noreferrer") : router.push(href);
  // A click that ends a drag isn't a click on the node under it. On touch
  // the first tap shows the node's details and a second opens it.
  const tap = (p: Placed) => (e: React.MouseEvent) => {
    if (dragged) return;
    if (touch && hover?.p.node.id !== p.node.id) return show(p, e.currentTarget);
    if (p.node.href) open(p.node.href);
  };

  // Pan with one pointer, pinch with two
  const rebase = (g: NonNullable<typeof gesture.current>) => {
    const pts = new Map(g.pts);
    let pinchAt: { x: number; y: number } | undefined;
    const two = [...pts.values()];
    const m = svgRef.current?.getScreenCTM();
    if (two.length === 2 && m) {
      pinchAt = new DOMPoint((two[0].x + two[1].x) / 2, (two[0].y + two[1].y) / 2).matrixTransform(m.inverse());
    }
    g.base = { view, pts, pinchAt };
  };
  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    setTouch(e.pointerType !== "mouse");
    const g = gesture.current ?? { pts: new Map(), base: { view, pts: new Map() }, moved: false };
    if (!gesture.current) setDragged(false);
    g.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    rebase(g);
    gesture.current = g;
  };
  const onMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || !g.pts.has(e.pointerId)) return;
    g.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const now = [...g.pts.entries()];
    const was = now.map(([id]) => g.base.pts.get(id)!);
    const mid = (ps: { x: number; y: number }[]) => ({ x: ps.reduce((a, q) => a + q.x, 0) / ps.length, y: ps.reduce((a, q) => a + q.y, 0) / ps.length });
    const m0 = mid(was);
    const m1 = mid(now.map(([, q]) => q));
    if (!g.moved) {
      if (Math.hypot(m1.x - m0.x, m1.y - m0.y) < 4 && now.length < 2) return;
      g.moved = true;
      setDragged(true);
      setHover(null);
    }
    const base = g.base.view;
    let next = base;
    if (now.length === 2 && g.base.pinchAt) {
      const d = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y) || 1;
      next = zoomAt(base, g.base.pinchAt, d(now[0][1], now[1][1]) / d(was[0], was[1]), size);
    }
    const upp = framePx ? size / next.s / framePx : 1;
    setView(clampView({ ...next, x: next.x - (m1.x - m0.x) * upp, y: next.y - (m1.y - m0.y) * upp }, size));
  };
  const onUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    g.pts.delete(e.pointerId);
    if (g.pts.size) rebase(g);
    else gesture.current = null;
  };

  return (
    <div
      ref={box}
      className={
        zoomable
          ? "relative mt-3 aspect-square w-full rounded-md border border-border md:aspect-auto md:h-[78vh]"
          : "relative mx-auto mt-2 max-w-[1100px]"
      }
      onMouseLeave={() => setHover(null)}
    >
      <svg
        ref={svgRef}
        viewBox={zoomable ? `${view.x - side / 2} ${view.y - side / 2} ${side} ${side}` : `${-size / 2} ${-size / 2} ${size} ${size}`}
        className={zoomable ? "h-full w-full cursor-grab touch-none select-none active:cursor-grabbing" : "h-auto w-full"}
        role="img"
        aria-label={label}
        onPointerDown={zoomable ? onDown : undefined}
        onPointerMove={zoomable ? onMove : undefined}
        onPointerUp={zoomable ? onUp : undefined}
        onPointerCancel={zoomable ? onUp : undefined}
        // A tap on empty space closes the details
        onClick={(e) => !(e.target as Element).closest("g[transform]") && setHover(null)}
      >
        <g fill="none" strokeWidth={1.5}>
          {placed
            .filter((p) => p.parent)
            .map((p) => (
              <path
                key={`l-${p.node.id}`}
                d={linkPath(p.parent!, p)}
                stroke={p.node.branch ? color[p.node.branch] : "var(--muted-foreground)"}
                strokeOpacity={lit ? (lit.has(p.node.id) && lit.has(p.parent!.node.id) ? 0.9 : 0.12) : linkOpacity}
              />
            ))}
        </g>
        {placed.map((p) => {
          const [x, y] = polar(p.angle, p.r);
          const deg = (p.angle * 180) / Math.PI;
          const flip = deg > 180;
          const fill = p.node.branch ? color[p.node.branch] : "var(--foreground)";
          const dim = lit && !lit.has(p.node.id);
          const dot = (p.depth === 0 ? 9 : p.leaf ? 4 : p.depth === 1 ? 7 : 5) * (p.depth <= 1 ? keep : 1);
          const go = p.node.href ? () => open(p.node.href!) : undefined;
          // Sub-branch labels wait until they're big enough to read
          const hubLabel = p.depth <= 1 || 11.5 / unitsPerPx >= 7;
          const text = p.leaf && p.node.label.length > LABEL_MAX ? `${p.node.label.slice(0, LABEL_MAX - 1)}…` : p.node.label;
          return (
            <g
              key={p.node.id}
              transform={`translate(${x},${y})`}
              opacity={dim ? 0.25 : 1}
              onPointerEnter={enter(p)}
              onPointerDown={(e) => !zoomable && setTouch(e.pointerType !== "mouse")}
              onFocus={enter(p)}
              onBlur={() => setHover(null)}
              onClick={go || touch ? tap(p) : undefined}
              onKeyDown={go ? (e) => e.key === "Enter" && go() : undefined}
              tabIndex={go ? 0 : undefined}
              role={go ? "link" : undefined}
              aria-label={go ? p.node.label : undefined}
              className={go ? "cursor-pointer outline-none" : undefined}
            >
              <circle r={12} fill="transparent" />
              <circle r={dot} fill={fill} stroke="var(--background)" strokeWidth={2} />
              {p.leaf ? (
                <text
                  transform={`rotate(${flip ? deg + 90 : deg - 90})`}
                  x={flip ? -9 : 9}
                  dy="0.32em"
                  textAnchor={flip ? "end" : "start"}
                  fontSize={leafFont}
                  fill="var(--foreground)"
                >
                  {text}
                </text>
              ) : (
                hubLabel && (
                  <text
                    y={(p.depth === 0 ? -16 : -11) * (p.depth <= 1 ? keep : 1)}
                    textAnchor="middle"
                    fontSize={(p.depth === 0 ? 15 : p.depth === 1 ? 13 : 11.5) * (p.depth <= 1 ? keep : 1)}
                    fontWeight={p.depth <= 1 ? 600 : 500}
                    fill="var(--foreground)"
                    stroke="var(--background)"
                    strokeWidth={4 * (p.depth <= 1 ? keep : 1)}
                    strokeLinejoin="round"
                    paintOrder="stroke"
                  >
                    {p.node.label}
                  </text>
                )
              )}
            </g>
          );
        })}
      </svg>
      {zoomable && (
        <>
          <div className="absolute right-2 top-2 flex gap-1">
            {[
              { label: "+", aria: "Zoom in", f: 1.6 },
              { label: "−", aria: "Zoom out", f: 1 / 1.6 },
            ].map((b) => (
              <button
                key={b.aria}
                aria-label={b.aria}
                onClick={() => {
                  setHover(null);
                  setView((v) => zoomAt(v, v, b.f, size));
                }}
                className="h-7 w-7 rounded-md border border-border bg-background/90 text-sm hover:bg-muted"
              >
                {b.label}
              </button>
            ))}
            <button
              onClick={() => {
                setHover(null);
                setView({ x: 0, y: 0, s: 1 });
              }}
              className="h-7 rounded-md border border-border bg-background/90 px-2 text-xs hover:bg-muted"
            >
              Fit
            </button>
          </div>
          <p className="pointer-events-none absolute bottom-2 left-3 text-xs text-muted-foreground">
            <span className="md:hidden">Pinch to zoom</span>
            <span className="hidden md:inline">Scroll to zoom</span> · drag to pan · {Math.round(view.s * 10) / 10}×
          </p>
        </>
      )}
      {hover && (
        <div
          className="pointer-events-none absolute z-10 w-max max-w-64 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md"
          style={{ left: hover.x, top: hover.y - 8 }}
        >
          <p className="font-medium text-foreground">{hover.p.node.label}</p>
          {hover.p.node.detail?.map((line) => (
            <p key={line} className="text-muted-foreground">
              {line}
            </p>
          ))}
          {hover.p.node.href && (
            <p className="mt-1 text-muted-foreground">{touch ? "Tap again to open" : (hover.p.node.hint ?? "Click to open")}</p>
          )}
        </div>
      )}
    </div>
  );
}

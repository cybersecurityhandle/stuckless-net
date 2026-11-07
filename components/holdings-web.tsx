"use client";

import { useMemo, useRef, useState } from "react";
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

function polar(angle: number, r: number): [number, number] {
  return [r * Math.sin(angle), -r * Math.cos(angle)];
}

// Leaves evenly round the circle, a gap between branches; each parent at the
// middle of its children. Inner rings scale with the leaf radius.
function layout(root: TreeNode, rLeaf: number): Placed[] {
  const radii = [0, 0.29, 0.53, 0.75].map((f) => f * rLeaf);
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
}: {
  tree: TreeNode;
  branches: BranchStyle[];
  label: string; // accessible name of the drawing
  rLeaf?: number; // leaf ring radius; raise it for more leaves
  leafFont?: number;
}) {
  const router = useRouter();
  const color = useMemo(() => Object.fromEntries(branches.map((b) => [b.id, b.color])), [branches]);
  const placed = useMemo(() => layout(tree, rLeaf), [tree, rLeaf]);
  const size = 2 * (rLeaf + PAD);
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ p: Placed; x: number; y: number } | null>(null);

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

  const enter = (p: Placed) => (e: React.MouseEvent | React.FocusEvent) => {
    const rect = box.current!.getBoundingClientRect();
    const target = (e.currentTarget as SVGGElement).getBoundingClientRect();
    setHover({ p, x: target.left + target.width / 2 - rect.left, y: target.top - rect.top });
  };
  const open = (href: string) =>
    /^https?:/.test(href) ? window.open(href, "_blank", "noopener,noreferrer") : router.push(href);

  return (
    <div ref={box} className="relative mx-auto mt-2 max-w-[1100px]" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} className="h-auto w-full" role="img" aria-label={label}>
        <g fill="none" strokeWidth={1.5}>
          {placed
            .filter((p) => p.parent)
            .map((p) => (
              <path
                key={`l-${p.node.id}`}
                d={linkPath(p.parent!, p)}
                stroke={p.node.branch ? color[p.node.branch] : "var(--muted-foreground)"}
                strokeOpacity={lit ? (lit.has(p.node.id) && lit.has(p.parent!.node.id) ? 0.9 : 0.12) : 0.45}
              />
            ))}
        </g>
        {placed.map((p) => {
          const [x, y] = polar(p.angle, p.r);
          const deg = (p.angle * 180) / Math.PI;
          const flip = deg > 180;
          const fill = p.node.branch ? color[p.node.branch] : "var(--foreground)";
          const dim = lit && !lit.has(p.node.id);
          const dot = p.depth === 0 ? 9 : p.leaf ? 4 : p.depth === 1 ? 7 : 5;
          const go = p.node.href ? () => open(p.node.href!) : undefined;
          const text = p.leaf && p.node.label.length > LABEL_MAX ? `${p.node.label.slice(0, LABEL_MAX - 1)}…` : p.node.label;
          return (
            <g
              key={p.node.id}
              transform={`translate(${x},${y})`}
              opacity={dim ? 0.25 : 1}
              onMouseEnter={enter(p)}
              onFocus={enter(p)}
              onBlur={() => setHover(null)}
              onClick={go}
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
                <text
                  y={p.depth === 0 ? 24 : -11}
                  textAnchor="middle"
                  fontSize={p.depth === 0 ? 15 : p.depth === 1 ? 13 : 11.5}
                  fontWeight={p.depth <= 1 ? 600 : 500}
                  fill="var(--foreground)"
                  stroke="var(--background)"
                  strokeWidth={4}
                  strokeLinejoin="round"
                  paintOrder="stroke"
                >
                  {p.node.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
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
          {hover.p.node.href && <p className="mt-1 text-muted-foreground">{hover.p.node.hint ?? "Click to open"}</p>}
        </div>
      )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import type { ThreatActor } from "@/lib/mitre";
import { Panel } from "@/components/intel/primitives";

const PAGE = 12;

type Sort = "techniques" | "name" | "updated";

const SORTS: { key: Sort; label: string }[] = [
  { key: "techniques", label: "most techniques" },
  { key: "updated", label: "recently updated" },
  { key: "name", label: "A–Z" },
];

export function ThreatActors({ actors, updated }: { actors: ThreatActor[]; updated: string }) {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<Sort>("techniques");
  const [limit, setLimit] = useState(PAGE);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const matches = q
      ? actors.filter((a) =>
          [a.name, a.id, ...a.aliases, ...a.software].some((field) => field.toLowerCase().includes(q))
        )
      : actors;
    return [...matches].sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "updated"
          ? b.modified.localeCompare(a.modified)
          : b.techniqueCount - a.techniqueCount
    );
  }, [actors, filter, sort]);

  return (
    <Panel
      label="adversaries"
      title="Threat actor directory"
      aside={`MITRE ATT&CK · synced ${new Date(updated).toISOString().slice(0, 10)}`}
    >
      <div className="flex flex-col gap-3 border-b border-green-500/10 p-4 sm:flex-row sm:items-center">
        <label className="flex flex-1 items-center gap-2 border border-green-500/20 bg-black px-3 focus-within:border-green-500/60">
          <Search className="h-4 w-4 text-zinc-500" aria-hidden />
          <input
            type="search"
            placeholder="group, alias or malware (e.g. Cozy Bear, Cobalt Strike)"
            aria-label="Filter threat actors"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setLimit(PAGE);
            }}
            className="h-9 min-w-0 flex-1 bg-transparent font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
          />
        </label>
        <div className="flex gap-1 font-mono text-[11px]" role="group" aria-label="Sort">
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={sort === s.key}
              onClick={() => setSort(s.key)}
              className={`border px-2 py-1 transition-colors ${
                sort === s.key
                  ? "border-green-500/50 bg-green-500/10 text-green-400"
                  : "border-zinc-800 text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="p-4 text-sm text-zinc-500">
          No groups match <span className="font-mono text-zinc-200">{filter}</span>.
        </p>
      ) : (
        <div className="grid gap-px bg-green-500/10 sm:grid-cols-2">
          {visible.slice(0, limit).map((a) => (
            <a
              key={a.id}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col bg-zinc-950 p-4 transition-colors hover:bg-zinc-900/70 focus-visible:bg-zinc-900/70 focus-visible:outline-none"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-[11px] text-green-500/60">{a.id}</p>
                  <h3 className="truncate font-mono text-sm font-semibold text-zinc-100 group-hover:text-green-400">{a.name}</h3>
                </div>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-zinc-700 transition-colors group-hover:text-green-400" aria-hidden />
              </div>
              {a.aliases.length > 0 && (
                <p className="mt-1 truncate text-xs text-zinc-500">
                  aka {a.aliases.slice(0, 3).join(", ")}
                  {a.aliases.length > 3 && ` +${a.aliases.length - 3}`}
                </p>
              )}
              <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-zinc-400">{a.description}</p>
              <div className="mt-auto pt-3">
                {a.software.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {a.software.slice(0, 4).map((s) => (
                      <span key={s} className="border border-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                        {s}
                      </span>
                    ))}
                    {a.software.length > 4 && (
                      <span className="px-1 py-0.5 font-mono text-[10px] text-zinc-600">+{a.software.length - 4}</span>
                    )}
                  </div>
                )}
                <p className="font-mono text-[11px] text-zinc-500">
                  <span className="text-zinc-300">{a.techniqueCount}</span> techniques ·{" "}
                  <span className="text-zinc-300">{a.software.length}</span>
                  {" tools & malware"}
                </p>
              </div>
            </a>
          ))}
        </div>
      )}

      {visible.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + PAGE)}
          className="w-full border-t border-green-500/10 py-3 font-mono text-xs text-zinc-400 transition-colors hover:bg-green-500/[0.04] hover:text-green-400"
        >
          show {Math.min(PAGE, visible.length - limit)} more of {visible.length - limit} remaining
        </button>
      )}
    </Panel>
  );
}

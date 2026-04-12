"use client";

import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import type { ThreatActor } from "@/lib/mitre";

export function ThreatActors() {
  const [actors, setActors] = useState<ThreatActor[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/threat-actors")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setActors(data);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = actors.filter(
    (a) =>
      a.name.toLowerCase().includes(filter.toLowerCase()) ||
      a.aliases.some((alias) => alias.toLowerCase().includes(filter.toLowerCase()))
  );

  return (
    <div>
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Filter threat actors..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading threat actors...</p>
      ) : (
        <div className="max-h-[500px] overflow-y-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">Name</TableHead>
                <TableHead className="w-[200px]">Aliases</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(0, 50).map((actor) => (
                <TableRow key={actor.id}>
                  <TableCell className="font-medium text-sm">{actor.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {actor.aliases.slice(0, 3).join(", ")}
                  </TableCell>
                  <TableCell className="text-xs line-clamp-2">{actor.description}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

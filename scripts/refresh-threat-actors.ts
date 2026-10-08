/**
 * Refresh threat actor data.
 *
 * Downloads the MITRE ATT&CK Enterprise bundle (~50 MB), extracts every active
 * intrusion set with its techniques and software, and writes
 * lib/threat-actors.json so the intel page never has to fetch the bundle at
 * runtime.
 *
 * Usage:
 *   npm run refresh-threat-actors
 *
 * ATT&CK publishes a few releases a year, so re-run occasionally.
 */

import { writeFileSync } from "fs";
import { join } from "path";
import type { ThreatActor } from "../lib/mitre";

const MITRE_ATTACK_URL =
  "https://raw.githubusercontent.com/mitre/cti/master/enterprise-attack/enterprise-attack.json";

type StixObject = {
  id: string;
  type: string;
  name?: string;
  aliases?: string[];
  description?: string;
  modified?: string;
  revoked?: boolean;
  x_mitre_deprecated?: boolean;
  external_references?: Array<{ source_name: string; external_id?: string; url?: string }>;
  relationship_type?: string;
  source_ref?: string;
  target_ref?: string;
};

// Strip ATT&CK markup: [Name](url) links and (Citation: ...) markers.
function cleanDescription(text: string, max = 320): string {
  const clean = text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s*\(Citation:[^)]*\)/g, "")
    .replace(/<\/?code>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const sentenceEnd = cut.lastIndexOf(". ");
  return sentenceEnd > max * 0.5 ? cut.slice(0, sentenceEnd + 1) : `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

async function main() {
  console.log("Downloading ATT&CK bundle...");
  const res = await fetch(MITRE_ATTACK_URL);
  if (!res.ok) throw new Error(`MITRE ATT&CK fetch error: ${res.status}`);
  const { objects } = (await res.json()) as { objects: StixObject[] };

  const active = (o: StixObject) => !o.revoked && !o.x_mitre_deprecated;
  const byId = new Map(objects.filter(active).map((o) => [o.id, o]));

  const techniques = new Map<string, Set<string>>();
  const software = new Map<string, Set<string>>();
  for (const rel of objects) {
    if (rel.type !== "relationship" || rel.relationship_type !== "uses" || !active(rel)) continue;
    const target = byId.get(rel.target_ref!);
    if (!target || !rel.source_ref?.startsWith("intrusion-set--")) continue;
    const bucket = target.type === "attack-pattern" ? techniques : target.type === "malware" || target.type === "tool" ? software : null;
    if (!bucket) continue;
    if (!bucket.has(rel.source_ref)) bucket.set(rel.source_ref, new Set());
    bucket.get(rel.source_ref)!.add(target.type === "attack-pattern" ? target.id : target.name!);
  }

  const actors: ThreatActor[] = objects
    .filter((o) => o.type === "intrusion-set" && active(o))
    .map((o) => {
      const ref = o.external_references?.find((r) => r.source_name === "mitre-attack");
      return {
        id: ref?.external_id ?? o.id,
        name: o.name!,
        aliases: (o.aliases ?? []).filter((a) => a !== o.name),
        description: cleanDescription(o.description ?? ""),
        url: ref?.url ?? `https://attack.mitre.org/groups/${ref?.external_id}/`,
        techniqueCount: techniques.get(o.id)?.size ?? 0,
        software: [...(software.get(o.id) ?? [])].sort(),
        modified: o.modified ?? "",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const out = join(process.cwd(), "lib", "threat-actors.json");
  writeFileSync(out, JSON.stringify({ updated: new Date().toISOString(), actors }, null, 1) + "\n");
  console.log(`Wrote ${actors.length} threat actors to ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

export interface ThreatActor {
  id: string;
  name: string;
  aliases: string[];
  description: string;
}

const MITRE_ATTACK_URL =
  "https://raw.githubusercontent.com/mitre/cti/master/enterprise-attack/enterprise-attack.json";

let cachedActors: ThreatActor[] | null = null;

export async function fetchThreatActors(): Promise<ThreatActor[]> {
  if (cachedActors) return cachedActors;

  const res = await fetch(MITRE_ATTACK_URL, { next: { revalidate: 86400 } });
  if (!res.ok) throw new Error(`MITRE ATT&CK fetch error: ${res.status}`);
  const data = await res.json();

  const objects = data.objects as Array<Record<string, unknown>>;
  const actors = objects
    .filter((obj) => obj.type === "intrusion-set")
    .map((obj) => ({
      id: obj.id as string,
      name: obj.name as string,
      aliases: (obj.aliases as string[]) ?? [],
      description: ((obj.description as string) ?? "").slice(0, 300),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  cachedActors = actors;
  return actors;
}

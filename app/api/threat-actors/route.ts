import { NextResponse } from "next/server";
import { fetchThreatActors } from "@/lib/mitre";

export async function GET() {
  try {
    const actors = await fetchThreatActors();
    return NextResponse.json(actors);
  } catch {
    return NextResponse.json({ error: "Failed to fetch threat actors" }, { status: 502 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { fetchRecentCVEs, searchCVEs } from "@/lib/nvd";

export async function GET(request: NextRequest) {
  const keyword = request.nextUrl.searchParams.get("q");

  try {
    const cves = keyword ? await searchCVEs(keyword) : await fetchRecentCVEs();
    return NextResponse.json(cves);
  } catch {
    return NextResponse.json({ error: "Failed to fetch CVEs" }, { status: 502 });
  }
}

/**
 * Shared run recorder for the refresh jobs: each records its latest outcome
 * in public/status.json, which the /status page reads alongside each
 * dataset's own "updated" date.
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export interface JobStatus {
  ranAt: string; // ISO timestamp
  ok: boolean;
  summary: string;
  seconds: number;
}

export type StatusJson = Record<string, JobStatus>;

const PATH = join(process.cwd(), "public", "status.json");

export function recordStatus(job: string, started: number, ok: boolean, summary: string) {
  const all: StatusJson = existsSync(PATH) ? JSON.parse(readFileSync(PATH, "utf8")) : {};
  all[job] = { ranAt: new Date().toISOString(), ok, summary, seconds: Math.round((Date.now() - started) / 1000) };
  writeFileSync(PATH, JSON.stringify(all, null, 1) + "\n");
}

/**
 * Shape of a "/x: everything X owns" page that isn't hand-coded like
 * /berkshire: lib/markel.ts, lib/fairfax.ts. components/company-holdings.tsx
 * draws it, adding a US-stocks branch from the manager's latest 13F.
 */

export interface HoldingItem {
  name: string;
  pct?: number; // share of the company owned, 0..1
  year?: number; // year it joined / was first bought, where the source says
  note?: string;
  value?: string; // as the source states it, e.g. "$4.7B market value"
  ticker?: string; // Yahoo symbol → links to /finance
  src?: string; // where the year was checked (shown in the history table)
}

export interface HoldingGroup {
  name: string;
  detail?: string;
  items: HoldingItem[];
}

export interface HoldingBranch {
  id: string;
  label: string;
  color: string; // a validated 600-step var (see components/holdings-web.tsx)
  detail?: string;
  groups?: HoldingGroup[];
  items?: HoldingItem[];
}

// Every deal the filings report, including businesses since sold or merged
export interface Acquisition {
  date: string; // "2017-07" or "2017"
  name: string;
  deal?: string; // stake / what was bought, as the filing says
  price?: string; // as stated, US$ unless shown
  src: string; // filing year it's from
}

export interface CompanyHoldings {
  name: string; // "Markel Group"
  short: string; // "Markel"
  managerId?: string; // MANAGERS id whose 13F becomes the US-stocks branch
  statsTitle: string;
  stats: { label: string; value: string; sub?: string }[];
  sources: { label: string; url: string }[];
  branches: HoldingBranch[];
  historyNote: string;
  acquisitions?: Acquisition[]; // the full history; else built from item years
  notes?: string[];
}

export const BRANCH_COLORS = {
  green: "var(--color-emerald-600)",
  blue: "var(--color-sky-600)", // reserved for the 13F branch
  amber: "var(--color-amber-600)",
  violet: "var(--color-violet-600)",
};

export const branchItems = (b: HoldingBranch) => [...(b.items ?? []), ...(b.groups ?? []).flatMap((g) => g.items)];

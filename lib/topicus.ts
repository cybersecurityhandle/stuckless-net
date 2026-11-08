/**
 * Topicus.com (TSXV:TOI) for /topicus. The deal list comes from
 * scripts/refresh-tss.ts (public/topicus/tss.json); this file holds what the
 * MD&A says, by hand. Refresh after each quarterly MD&A (statutory filings:
 * https://topicus.com/investor-relations/statutory-filings): ownership units,
 * stakes, results, acquisition spend.
 */

const MDA_Q3_2026 = "https://cdn.topicusplatform.nl/__/topicuscom/q3-2026/topicus-mda-q326-final.pdf";
const CSI_MDA_Q3_2026 = "https://www.csisoftware.com/wp-content/uploads/2026/11/CSI-MDA-Q3-2026-Final.pdf";

export const SOURCES = {
  mda: { label: "Topicus Q3 2026 MD&A", url: MDA_Q3_2026 },
  csi: { label: "Constellation Q3 2026 MD&A", url: CSI_MDA_Q3_2026 },
  tss: { label: "TSS transaction updates", url: "https://totalspecificsolutions.com/about-us/transaction-updates" },
};

// Who owns what, at 2026-09-30. Topicus.com Inc. owns Topicus Coop, which
// owns the businesses; Constellation controls Topicus.com Inc. through its
// super voting share (50.1% of votes).
export const OWNERSHIP = {
  asOf: "2026-09-30",
  csiEconomic: 0.313, // Constellation's fully diluted equity interest in Topicus.com Inc. (CSI MD&A)
  csiVotes: 0.501,
  coop: [
    { holder: "Topicus.com Inc.", pct: 0.6469 },
    { holder: "Joday Group", pct: 0.2938 },
    { holder: "IJssel Group", pct: 0.0578 },
    { holder: "Constellation (directly)", pct: 0.0015 },
  ],
};

// Listed companies Topicus holds, by Yahoo ticker
export const STAKES = [
  { ticker: "SGN.WA", company: "Sygnity", pct: 0.7268, note: "controlling stake, consolidated", page: "/sygnity" },
  { ticker: "ACP.WA", company: "Asseco Poland", pct: 0.2314, note: "19,207,886 shares; equity method", page: "/asseco" },
];

// Topicus.com B.V., the Dutch business TSS combined with in 2021. Its
// products are organised by sector (topicus.nl/cases).
export const TOPICUS_NL = {
  url: "https://topicus.nl",
  sectors: ["Finance", "Education", "Healthcare", "Social domain"],
};

// Nine months to 2026-09-30, € millions (Topicus Q3 2026 MD&A)
export const RESULTS = {
  period: "9 months to Sep 30, 2026",
  revenue: 1318.0,
  revenueGrowth: 0.18,
  netIncome: 148.9,
  netIncomeTopicus: 93.1, // attributable to Topicus.com shareholders, after the Coop minorities
  fcfa2s: 199.1,
};

// Cash paid for acquisitions in each year, € millions, including holdbacks
// for earlier deals, from the year-end MD&As (2021–22 aren't on Topicus's
// site). Asseco shares are separate.
export const ACQUISITION_SPEND: { year: string; spend: number; note?: string; url: string }[] = [
  { year: "2023", spend: 131.5, url: "https://cdn.topicusplatform.nl/__/topicuscom/q4-2023/topicus-mda-q423-final.pdf" },
  { year: "2024", spend: 135.3, url: "https://cdn.topicusplatform.nl/__/topicuscom/q4-2024/topicus-mda-q424-final.pdf" },
  {
    year: "2025",
    spend: 336.6,
    note: "plus €413.2M for Asseco shares",
    url: "https://cdn.topicusplatform.nl/__/topicuscom/q4-2025/topicus-mda-q425-final.pdf",
  },
  { year: "2026 (9 mo.)", spend: 115.5, url: MDA_Q3_2026 },
];

export interface TssJson {
  updated: string;
  source: string;
  deals: { id: number; company: string; date: string; country: string | null; title: string; url: string }[];
}

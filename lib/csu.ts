/**
 * Constellation Software (TSX:CSU) for /csu. Company names come from
 * scripts/refresh-csu.ts (public/csu/portfolio.json) and, for Topicus, from
 * refresh-tss (public/topicus/tss.json). This file holds what Constellation's
 * own filings say, by hand: refresh after each quarterly MD&A
 * (https://www.csisoftware.com/investor-relations/) and each year-end press
 * release.
 */

const CSI_MDA_Q3_2026 = "https://www.csisoftware.com/wp-content/uploads/2026/11/CSI-MDA-Q3-2026-Final.pdf";
const release = (file: string) => `https://www.csisoftware.com/wp-content/uploads/2026/04/${file}`;

export const SOURCES = {
  mda: { label: "Constellation Q3 2026 MD&A", url: CSI_MDA_Q3_2026 },
  groups: { label: "Constellation's operating groups", url: "https://www.csisoftware.com/operating-groups/" },
};

export type Ownership = "wholly" | "topicus" | "lumine";

export interface Group {
  id: string; // key in portfolio.json ("topicus" comes from tss.json)
  name: string;
  ownership: Ownership;
  site: string;
  about: string;
  claimed?: string; // the group's own count, where it gives one
  page?: string; // a page on this site with more
  listNote?: string; // how complete the list is
}

// The nine operating groups on Constellation's site, Nov 2026
export const GROUPS: Group[] = [
  { id: "volaris", name: "Volaris", ownership: "wholly", site: "https://www.volarisgroup.com/portfolio/", about: "40+ vertical markets in 60+ countries", claimed: "240+" },
  { id: "jonas", name: "Jonas Software", ownership: "wholly", site: "https://jonassoftware.com/our-companies", about: "vertical market software, 40+ verticals", claimed: "200+" },
  { id: "harris", name: "Harris", ownership: "wholly", site: "https://www.harriscomputer.com/", about: "public sector, healthcare, utilities, insurance, private sector" },
  {
    id: "topicus",
    name: "Topicus",
    ownership: "topicus",
    site: "https://topicus.com/our-companies",
    about: "Europe: public and private sector",
    page: "/topicus",
    listNote: "TSS acquisitions announced since 2016",
  },
  { id: "perseus", name: "Perseus", ownership: "wholly", site: "https://csiperseus.com/portfolio/", about: "acquires and holds software businesses" },
  { id: "vela", name: "Vela", ownership: "wholly", site: "https://velasoftwaregroup.com/portfolio/", about: "a decentralized, learning-focused group", listNote: "listed by website: Vela shows logos only" },
  { id: "lumine", name: "Lumine Group", ownership: "lumine", site: "https://www.luminegroup.com/our-companies/", about: "communications and media software", claimed: "30+" },
  { id: "modaxo", name: "Modaxo", ownership: "wholly", site: "https://modaxo.com/people-transportation-brands/index.html", about: "people transportation" },
  { id: "andromeda", name: "Andromeda", ownership: "wholly", site: "https://www.csiandromeda.com/our-portfolio", about: "real estate, mortgage, lending, data and other software" },
];

// Constellation's stakes in its two listed subsidiaries, 2026-09-30 (MD&A).
// It controls both through a super voting share carrying 50.1% of the votes.
export const LISTED = {
  asOf: "2026-09-30",
  topicus: { ticker: "TOI.V", equity: 0.313, votes: 0.501 },
  lumine: { ticker: "LMN.V", equity: 0.614, votes: 0.501 },
};

// Nine months to 2026-09-30, US$ millions (MD&A)
export const RESULTS = {
  period: "9 months to Sep 30, 2026",
  revenue: 10_027,
  revenueGrowth: 0.19,
  netIncome: 853, // attributable to common shareholders of CSI
  fcfa2s: 1_522,
};

// Total acquisition consideration per year, US$ millions, including holdbacks
// and contingent consideration, from each year-end press release. 2018 and
// pre-2017 releases aren't on Constellation's site.
export const ACQUISITION_SPEND: { year: number; spend: number; note?: string; url: string }[] = [
  { year: 2017, spend: 329, url: release("csi-press-release-q4-2017-final.pdf") },
  { year: 2019, spend: 688, url: release("csi-press-release-q4-2019-final.pdf") },
  { year: 2020, spend: 628, url: release("csi-press-release-q4-2020-final.pdf") },
  { year: 2021, spend: 1_517, note: "includes Topicus.com B.V.", url: release("CSI-Press-Release-Q4-2021-Final.pdf") },
  { year: 2022, spend: 1_875, url: release("CSI-Press-Release-Q4-2022-Final.pdf") },
  { year: 2023, spend: 2_609, url: release("CSI-Press-Release-Q4-2023-Final.pdf") },
  { year: 2024, spend: 1_792, url: release("CSI-Press-Release-Q4-2024-Final.pdf") },
  { year: 2025, spend: 1_579, note: "plus $530M other net investments, incl. Asseco", url: release("CSI-Press-Release-Q4-2025-Final.pdf") },
];

// The few deals Constellation's MD&A describes by name
export const NAMED_DEALS = [
  { date: "2021-01-05", name: "Topicus.com B.V.", via: "TSS", note: "TSS then spun out with it as Topicus.com Inc." },
  { date: "2022-05-02", name: "Altera", via: "Harris", note: "Allscripts' hospitals and large physician practices segment" },
  { date: "2023-02-22", name: "WideOrbit", via: "Lumine", note: "Lumine reorganized as part of the deal" },
  { date: "2025-01-31", name: "Asseco Poland", via: "Topicus", note: "9.99%, raised to 23.14% in Sep 2025 by buying treasury shares" },
];

export interface PortfolioJson {
  updated: string;
  groups: Record<string, { updated: string; source: string; companies: { name: string; url?: string; vertical?: string; acquired?: number; hq?: string }[] }>;
  failed: string[];
}

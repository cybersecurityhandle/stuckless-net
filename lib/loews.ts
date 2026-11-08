/**
 * Loews (NYSE:L) for /loews, from its 10-Ks: subsidiaries and the deals the 10-Ks for
 * 2000-2025 name. Refresh after each 10-K (Feb).
 */

import { BRANCH_COLORS, acquisitionsByDecade, type Acquisition, type CompanyHoldings } from "@/lib/company-holdings";

const ACQUISITIONS: Acquisition[] = [
  { date: "2003-05", name: "Texas Gas Transmission", deal: "from Williams; now Boardwalk", src: "10-K" },
  { date: "2004-12", name: "Gulf South Pipeline", deal: "now Boardwalk", src: "10-K" },
  { date: "2007-07", name: "Dominion exploration and production assets", deal: "became HighMount", src: "10-K" },
  { date: "2011", name: "CNA Surety", deal: "the publicly held minority, by CNA", src: "10-K" },
  { date: "2012-06", name: "Loews Hollywood Hotel", deal: "by Loews Hotels", src: "10-K" },
  { date: "2012-07", name: "Hardy Underwriting Bermuda", deal: "Lloyd's underwriter, by CNA", src: "10-K" },
  { date: "2012-10", name: "Louisiana Midstream", deal: "by Boardwalk", price: "~$620M", src: "10-K" },
  { date: "2017-05", name: "Altium Packaging (CCC Acquisition Holdings)", src: "10-K" },
  { date: "2018-06", name: "Boardwalk Pipeline Partners", deal: "the public common units, taking it private", src: "10-K" },
  { date: "2019-06", name: "Tri State Distribution", deal: "by Altium; now Altium Healthcare", src: "10-K" },
  { date: "2023-09", name: "Bayou Ethane (Williams Olefins Pipeline)", deal: "100%, by Boardwalk", price: "$355M", src: "10-K" },
];

export const LOEWS: CompanyHoldings = {
  name: "Loews Corporation",
  short: "Loews",
  statsTitle: "2025 · 10-K",
  stats: [
    { label: "Net income", value: "$1,667M", sub: "attributable to Loews (2024: $1,414M)" },
    { label: "CNA Financial", value: "~92% owned", sub: "its largest subsidiary" },
    { label: "Deals named", value: String(ACQUISITIONS.length), sub: "in 10-Ks since 2000" },
  ],
  sources: [{ label: "Loews 10-K filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000060086&type=10-K" }],
  branches: [
    {
      id: "subsidiaries",
      label: "Subsidiaries",
      color: BRANCH_COLORS.green,
      items: [
        { name: "CNA Financial", pct: 0.92, ticker: "CNA", note: "commercial property and casualty insurance" },
        { name: "Boardwalk Pipelines", note: "natural gas pipelines and storage; private since 2018" },
        { name: "Loews Hotels & Co" },
        { name: "Altium Packaging", year: 2017, src: "2017 10-K" },
      ],
    },
    acquisitionsByDecade(ACQUISITIONS, "Acquisitions", BRANCH_COLORS.amber),
  ],
  historyNote: "Deals Loews' 10-Ks for 2000-2025 describe, including those made through CNA, Boardwalk, Loews Hotels and Altium. Loews' large buybacks of its own shares aren't listed.",
  acquisitions: ACQUISITIONS,
};

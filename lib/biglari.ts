/**
 * Biglari Holdings (NYSE:BH) for /biglari, from its 10-Ks for 2018-2025 (the current
 * company's filings; Steak n Shake, Western Sizzlin, First Guard and Maxim came
 * earlier and aren't dated there). Refresh after each 10-K (Feb).
 */

import { BRANCH_COLORS, acquisitionsByDecade, type Acquisition, type CompanyHoldings } from "@/lib/company-holdings";

const ACQUISITIONS: Acquisition[] = [
  { date: "2019-09", name: "Southern Oil of Louisiana", deal: "100%, by Southern Oil Company", src: "10-K" },
  { date: "2020-03", name: "Southern Pioneer Property & Casualty Insurance", deal: "with its agency", src: "10-K" },
  { date: "2022-09", name: "Abraxas Petroleum", deal: "preferred shares giving 90%", price: "$80.0M", src: "10-K" },
  { date: "2023", name: "Abraxas Petroleum", deal: "the remaining 10%", price: "$5.4M", src: "10-K" },
];

export const BIGLARI: CompanyHoldings = {
  name: "Biglari Holdings",
  short: "Biglari",
  statsTitle: "From the 10-Ks, 2018-2025",
  stats: [
    { label: "Business lines", value: "4", sub: "restaurants, insurance, oil and gas, licensing and media" },
    { label: "Deals since 2018", value: String(ACQUISITIONS.length), sub: "named in the 10-Ks" },
    { label: "Led by", value: "Sardar Biglari", sub: "Chairman and CEO" },
  ],
  sources: [{ label: "Biglari Holdings 10-K filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001726173&type=10-K" }],
  branches: [
    {
      id: "businesses",
      label: "Subsidiaries",
      color: BRANCH_COLORS.green,
      groups: [
        { name: "Restaurants", items: [{ name: "Steak n Shake" }, { name: "Western Sizzlin" }] },
        { name: "Insurance", items: [{ name: "First Guard Insurance" }, { name: "Southern Pioneer", year: 2020, src: "10-K" }] },
        { name: "Oil and gas", items: [{ name: "Southern Oil", year: 2019, src: "10-K" }, { name: "Abraxas Petroleum", year: 2022, src: "10-K" }] },
        { name: "Licensing and media", items: [{ name: "Maxim" }] },
      ],
    },
    acquisitionsByDecade(ACQUISITIONS, "Acquisitions", BRANCH_COLORS.amber),
  ],
  historyNote: "Deals the current Biglari Holdings' 10-Ks (2018 onward) describe. Steak n Shake, Western Sizzlin, First Guard and Maxim were acquired earlier and aren't dated in these filings.",
  acquisitions: ACQUISITIONS,
};

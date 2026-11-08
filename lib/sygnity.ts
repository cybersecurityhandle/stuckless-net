/**
 * Sygnity (WSE:SGN) for /sygnity. Group structure from note 2 of the H1 2026
 * report (SSF-i-JSF-SGN-H126.pdf, Polish); deals and prices from Sygnity's
 * current reports (RB) on sygnity.pl/dla-inwestorow; 9M 2026 results from the
 * preliminary RB 29/2026 (final Q3 report due 2026-11-10). Topicus owns
 * 72.68% (lib/topicus.ts STAKES). Refresh after each periodic report.
 */

import { BRANCH_COLORS, type Acquisition, type CompanyHoldings } from "@/lib/company-holdings";

const H1 = "H1 2026 report";
const RB = (n: string) => `current report ${n}`;
const UPLOADS = "https://www.sygnity.pl/wp-content/uploads";

const ACQUISITIONS: Acquisition[] = [
  { date: "2024-02", name: "Edrana Baltic", deal: "100%; ERP systems in Lithuania and Latvia", price: "~€2.7M before adjustments", src: RB("34/2023, 7/2024") },
  { date: "2024-03", name: "Sagra Technology", deal: "100%; SaaS sales, marketing and analytics software", price: "up to ~PLN 42.3M", src: RB("10/2024") },
  { date: "2025-07", name: "DocLogix", deal: "100%; Vilnius, with its Latvian subsidiary", src: H1 },
  { date: "2025-12", name: "Comarch HIS (now Mednow)", deal: "100%; Comarch's hospital information system business, split out of Comarch", price: "~PLN 28M before adjustments", src: RB("30/2025, 37/2025") },
  { date: "2026-10", name: "g.on experience", deal: "100%, through Tessara Blue; bought from TSS Europe, Sygnity's majority owner", price: "~€7.2M before adjustments", src: RB("27/2026") },
];

export const SYGNITY: CompanyHoldings = {
  name: "Sygnity",
  short: "Sygnity",
  statsTitle: "9 months to Sep 30, 2026 · preliminary figures, PLN",
  stats: [
    { label: "Revenue", value: "PLN 336.3M", sub: "+38% (9M 2025: PLN 243.0M)" },
    { label: "Net profit", value: "PLN 75.9M", sub: "+56% (9M 2025: PLN 48.6M)" },
    { label: "EBITDA", value: "PLN 102.2M", sub: "final Q3 report due Nov 10" },
  ],
  sources: [
    { label: "H1 2026 report", url: `${UPLOADS}/2026/09/SSF-i-JSF-SGN-H126.pdf` },
    {
      label: "9M 2026 preliminary results",
      url: `${UPLOADS}/2026/11/RB_29_2026-Informacja-nt.-wstepnych-wynikow-finansowych-za-III-kwartaly-roku-obrotowego-2026-.pdf`,
    },
    { label: "Investor reports", url: "https://www.sygnity.pl/dla-inwestorow/" },
  ],
  branches: [
    {
      id: "pl",
      label: "Poland",
      color: BRANCH_COLORS.green,
      items: [
        { name: "Sygnity Business Solutions", note: "Zielona Góra; software and IT services" },
        { name: "Sygnity Holding International", note: "holding company" },
        { name: "Sagra Technology", year: 2024, src: RB("10/2024"), note: "Szczecin; SaaS sales and marketing software" },
        { name: "Mednow", year: 2025, src: RB("37/2025"), note: "Katowice; hospital information systems, ex Comarch HIS" },
        { name: "Budimex Sygnity", pct: 0.33, note: "joint venture with Budimex for one project; equity method" },
        { name: "Emtal", pct: 0.5, note: "public transport systems; not consolidated, fully written down" },
        { name: "Geomar", note: "bankrupt since 2020; not consolidated" },
      ],
    },
    {
      id: "baltics",
      label: "Baltics",
      color: BRANCH_COLORS.amber,
      items: [
        { name: "Edrana Baltic", year: 2024, src: RB("7/2024"), note: "Vilnius; ERP systems" },
        { name: "Edrana (Latvia)", note: "Riga; through Edrana Baltic" },
        { name: "DocLogix", year: 2025, src: H1, note: "Vilnius; software" },
        { name: "DocLogix Latvia", note: "Riga; through DocLogix" },
      ],
    },
    {
      id: "west",
      label: "Netherlands & Germany",
      color: BRANCH_COLORS.violet,
      detail: "Sygnity's first subsidiaries outside Poland and the Baltics",
      items: [
        { name: "Tessara Blue", note: "Utrecht; holding company set up May 2026" },
        { name: "g.on experience", year: 2026, src: RB("27/2026"), note: "Münster; geolocation software for managing infrastructure" },
      ],
    },
  ],
  historyNote:
    "Acquisitions in Sygnity's 2024–2026 reports, part of its plan to invest surplus cash in other software companies. Older deals still carried as goodwill (EMAX, PB Polsoft, Winuel, Aram) aren't dated in the H1 2026 report.",
  acquisitions: ACQUISITIONS,
  notes: [
    "Topicus owns 72.68% through TSS Europe B.V.; Constellation Software is the ultimate parent.",
  ],
};

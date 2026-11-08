/**
 * Lumine Group (TSXV:LMN) for /lumine. Companies, categories and acquisition
 * years from luminegroup.com/our-companies; closing dates, sellers and prices
 * from its newsroom; results from the Q3 2026 release (US$). Refresh after
 * each quarter's release.
 */

import { BRANCH_COLORS, type Acquisition, type CompanyHoldings } from "@/lib/company-holdings";

const ACQUISITIONS: Acquisition[] = [
  { date: "2014", name: "Incognito Software Systems", src: "luminegroup.com" },
  { date: "2015", name: "Netadmin Systems", src: "luminegroup.com" },
  { date: "2017", name: "Tarantula", src: "luminegroup.com" },
  { date: "2017", name: "Telepin", src: "luminegroup.com" },
  { date: "2017", name: "WDS-SICAP", deal: "Sicap Schweiz bought Jan 2018", src: "luminegroup.com" },
  { date: "2018", name: "Aleyant", src: "luminegroup.com" },
  { date: "2019", name: "Advantage 360", src: "luminegroup.com" },
  { date: "2019", name: "Avance Metering", src: "luminegroup.com" },
  { date: "2019", name: "Velocix", deal: "part of Nokia's video product business; agreed Sep 2018", src: "luminegroup.com" },
  { date: "2019-07", name: "MDS Global", src: "press release" },
  { date: "2020", name: "Collab", src: "luminegroup.com" },
  { date: "2020", name: "Symbrio", src: "luminegroup.com" },
  { date: "2020-01", name: "Lifecycle Software", src: "press release" },
  { date: "2020-08", name: "Flash Networks", src: "press release" },
  { date: "2021-01", name: "VAS-X", src: "press release" },
  { date: "2021-03", name: "TransMedia Dynamics", src: "press release" },
  { date: "2021-06", name: "Neural Technologies", src: "press release" },
  { date: "2021-07", name: "NetEngage", deal: "Concentrix's Mobile Network Solutions business", src: "press release" },
  { date: "2021-07", name: "Ubersmith", src: "press release" },
  { date: "2021-10", name: "Kansys", src: "press release" },
  { date: "2022", name: "MACH", src: "luminegroup.com" },
  { date: "2022", name: "Telarix", src: "luminegroup.com" },
  { date: "2022-06", name: "TOMIA", src: "press release" },
  { date: "2022-12", name: "Wiztivi", deal: "carve-out", src: "press release" },
  { date: "2023-02", name: "WideOrbit", deal: "bought as Lumine was spun out of Constellation", src: "press release" },
  { date: "2023-03", name: "Titan.ium", src: "press release" },
  { date: "2023-11", name: "Openwave", deal: "from Synchronoss's Messaging & NetworkX units", src: "press release" },
  { date: "2023-11", name: "RazorFlow", deal: "from Synchronoss's Messaging & NetworkX units", src: "press release" },
  { date: "2023-11", name: "SpatialNetworX", deal: "from Synchronoss's Messaging & NetworkX units", src: "press release" },
  { date: "2024-04", name: "Axyom.Core", deal: "Casa Systems' Axyom 5G core software and RAN assets", src: "press release" },
  { date: "2024-04", name: "Motive", deal: "Nokia's device and service management platform businesses", price: "up to €185M incl. €35M contingent", src: "press release" },
  { date: "2025-04", name: "Vidispine", deal: "from Arvato Systems (Bertelsmann)", src: "press release" },
  { date: "2025-07", name: "Datafusion Systems", src: "press release" },
  { date: "2026-02", name: "Synchronoss Technologies", deal: "100%; was Nasdaq-listed", price: "$116.4M equity value at $9.00/share", src: "press release" },
  { date: "2026-07", name: "Imagine Communications", price: "$231.5M with Quortex, incl. deferred payments", src: "press release" },
  { date: "2026-07", name: "Quortex", deal: "carve-out from Synamedia's video network business", price: "see Imagine Communications", src: "press release" },
];

export const LUMINE: CompanyHoldings = {
  name: "Lumine Group",
  short: "Lumine",
  statsTitle: "9 months to Sep 30, 2026 · Q3 2026 release, US$",
  stats: [
    { label: "Revenue", value: "$733.3M", sub: "+33% (9M 2025: $549.4M)" },
    { label: "Net income", value: "$60.0M", sub: "−13% (9M 2025: $69.2M)" },
    { label: "Operating income", value: "$218.7M", sub: "Lumine's non-IFRS measure (9M 2025: $187.3M)" },
  ],
  sources: [
    { label: "Our companies", url: "https://www.luminegroup.com/our-companies/" },
    {
      label: "Q3 2026 results",
      url: "https://www.luminegroup.com/statutory-filings/lumine-group-inc-announces-results-for-the-third-quarter-ended-september-30-2026/",
    },
  ],
  branches: [
    {
      id: "support",
      label: "Operator software",
      color: BRANCH_COLORS.green,
      detail: "Billing, business and operations support systems",
      groups: [
        { name: "Business support (BSS)", items: [
        { name: "Advantage 360", year: 2019, src: "luminegroup.com" },
        { name: "Collab", year: 2020, src: "luminegroup.com" },
        { name: "Incognito Software Systems", year: 2014, src: "luminegroup.com" },
        { name: "Kansys", year: 2021, src: "luminegroup.com" },
        { name: "Lifecycle Software", year: 2020, src: "luminegroup.com" },
        { name: "MACH", year: 2022, src: "luminegroup.com" },
        { name: "MDS Global", year: 2019, src: "luminegroup.com" },
        { name: "Motive", year: 2024, src: "luminegroup.com", note: "Nokia's device and service management platform businesses" },
        { name: "NetEngage", year: 2021, src: "luminegroup.com", note: "Concentrix's Mobile Network Solutions business" },
        { name: "Neural Technologies", year: 2021, src: "luminegroup.com" },
        { name: "RazorFlow", year: 2023, src: "luminegroup.com", note: "from Synchronoss's Messaging & NetworkX units" },
        { name: "Symbrio", year: 2020, src: "luminegroup.com" },
        { name: "Telarix", year: 2022, src: "luminegroup.com" },
        { name: "Telepin", year: 2017, src: "luminegroup.com" },
        { name: "TOMIA", year: 2022, src: "luminegroup.com" },
        { name: "Ubersmith", year: 2021, src: "luminegroup.com" },
        { name: "VAS-X", year: 2021, src: "luminegroup.com" },
        { name: "WDS-SICAP", year: 2017, src: "luminegroup.com", note: "Sicap Schweiz bought Jan 2018" },
        ] },
        { name: "Operations support (OSS)", items: [
        { name: "Avance Metering", year: 2019, src: "luminegroup.com" },
        { name: "Netadmin Systems", year: 2015, src: "luminegroup.com" },
        { name: "SpatialNetworX", year: 2023, src: "luminegroup.com", note: "from Synchronoss's Messaging & NetworkX units" },
        { name: "Tarantula", year: 2017, src: "luminegroup.com" },
        ] },
      ],
    },
    { id: "network", label: "Network applications", color: BRANCH_COLORS.violet, items: [
        { name: "Axyom.Core", year: 2024, src: "luminegroup.com", note: "Casa Systems' Axyom 5G core software and RAN assets" },
        { name: "Datafusion Systems", year: 2025, src: "luminegroup.com" },
        { name: "Flash Networks", year: 2020, src: "luminegroup.com" },
        { name: "Openwave", year: 2023, src: "luminegroup.com", note: "from Synchronoss's Messaging & NetworkX units" },
        { name: "Synchronoss Technologies", year: 2026, src: "luminegroup.com", note: "100%; was Nasdaq-listed" },
        { name: "Titan.ium", year: 2023, src: "luminegroup.com" },
    ] },
    { id: "media", label: "Content & media", color: BRANCH_COLORS.amber, items: [
        { name: "Aleyant", year: 2018, src: "luminegroup.com" },
        { name: "Imagine Communications", year: 2026, src: "luminegroup.com" },
        { name: "Quortex", year: 2026, src: "luminegroup.com", note: "carve-out from Synamedia's video network business" },
        { name: "TransMedia Dynamics", year: 2021, src: "luminegroup.com" },
        { name: "Velocix", year: 2019, src: "luminegroup.com", note: "part of Nokia's video product business; agreed Sep 2018" },
        { name: "Vidispine", year: 2025, src: "luminegroup.com", note: "from Arvato Systems (Bertelsmann)" },
        { name: "WideOrbit", year: 2023, src: "luminegroup.com", note: "bought as Lumine was spun out of Constellation" },
        { name: "Wiztivi", year: 2022, src: "luminegroup.com", note: "carve-out" },
    ] },
  ],
  historyNote:
    "Every company on Lumine's site, by the year it gives for each; month, seller and price where its press release states them. Lumine was a Volaris division until Constellation spun it out in February 2023.",
  acquisitions: ACQUISITIONS,
};

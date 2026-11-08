/**
 * Brookfield Corporation (NYSE:BN) for /brookfield. Principal subsidiaries
 * and ownership from the 2025 annual information form (40-F exhibit 99.1,
 * Dec 31 2025); deals since 2023 from its "development of the business";
 * Just Group and Oaktree closings and H1 2026 results from the Q1 and Q2
 * 2026 reports (6-K). The operating affiliates' leaves are the businesses
 * the AIF names them buying since 2023, not their whole portfolios. Refresh
 * after each 40-F (Mar).
 */

import { BRANCH_COLORS, type Acquisition, type CompanyHoldings } from "@/lib/company-holdings";

const ACQUISITIONS: Acquisition[] = [
  { date: "2023-01", name: "HomeServe", deal: "BIP: residential infrastructure, North America and Europe", price: "~$1.2B", src: "2025 AIF" },
  { date: "2023-02", name: "German telecom business", deal: "BIP: effective 6% interest", price: "~$700M", src: "2025 AIF" },
  { date: "2023-09", name: "Triton International", deal: "BIP: global intermodal logistics; via BIPC", price: "$1.2B", src: "2025 AIF" },
  { date: "2023-10", name: "North American hyperscale data center platform", deal: "BIP: ~15% interest", price: "~$400M", src: "2025 AIF" },
  { date: "2023-10", name: "X-Elio Energy", deal: "BEP: remaining 50%, with institutional partners", price: "$893M", src: "2025 AIF" },
  { date: "2023-10", name: "US renewable developer and operator", deal: "BEP: 5,900 MW operating and under construction", price: "$1.1B", src: "2025 AIF" },
  { date: "2023-11", name: "Argo Group International", deal: "Brookfield Wealth Solutions: 100%, all cash", price: "~$1.1B", src: "2025 AIF" },
  { date: "2023-12", name: "UK renewables developer", deal: "BEP: 260 MW onshore wind plus pipeline", price: "$625M", src: "2025 AIF" },
  { date: "2023", name: "South Korean logistics portfolio", deal: "BPY: through an opportunistic real estate fund", price: "$532M", src: "2025 AIF" },
  { date: "2024-01", name: "Cyxtera data center portfolio", deal: "BIP: bought out of bankruptcy", src: "2025 AIF" },
  { date: "2024-05", name: "American Equity Investment Life (AEL)", deal: "Brookfield Wealth Solutions: remaining shares; merged with American National", price: "$56.50 per share in cash and BAM stock", src: "2025 AIF" },
  { date: "2024-09", name: "Network International", deal: "BBU: 100%; was LSE-listed", price: "~$2.7B", src: "2025 AIF" },
  { date: "2024-09", name: "Castlelake", deal: "BN: 51% of fee-related earnings, 7.5% of carried interest", price: "~$489M", src: "2025 AIF" },
  { date: "2024", name: "US multifamily portfolio (23 assets)", deal: "BPY: through an opportunistic real estate fund", price: "$1.6B", src: "2025 AIF" },
  { date: "2024", name: "US logistics portfolio (129 assets)", deal: "BPY: through an opportunistic real estate fund", price: "~$1.3B", src: "2025 AIF" },
  { date: "2024", name: "US student housing portfolio (14 assets)", deal: "BPY: through an opportunistic real estate fund", price: "~$874M", src: "2025 AIF" },
  { date: "2024", name: "European logistics portfolio", deal: "BPY: through an opportunistic real estate fund", price: "~$791M", src: "2025 AIF" },
  { date: "2024-12", name: "UK offshore wind portfolio", deal: "BEP: 12.45% of four farms, 3.5 GW", price: "~$565M net to BEP", src: "2025 AIF" },
  { date: "2025-01", name: "Chemelex", deal: "BBU: carve-out; electric heat tracing", price: "$1.7B enterprise value", src: "2025 AIF" },
  { date: "2025", name: "US single-family rental portfolio", deal: "BPY: through an opportunistic real estate fund", price: "~$920M", src: "2025 AIF" },
  { date: "2025-04", name: "Neoen", deal: "BEP: 100%, after a 53% controlling stake and squeeze-out", src: "2025 AIF" },
  { date: "2025-05", name: "US renewable platform", deal: "BEP: 3.9 GW operating and under construction", price: "~$1.4B", src: "2025 AIF" },
  { date: "2025-05", name: "Antylia Scientific", deal: "BBU: lab consumables and testing equipment", price: "~$1.3B enterprise value", src: "2025 AIF" },
  { date: "2025-07", name: "Global Container International fleet", deal: "BIP: ~0.5M TEU of containers", price: "~$1.1B", src: "2025 AIF" },
  { date: "2025-07", name: "Colonial Enterprises", deal: "BIP: largest US refined products pipeline; effective 15%", price: "~$900M", src: "2025 AIF" },
  { date: "2025-09", name: "Hotwire Communications", deal: "BIP: fiber to the home; effective 20%", price: "~$800M", src: "2025 AIF" },
  { date: "2025", name: "European hostels platform", deal: "BAM funds: 15 properties in 10 countries", price: "~$925M", src: "2025 AIF" },
  { date: "2025-10", name: "Isagen", deal: "BEP: incremental 15%", src: "2025 AIF" },
  { date: "2025-10", name: "First National Financial", deal: "BBU: Canadian non-bank mortgage lender", price: "~C$3.65B enterprise value", src: "2025 AIF" },
  { date: "2025-12", name: "Fosber", deal: "BBU: agreed to acquire; closing not reported in these filings", price: "~$950M enterprise value", src: "2025 AIF" },
  { date: "2026-04", name: "Just Group", deal: "Brookfield Wealth Solutions: 100%; UK pension risk transfer; closed just after Q1", price: "~£2.4B", src: "Q1 2026 report" },
  { date: "2026-07", name: "Oaktree Capital Management", deal: "BN: remaining ~26%; now 100%", price: "~$3B", src: "Q2 2026 report" },
];

export const BROOKFIELD: CompanyHoldings = {
  name: "Brookfield Corporation",
  short: "Brookfield",
  statsTitle: "6 months to Jun 30, 2026 · Q2 2026 report, US$",
  stats: [
    { label: "Revenues", value: "$37,986M", sub: "+5% (H1 2025: $36,027M), consolidated" },
    { label: "Net income to shareholders", value: "$466M", sub: "H1 2025: $345M" },
    { label: "Distributable earnings", value: "$2,820M", sub: "before realizations; Brookfield's non-IFRS measure" },
  ],
  sources: [
    { label: "2025 annual information form", url: "https://www.sec.gov/Archives/edgar/data/1001085/000100108526000006/a2025-40xfex991aif.htm" },
    { label: "Q2 2026 report", url: "https://www.sec.gov/Archives/edgar/data/1001085/000100108526000021/bn-20260630.htm" },
  ],
  branches: [
    {
      id: "wealth",
      label: "Wealth solutions",
      color: BRANCH_COLORS.amber,
      detail: "Insurance; $191B of insurance assets at Jun 30 2026",
      items: [
        { name: "Brookfield Wealth Solutions", note: "paired entity; BN holds its class C shares", ticker: "BNT" },
        { name: "American National", year: 2024, src: "2025 AIF", note: "merged with American Equity (AEL) after buying the rest of AEL" },
        { name: "Argo Group", year: 2023, src: "2025 AIF", note: "specialty insurer" },
        { name: "Just Group", year: 2026, src: "Q1 2026 report", note: "UK pension risk transfer" },
      ],
    },
    {
      id: "am",
      label: "Asset management",
      color: BRANCH_COLORS.green,
      items: [
        { name: "Brookfield Asset Management", pct: 0.69, note: "73% of votes with the other Brookfield holders", ticker: "BAM" },
        { name: "Oaktree", pct: 1, year: 2026, src: "Q2 2026 report", note: "remaining ~26% bought Jul 2026" },
        { name: "Castlelake", year: 2024, src: "2025 AIF", note: "51% of fee-related earnings, 7.5% of carry" },
      ],
    },
    {
      id: "operating",
      label: "Operating businesses",
      color: BRANCH_COLORS.violet,
      detail: "Perpetual affiliates BN controls through 100% of the general partner; equity shown is BN's",
      groups: [
        { name: "Business Partners (BBU) · 43%", detail: "private equity; 68% with the other Brookfield holders", items: [
        { name: "Network International", year: 2024, src: "2025 AIF" },
        { name: "Chemelex", year: 2025, src: "2025 AIF" },
        { name: "Antylia Scientific", year: 2025, src: "2025 AIF" },
        { name: "First National Financial", year: 2025, src: "2025 AIF" },
        ] },
        { name: "Infrastructure (BIP) · 26%", items: [
        { name: "HomeServe", year: 2023, src: "2025 AIF" },
        { name: "Triton International", year: 2023, src: "2025 AIF" },
        { name: "Cyxtera data centers", year: 2024, src: "2025 AIF" },
        { name: "Global Container International fleet", year: 2025, src: "2025 AIF" },
        { name: "Colonial Enterprises", year: 2025, src: "2025 AIF", note: "effective 15%" },
        { name: "Hotwire Communications", year: 2025, src: "2025 AIF", note: "effective 20%" },
        ] },
        { name: "Renewable (BEP) · 45%", items: [
        { name: "X-Elio", year: 2023, src: "2025 AIF", note: "remaining 50% bought" },
        { name: "Neoen", year: 2025, src: "2025 AIF" },
        { name: "Isagen", year: 2025, src: "2025 AIF", note: "incremental 15% bought" },
        ] },
        { name: "Property (BPY) · 100%", detail: "bought through opportunistic real estate funds", items: [
        { name: "US multifamily (23 assets)", year: 2024, src: "2025 AIF" },
        { name: "US logistics (129 assets)", year: 2024, src: "2025 AIF" },
        { name: "US student housing (14 assets)", year: 2024, src: "2025 AIF" },
        { name: "European logistics", year: 2024, src: "2025 AIF" },
        { name: "US single-family rentals", year: 2025, src: "2025 AIF" },
        ] },
      ],
    },
  ],
  historyNote:
    "Every acquisition the 2025 AIF describes since January 2023, across Brookfield and its affiliates, plus the 2026 closings in the Q1 and Q2 reports. Most were made alongside institutional partners in Brookfield-managed funds.",
  acquisitions: ACQUISITIONS,
};

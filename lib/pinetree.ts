/**
 * Pinetree Capital (TSX:PNP) for /pinetree. Not an owner of operating
 * businesses like CSU: a concentrated portfolio of minority stakes in listed
 * software companies. Only the year-end MD&A names the holdings (with % of
 * portfolio and % of each company); quarterly MD&As give industry and country
 * totals only. Holdings from the 2025 annual MD&A, history from the 2020-2025
 * annual MD&As, results from the Q3 2026 release and MD&A (C$). All on
 * pinetreecapital.com/investors/financial-reports. Refresh after each annual
 * MD&A (Mar) and check the industry table each quarter.
 */

import { BRANCH_COLORS, type Acquisition, type CompanyHoldings } from "@/lib/company-holdings";

const REPORTS = "https://www.pinetreecapital.com/_resources/financials";

// One row per company named in a year-end portfolio table since 2020: the
// first year-end it appears, the year-ends held, peak weight and stake.
const HISTORY: Acquisition[] = [
  { date: "2020", name: "TruBridge", deal: "2020–2021, 2024–2025 · peak 28.8% of the portfolio (2025) · up to 5.8% of the company · US healthcare software; renamed from Computer Programs & Systems (CPSI)", src: "2020 year-end MD&A" },
  { date: "2020", name: "Bravura Solutions", deal: "2020, 2022–2025 · peak 24.1% of the portfolio (2025) · up to 3.0% of the company", src: "2020 year-end MD&A" },
  { date: "2020", name: "Constellation Software (debenture)", deal: "2020–2023 · peak 15.2% of the portfolio (2020) · CSU's debentures, not its shares", src: "2020 year-end MD&A" },
  { date: "2020", name: "Quorum Information", deal: "2020–2024 · peak 10.9% of the portfolio (2023) · up to 10.9% of the company", src: "2020 year-end MD&A" },
  { date: "2020", name: "Showbie", deal: "2020–2025 · peak 10.1% of the portfolio (2020) · up to 3.9% of the company", src: "2020 year-end MD&A" },
  { date: "2020", name: "Conduent", deal: "2020–2023 · peak 9.7% of the portfolio (2020) · up to 0.2% of the company", src: "2020 year-end MD&A" },
  { date: "2020", name: "Micro Focus", deal: "2020–2021 · peak 6.6% of the portfolio (2020) · up to 0.1% of the company", src: "2020 year-end MD&A" },
  { date: "2020", name: "Dalet", deal: "2020 · peak 6.4% of the portfolio (2020) · up to 1.5% of the company", src: "2020 year-end MD&A" },
  { date: "2020", name: "ProntoForms", deal: "2020–2023 · peak 5.1% of the portfolio (2020) · up to 1.2% of the company · later renamed TrueContext", src: "2020 year-end MD&A" },
  { date: "2020", name: "Computer Modelling Group", deal: "2020, 2025 · peak 4.7% of the portfolio (2025) · up to 1.0% of the company", src: "2020 year-end MD&A" },
  { date: "2020", name: "Linedata", deal: "2020 · peak 4.5% of the portfolio (2020) · up to 0.3% of the company", src: "2020 year-end MD&A" },
  { date: "2020", name: "Spok Holdings", deal: "2020 · peak 3.3% of the portfolio (2020) · up to 0.2% of the company", src: "2020 year-end MD&A" },
  { date: "2020", name: "Itesoft", deal: "2020 · peak 2.6% of the portfolio (2020) · up to 1.9% of the company", src: "2020 year-end MD&A" },
  { date: "2020", name: "Gresham Technologies", deal: "2020 · peak 2.0% of the portfolio (2020) · up to 0.2% of the company", src: "2020 year-end MD&A" },
  { date: "2021", name: "Adapt IT", deal: "2021 · peak 10.0% of the portfolio (2021) · up to 4.9% of the company", src: "2021 year-end MD&A" },
  { date: "2021", name: "Tungsten", deal: "2021 · peak 7.3% of the portfolio (2021) · up to 3.2% of the company", src: "2021 year-end MD&A" },
  { date: "2021", name: "Crealogix", deal: "2021 · peak 6.4% of the portfolio (2021) · up to 1.0% of the company", src: "2021 year-end MD&A" },
  { date: "2021", name: "Basware", deal: "2021 · peak 5.9% of the portfolio (2021) · up to 0.4% of the company", src: "2021 year-end MD&A" },
  { date: "2021", name: "Optiva", deal: "2021 · peak 4.2% of the portfolio (2021) · up to 1.0% of the company", src: "2021 year-end MD&A" },
  { date: "2021", name: "LiveVox", deal: "2021 · peak 1.5% of the portfolio (2021) · up to 0.1% of the company", src: "2021 year-end MD&A" },
  { date: "2021", name: "PayGroup", deal: "2021 · peak 0.4% of the portfolio (2021) · up to 0.4% of the company", src: "2021 year-end MD&A" },
  { date: "2022", name: "Sygnity", deal: "2022–2024 · peak 12.3% of the portfolio (2023) · up to 2.6% of the company", src: "2022 year-end MD&A" },
  { date: "2022", name: "SS&C Technologies", deal: "2022–2023 · peak 8.9% of the portfolio (2023)", src: "2022 year-end MD&A" },
  { date: "2022", name: "Topicus", deal: "2022–2024 · peak 7.8% of the portfolio (2024) · up to 0.1% of the company", src: "2022 year-end MD&A" },
  { date: "2022", name: "OMDA (CSAM Health)", deal: "2022–2025 · peak 7.4% of the portfolio (2023) · up to 5.5% of the company · Norwegian healthcare software; renamed from CSAM Health", src: "2022 year-end MD&A" },
  { date: "2022", name: "Sapiens", deal: "2022–2024 · peak 7.2% of the portfolio (2023) · up to 0.2% of the company", src: "2022 year-end MD&A" },
  { date: "2022", name: "CompuGroup Medical", deal: "2022 · peak 6.3% of the portfolio (2022) · up to 0.1% of the company", src: "2022 year-end MD&A" },
  { date: "2022", name: "Eleco", deal: "2022 · peak 2.3% of the portfolio (2022) · up to 1.0% of the company", src: "2022 year-end MD&A" },
  { date: "2023", name: "Aptitude Software", deal: "2023–2025 · peak 7.0% of the portfolio (2025) · up to 2.0% of the company", src: "2023 year-end MD&A" },
  { date: "2024", name: "Enghouse Systems", deal: "2024–2025 · peak 5.0% of the portfolio (2025) · up to 1.1% of the company", src: "2024 year-end MD&A" },
  { date: "2024", name: "Hansen Technologies", deal: "2024 · peak 3.0% of the portfolio (2024) · up to 0.2% of the company", src: "2024 year-end MD&A" },
  { date: "2025", name: "Dye & Durham", deal: "2025 · peak 5.9% of the portfolio (2025) · up to 2.0% of the company", src: "2025 year-end MD&A" },
  { date: "2025", name: "Undisclosed Australian software company", deal: "2025 · peak 4.5% of the portfolio (2025) · up to 1.5% of the company", src: "2025 year-end MD&A" },
  { date: "2025", name: "Open Text", deal: "2025 · peak 1.7% of the portfolio (2025)", src: "2025 year-end MD&A" },
];

export const PINETREE: CompanyHoldings = {
  name: "Pinetree Capital",
  short: "Pinetree",
  statsTitle: "Sep 30, 2026 · Q3 2026 MD&A, C$",
  stats: [
    { label: "Book value per share", value: "C$10.07", sub: "+8% this year (Dec 31 2025: C$9.33; Sep 30 2024: C$6.43)" },
    { label: "Net income, 9 months", value: "C$6.9M", sub: "9M 2025: C$11.0M; investment gains plus C$2.5M of dividends and interest" },
    { label: "Book value", value: "C$94.5M", sub: "9,387,000 shares; 11 positions, 99% invested" },
  ],
  sources: [
    { label: "2025 annual MD&A", url: `${REPORTS}/2025/PinetreeMDAQ42025.pdf` },
    { label: "Q3 2026 MD&A", url: `${REPORTS}/2026/PinetreeMDA26Q3.pdf` },
  ],
  branches: [
    {
      id: "eu",
      label: "Europe",
      color: BRANCH_COLORS.violet,
      items: [
        { name: "Aptitude Software", pct: 0.02, value: "C$6.2M · 7.0% of the portfolio, Dec 31 2025", note: "UK finance and accounting software", ticker: "APTD.L" },
        { name: "OMDA", pct: 0.03, value: "C$4.0M · 4.4% of the portfolio, Dec 31 2025", note: "Norwegian healthcare software, formerly CSAM Health; sold by Sep 30, 2026 (its industry is at zero in the Q3 2026 MD&A)", ticker: "OMDA.OL" },
      ],
    },
    {
      id: "na",
      label: "North America",
      color: BRANCH_COLORS.green,
      items: [
        { name: "TruBridge", pct: 0.058, value: "C$25.7M · 28.8% of the portfolio, Dec 31 2025", note: "US healthcare software, formerly CPSI; sold by Sep 30, 2026 (its industry is at zero in the Q3 2026 MD&A)", ticker: "TBRG" },
        { name: "Dye & Durham", pct: 0.02, value: "C$5.3M · 5.9% of the portfolio, Dec 31 2025", note: "legal software; sold by Sep 30, 2026 (its industry is at zero in the Q3 2026 MD&A)", ticker: "DND.TO" },
        { name: "Enghouse Systems", pct: 0.004, value: "C$4.5M · 5.0% of the portfolio, Dec 31 2025", note: "enterprise software; sold by Sep 30, 2026 (its industry is at zero in the Q3 2026 MD&A)", ticker: "ENGH.TO" },
        { name: "Computer Modelling Group", pct: 0.01, value: "C$4.2M · 4.7% of the portfolio, Dec 31 2025", note: "oil and gas software", ticker: "CMG.TO" },
        { name: "Open Text", value: "C$1.5M · 1.7% of the portfolio, Dec 31 2025", note: "under 0.1% of the company; sold by Sep 30, 2026 (its industry is at zero in the Q3 2026 MD&A)", ticker: "OTEX" },
        { name: "Showbie", pct: 0.039, value: "C$1.0M · 1.1% of the portfolio, Dec 31 2025", note: "private; education software" },
      ],
    },
    {
      id: "au",
      label: "Australia",
      color: BRANCH_COLORS.amber,
      items: [
        { name: "Bravura Solutions", pct: 0.02, value: "C$21.5M · 24.1% of the portfolio, Dec 31 2025", note: "financial services software", ticker: "BVS.AX" },
        { name: "Undisclosed Australian company", pct: 0.015, value: "C$4.0M · 4.5% of the portfolio, Dec 31 2025", note: "vertical market software; Pinetree is withholding the name while it decides whether to buy more" },
      ],
    },
  ],
  historyNote:
    "Every company in Pinetree's year-end portfolio tables, 2020–2025, with the year-ends it was held at. Positions bought and sold within a year never appear. Each year-end since 2020 shows 10–14 named positions.",
  acquisitions: HISTORY,
  history: { title: "Every position since 2020", date: "First held", deal: "Held at year-ends" },
  notes: [
    "The web is the portfolio Pinetree named at Dec 31, 2025; the percentage on each node is its stake in that company. Quarterly reports don't name holdings.",
    "At Sep 30, 2026 it held 11 positions: vertical market software C$47.6M, financial services software C$30.6M, oil and gas C$8.2M, finance/accounting C$5.5M, utilities C$2.4M, education C$1.0M; by headquarters 3 Australian, 3 Canadian, 2 US and one each in the Netherlands, UK and New Zealand. Healthcare, legal, enterprise and information management software were at zero.",
    "Pinetree says insiders own over 45% of its shares.",
  ],
};

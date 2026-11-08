/**
 * Brown & Brown (NYSE:BRO) for /brown-brown. It has bought 717 insurance intermediaries
 * (its 10-K's count); the 10-K tables named the significant ones individually in
 * 2004-2014 (cash paid shown), and the text names the big later ones. Refresh
 * after each 10-K (Feb).
 */

import { BRANCH_COLORS, acquisitionsByDecade, type Acquisition, type CompanyHoldings } from "@/lib/company-holdings";

const ACQUISITIONS: Acquisition[] = [
  { date: "2001-01", name: "Riedman Corporation", deal: "insurance agency operations", src: "10-K" },
  { date: "2003", name: "Florida Intracoastal Underwriters", deal: "remaining 25%", src: "10-K" },
  { date: "2004-02", name: "Doyle Consulting Group", price: "$10.7M", src: "10-K" },
  { date: "2004-03", name: "Statfeld Vantage Insurance Group", price: "$26.6M", src: "10-K" },
  { date: "2004-03", name: "Waldor Agency", price: "$30.4M", src: "10-K" },
  { date: "2004-05", name: "Proctor Financial", price: "$31.1M", src: "10-K" },
  { date: "2004-07", name: "The McDuffee Insurance Agency", price: "$19.0M", src: "10-K" },
  { date: "2005-01", name: "American Specialty Companies", price: "$23.8M", src: "10-K" },
  { date: "2005-10", name: "Weible & Cahill", price: "$18.0M", src: "10-K" },
  { date: "2005-11", name: "Timothy R. Downey Insurance", price: "$14.3M", src: "10-K" },
  { date: "2006-01", name: "Axiom Intermediaries", price: "$60.3M", src: "10-K" },
  { date: "2006-01", name: "Braishfield Associates", price: "$10.2M", src: "10-K" },
  { date: "2006-03", name: "Hull & Company", price: "$140.2M", src: "10-K" },
  { date: "2006-09", name: "Delaware Valley Underwriting Agency", price: "$46.3M", src: "10-K" },
  { date: "2007-03", name: "ALCOS", price: "$30.9M", src: "10-K" },
  { date: "2007-04", name: "Grinspec", price: "$32.0M", src: "10-K" },
  { date: "2007-04", name: "Sobel Affiliates", price: "$33.1M", src: "10-K" },
  { date: "2007-08", name: "The Combined Group", price: "$24.1M", src: "10-K" },
  { date: "2007-12", name: "Evergreen Re", price: "$11.0M", src: "10-K" },
  { date: "2008-01", name: "LDP Consulting Group", price: "$39.2M", src: "10-K" },
  { date: "2008-04", name: "Powers & Effler Insurance Brokers", price: "$25.0M", src: "10-K" },
  { date: "2008-06", name: "HBA Insurance Group", price: "$48.3M", src: "10-K" },
  { date: "2008-08", name: "Fullerton & Company", price: "$17.6M", src: "10-K" },
  { date: "2009-01", name: "Conner Strong Companies (small business unit)", price: "$22.7M", src: "10-K" },
  { date: "2009-05", name: "Irving Weber Associates", price: "$6.2M", src: "10-K" },
  { date: "2010-03", name: "DiMartino Associates", price: "$7.0M", src: "10-K" },
  { date: "2010-05", name: "Stone Insurance Agencies", price: "$15.8M", src: "10-K" },
  { date: "2010-09", name: "Crowe Paradis Holding Company", price: "$75.0M", src: "10-K" },
  { date: "2010-10", name: "Thomas R Jones", price: "$14.6M", src: "10-K" },
  { date: "2011-01", name: "Balcos Insurance", price: "$8.6M", src: "10-K" },
  { date: "2011-01", name: "Associated Insurance Service", price: "$12.0M", src: "10-K" },
  { date: "2011-02", name: "United Benefit Services Insurance Agency", price: "$14.3M", src: "10-K" },
  { date: "2011-04", name: "First Horizon Insurance Group", price: "$25.1M", src: "10-K" },
  { date: "2011-05", name: "Fitzharris Agency", price: "$6.2M", src: "10-K" },
  { date: "2011-06", name: "Corporate Benefit Consultants", price: "$9.0M", src: "10-K" },
  { date: "2011-11", name: "Sitzmann, Morris & Lavis Insurance Agency", price: "$40.5M", src: "10-K" },
  { date: "2011-11", name: "Snapper Shuler Kenner", price: "$7.5M", src: "10-K" },
  { date: "2011-11", name: "Industry Consulting Group", price: "$9.1M", src: "10-K" },
  { date: "2011-12", name: "Colonial Claims Corporation", price: "$9.9M", src: "10-K" },
  { date: "2012-01", name: "Arrowhead General Insurance Agency", price: "$397.0M", src: "10-K" },
  { date: "2012-05", name: "Maalouf Benefit Resources", price: "$15.5M", src: "10-K" },
  { date: "2012-05", name: "Richard W. Endlar Insurance Agency", price: "$10.8M", src: "10-K" },
  { date: "2012-09", name: "Texas Security General Insurance Agency", price: "$14.5M", src: "10-K" },
  { date: "2012-12", name: "Behnke & Associates", price: "$9.2M", src: "10-K" },
  { date: "2012-12", name: "Rowlands & Barranca Agency", price: "$8.7M", src: "10-K" },
  { date: "2013-06", name: "The Rollins Agency", price: "$13.8M", src: "10-K" },
  { date: "2013-07", name: "Beecher Carlson Holdings", price: "$364.3M", src: "10-K" },
  { date: "2013-12", name: "ICA", price: "$19.8M", src: "10-K" },
  { date: "2014-05", name: "The Wright Insurance Group", price: "$609.2M", src: "10-K" },
  { date: "2018-11", name: "The Hays Group", deal: "assets", src: "10-K" },
  { date: "2020", name: "Special Risk Insurance Managers", src: "10-K" },
  { date: "2021-01", name: "O'Leary Insurances", deal: "Ireland", price: "$117.4M", src: "10-K" },
  { date: "2022", name: "GRP (Jersey) Holdco", deal: "UK", src: "10-K" },
  { date: "2022", name: "BdB general insurance companies", deal: "UK", src: "10-K" },
  { date: "2023-10", name: "Kentro Capital", src: "10-K" },
  { date: "2024-10", name: "Quintes Holding", deal: "Netherlands", src: "10-K" },
  { date: "2025", name: "Accession Risk Management Group (RSC)", deal: "incl. One80 Intermediaries", src: "10-K" },
];

export const BROWN_BROWN: CompanyHoldings = {
  name: "Brown & Brown",
  short: "Brown & Brown",
  statsTitle: "2025 · 10-K",
  stats: [
    { label: "Intermediaries acquired", value: "717", sub: "since 1993, per the 2025 10-K" },
    { label: "Named here", value: String(ACQUISITIONS.length), sub: "the deals the filings name" },
    { label: "Largest", value: "Accession (2025)", sub: "holding company RSC, with One80" },
  ],
  sources: [{ label: "Brown & Brown 10-K filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000079282&type=10-K" }],
  branches: [acquisitionsByDecade(ACQUISITIONS, "Named acquisitions", BRANCH_COLORS.amber)],
  historyNote:
    "Brown & Brown has bought 717 insurance intermediaries; most are too small for its filings to name. These are the ones they do: the significant deals in the 2004-2014 acquisition tables (cash paid at closing, before earn-outs) and the large deals named since.",
  acquisitions: ACQUISITIONS,
};

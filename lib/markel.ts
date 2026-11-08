/**
 * Markel Group (NYSE:MKL) for /markel. From the 2025 10-K (Item 1 names every
 * business; segment table for adjusted operating income) and the Q3 2026
 * 10-Q. Years come from the 10-K for the year each deal closed; AMF, Rosemont
 * and Parkland aren't described as acquisitions in any 10-K since 2000, so
 * they have none. Refresh after each 10-K (late Feb).
 */

import { BRANCH_COLORS, type CompanyHoldings } from "@/lib/company-holdings";

const K = (y: number) => `${y} 10-K`;

export const MARKEL: CompanyHoldings = {
  name: "Markel Group",
  short: "Markel",
  managerId: "gayner",
  statsTitle: "9 months to Sep 30, 2026 · Q3 2026 10-Q",
  stats: [
    { label: "Operating revenues", value: "$11,727M" },
    { label: "Net income", value: "$1,216M", sub: "to common shareholders (9M 2025: $1,504M)" },
    { label: "Adjusted operating income", value: "$1,641M", sub: "pre-tax, before investment gains and amortization" },
  ],
  sources: [
    { label: "2025 10-K", url: "https://www.sec.gov/Archives/edgar/data/1096343/000109634326000020/mkl-20251231.htm" },
    { label: "Q3 2026 10-Q", url: "https://www.sec.gov/Archives/edgar/data/1096343/000109634326000080/mkl-20260930.htm" },
  ],
  branches: [
    {
      id: "insurance",
      label: "Markel Insurance",
      color: BRANCH_COLORS.green,
      detail: "$1,379M adjusted operating income in 2025 (pre-tax)",
      items: [
        { name: "U.S. Wholesale & Specialty" },
        { name: "Programs & Solutions", note: "incl. Bermuda" },
        { name: "International", note: "Lloyd's syndicate, 15 countries" },
        { name: "Global Reinsurance", note: "in run-off since Aug 2025" },
      ],
    },
    {
      id: "businesses",
      label: "Other businesses",
      color: BRANCH_COLORS.amber,
      detail: "Markel Ventures and the financial businesses",
      groups: [
        {
          name: "Industrial",
          detail: "$343M adjusted operating income in 2025",
          items: [
            { name: "Lansing Building Products", year: 2020, src: K(2020) },
            { name: "Metromont", year: 2021, src: K(2021) },
            { name: "VSC Fire & Security", year: 2019, src: K(2019) },
            { name: "Cottrell", year: 2014, src: K(2014) },
            { name: "AMF Bakery Systems" },
            { name: "Buckner HeavyLift Cranes", year: 2021, src: K(2021) },
            { name: "Havco", year: 2012, src: K(2012) },
            { name: "Reading Bakery Systems", year: 2012, src: K(2012) },
            { name: "Valor Environmental", year: 2024, src: K(2024) },
            { name: "Ellicott Dredges", year: 2009, src: K(2009) },
            { name: "Weldship", year: 2011, src: K(2011) },
            { name: "Panel Specialists", year: 2009, src: K(2009) },
          ],
        },
        {
          name: "Financial",
          detail: "$327M adjusted operating income in 2025",
          items: [
            { name: "State National", year: 2017, src: K(2017), note: "fronting and lender services" },
            { name: "Nephila", year: 2018, src: K(2018), note: "insurance-linked securities manager" },
            { name: "Rosemont Investment Group" },
          ],
        },
        {
          name: "Consumer & Other",
          detail: "$175M adjusted operating income in 2025",
          items: [
            { name: "Costa Farms", year: 2017, src: K(2017) },
            { name: "CapTech", year: 2015, src: K(2015) },
            { name: "Eagle Construction", year: 2013, src: K(2013) },
            { name: "Brahmin", year: 2018, src: K(2018) },
            { name: "Parkland Ventures" },
            { name: "Educational Partners International", year: 2024, src: K(2024) },
            { name: "RDSolutions", year: 2010, src: K(2010), note: "bought as RetailData" },
            { name: "PartnerMD", year: 2011, src: K(2011) },
          ],
        },
      ],
    },
    {
      id: "stakes",
      label: "Strategic stake",
      color: BRANCH_COLORS.violet,
      items: [
        {
          name: "Hagerty",
          ticker: "HGTY",
          pct: 0.23,
          value: "$1.0B market value, Dec 31 2025",
          note: "equity method; also in the 13F",
        },
      ],
    },
  ],
  historyNote:
    "Every acquisition described in Markel's 10-Ks for 2000–2025, including businesses since sold or folded into others. Three 2007–08 insurance agencies aren't named there. AMF Bakery Systems, Rosemont and Parkland predate these filings or aren't described as acquisitions.",
  acquisitions: [
    { date: "1999-01", name: "Gryphon Holdings", src: "2000 10-K" },
    { date: "2000-01", name: "Acceptance Insurance (Scottsdale office)", deal: "renewal rights to a book of business", src: "2000 10-K" },
    { date: "2000-03", name: "Terra Nova (Bermuda) Holdings", deal: "became Markel International", src: "2000 10-K" },
    { date: "2007-04", name: "Wholesale insurance broker (unnamed)", deal: "social services insurance programs; cash and stock", src: "2007 10-K" },
    { date: "2007-06", name: "Managing general agent (unnamed)", deal: "errors and omissions products", src: "2007 10-K" },
    { date: "2008-04", name: "Managing general agent (unnamed)", deal: "commercial auto and liability for garages", src: "2008 10-K" },
    { date: "2009-10", name: "Elliott Special Risks", deal: "Canadian managing general agent", src: "2009 10-K" },
    { date: "2009-10", name: "Panel Specialists", src: "2009 10-K" },
    { date: "2009-11", name: "Ellicott Dredge Enterprises", deal: "80.1% controlling interest", src: "2009 10-K" },
    { date: "2010-05", name: "Solbern", deal: "controlling interest", src: "2010 10-K" },
    { date: "2010-10", name: "Aspen Holdings (FirstComp)", deal: "100%", src: "2010 10-K" },
    { date: "2010-12", name: "RetailData (now RDSolutions)", deal: "60% controlling interest", src: "2010 10-K" },
    { date: "2010-12", name: "Diamond Healthcare", deal: "75% controlling interest", src: "2010 10-K" },
    { date: "2011-07", name: "PartnerMD", src: "2011 10-K" },
    { date: "2011-09", name: "Baking Technology Systems", src: "2011 10-K" },
    { date: "2011-10", name: "WI Holdings (Weldship)", deal: "83% controlling interest", src: "2011 10-K" },
    { date: "2012-01", name: "THOMCO", deal: "100%; program administrator", src: "2012 10-K" },
    { date: "2012-04", name: "Havco", deal: "85% controlling interest", src: "2012 10-K" },
    { date: "2012-07", name: "Tromp Bakery Equipment", deal: "100%", src: "2012 10-K" },
    { date: "2012-09", name: "Reading Bakery Systems", deal: "85% controlling interest", src: "2012 10-K" },
    { date: "2013-01", name: "Essentia Insurance", deal: "100%; writes Hagerty's business", src: "2013 10-K" },
    { date: "2013-05", name: "Alterra Capital Holdings", deal: "100%, by merger", src: "2013 10-K" },
    { date: "2013-08", name: "Eagle Construction of VA", src: "2013 10-K" },
    { date: "2014-01", name: "Abbey Protection", deal: "100%", src: "2014 10-K" },
    { date: "2014-07", name: "Cottrell", deal: "100%", src: "2014 10-K" },
    { date: "2015-12", name: "CATCo Investment Management", deal: "substantially all assets", src: "2015 10-K" },
    { date: "2015-12", name: "CapTech Ventures", deal: "80%", src: "2015 10-K" },
    { date: "2017-04", name: "SureTec Financial", src: "2017 10-K" },
    { date: "2017-08", name: "Costa Farms", deal: "81%", src: "2017 10-K" },
    { date: "2017-11", name: "State National Companies", deal: "100%", src: "2017 10-K" },
    { date: "2018-10", name: "Brahmin Leather Works", deal: "90%", src: "2018 10-K" },
    { date: "2018-11", name: "Nephila Holdings", deal: "100%", src: "2018 10-K" },
    { date: "2019-06", name: "The Hagerty Group", deal: "minority interest", src: "2019 10-K" },
    { date: "2019-11", name: "VSC Fire & Security", src: "2019 10-K" },
    { date: "2020-04", name: "Lansing Building Products", deal: "controlling interest", src: "2020 10-K" },
    { date: "2021-08", name: "Buckner HeavyLift Cranes", deal: "90%", src: "2021 10-K" },
    { date: "2021-12", name: "Metromont", deal: "51%", src: "2021 10-K" },
    { date: "2024-06", name: "Valor Environmental", deal: "98%", src: "2024 10-K" },
    { date: "2024-09", name: "Educational Partners International", deal: "68%", src: "2024 10-K" },
  ],
};

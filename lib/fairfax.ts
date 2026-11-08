/**
 * Fairfax Financial (TSX:FFH) for /fairfax, from the 2025 annual report:
 * the Corporate Profile lists every operating subsidiary and its ownership;
 * the letter's "Common Stock Holdings as at December 31, 2025" table gives the
 * associates, consolidated and mark-to-market stakes with ownership and
 * market value; the India table gives dates of first investment. Years only
 * where that report states them. Refresh after each annual report (March).
 */

import { BRANCH_COLORS, type CompanyHoldings } from "@/lib/company-holdings";

const AR = "2025 annual report";

export const FAIRFAX: CompanyHoldings = {
  name: "Fairfax Financial",
  short: "Fairfax",
  managerId: "watsa",
  statsTitle: "December 31, 2025 · 2025 annual report",
  stats: [
    { label: "Shareholders' equity", value: "$26.5B", sub: "attributable to Fairfax" },
    { label: "Common stock holdings", value: "$23.6B", sub: "market value, $3.1B above carrying value" },
    { label: "Non-insurance revenue", value: "$8.5B", sub: "consolidated companies, 2025" },
  ],
  sources: [{ label: "2025 annual report", url: "https://www.fairfax.ca/wp-content/uploads/2026/03/FFH_Fairfax-Financial-2025-Annual-Report-144860.pdf" }],
  branches: [
    {
      id: "insurance",
      label: "Insurance & reinsurance",
      color: BRANCH_COLORS.green,
      detail: "Operating subsidiaries; wholly owned unless shown",
      groups: [
        {
          name: "North America",
          items: [{ name: "Northbridge" }, { name: "Crum & Forster" }, { name: "Zenith National" }],
        },
        {
          name: "Global",
          items: [
            { name: "Odyssey Group", pct: 0.9, year: 1996, src: AR },
            { name: "Brit" },
            { name: "Ki", pct: 0.2 },
            { name: "Allied World", pct: 0.834, year: 2017, src: AR, note: "$4.2B" },
          ],
        },
        {
          name: "International",
          items: [
            { name: "Group Re" },
            { name: "Bryte Insurance" },
            { name: "Eurolife General", pct: 0.8, year: 2016, src: AR },
            { name: "Gulf Insurance", pct: 0.971, year: 2023, src: AR },
          ],
        },
        {
          name: "Asia",
          items: [
            { name: "Falcon Insurance" },
            { name: "Falcon Thailand", pct: 0.998 },
            { name: "Pacific Insurance", pct: 0.85 },
            { name: "AMAG Insurance", pct: 0.809 },
            { name: "Fairfirst Insurance" },
            { name: "Singapore Re" },
          ],
        },
        {
          name: "Europe & Latin America",
          items: [
            { name: "Colonnade Insurance" },
            { name: "Polish Re" },
            { name: "Fairfax Ukraine", note: "ARX and Universalna" },
            { name: "Fairfax Brasil" },
            { name: "Fairfax Latam" },
          ],
        },
        {
          name: "Life & run-off",
          items: [
            { name: "Eurolife", pct: 0.8, year: 2016, src: AR, note: "life business being sold to Eurobank" },
            { name: "RiverStone", note: "run-off" },
          ],
        },
      ],
    },
    {
      id: "businesses",
      label: "Non-insurance companies",
      color: BRANCH_COLORS.amber,
      detail: "Consolidated; $8.5B revenue in 2025",
      items: [
        { name: "Recipe Unlimited", pct: 1, note: "100% since 2025 buyback" },
        { name: "Sleep Country", pct: 1, year: 2024, src: AR },
        { name: "Peak Achievement", pct: 1, year: 2024, src: AR, note: "100% from Dec 2024" },
        { name: "Meadow Foods", pct: 0.95, year: 2024, src: AR, note: "consolidated Nov 2024" },
        { name: "Grivalia Hospitality", pct: 0.84 },
        { name: "Thomas Cook India", pct: 0.645, year: 2012, src: AR, ticker: "THOMASCOOK.NS" },
        { name: "Dexterra Group", pct: 0.5, ticker: "DXT.TO" },
        { name: "Fairfax India", pct: 0.429, year: 2015, src: AR, ticker: "FIH-U.TO", note: "95.2% of votes; owns 74% of Bangalore airport" },
        { name: "AGT", year: 2019, src: AR, note: "taken private with its co-founders" },
      ],
    },
    {
      id: "stakes",
      label: "Stakes outside 13F",
      color: BRANCH_COLORS.violet,
      detail: "Associates and foreign-listed holdings",
      groups: [
        {
          name: "Associates",
          items: [
            { name: "Eurobank", pct: 0.32, year: 2014, src: AR, ticker: "EUROB.AT", value: "$4.7B market value" },
            { name: "Poseidon", pct: 0.45, value: "$2.6B market value" },
            { name: "EXCO Resources", pct: 0.49 },
            { name: "John Keells", pct: 0.26, ticker: "JKH-N0000.CM" },
            { name: "Quess", pct: 0.347, year: 2019, src: AR, ticker: "QUESS.NS" },
            { name: "Helios Fairfax Partners", pct: 0.36, ticker: "HFPC-U.TO" },
          ],
        },
        {
          name: "Insurance stakes",
          items: [
            { name: "Digit", pct: 0.49, year: 2017, src: AR, ticker: "GODIGIT.NS", value: "$2.0B fair value" },
            { name: "Thai Re", pct: 0.477 },
            { name: "BIC Insurance", pct: 0.35 },
            { name: "Digit Life", pct: 0.342 },
            { name: "Albingia", pct: 0.33, year: 2025, src: AR },
            { name: "Alltrust Insurance", pct: 0.15 },
            { name: "Africa Re", pct: 0.071 },
          ],
        },
        {
          name: "Foreign-listed",
          items: [
            { name: "Metlen Energy", pct: 0.08, ticker: "MTLN.L" },
            { name: "Commercial International Bank", pct: 0.07, ticker: "COMI.CA" },
            { name: "Foran Mining", pct: 0.23 },
            { name: "Altius Minerals", pct: 0.14, ticker: "ALS.TO" },
          ],
        },
      ],
    },
  ],
  historyNote:
    "Every acquisition and stake increase in Fairfax's annual reports filed with the SEC for 2002–2025, including companies since sold. Deals before 2001 aren't in those filings; Odyssey's 1996 date is from the 2025 report.",
  acquisitions: [
    { date: "1996", name: "Odyssey (Skandia America)", src: "2025 annual report" },
    { date: "2001-12", name: "Winterthur Swiss Insurance (Asia)", price: "$14.5M", src: "2002 annual report" },
    { date: "2002-05", name: "Old Lyme Insurance Company of Rhode Island", src: "2002 annual report" },
    { date: "2002-12", name: "TRG", deal: "Xerox's 72.5% economic interest", src: "2004 annual report" },
    { date: "2007", name: "Cunningham Lindsey (CLGI)", deal: "shares it didn't already own", price: "C$12.6M", src: "2009 annual report" },
    { date: "2009-01", name: "Polish Re", deal: "100%", price: "$57.0M", src: "2009 annual report" },
    { date: "2009-10", name: "Advent Capital", deal: "shares it didn't already own, at 220p", src: "2009 annual report" },
    { date: "2009-12", name: "Singapore Re", deal: "raised to 20.0%", src: "2009 annual report" },
    { date: "2010-05", name: "Zenith National", deal: "100%", src: "2010 annual report" },
    { date: "2010-09", name: "Gulf Insurance", deal: "41.3%", price: "$217.1M", src: "2010 annual report" },
    { date: "2011-02", name: "First Mercury Financial", deal: "100%, incl. Valiant Insurance", src: "2012 annual report" },
    { date: "2011-03", name: "Pacific Insurance", deal: "100%", src: "2012 annual report" },
    { date: "2011-08", name: "William Ashley China", deal: "the business's assets", src: "2011 annual report" },
    { date: "2011-12", name: "Sporting Life", deal: "75.0%", src: "2012 annual report" },
    { date: "2012-01", name: "Prime Restaurants", deal: "81.7%", src: "2012 annual report" },
    { date: "2012-03", name: "Thai Re", deal: "21.2%", src: "2012 annual report" },
    { date: "2012-08", name: "Thomas Cook India", deal: "87.1%", price: "$172.7M", src: "2012 annual report" },
    { date: "2012-10", name: "Brit Insurance Limited", deal: "renamed RiverStone Insurance", src: "2012 annual report" },
    { date: "2013-10", name: "American Safety Insurance", deal: "100%", src: "2013 annual report" },
    { date: "2014-02", name: "The Keg", deal: "51.0%", price: "$76.7M", src: "2013 annual report" },
    { date: "2014-04", name: "Eurobank", deal: "first purchase, at €31.00 a share", src: "2025 annual report" },
    { date: "2014-06", name: "Praktiker Hellas", deal: "100%", price: "$28.6M", src: "2014 annual report" },
    { date: "2014-09", name: "Sterling Resorts", deal: "control, through Thomas Cook India", src: "2014 annual report" },
    { date: "2014-11", name: "Pethealth", deal: "100%", src: "2014 annual report" },
    { date: "2015-01", name: "Fairfax India", deal: "95.1% of votes, 28.1% of equity at founding", src: "2016 annual report" },
    { date: "2015-01", name: "Union Assurance", deal: "78.0%", price: "$27.9M", src: "2015 annual report" },
    { date: "2015-03", name: "MCIS Insurance", deal: "its general insurance business", src: "2015 annual report" },
    { date: "2015-04", name: "Cara (now Recipe)", deal: "52.6% of votes, 40.7% of equity", src: "2016 annual report" },
    { date: "2015-06", name: "Brit", deal: "97.0%, rest by July 2015", src: "2016 annual report" },
    { date: "2015-07", name: "Boat Rocker (Temple Street)", deal: "55.0%", src: "2016 annual report" },
    { date: "2016", name: "Eurolife", deal: "from Eurobank", src: "2025 annual report" },
    { date: "2016-01", name: "APR Energy", deal: "49.0% indirect", src: "2015 annual report" },
    { date: "2016-10", name: "AMAG Insurance", deal: "80.0%", src: "2016 annual report" },
    { date: "2016-10", name: "Golf Town", deal: "60.0% indirect", src: "2016 annual report" },
    { date: "2016-12", name: "Bryte Insurance (Zurich South Africa)", deal: "100%", src: "2016 annual report" },
    { date: "2017-02", name: "Digit", deal: "first investment", src: "2025 annual report" },
    { date: "2017-02", name: "Fairfax Africa", deal: "64.2%", src: "2017 annual report" },
    { date: "2017-03", name: "Farmers Edge", deal: "46.1%", src: "2017 annual report" },
    { date: "2017-07", name: "Allied World", deal: "94.6%", price: "$3,977.9M", src: "2017 annual report" },
    { date: "2017-07", name: "Grivalia Properties", deal: "control, at 52.6%", src: "2017 annual report" },
    { date: "2017-08", name: "Sigma Companies", deal: "81.2% non-voting", src: "2017 annual report" },
    { date: "2017", name: "AIG Central & Eastern Europe and Latin America", deal: "insurance operations", src: "2018 annual report" },
    { date: "2018-01", name: "AIG Uruguay", deal: "insurance operations", src: "2018 annual report" },
    { date: "2018-03", name: "Carillion Canada services (now Dexterra)", src: "2018 annual report" },
    { date: "2018-05", name: "Toys \"R\" Us Canada", deal: "100%", src: "2018 annual report" },
    { date: "2019-02", name: "AXA Ukraine (now ARX Insurance)", src: "2019 annual report" },
    { date: "2019", name: "AGT and Universalna", src: "2019 annual report" },
    { date: "2020-07", name: "Farmers Edge", deal: "consolidated", src: "2020 annual report" },
    { date: "2021-06", name: "Singapore Re", deal: "28.2% raised to 94.0%", src: "2022 annual report" },
    { date: "2021-07", name: "Eurolife", deal: "raised to 80.0%", src: "2022 annual report" },
    { date: "2022-07", name: "Grivalia Hospitality", src: "2022 annual report" },
    { date: "2022-10", name: "Atlas Corp", deal: "raised to 43.2%", src: "2022 annual report" },
    { date: "2023-06", name: "Allied World", deal: "shares from minority holders", price: "$30.6M", src: "2023 annual report" },
    { date: "2023-12", name: "Gulf Insurance", deal: "43.7% raised to 90.0%, from KIPCO", src: "2023 annual report" },
    { date: "2023-12", name: "Eurobank", deal: "raised to 34.1%", price: "$82.0M", src: "2023 annual report" },
    { date: "2024-10", name: "Sleep Country", deal: "100%", src: "2024 annual report" },
    { date: "2024-11", name: "Meadow Foods", deal: "raised to 93.2%", price: "$333.1M", src: "2024 annual report" },
    { date: "2024-12", name: "Peak Achievement", deal: "42.6% raised to 100%", src: "2024 annual report" },
    { date: "2024-12", name: "Brit", deal: "remaining shares, from OMERS", src: "2024 annual report" },
    { date: "2025-01", name: "Blizzard Vacatia", deal: "50.0%", src: "2024 annual report" },
    { date: "2025-05", name: "Albingia", deal: "33.0% indirect", price: "$236.5M", src: "2025 annual report" },
    { date: "2025-08", name: "The Keg Royalties Income Fund", deal: "units it didn't already own", src: "2025 annual report" },
  ],
  notes: [
    "Ownership as of Dec 31, 2025. US-listed holdings in Fairfax's 13F are in the 13F branch; Occidental and Kennedy Wilson, which the annual report lists, aren't in its latest 13F.",
  ],
};

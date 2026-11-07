/**
 * Everything Berkshire Hathaway owns, for /berkshire. The stock branches come
 * from the 13F data and lib/major-holders.ts; this file holds the rest, by
 * hand.
 *
 * Refresh once a year from the 10-K (out late Feb): Item 1 names the
 * operating businesses, the business-segment note gives each segment's
 * after-tax earnings (see Segment.earnings). Cash comes from the latest 10-Q balance sheet. Names
 * follow the 10-K; brands sold by a business (Ace stores for Benjamin Moore)
 * or contracts (the IAG quota share) aren't Berkshire companies and stay out.
 */

export const BUSINESSES_SOURCE = {
  asOf: "2025-12-31",
  label: "2025 annual report (10-K)",
  url: "https://www.berkshirehathaway.com/2025ar/2025ar.pdf",
};

export interface Segment {
  id: string;
  name: string;
  // USD, 2025 earnings after income taxes. Insurance, BNSF and BHE: MD&A's net
  // earnings attributable to Berkshire (insurance = underwriting + investment
  // income). The other four: segment-note pre-tax earnings less segment income
  // tax — the MD&A only reports them combined ($13,647M attributable, about
  // $0.1B below their sum after minority interests). Pre-tax would misstate BHE,
  // whose wind and solar tax credits make its tax line a benefit (−$1,785M).
  earnings: number;
  // Segments with one business have no groups
  groups?: { name: string; businesses: string[] }[];
  businesses?: string[];
}

export const SEGMENTS: Segment[] = [
  {
    id: "insurance",
    name: "Insurance",
    earnings: 19_771e6,
    groups: [
      { name: "GEICO", businesses: ["GEICO"] },
      {
        name: "BH Primary",
        businesses: [
          "NICO Primary",
          "BH Homestate (BHHC)",
          "BH Specialty (BHSI)",
          "GUARD",
          "MedPro",
          "MLMIC",
          "USLI",
          "RSUI",
          "BH Direct (biBERK)",
        ],
      },
      {
        name: "BH Reinsurance",
        businesses: ["National Indemnity (NICO)", "General Re", "TransRe", "BH Life & Health"],
      },
    ],
  },
  { id: "bnsf", name: "BNSF", earnings: 5_476e6, businesses: ["BNSF Railway"] },
  {
    id: "bhe",
    name: "Berkshire Hathaway Energy",
    earnings: 3_979e6,
    businesses: [
      "PacifiCorp",
      "MidAmerican Energy",
      "NV Energy",
      "Northern Powergrid",
      "AltaLink",
      "BHE GT&S",
      "Northern Natural Gas",
      "Kern River",
      "HomeServices",
    ],
  },
  {
    id: "manufacturing",
    name: "Manufacturing",
    earnings: 10_042e6,
    groups: [
      {
        name: "Industrial",
        businesses: [
          "Precision Castparts",
          "Lubrizol",
          "IMC",
          "Marmon",
          "OxyChem",
          "CTB",
          "LiquidPower Specialty",
          "W&W|AFCO Steel",
          "Bell Laboratories",
        ],
      },
      {
        name: "Building",
        businesses: [
          "Clayton Homes",
          "Taylor Morrison",
          "Shaw Industries",
          "Johns Manville",
          "MiTek",
          "Benjamin Moore",
          "Acme Brick",
        ],
      },
      {
        name: "Consumer",
        businesses: [
          "Forest River",
          "Fruit of the Loom",
          "Garan",
          "Fechheimer",
          "Duracell",
          "Jazwares",
          "Richline",
          "Brooks Running",
          "Justin & BØRN footwear",
          "Larson-Juhl",
        ],
      },
    ],
  },
  {
    id: "service-retail",
    name: "Service & retailing",
    earnings: 3_057e6,
    groups: [
      {
        name: "Service",
        businesses: [
          "NetJets",
          "FlightSafety",
          "TTI",
          "XTRA Lease",
          "IPS",
          "Dairy Queen",
          "Business Wire",
          "CORT",
          "WPLG-TV",
          "Charter Brokerage",
        ],
      },
      {
        name: "Retail",
        businesses: [
          "BH Automotive",
          "Nebraska Furniture Mart",
          "R.C. Willey",
          "Star Furniture",
          "Jordan's Furniture",
          "Borsheims",
          "Helzberg Diamonds",
          "Ben Bridge",
          "See's Candies",
          "Pampered Chef",
          "Oriental Trading",
          "Detlev Louis",
        ],
      },
    ],
  },
  { id: "mclane", name: "McLane", earnings: 505e6, businesses: ["McLane"] },
  { id: "pilot", name: "Pilot", earnings: 163e6, businesses: ["Pilot Travel Centers"] },
];

/**
 * When each business joined Berkshire (the year the deal closed), keyed by the
 * names above. `src` is where the year (and price) was checked: a Buffett
 * letter, the 10-K or a 10-Q. Prices only where Berkshire itself states one,
 * in its own terms; a compiled list's figures disagree with Berkshire's often
 * enough (OxyChem $9.7B vs the 10-Q's $9.4B) not to be used. `checked: false`
 * = year from Wikipedia's list of Berkshire's assets, not found in Berkshire's
 * documents. New acquisitions: add here and to SEGMENTS.
 */
export interface Acquisition {
  year?: number;
  via?: string; // came with a larger acquisition
  price?: string; // as Berkshire states it
  note?: string;
  src: string;
  checked: boolean;
}

const ALLEGHANY: Acquisition = { year: 2022, via: "Alleghany", src: "2025 10-K", checked: true };
const MIDAMERICAN: Acquisition = { year: 2000, via: "MidAmerican", src: "Wikipedia", checked: false };
const listed = (year: number, via?: string): Acquisition => ({ year, via, src: "Wikipedia", checked: false });
const letter = (year: number, letterYear = year, price?: string, via?: string): Acquisition => ({
  year,
  via,
  price,
  src: `${letterYear} letter`,
  checked: true,
});

export const ACQUIRED: Record<string, Acquisition> = {
  // Insurance
  GEICO: { year: 1996, src: "1995 letter", checked: true, note: "bought the half it didn't already own" },
  "NICO Primary": { year: 1967, via: "National Indemnity", src: "2025 10-K", checked: true },
  "BH Homestate (BHHC)": listed(1990),
  "BH Specialty (BHSI)": { year: 2013, src: "Wikipedia", checked: false, note: "started by Berkshire" },
  GUARD: listed(2012),
  MedPro: letter(2005),
  MLMIC: listed(2018),
  USLI: letter(2000),
  RSUI: ALLEGHANY,
  "BH Direct (biBERK)": { year: 2019, src: "Wikipedia", checked: false, note: "started by Berkshire" },
  "National Indemnity (NICO)": { year: 1967, src: "2025 10-K", checked: true },
  "General Re": letter(1998),
  TransRe: ALLEGHANY,
  "BH Life & Health": { src: "—", checked: false },
  // Railroad and energy
  "BNSF Railway": { year: 2010, src: "2025 10-K", checked: true, price: "$34.5B equity value", note: "owned 22.5% before" },
  PacifiCorp: letter(2006),
  "MidAmerican Energy": letter(2000, 1999, undefined, "MidAmerican"),
  "NV Energy": letter(2013),
  "Northern Powergrid": MIDAMERICAN,
  AltaLink: letter(2014, 2014, "C$3B"),
  "BHE GT&S": listed(2020),
  "Northern Natural Gas": letter(2002),
  "Kern River": letter(2002),
  HomeServices: MIDAMERICAN,
  // Manufacturing
  "Precision Castparts": letter(2016, 2015, "over $32B cash"),
  Lubrizol: letter(2011),
  IMC: { ...letter(2006, 2006, "$4B"), note: "80% at first" },
  Marmon: letter(2008, 2007),
  OxyChem: { year: 2026, src: "Q3 2026 10-Q", checked: true, price: "~$9.4B cash" },
  CTB: letter(2002),
  "LiquidPower Specialty": listed(2017),
  "W&W|AFCO Steel": ALLEGHANY,
  "Bell Laboratories": { year: 2025, src: "2025 10-K", checked: true },
  "Clayton Homes": letter(2003),
  "Taylor Morrison": { year: 2026, src: "Q3 2026 10-Q", checked: true, price: "~$6.8B cash" },
  "Shaw Industries": letter(2001, 2000),
  "Johns Manville": letter(2001),
  MiTek: letter(2001),
  "Benjamin Moore": letter(2000, 2001),
  "Acme Brick": letter(2000, 2001),
  "Forest River": letter(2005),
  "Fruit of the Loom": letter(2002, 2001),
  Garan: letter(2002),
  Fechheimer: letter(1986),
  Duracell: letter(2016),
  Jazwares: ALLEGHANY,
  Richline: letter(2007),
  "Brooks Running": letter(2006, 2006, undefined, "Russell"),
  "Justin & BØRN footwear": letter(2000, 2000, "$570M cash"),
  "Larson-Juhl": letter(2002, 2001),
  // Service and retailing
  NetJets: letter(1998),
  FlightSafety: letter(1996, 1996, "~$1.5B"),
  TTI: letter(2007),
  "XTRA Lease": letter(2001),
  IPS: ALLEGHANY,
  "Dairy Queen": letter(1998, 1997),
  "Business Wire": letter(2006),
  CORT: letter(2000, 2000, "~$386M cash", "Wesco"),
  "WPLG-TV": listed(2014),
  "Charter Brokerage": listed(2014),
  "BH Automotive": letter(2015, 2014),
  "Nebraska Furniture Mart": { ...letter(1983), note: "80% at first" },
  "R.C. Willey": letter(1995),
  "Star Furniture": letter(1997),
  "Jordan's Furniture": letter(1999),
  Borsheims: { ...letter(1989, 1988), note: "80% at first" },
  "Helzberg Diamonds": letter(1995),
  "Ben Bridge": letter(2000),
  "See's Candies": listed(1972),
  "Pampered Chef": letter(2002),
  "Oriental Trading": listed(2012),
  "Detlev Louis": listed(2015),
  McLane: letter(2003),
  "Pilot Travel Centers": {
    year: 2017,
    src: "2017 letter, 2025 10-K",
    checked: true,
    price: "~$8.2B for 41.4% (2023)",
    note: "38.6% in 2017; the last 20% in Jan 2024",
  },
};

export const LETTERS_URL = "https://www.berkshirehathaway.com/letters/letters.html";
export const WIKIPEDIA_URL = "https://en.wikipedia.org/wiki/List_of_assets_owned_by_Berkshire_Hathaway";

// Insurance and other cash + T-bills, plus railroad/utilities cash, less T-bill
// purchases not yet settled (36,034 + 336,735 + 4,666 − 20,489, $M)
export const CASH = {
  value: 356_946e6,
  asOf: "2026-09-30",
  label: "Q3 2026 10-Q",
  url: "https://www.berkshirehathaway.com/qtrly/3rdqtr26.pdf",
};

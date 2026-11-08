/**
 * Boston Omaha (NYSE:BOC) for /boston-omaha, from its 10-Ks for 2012-2025: its
 * businesses and every deal or stake the 10-Ks describe. Refresh after each 10-K (Mar).
 */

import { BRANCH_COLORS, acquisitionsByDecade, type Acquisition, type CompanyHoldings } from "@/lib/company-holdings";

const ACQUISITIONS: Acquisition[] = [
  { date: "2010-01", name: "Ananda Investments", deal: "40%, commercial real estate", src: "10-K" },
  { date: "2015-08", name: "I-85 Advertising billboards", deal: "by Link Media Alabama", src: "10-K" },
  { date: "2015-10", name: "DFH Leyden", deal: "8.33%", src: "10-K" },
  { date: "2015-12", name: "Logic Real Estate Companies", deal: "30%", src: "10-K" },
  { date: "2015-12", name: "TAG SW1", deal: "15%, retail centers", src: "10-K" },
  { date: "2016-01", name: "DFH Leyden 2", deal: "7.15%", src: "10-K" },
  { date: "2016-04", name: "The Warnock Agency", deal: "surety brokerage", src: "10-K" },
  { date: "2016-12", name: "United Casualty and Surety (UCS)", deal: "surety insurer", src: "10-K" },
  { date: "2018-05", name: "CB&T Holding", deal: "common stock", price: "~$19M", src: "10-K" },
  { date: "2018-07", name: "Tammy Lynn Outdoor billboards", src: "10-K" },
  { date: "2018-08", name: "Key Outdoor billboards", deal: "700+ structures", src: "10-K" },
  { date: "2018-08", name: "Waitt Outdoor billboards", deal: "1,600+ structures", src: "10-K" },
  { date: "2019-08", name: "Image Outdoor Advertising billboards", deal: "60 structures", src: "10-K" },
  { date: "2019-10", name: "Alpha Displays billboards (Missouri)", src: "10-K" },
  { date: "2020-02", name: "Dean Martin Holding billboards (Nevada)", src: "10-K" },
  { date: "2020-03", name: "FibAire Communications", deal: "broadband; became AireBeam", src: "10-K" },
  { date: "2020", name: "Yellowstone Acquisition Company", deal: "SPAC sponsor", price: "~$7.8M", src: "10-K" },
  { date: "2020", name: "24th Street Fund I and II", deal: "$6M", src: "10-K" },
  { date: "2020-12", name: "Utah Broadband", deal: "business assets", src: "10-K" },
  { date: "2021-01", name: "Thomas Outdoors billboards (Kansas)", src: "10-K" },
  { date: "2022-04", name: "InfoWest", deal: "broadband business assets", src: "10-K" },
];

export const BOSTON_OMAHA: CompanyHoldings = {
  name: "Boston Omaha",
  short: "Boston Omaha",
  statsTitle: "From the 10-Ks, 2012-2025",
  stats: [
    { label: "Businesses", value: "4", sub: "billboards, broadband, surety insurance, asset management" },
    { label: "Deals and stakes", value: String(ACQUISITIONS.length), sub: "named in the 10-Ks" },
    { label: "First deal", value: "2010", sub: "a 40% real estate stake" },
  ],
  sources: [{ label: "Boston Omaha 10-K filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001494582&type=10-K" }],
  branches: [
    {
      id: "businesses",
      label: "Businesses",
      color: BRANCH_COLORS.green,
      items: [
        { name: "Link Media Outdoor", note: "billboards, built by acquisitions since 2015" },
        { name: "Boston Omaha Broadband", note: "AireBeam, Utah Broadband, InfoWest" },
        { name: "General Indemnity Group", note: "surety insurance (UCS) and brokerage" },
        { name: "Boston Omaha Asset Management", year: 2017, src: "10-K", note: "founded, not acquired" },
      ],
    },
    acquisitionsByDecade(ACQUISITIONS, "Deals and stakes", BRANCH_COLORS.amber),
  ],
  historyNote: "Every acquisition and minority stake Boston Omaha's 10-Ks describe, including billboard portfolios bought from other operators. Many smaller billboard purchases are only summarized.",
  acquisitions: ACQUISITIONS,
};

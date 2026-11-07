/**
 * Holders the 13F feed can't see. 13Fs only cover US-listed securities, so a
 * stake in a stock listed only abroad (Warsaw, Tokyo, ...) never shows up in
 * one. Hand-maintained from the company's own disclosures (threshold
 * notices, general-meeting lists of 5%+ holders) and fund letters (the
 * quarterly "Letters & Reports" thread on r/SecurityAnalysis lists the
 * companies each letter discusses).
 *
 * Refresh quarterly, after the 13F run (mid Feb / May / Aug / Nov). Big
 * holders only file on crossing a threshold, so most quarters nothing
 * changes — but bump asOf when a newer source confirms a figure. Entries
 * older than STALE_MONTHS show in yellow.
 */

export const STALE_MONTHS = 6;

export interface MajorHolder {
  holder: string; // as named in the source
  group?: string; // ultimate parent, when that's who you'd recognise
  short?: string; // name for the narrow snapshot card
  managerId?: string; // id in MANAGERS, when it's a tracked superinvestor; also lists it on their page
  company?: string; // the stock held, named on the manager's page (with managerId)
  featured?: boolean; // starred like favorite managers
  pct: number; // fraction of shares outstanding (= votes unless the note says otherwise)
  asOf: string; // YYYY-MM-DD the figure is as of
  source: string; // URL
  sourceLabel: string;
  note?: string;
}

type Source = Pick<MajorHolder, "asOf" | "source" | "sourceLabel">;

// One per filing, shared by the holders it lists
const ACP_EGM: Source = {
  asOf: "2026-08-12",
  source: "https://www.parkiet.com/komunikaty-espi/art45009611-asseco-poland-sa-nadzwyczajne-walne-zgromadzenie-asseco-poland-s-a-znaczacy-akcjonariusze",
  sourceLabel: "Report 25/2026 (EGM 5%+ holders)",
};
const SGN_AGM: Source = {
  asOf: "2026-06-17",
  source: "https://www.money.pl/gielda/komunikaty/7298573325964353.html",
  sourceLabel: "AGM 5%+ holders list",
};
const TENCENT_IR: Source = {
  asOf: "2026-06-30",
  source: "https://www.tencent.com/wp-content/uploads/2026/08/E700_IR.pdf",
  sourceLabel: "2026 Interim Report",
};
const HKEX_IR: Source = {
  asOf: "2026-06-30",
  source: "https://www.hkexnews.hk/listedco/listconews/sehk/2026/0831/2026083100411.pdf",
  sourceLabel: "2026 Interim Report",
};
const MONOTARO_HY: Source = {
  asOf: "2026-06-30",
  source: "https://disclosure2dl.edinet-fsa.go.jp/searchdocument/pdf/S100YUQB.pdf",
  sourceLabel: "Half-year report (EDINET)",
};
const ASX_AR: Source = {
  asOf: "2026-07-06",
  source: "https://www.asx.com.au/content/dam/asx/annual-reports/asx-2026-annual-report.pdf",
  sourceLabel: "Annual Report 2026",
};
const KPG_20F: Source = {
  asOf: "2026-09-22",
  source: "https://www.sec.gov/Archives/edgar/data/2154524/000121390026106104/ea0306980-20fr12b_kelly.htm",
  sourceLabel: "Form 20-F (SEC)",
};
const BSE_SHP: Source = {
  asOf: "2026-09-30",
  source: "https://nsearchives.nseindia.com/corporate/xbrl/SHP_1741125_19102026104829_WEB.xml",
  sourceLabel: "Shareholding pattern (NSE)",
};
const PROSUS_CLASSES: Source = {
  asOf: "2026-05-18",
  source: "https://www.prosus.com/~/media/Files/P/prosus-corp-v2/investors/agm/fy2026/fy2026-shares-per-class-issued.pdf",
  sourceLabel: "FY26 shares per class",
};
const TEQNION_AR: Source = {
  asOf: "2026-03-07",
  source: "https://cdn.bequoted.com/media/1/d676fd84-76fa-4e28-adbb-bf3c6f21e9b6/Teqnion-Annual-report-ENG-version-2025.pdf",
  sourceLabel: "Annual Report 2025",
};

// Berkshire's Japan stakes, held through National Indemnity (EDINET filer
// E35979). Large-holder reports are only due on a 1%+ change, so these can sit
// unchanged for a long time. The percentages use different bases: reports use
// issued shares including treasury, Itochu's notice uses voting rights.
const edinet = (asOf: string, doc: string): Source => ({
  asOf,
  source: `https://disclosure2dl.edinet-fsa.go.jp/searchdocument/pdf/${doc}.pdf`,
  sourceLabel: "Large-holder report (EDINET)",
});
const NICO = {
  holder: "National Indemnity",
  group: "Berkshire Hathaway",
  short: "Berkshire",
  managerId: "buffett",
  featured: true,
};
const ITOCHU_NOTICE: Source = {
  asOf: "2026-02-27",
  source: "https://www.itochu.co.jp/ja/files/ITC20260302_2_J.pdf",
  sourceLabel: "Major shareholder notice (Itochu)",
};
const TOKIO_MARINE_FY25: Source = {
  asOf: "2026-04-13",
  source: "https://www.tokiomarinehd.com/en/ir/event/presentation/2025/f5hrqd0000005mbv-att/4Q_FY2025_Summary_Report_e.pdf",
  sourceLabel: "FY2025 results (Tokio Marine)",
};
const BSP_BERKSHIRE: Source = {
  asOf: "2026-10-14",
  source: "https://www.sec.gov/Archives/edgar/data/2004711/000200471126000018/bsp_ex99-1.htm",
  sourceLabel: "Form 6-K press release (SEC)",
};

// Keyed by Yahoo ticker (as typed on the Five-Factor page)
export const MAJOR_HOLDERS: Record<string, MajorHolder[]> = {
  // Hong Kong: holders of 5%+ must notify (SFO Part XV); reports list them
  "0388.HK": [
    {
      holder: "JPMorgan Chase & Co.",
      pct: 0.0795,
      ...HKEX_IR,
      note: "Mostly as lending agent, investment manager and custodian, not a single owner's stake.",
    },
    {
      holder: "HKSAR Government",
      group: "for the account of the Exchange Fund",
      short: "HK Government",
      pct: 0.0617,
      ...HKEX_IR,
      note: "Share count as at 31 Dec 2025, per the HKMA. The government also appoints six of the thirteen directors.",
    },
  ],
  "0700.HK": [
    {
      holder: "MIH Internet Holdings B.V.",
      group: "Prosus · Naspers",
      short: "Prosus (Naspers)",
      pct: 0.226,
      ...TENCENT_IR,
      note: "Down from 22.80% at 31 Dec 2025: Prosus sells Tencent shares to fund its own buyback.",
    },
    { holder: "Advance Data Services Limited", group: "Ma Huateng (founder, CEO)", short: "Ma Huateng", pct: 0.0885, ...TENCENT_IR },
  ],
  // Japan: half-year and annual reports list the ten largest holders
  "3064.T": [
    {
      holder: "Grainger Global Holdings, Inc.",
      group: "W.W. Grainger",
      short: "Grainger",
      pct: 0.5066,
      ...MONOTARO_HY,
      note: "Parent company since 2009. Next largest are custody banks (Japan Master Trust 9.21%).",
    },
  ],
  // Poland: lists of 5%+ holders at each general meeting; % of total votes
  "ACP.WA": [
    {
      holder: "TSS Europe B.V.",
      short: "Topicus (Constellation)",
      group: "Topicus.com · Constellation Software",
      featured: true,
      pct: 0.2314,
      ...ACP_EGM,
      note: "24.84% (20,618,892 shares) per TSS's 2 Oct 2025 notice after buying 14.84% in treasury shares at PLN 85; meeting lists count only shares registered for that meeting. Voting agreement with the Góral foundation.",
    },
    { holder: "Adam Góral Fundacja Rodzinna", short: "Adam Góral foundation", group: "Adam Góral (CEO)", pct: 0.1096, ...ACP_EGM },
    { holder: "Allianz OFE", group: "Polish pension fund", pct: 0.0936, ...ACP_EGM },
    { holder: "Nationale-Nederlanden OFE", group: "Polish pension fund", pct: 0.0912, ...ACP_EGM },
  ],
  "SGN.WA": [
    {
      holder: "TSS Europe B.V.",
      short: "Topicus (Constellation)",
      group: "Topicus.com · Constellation Software",
      featured: true,
      pct: 0.7268,
      ...SGN_AGM,
      note: "Control since its tender offer at PLN 12, in which Cron and Value FIZ sold 51.92%.",
    },
    { holder: "Barca Global Master Fund, L.P.", short: "Barca Global", pct: 0.0901, ...SGN_AGM },
  ],
  // Australia: substantial holders (5%+) file Forms 603/604
  "ASX.AX": [
    { holder: "State Street Corporation", pct: 0.0915, ...ASX_AR },
    { holder: "UniSuper", group: "Australian super fund", pct: 0.0767, ...ASX_AR },
    { holder: "AustralianSuper Pty Ltd", group: "Australian super fund", short: "AustralianSuper", pct: 0.0754, ...ASX_AR },
    { holder: "BlackRock", pct: 0.0709, ...ASX_AR },
    { holder: "Vanguard", pct: 0.0603, ...ASX_AR },
  ],
  "KPG.AX": [
    {
      holder: "Brett Kelly and related entities",
      group: "founder, CEO",
      short: "Brett Kelly",
      pct: 0.3132,
      ...KPG_20F,
      note: "14,178,118 shares. Down from 48.0% (Jun 2024) and 37.19% (Jun 2026), mainly on-market sales, before an agreed sale of up to A$6.5m to the employee share trust. No other 5% holder. Nasdaq listing and ASX delisting approved at the 23 Oct 2026 EGM; Class B shares with 10 votes to follow.",
    },
  ],
  // India: quarterly shareholding patterns name every holder above 1%
  "BSE.NS": [
    {
      holder: "Life Insurance Corporation of India",
      short: "LIC",
      pct: 0.0451,
      ...BSE_SHP,
      note: "No promoter and no 5% holder; these are the largest named holders above 1%.",
    },
    { holder: "ICICI Prudential Mutual Fund", short: "ICICI Prudential MF", pct: 0.027, ...BSE_SHP },
    { holder: "SBI Mutual Fund", pct: 0.0256, ...BSE_SHP },
    { holder: "Vanguard", pct: 0.022, ...BSE_SHP },
    { holder: "Nippon India Mutual Fund", short: "Nippon India MF", pct: 0.0184, ...BSE_SHP },
    { holder: "Siddharth Balachandran", group: "individual investor", pct: 0.0164, ...BSE_SHP },
  ],
  // Netherlands: AFM register; Prosus publishes holders per share class
  "PRX.AS": [
    {
      holder: "Naspers Limited",
      short: "Naspers",
      pct: 0.4292,
      ...PROSUS_CLASSES,
      note: "42.92% of the N shares (the economic interest). Naspers also owns all 2.87bn B shares, which vote but carry little economic interest, for about 77% of votes. Cross-holding with Naspers removed in 2023.",
    },
  ],
  // Sweden: annual report lists the ten largest (Euroclear)
  "TEQ.ST": [
    {
      holder: "Stravaigin AB",
      pct: 0.1774,
      ...TEQNION_AR,
      note: "Same 3,045,000 shares other sources attribute to Antheia, Daniel Ek's family office, which bought from Vixar in 2025.",
    },
    { holder: "Investment AB Spiltan", short: "Spiltan", pct: 0.1141, ...TEQNION_AR },
    { holder: "Vixar AB", short: "Vixar", pct: 0.1094, ...TEQNION_AR },
    { holder: "Johan Steene", group: "CEO", pct: 0.0502, ...TEQNION_AR },
  ],
  // Japan: holders of 5%+ report each 1% change through EDINET
  "8058.T": [{ ...NICO, company: "Mitsubishi Corp", pct: 0.1106, note: "% of issued shares.", ...edinet("2026-04-30", "S100Y33F") }],
  "8031.T": [{ ...NICO, company: "Mitsui & Co", pct: 0.1083, note: "% of issued shares.", ...edinet("2026-06-24", "S100YO0N") }],
  "8002.T": [{ ...NICO, company: "Marubeni Corp", pct: 0.1032, note: "% of issued shares.", ...edinet("2026-06-25", "S100YO1O") }],
  "8053.T": [{ ...NICO, company: "Sumitomo Corp", pct: 0.103, note: "% of issued shares.", ...edinet("2026-05-12", "S100Y4U6") }],
  "8001.T": [{ ...NICO, company: "Itochu Corp", pct: 0.1007, note: "% of voting rights, which excludes treasury shares.", ...ITOCHU_NOTICE }],
  "8766.T": [
    {
      ...NICO,
      company: "Tokio Marine Holdings",
      pct: 0.0249,
      note: "Bought from treasury in a strategic partnership; % of issued shares.",
      ...TOKIO_MARINE_FY25,
    },
  ],
  // US-listed, so 13Fs do cover it, but they lag: the Oct 2026 purchase isn't
  // reported until the Q4 13F (Feb 2027). Recheck then; drop this entry if the
  // 13F shows the full stake.
  BSP: [
    {
      holder: "Berkshire Hathaway",
      group: "Warren Buffett",
      short: "Berkshire",
      managerId: "buffett",
      company: "Bending Spoons",
      featured: true,
      pct: 0.04,
      note: "$600M at the July 2026 IPO plus $330M on Oct 14, 2026. The October purchase falls in Q4, so it won't appear in a 13F until Feb 2027.",
      ...BSP_BERKSHIRE,
    },
  ],
};

export function majorHolders(ticker: string): MajorHolder[] {
  return MAJOR_HOLDERS[ticker.toUpperCase()] ?? [];
}

// A manager's stakes from this list, largest share of the company first
export function holdingsOutside13F(managerId: string) {
  return Object.entries(MAJOR_HOLDERS)
    .flatMap(([ticker, holders]) => holders.filter((h) => h.managerId === managerId).map((h) => ({ ticker, ...h })))
    .sort((a, b) => b.pct - a.pct);
}

// Yahoo exchange suffixes. Listed explicitly so share classes (BRK.B) don't
// count as foreign
const EXCHANGE_SUFFIXES = new Set(
  ("TO V NE CN L IL DE F PA AS BR LS MI MC SW VI WA ST HE CO OL IC IR AT PR BD IS " +
    "AX NZ HK SS SZ T KS KQ TW TWO NS BO SI JK KL BK SA MX JO TA SR QA").split(" ")
);

// A non-US line: 13Fs may not cover it and its insiders don't file Form 4s
export const isForeignListing = (ticker: string) => EXCHANGE_SUFFIXES.has(ticker.toUpperCase().split(".").pop()!) && ticker.includes(".");

// `today` as YYYY-MM-DD (the daily data refresh date, so render stays pure)
export function isStale(asOf: string, today: string) {
  const cutoff = new Date(`${today.slice(0, 10)}T00:00:00Z`);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - STALE_MONTHS);
  return asOf < cutoff.toISOString().split("T")[0];
}

/**
 * Asseco Poland (WSE:ACP) for /asseco, from the H1 2026 financial report
 * (English): note 3's top-level group chart (voting rights / equity at
 * Jun 30 2026), its list of changes in H1 2026, and the financial highlights
 * (PLN). Sub-group charts A–E (Asseco Central Europe, ASEE, Michpal, Matrix
 * IT, Magic) are counted on their parent's node rather than drawn. The site
 * blocks scripted downloads; read it in a browser. Refresh after each half.
 */

import { BRANCH_COLORS, type Acquisition, type CompanyHoldings } from "@/lib/company-holdings";

const ACQUISITIONS: Acquisition[] = [
  { date: "2026-02", name: "8Seneca", deal: "51%, with its subsidiaries; bought by INVENTION (Asseco Central Europe)", src: "H1 2026 report, note 3" },
  { date: "2026-02", name: "M.L.B.S. Technologies", deal: "73%, with its subsidiary; bought by Formula Infrastructure", src: "H1 2026 report, note 3" },
  { date: "2026-02", name: "David Barhom", deal: "70%; bought by Formula Infrastructure", src: "H1 2026 report, note 3" },
  { date: "2026-02", name: "Magic Software Enterprises", deal: "merged into Matrix IT, which bought all of it; Magic delisted from Nasdaq and TASE", src: "H1 2026 report, note 3" },
  { date: "2026-03", name: "Martin Control Systems", deal: "100%; bought by Magic Software Enterprises", src: "H1 2026 report, note 3" },
  { date: "2026-03", name: "MABAT 3D Technologies", deal: "bought by TSG IT Advanced Systems; accounted for as an associate", src: "H1 2026 report, note 3" },
  { date: "2026-04", name: "JTG HR Consulting", deal: "60%, with its subsidiaries; bought by Michpal Technologies", src: "H1 2026 report, note 3" },
  { date: "2026-04", name: "Productive Software Development", deal: "60%; bought by Comblack IT (Magic)", src: "H1 2026 report, note 3" },
  { date: "2026-04", name: "TOVEK", deal: "stake raised from 75% to 80% by Asseco Central Europe", src: "H1 2026 report, note 3" },
  { date: "2026-04", name: "Monri Payments (Slovenia)", deal: "stake raised to 100% by Payten Holding", src: "H1 2026 report, note 3" },
  { date: "2026-04", name: "BS Telecom Solutions", deal: "stake raised from 60% to 100% by ASEE", src: "H1 2026 report, note 3" },
];

export const ASSECO: CompanyHoldings = {
  name: "Asseco Poland",
  short: "Asseco",
  statsTitle: "6 months to Jun 30, 2026 · H1 2026 report, PLN",
  stats: [
    { label: "Operating revenues", value: "PLN 9,250M", sub: "+16% (H1 2025: PLN 7,987M)" },
    { label: "Net profit to Asseco shareholders", value: "PLN 430M", sub: "H1 2025: PLN 282M" },
    { label: "Net profit incl. minorities", value: "PLN 873M", sub: "most of Formula's profit belongs to its other owners" },
  ],
  sources: [
    {
      label: "H1 2026 financial report",
      url: "https://inwestor.asseco.com/files/investor/uploads/Semi_annual_report_for_H1_2026_-_Financial_statements_of_Asseco_Group.pdf",
    },
  ],
  branches: [
    {
      id: "intl",
      label: "Asseco International",
      color: BRANCH_COLORS.amber,
      detail: "Asseco International, a.s. (Slovakia, 100%)",
      groups: [
        { name: "Europe & Africa", items: [
        { name: "Asseco Central Europe", pct: 0.9233, note: "Slovakia; heads 37 companies incl. Asseco Business Solutions (47.6%)" },
        { name: "Asseco South Eastern Europe", pct: 0.5089, note: "Poland; heads 53 companies incl. Payten, Monri, Necomplus", ticker: "ASE.WA" },
        { name: "Asseco Equator Software", pct: 0.51, note: "Kenya" },
        { name: "Asseco Western Europe", note: "Poland" },
        { name: "Asseco Spain", pct: 0.8686, note: "Spain" },
        { name: "Valorista", note: "Spain" },
        { name: "Raxon Security Services", note: "Spain" },
        { name: "Worldtech Enterprises USA", pct: 0.8, note: "USA" },
        { name: "Asseco Lietuva", pct: 0.978, note: "Lithuania" },
        ] },
        { name: "Asseco PST (Portugal)", items: [
        { name: "Asseco PST Holding", pct: 0.949, note: "Portugal" },
        { name: "Asseco PST Portugal", note: "Portugal" },
        { name: "LebaTechnology", pct: 0.9986, note: "Angola" },
        { name: "CPI – Consultoria de Projetos Informáticos", pct: 0.8, note: "Angola" },
        { name: "Asseco PST Moçambique", pct: 0.9, note: "Mozambique" },
        { name: "Finantech", pct: 0.76, note: "Portugal" },
        { name: "CodeConnexion", pct: 0.45, note: "Sri Lanka; in liquidation" },
        ] },
      ],
    },
    {
      id: "formula",
      label: "Formula Systems",
      color: BRANCH_COLORS.violet,
      detail: "Asseco owns 25.81% of Formula Systems (Nasdaq: FORTY) and controls it; stakes below are Formula's",
      items: [
        { name: "Matrix IT", pct: 0.4768, note: "Israel; heads 86 companies incl. Magic Software (82 more) since their Feb 2026 merger", ticker: "MTRX.TA" },
        { name: "Michpal Technologies", pct: 0.6909, note: "Israel; heads 19 companies" },
        { name: "TSG IT Advanced Systems", pct: 0.3287, note: "Israel" },
        { name: "ExonMedia", pct: 0.2145, note: "Israel" },
        { name: "Insync Staffing", pct: 0.9009, note: "USA" },
        { name: "Bear Staffing", note: "USA" },
        { name: "Zap Group", note: "Israel" },
        { name: "Gil Hazahav", note: "Israel" },
        { name: "Winhelp – Ofran", note: "Israel" },
        { name: "Safra Digital Marketing", pct: 0.51, note: "Israel" },
        { name: "SHAK-AD", pct: 0.501, note: "Israel" },
        { name: "ATAK Electronics Communications", note: "Israel" },
        { name: "Shamrad Electronic", note: "Israel" },
        { name: "Hashahar Telecom and Electricity", pct: 0.51, note: "Israel" },
        { name: "E.P.R. Systems", pct: 0.6, note: "Israel" },
        { name: "Bar Technologies", note: "Israel" },
        { name: "E.S.D Assets Conducting", note: "Israel" },
        { name: "Eshed Asset Registration", note: "Israel" },
        { name: "Q.rity Quality Security Solutions", note: "Israel" },
        { name: "A.R.T.S. Advanced Real Time Systems", note: "Israel" },
        { name: "Elita Project Management", note: "Israel" },
        { name: "Puzzle Projects", note: "Israel" },
        { name: "P.C.I Process Control Instrumentation", pct: 0.7, note: "Israel" },
        { name: "MABAT 3D Technologies", note: "Israel; bought Mar 2026; accounted for as an associate" },
        { name: "Bestdeals USA", note: "USA" },
        { name: "Exon Media India", note: "India" },
        { name: "Exon Media Technology Brazil", note: "Brazil" },
        { name: "Strepera", note: "Ireland" },
        { name: "Brandvision", note: "Israel" },
        { name: "Ofek Aerial Photography", pct: 0.8, note: "Israel" },
        { name: "Yona Engineering Consulting & Management", note: "Israel" },
        { name: "Geopoint", pct: 0.4, note: "Israel; 50% of votes" },
        { name: "Formula Infrastructure", note: "Israel" },
        { name: "Advance Engineering", pct: 0.6, note: "Israel" },
        { name: "M.L.B.S. Technologies", pct: 0.73, note: "Israel; bought Feb 2026" },
        { name: "M.L.B.S Construction, Development and Management", note: "Israel" },
        { name: "David Barhom", pct: 0.7, note: "Israel; bought Feb 2026" },
      ],
    },
    {
      id: "poland",
      label: "Asseco Poland segment",
      color: BRANCH_COLORS.green,
      detail: "Held by Asseco Poland directly",
      items: [
        { name: "Asseco Data Systems", note: "Poland" },
        { name: "Pirios", pct: 0.6524, note: "Poland" },
        { name: "Nile Data Systems", pct: 0.49, note: "South Sudan" },
        { name: "Cyber Defense Africa", pct: 0.32, note: "Togo" },
        { name: "Asseco Middle East", pct: 0.33, note: "Saudi Arabia" },
        { name: "Creative Telecom Company", note: "Saudi Arabia" },
        { name: "ComCERT", note: "Poland" },
        { name: "ABS GmbH", note: "Germany" },
        { name: "IMX", note: "Ukraine; in liquidation" },
        { name: "KKI-BCI", note: "Poland; in liquidation" },
        { name: "Asseco Innovation Fund", note: "Poland; in liquidation" },
        { name: "ZUI Novum", pct: 0.5108, note: "Poland" },
        { name: "GSTN Consulting", note: "Poland" },
        { name: "Postdata", pct: 0.49, note: "Poland" },
        { name: "Asseco Resovia", pct: 0.8902, note: "Poland; volleyball club" },
        { name: "Krajowy Operator Chmury Medycznej", note: "Poland; national medical cloud operator" },
        { name: "Nextbank Software", pct: 0.648, note: "Poland" },
        { name: "NXTBK", pct: 0.399, note: "Philippines" },
        { name: "Asseco Cloud", note: "Poland" },
        { name: "Infocomp", pct: 0.5083, note: "Poland" },
        { name: "Park Wodny Sopot", note: "Poland" },
        { name: "Aquapark Sopot", note: "Poland" },
        { name: "Podkarpacki Fundusz Nieruchomości", note: "Poland; real estate" },
      ],
    },
  ],
  historyNote:
    "Deals in the first half of 2026, from note 3 of the H1 2026 report. Asseco reports changes half by half, so earlier years aren't listed here.",
  acquisitions: ACQUISITIONS,
  notes: [
    "About 350 companies in all: the top-level chart drawn here plus five sub-group charts in note 3, counted on Asseco Central Europe, ASEE, Michpal and Matrix IT.",
  ],
};

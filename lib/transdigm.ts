/**
 * TransDigm Group (NYSE:TDG) for /transdigm: every acquisition named in its 10-Ks for fiscal
 * 2006-2025 (year to Sep 30; TransDigm Group's filings start in 2006, so its 1993-2002
 * deals aren't covered). Refresh after each 10-K (Nov).
 */

import { BRANCH_COLORS, acquisitionsByDecade, type Acquisition, type CompanyHoldings } from "@/lib/company-holdings";

const ACQUISITIONS: Acquisition[] = [
  { date: "2003-02", name: "Norco", deal: "assets, through MarathonNorco", src: "10-K" },
  { date: "2004-07", name: "Avionic Instruments", deal: "100%", src: "10-K" },
  { date: "2005-01", name: "Fluid Regulators", deal: "100%", src: "10-K" },
  { date: "2005-06", name: "Eaton aerospace motor product line", src: "10-K" },
  { date: "2006-06", name: "Sweeney Engineering", deal: "100%", price: "~$25.5M", src: "10-K" },
  { date: "2006-10", name: "CDA InterCorp", deal: "100%", price: "$45M", src: "10-K" },
  { date: "2007-02", name: "Aviation Technologies", deal: "100%", src: "10-K" },
  { date: "2007-08", name: "Bruce Aerospace", deal: "assets of Bruce Industries", src: "10-K" },
  { date: "2008-05", name: "CEF Industries", deal: "100%", src: "10-K" },
  { date: "2009-07", name: "Acme Aerospace", deal: "100%", src: "10-K" },
  { date: "2010-09", name: "Semco Instruments", deal: "100%", src: "10-K" },
  { date: "2010-12", name: "McKechnie Aerospace", deal: "100%", src: "10-K" },
  { date: "2011-08", name: "Schneller", deal: "100%", price: "~$288.5M", src: "10-K" },
  { date: "2011-12", name: "Harco Laboratories", deal: "100%", price: "~$83.3M", src: "10-K" },
  { date: "2012-02", name: "AmSafe Global Holdings", deal: "100%", src: "10-K" },
  { date: "2012-09", name: "Aero-Instruments", deal: "100%", src: "10-K" },
  { date: "2013-06", name: "Aerosonic", deal: "majority, by tender offer", src: "10-K" },
  { date: "2013-06", name: "Arkwin Industries", deal: "100%", src: "10-K" },
  { date: "2013-06", name: "Whippany Actuation Systems", deal: "GE Aviation electromechanical actuation assets", src: "10-K" },
  { date: "2014", name: "Airborne Systems", src: "10-K" },
  { date: "2014", name: "Electromech Technologies (EME)", src: "10-K" },
  { date: "2015-03", name: "Telair Cargo Group", src: "10-K" },
  { date: "2015-03", name: "Adams Rite Aerospace GmbH (Franke Aquarotter)", src: "10-K" },
  { date: "2015-05", name: "Pexco Aerospace", deal: "assets", src: "10-K" },
  { date: "2015-08", name: "PneuDraulics", deal: "100%", src: "10-K" },
  { date: "2016-01", name: "Breeze-Eastern", src: "10-K" },
  { date: "2016-06", name: "Data Device Corporation (ILC Holdings)", deal: "100%", src: "10-K" },
  { date: "2016-09", name: "Young & Franklin / Tactair", deal: "100%", src: "10-K" },
  { date: "2017-02", name: "Schroth Safety Products", src: "10-K" },
  { date: "2017-05", name: "North Hills Signal Processing, Cablecraft Motion Controls and Preece", price: "~$106.3M together", src: "10-K" },
  { date: "2018-03", name: "Kirkhill Elastomers", src: "10-K" },
  { date: "2018-04", name: "Extant Components Group", src: "10-K" },
  { date: "2018-07", name: "Skandia", deal: "100%", src: "10-K" },
  { date: "2018-08", name: "Rockwell Collins product line", deal: "for Extant", src: "10-K" },
  { date: "2018-10", name: "NavCom (Corona operations)", deal: "assets", src: "10-K" },
  { date: "2019-03", name: "Esterline Technologies", deal: "100%", price: "$122.50 a share", src: "10-K" },
  { date: "2019-08", name: "L3Harris Stormscope product line", deal: "assets", src: "10-K" },
  { date: "2021", name: "Cobham Aero Connectivity", src: "10-K" },
  { date: "2022-05", name: "DART Aerospace", deal: "100%", price: "$359M", src: "10-K" },
  { date: "2023-05", name: "Calspan", deal: "100%", price: "~$730M", src: "10-K" },
  { date: "2024-06", name: "CPI Electron Device Business", deal: "100%", price: "~$1,385M", src: "10-K" },
  { date: "2025", name: "Servotronics", src: "10-K" },
  { date: "2025-10", name: "Simmonds Precision Products", deal: "100%", src: "10-K" },
];

export const TRANSDIGM: CompanyHoldings = {
  name: "TransDigm Group",
  short: "TransDigm",
  statsTitle: "Fiscal 2025 (year to Sep 30) · 10-K",
  stats: [
    { label: "Net sales", value: "$8,831M", sub: "fiscal 2024: $7,940M" },
    { label: "Net income", value: "$2,074M", sub: "fiscal 2024: $1,715M" },
    { label: "Businesses acquired", value: "95", sub: "and product lines since 1993, per the 10-K" },
  ],
  sources: [{ label: "TransDigm 10-K filings", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001260221&type=10-K" }],
  branches: [acquisitionsByDecade(ACQUISITIONS, "Acquisitions", BRANCH_COLORS.amber)],
  historyNote:
    "Every acquisition TransDigm's 10-Ks name for 2003-2025. The 10-K counts 95 businesses and product lines bought since its 1993 founding; earlier deals predate its SEC filings.",
  acquisitions: ACQUISITIONS,
};

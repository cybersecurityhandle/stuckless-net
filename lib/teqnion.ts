/**
 * Teqnion (STO:TEQ) for /teqnion, from the 2025 annual report (English): note 26
 * lists every subsidiary with ownership; the five-year overview gives results
 * (MSEK). Companies with no 2024 carrying value there were bought in 2025;
 * earlier purchase years aren't in this report. Refresh after each annual
 * report (Mar).
 */

import { BRANCH_COLORS, type Acquisition, type CompanyHoldings } from "@/lib/company-holdings";

const ACQUISITIONS: Acquisition[] = [
  { date: "2025", name: "Edurus Gravstenar", src: "2025 annual report" },
  { date: "2025", name: "MITAB i Forsbacka", src: "2025 annual report" },
  { date: "2025", name: "Norlin Polymers (UK)", src: "2025 annual report" },
  { date: "2025", name: "Birkett Bogmats", src: "2025 annual report" },
  { date: "2025", name: "HT Servo", src: "2025 annual report" },
  { date: "2025", name: "Midlands Special Fasteners", src: "2025 annual report" },
  { date: "2025", name: "Awarded 2U", src: "2025 annual report" },
  { date: "2025", name: "Merridale", src: "2025 annual report" },
  { date: "2025", name: "Thermasolutions International", src: "2025 annual report" },
];

export const TEQNION: CompanyHoldings = {
  name: "Teqnion",
  short: "Teqnion",
  statsTitle: "2025 · annual report, SEK",
  stats: [
    { label: "Net sales", value: "SEK 1,800M", sub: "+15% (2024: SEK 1,567M)" },
    { label: "EBITA", value: "SEK 203M", sub: "11.3% margin" },
    { label: "Profit for the year", value: "SEK 98.5M", sub: "2024: SEK 95.8M" },
  ],
  sources: [{ label: "2025 annual report", url: "https://cdn.bequoted.com/media/1/d676fd84-76fa-4e28-adbb-bf3c6f21e9b6/Teqnion-Annual-report-ENG-version-2025.pdf" }],
  branches: [
    { id: "se", label: "Sweden", color: BRANCH_COLORS.green, items: [
        {name: "Industrikomponenter"},
        {name: "AB Elrond Komponent"},
        {name: "Narva Scandinavia"},
        {name: "GB Verkstads & Industrivaror"},
        {name: "Storebro Energy Systems"},
        {name: "Air Target Sweden"},
        {name: "K-Fab Sverige", pct: 0.91},
        {name: "Cellab Nordia"},
        {name: "Grimstorp Byggkomponenter"},
        {name: "Shanty TEQ"},
        {name: "Stans & Press i Blomstermåla"},
        {name: "Stans & Press i Olofström"},
        {name: "Eloflex"},
        {name: "Hem1 Sydost"},
        {name: "Markis City"},
        {name: "Injab Kraft Teknik"},
        {name: "WiMa Propulsion"},
        {name: "Cutting Metal Works i Valdemarsvik"},
        {name: "Kema Storköksförsäljning"},
        {name: "Wallmek i Kungälv"},
        {name: "INNOGUARD"},
        {name: "Vicky Teknik"},
        {name: "Teltek i Örebro"},
        {name: "Lundahl Transformers"},
        {name: "Schill Reglerteknik"},
        {name: "Edurus Gravstenar", year: 2025, src: "2025 annual report"},
        {name: "MITAB i Forsbacka", year: 2025, src: "2025 annual report"},
    ] },
    { id: "uk", label: "UK & Ireland", color: BRANCH_COLORS.amber, groups: [
      { name: "United Kingdom", items: [
        {name: "Belle Coachworks"},
        {name: "Stanwell Group"},
        {name: "Surge Protection Devices"},
        {name: "Nubis Solutions"},
        {name: "Avelair"},
        {name: "UK Lanyard Makers"},
        {name: "Norlin Polymers (UK)", year: 2025, src: "2025 annual report"},
        {name: "Birkett Bogmats", year: 2025, src: "2025 annual report"},
        {name: "HT Servo", year: 2025, src: "2025 annual report"},
        {name: "Midlands Special Fasteners", year: 2025, src: "2025 annual report"},
        {name: "Awarded 2U", year: 2025, src: "2025 annual report"},
        {name: "Merridale", year: 2025, src: "2025 annual report"},
        {name: "Thermasolutions International", year: 2025, src: "2025 annual report"},
      ] },
      { name: "Ireland", items: [
        {name: "Reward Catering"},
      ] },
    ] },
  ],
  historyNote: "Companies Teqnion bought in 2025 (new in its subsidiary list that year). The 2025 report doesn't date earlier purchases.",
  acquisitions: ACQUISITIONS,
};

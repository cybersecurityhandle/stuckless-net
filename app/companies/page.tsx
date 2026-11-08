import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  alternates: { canonical: "/companies" },
  title: "Holding companies | Stuckless",
  description:
    "Everything Berkshire Hathaway, Constellation Software, Topicus, Markel, Fairfax, Brookfield and other compounders own, with their acquisition histories",
};

// Every "everything X owns" page. Server-rendered so search engines find them
// through links, not only the sitemap.
const GROUPS: { title: string; pages: { href: string; name: string; about: string }[] }[] = [
  {
    title: "Constellation Software family",
    pages: [
      { href: "/csu", name: "Constellation Software", about: "Every company in its nine operating groups, plus yearly acquisition spend" },
      { href: "/topicus", name: "Topicus", about: "The Dutch Topicus business, every TSS deal since 2016, and its listed stakes" },
      { href: "/lumine", name: "Lumine Group", about: "36 communications and media software companies, with the year each was bought" },
      { href: "/sygnity", name: "Sygnity", about: "Topicus's Polish subsidiary and the software companies it has bought since 2024" },
      { href: "/asseco", name: "Asseco Poland", about: "Its group structure across Poland, Asseco International and Formula Systems" },
    ],
  },
  {
    title: "Insurance-led holding companies",
    pages: [
      { href: "/berkshire", name: "Berkshire Hathaway", about: "Every owned business by segment, after-tax segment earnings and acquisition history" },
      { href: "/markel", name: "Markel Group", about: "Markel Ventures, the insurance units and every acquisition since 1999" },
      { href: "/fairfax", name: "Fairfax Financial", about: "Subsidiaries, associates and stakes, and every acquisition since 2001" },
      { href: "/brookfield", name: "Brookfield Corporation", about: "BAM, Brookfield Wealth Solutions, its operating affiliates and their deals since 2023" },
      { href: "/loews", name: "Loews", about: "CNA, Boardwalk, Loews Hotels, Altium and its acquisitions" },
      { href: "/brown-brown", name: "Brown & Brown", about: "The insurance broker's named acquisitions" },
    ],
  },
  {
    title: "Serial acquirers",
    pages: [
      { href: "/heico", name: "HEICO", about: "Every acquisition named in its 10-Ks, by decade" },
      { href: "/roper", name: "Roper Technologies", about: "Every acquisition named in its 10-Ks, by decade" },
      { href: "/transdigm", name: "TransDigm", about: "Every acquisition named in its 10-Ks, by decade" },
      { href: "/teqnion", name: "Teqnion", about: "Its niche industrial companies in Sweden, the UK and Ireland" },
      { href: "/kelly-partners", name: "Kelly Partners Group", about: "Its 51%-owned accounting partnerships and every deal announced on the ASX" },
      { href: "/boston-omaha", name: "Boston Omaha", about: "Billboards, broadband, surety insurance and its acquisitions" },
      { href: "/biglari", name: "Biglari Holdings", about: "Steak n Shake, Western Sizzlin, insurance and oil and gas" },
    ],
  },
];

export default function Page() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight">Holding companies</h1>
      <p className="mt-2 max-w-3xl text-muted-foreground">
        What each of these compounders owns, drawn as a web from its own filings, with its acquisition history.
      </p>
      {GROUPS.map((g) => (
        <section key={g.title} className="mt-8">
          <h2 className="text-lg font-semibold">{g.title}</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.pages.map((p) => (
              <li key={p.href}>
                <Link
                  href={p.href}
                  className="block h-full rounded-md border border-border px-4 py-3 transition-colors hover:bg-muted/40"
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{p.about}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

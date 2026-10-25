import type { Metadata } from "next";
import type { ReactNode } from "react";

const DESCRIPTION =
  "Daniel Stuckless: security engineer and pentester, founder of CyberLegionnaire. Security monitoring and defence for regulated financial clients; open-source security tools.";

export const metadata: Metadata = {
  title: "About | Stuckless",
  description: DESCRIPTION,
  openGraph: {
    title: "Daniel Stuckless: Security Engineer",
    description: DESCRIPTION,
    url: "https://stuckless.net/about",
    siteName: "stuckless.net",
    type: "profile",
  },
};

const WHOAMI = "Daniel Stuckless";
const TAGLINE = "security engineer & pentester · Canada";

const BIO = [
  "Founder of CyberLegionnaire, a security practice covering defence, offence and advisory.",
  "Clients include a financial regulatory firm and a REIT operating under Ontario Securities Commission requirements: security monitoring, defence in depth and staff security awareness.",
  "This site is my personal hub for the tools I actually use.",
];

const PROJECTS = [
  {
    name: "wishday",
    note: "open-source Android app that remembers birthdays and sends wishes by SMS or Signal",
    href: "https://github.com/cybersecurityhandle/wishday/releases/latest",
  },
  {
    name: "tor-ovh",
    note: "Terraform for a non-exit Tor relay on an OVH dedicated server",
    href: "https://github.com/cybersecurityhandle/tor-ovh",
  },
  {
    name: "pan-redactor",
    note: "finds and redacts payment card numbers in the browser (Luhn check, PCI DSS masking)",
    href: "https://cybersecurityhandle.github.io/pan-redactor/",
  },
  {
    name: "wazuh-additions",
    note: "ClamAV integration and Lynis audits for Wazuh",
    href: "https://github.com/cybersecurityhandle/Wazuh-Additions",
  },
  {
    name: "intel",
    note: "live threat intel dashboard: CVEs, EPSS, CISA KEV, threat actors",
    href: "/intel",
  },
];

const FOCUS = [
  { area: "security", note: "detection & monitoring (Wazuh), threat intel, offensive testing" },
  { area: "technology", note: "Python, TypeScript, Terraform; small self-hosted tools" },
  { area: "also", note: "investing: statutory earnings over adjusted; serial acquirers" },
];

const NOW_UPDATED = "2026-10";
const NOW = [
  "Wishday v1.3.2 released; submitted to F-Droid",
  "Working through OSCP-style labs for fun",
  "Reading Mark Leonard's Constellation Software shareholder letters",
];

const LINKS = [
  { label: "github", href: "https://github.com/cybersecurityhandle", text: "github.com/cybersecurityhandle" },
  // TODO: add LinkedIn URL
  // { label: "linkedin", href: "https://www.linkedin.com/in/...", text: "linkedin.com/in/..." },
  { label: "email", href: "mailto:daniel@cyberlegionnaire.com", text: "daniel@cyberlegionnaire.com" },
  { label: "work", href: "https://cyberlegionnaire.com", text: "cyberlegionnaire.com" },
  // TODO: add résumé PDF to public/ and link it
  // { label: "résumé", href: "/daniel-stuckless-resume.pdf", text: "resume.pdf" },
];

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: WHOAMI,
  url: "https://stuckless.net/about",
  jobTitle: "Security Engineer",
  worksFor: { "@type": "Organization", name: "CyberLegionnaire", url: "https://cyberlegionnaire.com" },
  sameAs: LINKS.filter((l) => l.href.startsWith("http") && l.label !== "work").map((l) => l.href),
  knowsAbout: ["Security monitoring", "Wazuh", "Threat intelligence", "Penetration testing", "Terraform"],
};

function Prompt({ cmd }: { cmd: string }) {
  return (
    <div className="mb-2 text-green-400">
      <span className="text-glow-subtle">root@stuckless:~$</span>{" "}
      <span className="text-green-300">{cmd}</span>
    </div>
  );
}

function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="text-green-400 underline decoration-green-500/30 underline-offset-4 hover:text-green-300 hover:decoration-green-400"
    >
      {children}
    </a>
  );
}

export default function AboutPage() {
  return (
    <div className="scanlines crt-flicker min-h-[calc(100vh-4rem)] bg-black font-mono">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c") }}
      />
      <div className="mx-auto max-w-4xl space-y-8 px-4 py-10 text-sm text-green-500 sm:px-6 lg:px-8">
        <section>
          <Prompt cmd="whoami" />
          <p className="text-glow text-lg font-bold text-green-400">{WHOAMI}</p>
          <p className="text-green-500/80">{TAGLINE}</p>
        </section>

        <section>
          <Prompt cmd="cat about.txt" />
          <div className="space-y-1 border-l border-green-500/20 pl-4 text-green-500/90">
            {BIO.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </section>

        <section>
          <Prompt cmd="ls ./projects/" />
          <ul className="space-y-2">
            {PROJECTS.map((p) => (
              <li key={p.name} className="flex flex-col sm:flex-row sm:gap-3">
                <span className="w-40 shrink-0 font-bold">
                  <ExtLink href={p.href}>{p.name}/</ExtLink>
                </span>
                <span className="text-green-500/80">{"// "}{p.note}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <Prompt cmd="ls ./focus/" />
          <ul className="space-y-1">
            {FOCUS.map((f) => (
              <li key={f.area} className="flex flex-col sm:flex-row sm:gap-3">
                <span className="w-32 shrink-0 font-bold text-green-400">{f.area}/</span>
                <span className="text-green-500/80">{"// "}{f.note}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <Prompt cmd="cat now.log" />
          <p className="mb-1 text-green-500/60"># updated {NOW_UPDATED}</p>
          <ul className="space-y-1 text-green-500/90">
            {NOW.map((line, i) => (
              <li key={i}>
                <span className="text-green-500/60">[*]</span> {line}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <Prompt cmd="cat contact.cfg" />
          <ul className="space-y-1">
            {LINKS.map((l) => (
              <li key={l.label} className="flex gap-3">
                <span className="w-20 shrink-0 text-green-500/80">{l.label}:</span>
                <ExtLink href={l.href}>{l.text}</ExtLink>
              </li>
            ))}
          </ul>
        </section>

        <div className="flex items-center text-green-400">
          <span className="text-glow-subtle">root@stuckless:~$</span>
          <span className="cursor-blink ml-1 text-green-500">_</span>
        </div>
      </div>
    </div>
  );
}

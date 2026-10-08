import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About | Stuckless",
  description: "Identity & contact information",
};

const WHOAMI = "Daniel Stuckless";

const BIO = [
  "Security engineer and pentester. I run CyberLegionnaire, a security practice covering defence, offence and advisory.",
  "This site is my personal hub for the tools I actually use.",
];

const FOCUS = [
  { area: "cybersecurity", note: "blue team tooling, Wazuh, threat intel, offensive testing" },
  { area: "finance", note: "statutory earnings over adjusted; serial acquirers & deep value" },
  { area: "technology", note: "Python, TypeScript, Terraform; small self-hosted tools" },
];

const NOW = [
  "Running a Tor relay on OVH, deployed with Terraform",
  "Working through OSCP-style labs for fun",
  "Reading Mark Leonard's Constellation Software shareholder letters",
];

const LINKS = [
  { label: "github", href: "https://github.com/cybersecurityhandle", text: "github.com/cybersecurityhandle" },
  { label: "email", href: "mailto:daniel@cyberlegionnaire.com", text: "daniel@cyberlegionnaire.com" },
  { label: "work", href: "https://cyberlegionnaire.com", text: "cyberlegionnaire.com" },
];

function Prompt({ cmd }: { cmd: string }) {
  return (
    <div className="mb-2 text-green-400">
      <span className="text-glow-subtle">root@stuckless:~$</span>{" "}
      <span className="text-green-300">{cmd}</span>
    </div>
  );
}

export default function AboutPage() {
  return (
    <div className="scanlines crt-flicker min-h-[calc(100vh-4rem)] bg-black font-mono">
      <div className="mx-auto max-w-4xl space-y-8 px-4 py-10 text-sm text-green-500 sm:px-6 lg:px-8">
        <section>
          <Prompt cmd="whoami" />
          <p className="text-glow text-lg font-bold text-green-400">{WHOAMI}</p>
        </section>

        <section>
          <Prompt cmd="cat about.txt" />
          <div className="space-y-1 border-l border-green-500/20 pl-4 text-green-500/80">
            {BIO.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </section>

        <section>
          <Prompt cmd="ls ./focus/" />
          <ul className="space-y-1">
            {FOCUS.map((f) => (
              <li key={f.area} className="flex flex-col sm:flex-row sm:gap-3">
                <span className="w-32 shrink-0 font-bold text-green-400">{f.area}/</span>
                <span className="text-green-500/60">{"// "}{f.note}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <Prompt cmd="cat now.log" />
          <ul className="space-y-1 text-green-500/80">
            {NOW.map((line, i) => (
              <li key={i}>
                <span className="text-green-500/40">[*]</span> {line}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <Prompt cmd="cat contact.cfg" />
          <ul className="space-y-1">
            {LINKS.map((l) => (
              <li key={l.label} className="flex gap-3">
                <span className="w-20 shrink-0 text-green-500/60">{l.label}:</span>
                <a
                  href={l.href}
                  target={l.href.startsWith("http") ? "_blank" : undefined}
                  rel={l.href.startsWith("http") ? "noopener noreferrer" : undefined}
                  className="text-green-400 underline decoration-green-500/30 underline-offset-4 hover:text-green-300 hover:decoration-green-400"
                >
                  {l.text}
                </a>
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

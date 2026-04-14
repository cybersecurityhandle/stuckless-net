"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Shield, TrendingUp, User, Code, BarChart3 } from "lucide-react";

const ASCII_ART = [
  "  ___  _____  _  _  ___  _  _ _    ___  ___  ___ ",
  " / __||_   _|| || |/ __|| |/ /| |  | __|/ __|/ __|",
  " \\__ \\  | |  | \\/ || (__ |   < | |__| _| \\__ \\\\__ \\",
  " |___/  |_|   \\__/  \\___||_|\\_\\|____|___|___/|___/",
];

const BOOT_LINES = [
  "[*] Initializing system...",
  "[*] Loading kernel modules... OK",
  "[*] Establishing encrypted connection... OK",
  "[*] Verifying identity... AUTHORIZED",
  "[*] Access granted. Welcome back.",
  "",
  "root@stuckless:~$ ls -la /projects/",
];

const cards = [
  {
    title: "/intel",
    description: "// threat intelligence dashboard",
    href: "/intel",
    icon: Shield,
    status: "ACTIVE",
  },
  {
    title: "/finance",
    description: "// rent vs buy & five-factor stock analysis",
    href: "/finance",
    icon: TrendingUp,
    status: "ACTIVE",
  },
  {
    title: "/screener",
    description: "// stock quality screener",
    href: "/screener",
    icon: BarChart3,
    status: "ACTIVE",
  },
  {
    title: "/about",
    description: "// identity & contact information",
    href: "/about",
    icon: User,
    status: "LOCKED",
  },
  {
    title: "/github",
    description: "// source code & contributions",
    href: "https://github.com/cybersecurityhandle",
    icon: Code,
    status: "ACTIVE",
  },
];

function TypingText({ text, delay = 0, speed = 30 }: { text: string; delay?: number; speed?: number }) {
  const [displayed, setDisplayed] = useState("");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(timeout);
  }, [delay]);

  useEffect(() => {
    if (!started) return;
    if (displayed.length < text.length) {
      const timeout = setTimeout(() => {
        setDisplayed(text.slice(0, displayed.length + 1));
      }, speed);
      return () => clearTimeout(timeout);
    }
  }, [started, displayed, text, speed]);

  return <>{displayed}</>;
}

export default function Home() {
  const [bootDone, setBootDone] = useState(false);
  const [showCards, setShowCards] = useState(false);

  useEffect(() => {
    const totalBootTime = BOOT_LINES.length * 400 + 500;
    const t1 = setTimeout(() => setBootDone(true), totalBootTime);
    const t2 = setTimeout(() => setShowCards(true), totalBootTime + 200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <div className="scanlines crt-flicker min-h-[calc(100vh-4rem)] bg-black font-mono">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        {/* ASCII Art Header */}
        <div className="mb-6 overflow-x-auto">
          <pre className="text-glow text-green-500 text-[0.5rem] leading-tight sm:text-xs md:text-sm lg:text-base text-center">
{ASCII_ART.map((line, i) => (
  <span key={i} className="block">{line}</span>
))}
          </pre>
          <p className="text-center text-xs text-green-500/30 mt-2 tracking-[0.5em]">
            CYBERSECURITY // FINANCE // TECHNOLOGY
          </p>
        </div>

        {/* Boot Sequence */}
        <div className="mb-8 space-y-1 text-sm text-green-500">
          {BOOT_LINES.map((line, i) => (
            <div key={i} className="text-glow-subtle">
              <TypingText text={line} delay={i * 400} speed={20} />
            </div>
          ))}
          {bootDone && (
            <div className="mt-2 flex items-center text-green-400">
              <span className="text-glow-subtle">root@stuckless:~$</span>
              <span className="cursor-blink ml-1 text-green-500">_</span>
            </div>
          )}
        </div>

        {/* Cards */}
        <div
          className={`grid gap-4 sm:grid-cols-2 transition-all duration-700 ${
            showCards ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          {cards.map((card) => {
            const isLocked = card.status === "LOCKED";
            const inner = (
              <div
                className={`group relative border border-green-500/20 bg-black/80 p-5 transition-all hover:border-green-500/60 ${
                  isLocked ? "cursor-default opacity-40" : "border-glow cursor-pointer"
                }`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <card.icon className="h-4 w-4 text-green-500" />
                    <span className="glitch text-sm font-bold text-green-400">
                      {card.title}
                    </span>
                  </div>
                  <span
                    className={`text-xs ${
                      isLocked ? "text-red-500" : "text-green-500"
                    }`}
                  >
                    [{card.status}]
                  </span>
                </div>
                <p className="text-xs text-green-500/60">{card.description}</p>
              </div>
            );

            if (isLocked) return <div key={card.title}>{inner}</div>;
            return (
              <Link key={card.title} href={card.href}>
                {inner}
              </Link>
            );
          })}
        </div>

        {/* Footer */}
        <div className={`mt-10 border-t border-green-500/10 pt-4 text-xs text-green-500/30 transition-all duration-700 ${
          showCards ? "opacity-100" : "opacity-0"
        }`}>
          <p>// cybersecurity &middot; finance &middot; technology</p>
          <p className="mt-1">// all connections monitored and logged</p>
        </div>
      </div>
    </div>
  );
}

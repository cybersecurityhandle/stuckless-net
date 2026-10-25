"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export function Navbar() {
  const pathname = usePathname();

  const links: { href: string; label: string; short?: string }[] = [
    { href: "/", label: "Home" },
    { href: "/intel", label: "Threat Intel", short: "Intel" },
    { href: "/finance", label: "Finance" },
    { href: "/screener", label: "Screener" },
    { href: "/superinvestors", label: "Superinvestors", short: "13F" },
    { href: "/insiders", label: "Insider Buys", short: "Insiders" },
    { href: "/about", label: "About" },
  ];

  return (
    <nav className="border-b border-border bg-card">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          <Link href="/" aria-label="stuckless.net" className="flex shrink-0 items-center gap-2 text-lg font-bold">
            <Shield className="h-5 w-5 text-emerald-500" />
            <span className="hidden sm:inline">stuckless.net</span>
          </Link>
          <div className="flex min-w-0 items-center gap-4 overflow-x-auto whitespace-nowrap sm:gap-6">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium transition-colors hover:text-foreground ${
                  pathname === link.href
                    ? "text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {link.short ? (
                  <>
                    <span className="sm:hidden">{link.short}</span>
                    <span className="hidden sm:inline">{link.label}</span>
                  </>
                ) : (
                  link.label
                )}
              </Link>
            ))}
            <button
              onClick={() => window.dispatchEvent(new Event("open-command-palette"))}
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Search (⌘K)"
            >
              Search <kbd className="hidden font-sans sm:inline">⌘K</kbd>
            </button>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </nav>
  );
}

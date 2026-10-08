"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield } from "lucide-react";

export function Navbar() {
  const pathname = usePathname();

  const links: { href: string; label: string; short?: string }[] = [
    { href: "/", label: "Home" },
    { href: "/intel", label: "Threat Intel", short: "Intel" },
    { href: "/finance", label: "Finance" },
    { href: "/screener", label: "Screener" },
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
          <div className="flex min-w-0 gap-4 overflow-x-auto whitespace-nowrap sm:gap-6">
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
          </div>
        </div>
      </div>
    </nav>
  );
}

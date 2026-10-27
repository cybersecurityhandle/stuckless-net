"use client";

import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Moon, Sun } from "lucide-react";
import { themeScope } from "@/lib/theme";

// Each section remembers its own theme (lib/theme.ts): Superinvestors
// defaults to light, everything else to dark. The inline script in
// app/layout.tsx applies it before first paint, so the <html> class is the
// source of truth here.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

const isDark = () => document.documentElement.classList.contains("dark");

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, isDark, () => true);
  const { key } = themeScope(usePathname());

  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(key, next ? "dark" : "light");
    } catch {
      // private mode / blocked storage: theme still switches for this visit
    }
  }

  return (
    <button
      onClick={toggle}
      className="flex shrink-0 items-center rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Light theme" : "Dark theme"}
    >
      {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
    </button>
  );
}

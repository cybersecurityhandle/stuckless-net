"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

// Dark is the default; light is opt-in and remembered in localStorage.
// The inline script in app/layout.tsx applies it before first paint.
export function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // private mode / blocked storage: theme still switches for this visit
    }
    setDark(next);
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

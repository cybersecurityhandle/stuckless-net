"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { applyTheme, savedTheme } from "@/lib/theme";

// Client-side navigation doesn't rerun the <head> theme script, so apply the
// destination section's theme whenever the path changes
export function ThemeRouteSync() {
  const pathname = usePathname();
  useEffect(() => {
    applyTheme(savedTheme(pathname));
  }, [pathname]);
  return null;
}

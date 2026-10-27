// Per-section theme: Superinvestors defaults to light (Dataroma-style white),
// the rest of the site to dark. Each section remembers its own choice.
// THEME_SCRIPT applies it before first paint; ThemeRouteSync re-applies it on
// client-side navigation between sections.

export type Theme = "light" | "dark";

const LIGHT_FIRST = ["/superinvestors"];

export function themeScope(pathname: string) {
  const light = LIGHT_FIRST.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  return light ? { key: "theme-superinvestors", fallback: "light" as Theme } : { key: "theme", fallback: "dark" as Theme };
}

export function savedTheme(pathname: string): Theme {
  const { key, fallback } = themeScope(pathname);
  try {
    const t = localStorage.getItem(key);
    if (t === "light" || t === "dark") return t;
  } catch {
    // private mode / blocked storage: use the section default
  }
  return fallback;
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

// Same logic as savedTheme + applyTheme, inlined for <head> (runs before
// React; <html> starts with class="dark")
export const THEME_SCRIPT = `(function(){var p=location.pathname,l=${JSON.stringify(LIGHT_FIRST)}.some(function(x){return p===x||p.indexOf(x+"/")===0}),k=l?"theme-superinvestors":"theme",t=null;try{t=localStorage.getItem(k)}catch(e){}if(t!=="light"&&t!=="dark")t=l?"light":"dark";if(t==="light")document.documentElement.classList.remove("dark")})()`;

"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { DEFAULT_THEME, THEME_STORAGE_KEY, type Theme } from "@/lib/theme";
import { cn } from "@/lib/cn";

function readTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage can be unavailable (private mode); the theme still applies for this visit.
  }
}

/** Sun/moon switch between the light (default) and dark themes. */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, readTheme, () => DEFAULT_THEME);
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={() => applyTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
      className={cn(
        "relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border border-line-strong bg-surface/70 text-foreground backdrop-blur transition-colors hover:border-brand-400/60 hover:text-accent",
        className,
      )}
    >
      <Sun
        aria-hidden
        className={cn("absolute size-4 transition-all duration-500", isDark ? "-translate-y-8 rotate-90 opacity-0" : "opacity-100")}
      />
      <Moon
        aria-hidden
        className={cn("absolute size-4 transition-all duration-500", isDark ? "opacity-100" : "translate-y-8 -rotate-90 opacity-0")}
      />
    </button>
  );
}

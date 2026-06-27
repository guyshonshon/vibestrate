/**
 * Theme switching for the dashboard. The app is class-toggled: <html> carries
 * `dark` (default) or `light`, and index.css re-assigns every `--color-*` token
 * under `:root.light`, so flipping the class flips the whole UI. A pre-paint
 * inline script in index.html applies the stored/system theme before React
 * mounts (no flash); this module keeps it in sync at runtime.
 */
import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "vibestrate-theme";

export function systemTheme(): Theme {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function getTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // localStorage unavailable - fall through to system preference
  }
  return systemTheme();
}

export function applyTheme(theme: Theme): void {
  const el = document.documentElement;
  el.classList.remove("light", "dark");
  el.classList.add(theme);
  el.style.colorScheme = theme;
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // best-effort persistence; still apply for this session
  }
  applyTheme(theme);
}

/** React binding: returns the current theme and a toggle. */
export function useTheme(): { theme: Theme; toggle: () => void; set: (t: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>(() => getTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const set = useCallback((t: Theme) => {
    setTheme(t);
    setThemeState(t);
  }, []);

  const toggle = useCallback(() => {
    setThemeState((cur) => {
      const next: Theme = cur === "dark" ? "light" : "dark";
      setTheme(next);
      return next;
    });
  }, []);

  return { theme, toggle, set };
}

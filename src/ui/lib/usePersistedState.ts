import { useEffect, useState } from "react";

/**
 * Tiny localStorage-backed state hook. SSR-safe (falls back to the
 * initial value when `window` is unavailable). Swallows parse errors
 * so a corrupt or stale entry never breaks the UI — it just falls back
 * to the initial value.
 */
export function usePersistedState<T>(
  key: string,
  initial: T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return initial;
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Quota exceeded / private mode — best-effort.
    }
  }, [key, value]);

  return [value, setValue];
}

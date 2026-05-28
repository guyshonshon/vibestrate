import { useEffect, useState } from "react";

/** Lightweight liveness check for the local vibestrate server. Polls
 *  /api/health every 4s. Returns true while reachable, false once we
 *  miss two consecutive checks. Surfaces this so other consumers (the
 *  AppShell banner, polling loops) can stop thrashing when `vibestrate ui`
 *  has exited.
 */
export function useServerHealth(): { reachable: boolean; lastCheckedAt: Date } {
  const [reachable, setReachable] = useState(true);
  const [lastCheckedAt, setLastCheckedAt] = useState(() => new Date());

  useEffect(() => {
    let cancelled = false;
    let consecutiveFailures = 0;
    const check = async () => {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (cancelled) return;
        if (res.ok) {
          consecutiveFailures = 0;
          setReachable(true);
        } else {
          consecutiveFailures += 1;
          if (consecutiveFailures >= 2) setReachable(false);
        }
      } catch {
        if (cancelled) return;
        consecutiveFailures += 1;
        if (consecutiveFailures >= 2) setReachable(false);
      } finally {
        if (!cancelled) setLastCheckedAt(new Date());
      }
    };
    void check();
    const id = window.setInterval(check, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return { reachable, lastCheckedAt };
}

import { useEffect, useRef, useState, useCallback } from "react";
import {
  buildShellSnapshot,
  type ShellSnapshot,
} from "../../shell-snapshot.js";

type Options = {
  projectRoot: string;
  refreshMs?: number;
};

/**
 * Periodically reads the on-disk snapshot. The refresh is best-effort:
 * failures surface as `error` but don't blow up the render. Callers can
 * also invoke `refresh()` after an action to update faster than the
 * polling interval (eg. immediately after pausing a run).
 */
export function useSnapshot({ projectRoot, refreshMs = 1000 }: Options) {
  const [snapshot, setSnapshot] = useState<ShellSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const snap = await buildShellSnapshot(projectRoot);
      if (!mounted.current) return;
      setSnapshot(snap);
      setError(null);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [projectRoot]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const id = setInterval(() => void refresh(), refreshMs);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [refresh, refreshMs]);

  return { snapshot, error, refresh };
}

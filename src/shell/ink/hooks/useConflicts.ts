import { useEffect, useRef, useState, useCallback } from "react";
import { ConflictsStore } from "../../../scheduler/conflict-detector.js";
import type { ConflictWarning } from "../../../scheduler/scheduler-types.js";

/**
 * Read the per-project conflict warnings file periodically. Returns
 * the latest list and a manual `refresh()` to invoke after any write.
 */
export function useConflicts(projectRoot: string, refreshMs = 2000) {
  const [warnings, setWarnings] = useState<ConflictWarning[]>([]);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const file = await new ConflictsStore(projectRoot).read();
      if (!mounted.current) return;
      setWarnings(file.warnings);
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

  return { warnings, error, refresh };
}

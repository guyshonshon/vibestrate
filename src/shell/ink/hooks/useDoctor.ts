import { useEffect, useRef, useState, useCallback } from "react";
import { runDoctor } from "../../../setup/doctor-service.js";
import type { DoctorReport } from "../../../setup/doctor-service.js";

/**
 * Doctor runs on demand (not on a poll) because it shells out to git
 * + provider detection — expensive. The hook fires once on mount,
 * then only when `refresh()` is called.
 */
export function useDoctor(projectRoot: string) {
  const [report, setReport] = useState<DoctorReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await runDoctor({ cwd: projectRoot });
      if (!mounted.current) return;
      setReport(r);
      setError(null);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [projectRoot]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  return { report, error, loading, refresh };
}

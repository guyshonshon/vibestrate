import { useEffect, useState } from "react";
import { buildRunAudit, type RunAudit } from "../../../core/run/run-audit.js";

/**
 * Lazily derive a single run's audit tree for the TUI audit tab. Unlike the
 * shell snapshot (which reads only a per-run event tail for every row each
 * poll), `buildRunAudit` reads the full event log + metrics + assurance, so we
 * only run it for the currently-selected run, and only while this hook is
 * mounted (the audit tab is open). Re-derives on a slow poll so a live run's
 * tree fills in.
 */
export function useRunAudit(
  projectRoot: string,
  runId: string | null,
  refreshMs = 2000,
): RunAudit | null {
  const [audit, setAudit] = useState<RunAudit | null>(null);
  useEffect(() => {
    if (!runId) {
      setAudit(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const a = await buildRunAudit(projectRoot, runId);
        if (!cancelled) setAudit(a);
      } catch {
        if (!cancelled) setAudit(null);
      }
    };
    void load();
    const id = setInterval(() => void load(), refreshMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [projectRoot, runId, refreshMs]);
  return audit;
}

import { useEffect, useRef, useState, useCallback } from "react";
import { ApprovalService } from "../../../core/approval-service.js";
import type { ApprovalRequest } from "../../../core/approval-types.js";
import type { ShellSnapshot } from "../../shell-snapshot.js";

export type ApprovalRow = ApprovalRequest & { runId: string };

/**
 * Read every run's approvals.json and surface a flat list of
 * pending approvals across the whole project — the panel uses
 * this to render a single inbox-style view.
 */
export function useApprovals(
  projectRoot: string,
  snapshot: ShellSnapshot | null,
  refreshMs = 2000,
) {
  const [items, setItems] = useState<ApprovalRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (!snapshot) return;
    try {
      const out: ApprovalRow[] = [];
      for (const r of snapshot.runs) {
        if (r.pendingApprovals === 0) continue;
        const svc = new ApprovalService(projectRoot, r.runId);
        const list = await svc.list();
        for (const a of list) {
          if (a.status === "pending") out.push({ ...a, runId: r.runId });
        }
      }
      if (!mounted.current) return;
      out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setItems(out);
      setError(null);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [projectRoot, snapshot]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const id = setInterval(() => void refresh(), refreshMs);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [refresh, refreshMs]);

  return { items, error, refresh };
}

import { useEffect, useRef, useState, useCallback } from "react";
import { ReviewSuggestionService } from "../../../reviews/review-suggestion-service.js";
import type { ReviewSuggestion } from "../../../reviews/review-suggestion-types.js";
import type { ShellSnapshot } from "../../shell-snapshot.js";

export type SuggestionRow = ReviewSuggestion & { runId: string };

export function useSuggestions(
  projectRoot: string,
  snapshot: ShellSnapshot | null,
  refreshMs = 2000,
) {
  const [items, setItems] = useState<SuggestionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (!snapshot) return;
    try {
      const out: SuggestionRow[] = [];
      for (const r of snapshot.runs) {
        if (r.pendingSuggestions === 0) continue;
        const svc = new ReviewSuggestionService(projectRoot, r.runId);
        const list = await svc.list();
        for (const s of list) {
          if (s.status === "open") {
            out.push({ ...s, runId: r.runId });
          }
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

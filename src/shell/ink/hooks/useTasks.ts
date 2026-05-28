import { useEffect, useRef, useState, useCallback } from "react";
import { RoadmapService } from "../../../roadmap/roadmap-service.js";
import type { Task } from "../../../roadmap/roadmap-types.js";

/**
 * Periodically reads the full task list from `.vibestrate/roadmap/tasks/`.
 * Refresh is best-effort: file errors surface as `error` without
 * blowing up the render. Pass a manual `refresh()` after any write
 * so the UI doesn't wait for the next tick.
 */
export function useTasks(projectRoot: string, refreshMs = 2000) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const svc = new RoadmapService(projectRoot);
      const list = await svc.listTasks();
      if (!mounted.current) return;
      setTasks(list);
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

  return { tasks, error, refresh };
}

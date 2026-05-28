import { useEffect, useRef, useState, useCallback } from "react";
import { loadConfig } from "../../../project/config-loader.js";
import type { ProjectConfig } from "../../../project/config-schema.js";

/**
 * Reads the project config periodically. Errors surface as `error`
 * (e.g. missing project.yml) so the page can render an honest
 * "run vibestrate init" prompt rather than crashing.
 */
export function useProjectConfig(projectRoot: string, refreshMs = 3000) {
  const [config, setConfig] = useState<ProjectConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const { config: cfg } = await loadConfig(projectRoot);
      if (!mounted.current) return;
      setConfig(cfg);
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

  return { config, error, refresh };
}

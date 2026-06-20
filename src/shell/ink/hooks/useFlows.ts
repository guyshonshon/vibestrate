import { useEffect, useRef, useState, useCallback } from "react";
import {
  discoverSelectableFlows,
  type DiscoveredFlow,
} from "../../../flows/catalog/flow-discovery.js";

/** Periodically lists built-in + project flows for the Flow page. */
export function useFlows(projectRoot: string, refreshMs = 4000) {
  const [flows, setFlows] = useState<DiscoveredFlow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const list = await discoverSelectableFlows(projectRoot);
      if (!mounted.current) return;
      setFlows(list);
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

  return { flows, error, refresh };
}

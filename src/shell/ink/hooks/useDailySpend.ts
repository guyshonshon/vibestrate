import { useEffect, useRef, useState, useCallback } from "react";
import { computeDailySpendUsd } from "../../../core/metrics/spend-cap-service.js";

type Options = {
  projectRoot: string;
  refreshMs?: number;
};

/**
 * Today's USD spend across all runs, polled on a deliberately slow cadence.
 * `computeDailySpendUsd` reads every run's metrics file, so this is decoupled
 * from the 1s shell snapshot poll - a daily total drifts by cents, not
 * second-to-second, and the header tolerates a few seconds of lag. Best-effort:
 * a failed read keeps the last value rather than blanking the chip.
 */
export function useDailySpend({ projectRoot, refreshMs = 5000 }: Options) {
  const [spentUsd, setSpentUsd] = useState(0);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const total = await computeDailySpendUsd(projectRoot);
      if (mounted.current) setSpentUsd(total);
    } catch {
      // keep last known value
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

  return { spentUsd, refresh };
}

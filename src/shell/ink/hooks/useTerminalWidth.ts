import { useEffect, useState } from "react";
import { useStdout } from "ink";

/**
 * Live terminal width that re-renders when the user resizes their
 * window. Pages use it to switch between side-by-side and stacked
 * layouts (we collapse two-column views below ~100 cols so content
 * doesn't end up one-word-per-line).
 */
export function useTerminalWidth(): number {
  const { stdout } = useStdout();
  const [cols, setCols] = useState<number>(stdout?.columns ?? 100);
  useEffect(() => {
    if (!stdout) return;
    const update = () => setCols(stdout.columns ?? 100);
    stdout.on("resize", update);
    return () => {
      stdout.off("resize", update);
    };
  }, [stdout]);
  return cols;
}

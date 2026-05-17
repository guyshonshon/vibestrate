import { useEffect, useState } from "react";
import { useStdout } from "ink";

export type TerminalSize = { cols: number; rows: number };

/**
 * Subscribes to `stdout.resize` so re-renders pick up the new size
 * automatically. The numbers are read live each render to keep
 * adaptive layouts (compact vs full) honest.
 */
export function useTerminalSize(): TerminalSize {
  const { stdout } = useStdout();
  const [size, setSize] = useState<TerminalSize>({
    cols: stdout?.columns ?? 100,
    rows: stdout?.rows ?? 30,
  });
  useEffect(() => {
    if (!stdout) return;
    const update = () =>
      setSize({ cols: stdout.columns ?? 100, rows: stdout.rows ?? 30 });
    stdout.on("resize", update);
    return () => {
      stdout.off("resize", update);
    };
  }, [stdout]);
  return size;
}

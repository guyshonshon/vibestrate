// Pure windowing for scrollable text panes (command output, docs). Import-free
// so it runs under the node-only Vitest environment.

export type LineWindow<T = string> = {
  lines: T[];
  /** Hidden lines above / below the window (for "↑ N more" indicators). */
  above: number;
  below: number;
};

/**
 * A `height`-tall window into `lines`, anchored to the bottom. `scroll` is how
 * many lines we've moved *up* from the bottom (0 = following the tail). The
 * value is clamped so you can't scroll past either end.
 */
export function windowFromBottom<T>(
  lines: readonly T[],
  scroll: number,
  height: number,
): LineWindow<T> {
  const h = Math.max(1, height);
  if (lines.length <= h) {
    return { lines: [...lines], above: 0, below: 0 };
  }
  const maxScroll = lines.length - h;
  const s = Math.max(0, Math.min(maxScroll, scroll));
  const end = lines.length - s;
  const start = end - h;
  return {
    lines: lines.slice(start, end),
    above: start,
    below: lines.length - end,
  };
}

/**
 * Heuristic: would this command output look mangled in the narrow (~26%)
 * output column? True when it has many lines or any wide line - the cases
 * where one-row-per-line truncation turns YAML / tables (e.g. `config show`,
 * `status`) into noise. The shell uses this to auto-open the full-width
 * readable view when a verbose command finishes.
 */
export function looksVerbose(
  output: string,
  opts: { maxWidth?: number; maxLines?: number } = {},
): boolean {
  if (output.trim().length === 0) return false;
  const maxWidth = opts.maxWidth ?? 64;
  const maxLines = opts.maxLines ?? 16;
  const lines = output.split(/\r?\n/);
  if (lines.length > maxLines) return true;
  return lines.some((l) => l.length > maxWidth);
}

/** A `height`-tall window anchored to the top (for top-down docs scrolling). */
export function windowFromTop<T>(
  lines: readonly T[],
  scroll: number,
  height: number,
): LineWindow<T> {
  const h = Math.max(1, height);
  if (lines.length <= h) {
    return { lines: [...lines], above: 0, below: 0 };
  }
  const maxScroll = lines.length - h;
  const s = Math.max(0, Math.min(maxScroll, scroll));
  return {
    lines: lines.slice(s, s + h),
    above: s,
    below: lines.length - (s + h),
  };
}

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

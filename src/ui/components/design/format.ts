/**
 * Format a duration in seconds as "1m 23s" - used by run cards and the
 * Run Detail meta strip.
 */
export function fmtElapsed(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r}s`;
  return `${m}m ${String(r).padStart(2, "0")}s`;
}

/**
 * Run ids are `YYYYMMDD-HHMMSS-task-slug`; the slug repeats the task title,
 * which the UI always shows next to the id. The timestamp prefix alone is
 * unique locally and correlates with CLI output, so surfaces render this
 * short form and keep the full id in a `title` attribute.
 */
export function shortRunId(runId: string): string {
  const m = /^(\d{8}-\d{6})-/.exec(runId);
  return m ? m[1]! : runId;
}

export function relTime(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const ms = Math.max(0, now - t);
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

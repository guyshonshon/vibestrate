export function nowIso(): string {
  return new Date().toISOString();
}

function pad(n: number, width = 2): string {
  return n.toString().padStart(width, "0");
}

export function formatRunIdTimestamp(date: Date = new Date()): string {
  const yyyy = date.getUTCFullYear().toString();
  const mm = pad(date.getUTCMonth() + 1);
  const dd = pad(date.getUTCDate());
  const hh = pad(date.getUTCHours());
  const mi = pad(date.getUTCMinutes());
  const ss = pad(date.getUTCSeconds());
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

export function durationMs(start: Date, end: Date = new Date()): number {
  return end.getTime() - start.getTime();
}

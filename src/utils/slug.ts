const MAX_SLUG_LENGTH = 60;
const FALLBACK_SLUG = "task";

export function slugify(input: string): string {
  if (!input) return FALLBACK_SLUG;

  const normalized = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]+/g, " ")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  const truncated = normalized.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, "");
  return truncated || FALLBACK_SLUG;
}

/** A short, human-readable run label derived from the task (T6). The run ID
 *  stays the stable identifier; this is just a friendlier name for lists and
 *  headers. First ~6 words, sentence-cased, with a trailing "..." when the task
 *  is longer. Users can override it (`vibe rename`). */
export function defaultDisplayName(task: string): string {
  const trimmed = task.replace(/\s+/g, " ").trim();
  if (!trimmed) return "Untitled run";
  const words = trimmed.split(" ");
  const head = words.slice(0, 6).join(" ");
  const label = head.charAt(0).toUpperCase() + head.slice(1);
  return words.length > 6 ? `${label}...` : label;
}

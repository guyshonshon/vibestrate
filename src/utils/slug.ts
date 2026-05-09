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

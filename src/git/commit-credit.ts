import type { CommitsConfig } from "../project/config-schema.js";

/**
 * The single source of truth for Vibestrate's commit attribution. When Vibestrate
 * authors or assists a commit (per-item pickup commits, integrator merges, future
 * orchestrator-driven commits) it stamps a `Co-authored-by` credit trailer -
 * unless the project opted out (`commits.coAuthor: false`). The identity is
 * overridable. Returns trailers to merge into a commit; `{}` when disabled.
 *
 * Git trailers are line-oriented, so the name/email are sanitized to one line and
 * the email is stripped of angle brackets (we add our own). No emojis (repo rule).
 */
export function creditTrailers(
  commits: Pick<CommitsConfig, "coAuthor" | "coAuthorName" | "coAuthorEmail">,
): Record<string, string> {
  if (!commits.coAuthor) return {};
  const name = commits.coAuthorName.replace(/[\r\n]/g, " ").trim();
  const email = commits.coAuthorEmail.replace(/[\r\n<>]/g, "").trim();
  if (!name || !email) return {};
  return { "Co-authored-by": `${name} <${email}>` };
}

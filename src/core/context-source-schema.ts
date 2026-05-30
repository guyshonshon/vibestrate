import { z } from "zod";

// ── Context sources (Phase 4) ───────────────────────────────────────────────
// Per-run / per-task attachments materialized into each agent's prompt:
//   - file: a path-guarded file inside the project / worktree (secret files
//           refused; secret-shaped content redacted).
//   - url:  an opt-in, SSRF-guarded, bounded fetch; content secret-redacted
//           before it enters a prompt.
// (pdf is reserved for a follow-up — it needs a local parser.) Zod-only module
// so the Task + RunSpec schemas can import it without pulling in the
// materializer's fs/network deps.

export const contextSourceKindSchema = z.enum(["file", "url"]);
export type ContextSourceKind = z.infer<typeof contextSourceKindSchema>;

export const contextSourceSchema = z
  .object({
    kind: contextSourceKindSchema,
    /** A project-relative path (file) or an http(s) URL. */
    ref: z.string().min(1).max(2000),
    /** Short human label shown in the prompt section; defaults to `ref`. */
    label: z.string().min(1).max(120).optional(),
  })
  .strict();
export type ContextSource = z.infer<typeof contextSourceSchema>;

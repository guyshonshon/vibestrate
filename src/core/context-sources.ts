// ── Context-source materializer (Phase 4) ───────────────────────────────────
//
// Turns a run's ContextSource[] into prompt artifacts, safely:
//   - file: resolved through the path guard (no traversal / symlink escape),
//           secret-shaped *paths* refused, secret-shaped *content* redacted,
//           size-bounded.
//   - url:  opt-in only; SSRF-guarded + bounded fetch; content redacted.
// Every failure is non-fatal — it becomes a `note` and the source is skipped,
// so a bad attachment never blocks a run.

import fs from "node:fs/promises";
import { resolveSafePath, buildProjectRoots, PathGuardError } from "./path-guard.js";
import { isSecretLikePath, redactSecretsInText } from "./diff-service.js";
import { fetchGuardedText } from "./guarded-fetch.js";
import type { FetchImpl } from "../flows/runtime/flow-portability.js";
import type { ContextSource } from "./context-source-schema.js";
import type { PriorArtifact } from "./prompt-builder.js";

const DEFAULT_MAX_BYTES = 512 * 1024;

export type MaterializeContextInput = {
  sources: readonly ContextSource[];
  projectRoot: string;
  worktreePath: string | null;
  /** URL sources are skipped unless this is true (opt-in egress). */
  allowUrlFetch: boolean;
  /** Skip the SSRF host check for URLs (CLI only — user typed the URL). */
  allowPrivateHosts?: boolean;
  fetchImpl?: FetchImpl;
  maxBytes?: number;
};

export type MaterializeContextResult = {
  artifacts: PriorArtifact[];
  notes: string[];
};

function clamp(text: string, maxBytes: number): { text: string; truncated: boolean } {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return { text, truncated: false };
  // Trim to roughly maxBytes characters (a byte ≈ a char for ascii; safe upper bound).
  return { text: `${text.slice(0, maxBytes)}\n…[truncated]`, truncated: true };
}

export async function materializeContextSources(
  input: MaterializeContextInput,
): Promise<MaterializeContextResult> {
  const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES;
  const artifacts: PriorArtifact[] = [];
  const notes: string[] = [];

  for (const source of input.sources) {
    const label = source.label ?? source.ref;
    if (source.kind === "file") {
      try {
        const resolved = await resolveSafePath(
          source.ref,
          buildProjectRoots({ projectRoot: input.projectRoot, worktreePath: input.worktreePath }),
        );
        if (resolved.isSecretLike || isSecretLikePath(resolved.relativePath)) {
          notes.push(`Refused context file "${source.ref}" — looks secret-like.`);
          continue;
        }
        const raw = await fs.readFile(resolved.absolutePath, "utf8").catch(() => null);
        if (raw === null) {
          notes.push(`Context file "${source.ref}" not found or unreadable — skipped.`);
          continue;
        }
        const { redacted, count } = redactSecretsInText(raw);
        const { text, truncated } = clamp(redacted, maxBytes);
        artifacts.push({
          label: `Context — ${label}`,
          content:
            `Source: file ${resolved.relativePath}` +
            (count > 0 ? ` (${count} secret token(s) redacted)` : "") +
            (truncated ? " (truncated)" : "") +
            `\n\n${text}\n`,
        });
      } catch (err) {
        notes.push(
          err instanceof PathGuardError
            ? `Refused context file "${source.ref}": ${err.message}`
            : `Could not read context file "${source.ref}": ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      continue;
    }

    // url
    if (!input.allowUrlFetch) {
      notes.push(`Skipped URL context "${source.ref}" — URL fetch is opt-in (not enabled for this run).`);
      continue;
    }
    const got = await fetchGuardedText({
      url: source.ref,
      fetchImpl: input.fetchImpl,
      maxBytes,
      allowPrivateHosts: input.allowPrivateHosts,
    });
    if (!got.ok) {
      notes.push(`Skipped URL context "${source.ref}": ${got.reason}`);
      continue;
    }
    const { redacted, count } = redactSecretsInText(got.text);
    const { text, truncated } = clamp(redacted, maxBytes);
    artifacts.push({
      label: `Context — ${label}`,
      content:
        `Source: url ${source.ref}` +
        (count > 0 ? ` (${count} secret token(s) redacted)` : "") +
        (truncated ? " (truncated)" : "") +
        `\n\n${text}\n`,
    });
  }

  return { artifacts, notes };
}

// ── Context-source materializer ───────────────────────────────────────────────
//
// Turns a run's ContextSource[] into prompt artifacts, safely:
//   - file: resolved through the path guard (no traversal / symlink escape),
//           secret-shaped *paths* refused, secret-shaped *content* redacted,
//           binary/unsupported formats refused, size-bounded.
//   - url:  opt-in only; SSRF-guarded + bounded fetch; content redacted.
// Every failure is non-fatal - it becomes a `note` and the source is skipped,
// so a bad attachment never blocks a run.

import fs from "node:fs/promises";
import path from "node:path";
import { resolveSafePath, buildProjectRoots, PathGuardError } from "../path-guard.js";
import { isSecretLikePath, redactSecretsInText } from "../diff-service.js";
import { fetchGuardedText } from "../guarded-fetch.js";
import type { FetchImpl } from "../../flows/runtime/flow-portability.js";
import type { ContextSource } from "./context-source-schema.js";
import type { PriorArtifact } from "./prompt-builder.js";

const DEFAULT_MAX_BYTES = 512 * 1024;

// Extensions we know are unreadable as plain text. Reading these with
// fs.readFile(..., "utf8") does not error - it silently decodes the binary
// bytes to replacement-character garbage, which then gets injected into every
// agent's prompt as if it were readable content. Refuse them at entry instead
// of feeding the model nonsense. (Not shared with INERT_EXTENSIONS in
// validation-scope.ts or STRICT_PROSE_EXTENSIONS in review-descent.ts - those
// classify diff-review relevance, not text-readability; their allow/deny
// shape and membership don't match this list's intent.)
const UNSUPPORTED_BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
  // documents (need a real parser we don't have yet - see
  // context-source-schema.ts's note on pdf being reserved for a follow-up)
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".odt",
  ".ods",
  ".odp",
  // images
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".ico",
  ".avif",
  ".tiff",
  ".heic",
  // archives
  ".zip",
  ".tar",
  ".gz",
  ".tgz",
  ".bz2",
  ".7z",
  ".rar",
  // audio/video
  ".mp3",
  ".mp4",
  ".mov",
  ".wav",
  ".avi",
  ".mkv",
  ".flac",
  ".ogg",
  // fonts
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  // misc binary
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".wasm",
  ".sqlite",
  ".db",
]);

/** How many leading bytes to sniff for files whose extension isn't a known-binary one. */
const SNIFF_BYTES = 4096;
/** Above this fraction of control bytes in the sniff window, refuse the file. */
const SNIFF_CONTROL_BYTE_THRESHOLD = 0.3;

function isUnsupportedBinaryExtension(ref: string): boolean {
  return UNSUPPORTED_BINARY_EXTENSIONS.has(path.extname(ref).toLowerCase());
}

/**
 * Cheap binary sniff for files without a telltale extension. Two checks over
 * the leading window, either of which is a refusal:
 *   1. Strict UTF-8 decode fails. This is the actual mechanism of the bug:
 *      `fs.readFile(..., "utf8")` never throws on invalid bytes, it silently
 *      replaces them with U+FFFD garbage. Decoding with `fatal: true` catches
 *      exactly the inputs that would otherwise decode to garbage - real UTF-8
 *      text (including multibyte emoji/CJK sequences) always decodes cleanly,
 *      so this has no false-positive risk on legitimate text.
 *   2. A NUL byte, or a high proportion of C0 control bytes, is present. NUL
 *      is technically valid inside a UTF-8 stream but is a reliable binary
 *      signal in practice (no real prose/code/config file contains one), and
 *      catches degenerate cases like a lone control byte that happens to
 *      still be valid UTF-8.
 */
function looksBinary(buf: Buffer): boolean {
  const len = Math.min(buf.length, SNIFF_BYTES);
  if (len === 0) return false;
  const window = buf.subarray(0, len);

  try {
    // A fresh decoder per call (no shared state across sources) with
    // `stream: true` so a multibyte character legitimately straddling the
    // SNIFF_BYTES cutoff isn't misread as an invalid trailing sequence.
    new TextDecoder("utf-8", { fatal: true }).decode(window, { stream: true });
  } catch {
    return true;
  }

  let controlBytes = 0;
  for (let i = 0; i < len; i++) {
    const byte = window[i]!;
    if (byte === 0) return true;
    const isControl = byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d;
    if (isControl || byte === 0x7f) controlBytes++;
  }
  return controlBytes / len > SNIFF_CONTROL_BYTE_THRESHOLD;
}

/** The `PriorArtifact.label` a materialized context source lands under -
 *  every source gets the "Context - " prefix below, so callers matching a
 *  materialized artifact against a known source label (e.g. the orchestrator
 *  detecting a staged codebase map, see CODEBASE_MAP_CONTEXT_SOURCE_LABEL)
 *  must go through this helper rather than comparing the raw label. */
export function materializedContextLabel(sourceLabel: string): string {
  return `Context - ${sourceLabel}`;
}

export type MaterializeContextInput = {
  sources: readonly ContextSource[];
  projectRoot: string;
  worktreePath: string | null;
  /** URL sources are skipped unless this is true (opt-in egress). */
  allowUrlFetch: boolean;
  /** Skip the SSRF host check for URLs (CLI only - user typed the URL). */
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
          notes.push(`Refused context file "${source.ref}" - looks secret-like.`);
          continue;
        }
        if (isUnsupportedBinaryExtension(resolved.relativePath)) {
          const ext = path.extname(resolved.relativePath).toLowerCase();
          notes.push(
            `Refused context file "${source.ref}": "${ext}" is a binary/document format that is ` +
              `not supported yet. Only plain-text formats can be used as context today - convert or ` +
              `extract the text content first (e.g. export to .txt/.md) and reference that instead.`,
          );
          continue;
        }
        const rawBuffer = await fs.readFile(resolved.absolutePath).catch(() => null);
        if (rawBuffer === null) {
          notes.push(`Context file "${source.ref}" not found or unreadable - skipped.`);
          continue;
        }
        if (looksBinary(rawBuffer)) {
          notes.push(
            `Refused context file "${source.ref}": file content looks binary (not readable text). ` +
              `Only plain-text formats can be used as context today - convert or extract the text ` +
              `content first and reference that instead.`,
          );
          continue;
        }
        const raw = rawBuffer.toString("utf8");
        const { redacted, count } = redactSecretsInText(raw);
        const { text, truncated } = clamp(redacted, maxBytes);
        artifacts.push({
          label: materializedContextLabel(label),
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
      notes.push(`Skipped URL context "${source.ref}" - URL fetch is opt-in (not enabled for this run).`);
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
      label: materializedContextLabel(label),
      content:
        `Source: url ${source.ref}` +
        (count > 0 ? ` (${count} secret token(s) redacted)` : "") +
        (truncated ? " (truncated)" : "") +
        `\n\n${text}\n`,
    });
  }

  return { artifacts, notes };
}

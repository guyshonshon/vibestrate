// ── VIBESTRATE.md - the project's operating manual ──────────────────────────
//
// A root-level, project-owned (normally committed) `VIBESTRATE.md` is the
// concise operating manual the responsible orchestrator reads before selecting
// a workflow or advising the user. It is distinct from `.vibestrate/rules.md`:
// rules.md is per-turn prompt guidance; VIBESTRATE.md is the orchestrator's
// durable project model. Precedence: Policy (code-enforced) > VIBESTRATE.md
// (advisory) > rules.md. See docs/design/responsible-orchestrator.md.
//
// Loading is read-only and safe: path-guarded to the project root, secret-shaped
// content redacted, size-bounded. Absent / unreadable degrades to present:false
// rather than throwing - a missing manual never blocks anything.

import { resolveSafePath, buildProjectRoots, PathGuardError } from "../core/path-guard.js";
import { isSecretLikePath, redactSecretsInText } from "../core/diff-service.js";
import { readText } from "../utils/fs.js";
import { vibestrateManualPath, MANUAL_FILENAME } from "../utils/paths.js";

/** A manual is meant to be concise; clamp well below the context-source bound. */
const MANUAL_MAX_BYTES = 64 * 1024;

export type ProjectManual = {
  /** True when a readable VIBESTRATE.md exists at the project root. */
  present: boolean;
  /** Absolute path where the manual is (or would be) - useful for messages. */
  path: string;
  /** Redacted, size-bounded content; null when absent/unreadable. */
  content: string | null;
  /** How many secret-shaped tokens were redacted out of the content. */
  redactionCount: number;
  /** True when the manual was longer than the cap and got clamped. */
  truncated: boolean;
};

function clamp(text: string, maxBytes: number): { text: string; truncated: boolean } {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return { text, truncated: false };
  return { text: `${text.slice(0, maxBytes)}\n…[truncated]`, truncated: true };
}

/**
 * Read the project's `VIBESTRATE.md` safely. Non-fatal: any problem (absent,
 * unreadable, path-guard refusal) returns `present: false` with `content: null`.
 */
export async function loadProjectManual(projectRoot: string): Promise<ProjectManual> {
  const manualPath = vibestrateManualPath(projectRoot);
  try {
    const resolved = await resolveSafePath(
      MANUAL_FILENAME,
      buildProjectRoots({ projectRoot }),
    );
    if (resolved.isSecretLike || isSecretLikePath(resolved.relativePath)) {
      return { present: false, path: manualPath, content: null, redactionCount: 0, truncated: false };
    }
    const raw = await readText(resolved.absolutePath).catch(() => null);
    if (raw === null) {
      return { present: false, path: manualPath, content: null, redactionCount: 0, truncated: false };
    }
    const { redacted, count } = redactSecretsInText(raw);
    const { text, truncated } = clamp(redacted, MANUAL_MAX_BYTES);
    return { present: true, path: manualPath, content: text, redactionCount: count, truncated };
  } catch (err) {
    // PathGuardError or any fs error -> treat as absent. Never throw.
    void (err instanceof PathGuardError);
    return { present: false, path: manualPath, content: null, redactionCount: 0, truncated: false };
  }
}

/**
 * Starter template for a new `VIBESTRATE.md`. Used by consult to suggest creating
 * one, and (later, Slice 1b) by the guarded apply path. The sections mirror the
 * design doc so the orchestrator knows where to look for each kind of guidance.
 */
export const STARTER_MANUAL = `# VIBESTRATE.md

The operating manual Vibestrate's orchestrator reads before choosing how to run a
task. Keep it concise and current. (Project Instructions for role prompts live in
\`.vibestrate/rules.md\`; hard, code-enforced rules live in \`.vibestrate/policies/\`.)

## Project Model
What this project is, its main domains, architecture boundaries, and critical flows.

## Development Commands
Install, test, typecheck, lint, build, run locally - in the order they should run.

## Orchestration Preferences
Preferred flows and crews; when to use heavier review; when to stay lean.

## Risk Rules
When to propose sandbox mode, approval gates, isolated execution, or extra
validation. For example: propose sandbox mode when a task runs untrusted scripts,
touches install hooks or provider execution, changes policy enforcement, or
operates on secret/credential paths.

## Codebase Conventions
Patterns, naming, generated files, ownership boundaries, style rules.

## Known Constraints
Fragile areas, migrations, external services, secrets, platform limits.

## Lessons Learned
Short, durable lessons from prior runs. Prune aggressively.
`;

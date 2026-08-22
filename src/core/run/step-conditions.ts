// ── Deterministic step conditions ───────────────────────────────────────────
//
// Decides whether a checking step may be skipped because the run's ACTUAL diff
// does not contain the thing that step exists to check. An authorization review
// on a change that touched no authorization surface is a model turn spent
// confirming an absence.
//
// This widens `skipWhen` past `inert_diff`, and every value added here is a new
// way for a review NOT to happen. So the failure direction is inverted from
// normal matching: skipping requires POSITIVE EVIDENCE OF ABSENCE. Anything
// unknown - an unreadable diff, a file type we do not classify, an empty change
// set - runs the step. A wrong call can only ever cause more review.
//
// The conditions are also only ever a WITHDRAWAL. A lens is attached because
// the shaping turn tagged the unit as risky; the condition can take back a lens
// the tag speculatively earned, never add one nobody asked for, and never
// remove one the owner forced with `--flow-force`.
//
// Path and content patterns are deliberately NOT configurable. Broadening them
// is harmless but narrowing them silently weakens a gate, and a config file is
// the wrong place to disarm a review. The control surface is `--flow-force`,
// which only ever adds work back.

/** What a condition looked at, so a skip is explainable and auditable. */
export type StepConditionEvidence = {
  /** Files the condition inspected. */
  files: string[];
  /** Human-readable reason the step is being skipped. */
  reason: string;
};

export type StepConditionDecision =
  | { skip: true; evidence: StepConditionEvidence }
  | { skip: false; because: string };

/** A changed file plus the lines the run ADDED to it. */
export type DiffFileFacts = {
  path: string;
  addedLines: string[];
};

/**
 * Conditions past `inert_diff`. Each reads "skip this step when the diff shows
 * NO <subject>", so the name states the absence being proven.
 */
export const STEP_CONDITIONS = [
  "no_auth_surface",
  "no_untrusted_input",
  "no_schema_change",
  "no_ui_change",
  "no_dependency_change",
] as const;
export type StepCondition = (typeof STEP_CONDITIONS)[number];

type Matcher = {
  /** Path fragments that indicate the subject is present. */
  paths: RegExp;
  /** Added-line patterns that indicate the subject is present. */
  content: RegExp;
  /** What this condition is proving absent, for the skip message. */
  subject: string;
};

// Deliberately BROAD. A false "present" costs one review turn; a false "absent"
// costs a missed review. These are tuned to over-detect.
const MATCHERS: Record<StepCondition, Matcher> = {
  no_auth_surface: {
    paths: /auth|login|session|permission|role|acl|token|identity|tenant|owner|admin|guard|middleware/i,
    content:
      /\b(?:authoriz|authentic|permission|req\.user|currentUser|isAdmin|hasRole|canAccess|forbidden|unauthorized|403|401|x-user|bearer|jwt|session|ownerId|userId\s*!==|\.owner\b)/i,
    subject: "an authentication or authorization surface",
  },
  no_untrusted_input: {
    paths: /route|controller|handler|api|endpoint|form|parser|upload|import|webhook|public\//i,
    content:
      /\b(?:req\.(?:body|query|params|headers)|request\.(?:body|json|form)|innerHTML|dangerouslySetInnerHTML|eval\(|new Function|exec\(|execSync|child_process|JSON\.parse|readFile|\$\{[^}]*(?:body|query|params|input|user)[^}]*\}|SELECT .*\+|INSERT .*\+)/i,
    subject: "caller-supplied input reaching a sink",
  },
  no_schema_change: {
    paths: /migration|schema|\.sql$|models?\/|entit(?:y|ies)\/|prisma|drizzle|knex|alembic/i,
    content:
      /\b(?:CREATE TABLE|ALTER TABLE|DROP TABLE|ADD COLUMN|DROP COLUMN|CREATE INDEX|createTable|addColumn|dropColumn|migrat)/i,
    subject: "a schema or migration change",
  },
  no_ui_change: {
    paths:
      /\.(?:html|htm|css|scss|sass|less|tsx|jsx|vue|svelte|astro)$|public\/|components?\/|views?\/|templates?\/|pages?\//i,
    content:
      /\b(?:document\.|querySelector|addEventListener|className|aria-|role=|<button|<input|<form|<img|useState|render\()/i,
    subject: "a change to the rendered surface",
  },
  no_dependency_change: {
    paths:
      /package\.json$|package-lock\.json$|pnpm-lock\.yaml$|yarn\.lock$|Cargo\.(?:toml|lock)$|go\.(?:mod|sum)$|requirements\.txt$|pyproject\.toml$|Gemfile(?:\.lock)?$/i,
    content: /"(?:dependencies|devDependencies|peerDependencies)"|^\s*"[^"]+"\s*:\s*"[\^~]?\d/i,
    subject: "a dependency change",
  },
};

/**
 * Pure. Decide whether `condition` proves its subject absent from this diff.
 *
 * `files` empty => NOT a skip. An empty change set is uncertainty, not proof:
 * a run whose diff could not be read looks identical to one that changed
 * nothing, and only one of those is safe to skip.
 */
export function evaluateStepCondition(
  condition: StepCondition,
  files: readonly DiffFileFacts[],
): StepConditionDecision {
  const matcher = MATCHERS[condition];
  if (!matcher) {
    // An unknown condition must never skip. Reaching here means a value got
    // past the schema, which is a bug - and the safe reading of a bug is "run".
    return { skip: false, because: `unknown condition "${condition}"` };
  }
  if (files.length === 0) {
    return {
      skip: false,
      because: "no diff evidence - an empty change set is uncertainty, not proof of absence",
    };
  }
  const hits: string[] = [];
  for (const f of files) {
    if (matcher.paths.test(f.path)) {
      hits.push(f.path);
      continue;
    }
    if (f.addedLines.some((l) => matcher.content.test(l))) hits.push(f.path);
  }
  if (hits.length > 0) {
    return {
      skip: false,
      because: `${matcher.subject} is present in ${hits.slice(0, 3).join(", ")}`,
    };
  }
  return {
    skip: true,
    evidence: {
      files: files.map((f) => f.path),
      reason: `no file in this change shows ${matcher.subject}`,
    },
  };
}

/**
 * Build the facts a condition reads from a unified diff. Files with no added
 * lines still appear: a deletion-only or rename-only change is evidence about
 * the path even when it contributes no content.
 */
export function diffFactsFromPatch(
  patch: string,
  changedPaths: readonly string[],
  extractAdded: (patch: string) => { file: string | null; line: string }[],
): DiffFileFacts[] {
  const byFile = new Map<string, string[]>();
  for (const p of changedPaths) byFile.set(p, []);
  for (const { file, line } of extractAdded(patch)) {
    if (!file) continue;
    const list = byFile.get(file) ?? [];
    list.push(line);
    byFile.set(file, list);
  }
  return [...byFile].map(([path, addedLines]) => ({ path, addedLines }));
}

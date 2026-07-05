// ── Policy assist: supervisor-assisted authoring, suggestion, and dry-run ──────
//
// The powerful half of the Policies surface, built on the SAME primitives the rest
// of the product uses - one model-call path (`runAssist`), one central redactor
// (`redactSecretsInText`), one pure deterministic evaluator
// (`evaluatePatchAgainstPolicies`). Shared by BOTH the CLI (`vibe policies
// draft|suggest|test`) and the dashboard routes so behavior can never drift.
//
// SECURITY INVARIANTS (independently reviewed - do not weaken):
//   1. OWNER-ONLY BLOCK. Nothing here writes a policy or returns a value that
//      auto-commits a block/matcher. `draft`/`suggest` return an EDITABLE DRAFT;
//      committing tier/matcher is the owner's explicit `addOwnerPolicy` action
//      (a separate Save/Adopt click / `vibe policies add`). The model MAY suggest
//      a tier + regex in the draft, but a human commits it.
//   2. REDACTION BEFORE THE MODEL. Every free-text/diff input is run through
//      `redactSecretsInText` before it reaches `runAssist`. (runAssist ALSO
//      redacts the assembled prompt as a backstop, but we redact at the source
//      because that is the invariant callers can reason about.)
//   3. TEST IS READ-ONLY + ReDoS-BOUNDED. `testPolicyRule` performs no write and
//      evaluates ONLY through `evaluatePatchAgainstPolicies` (so it inherits the
//      engine's per-line truncation). Any candidate regex is validated against
//      POLICY_LIMITS before a transient rule is built. Matched lines are run
//      through `redactSecretsInText` and truncated before they leave the process.

import { z } from "zod";
import { runAssist, type AssistProviderRunner } from "../assist/assist-runner.js";
import { redactSecretsInText, getWorktreeDiffText } from "../core/diff-service.js";
import {
  evaluatePatchAgainstPolicies,
} from "./policy-engine.js";
import {
  POLICY_LIMITS,
  policySurfaceSchema,
  type PolicyRule,
  type PolicySurface,
} from "./policy-types.js";
import { loadConfig } from "../project/config-loader.js";
import { readDirSafe, pathExists } from "../utils/fs.js";
import { projectRunsDir, runStatePath } from "../utils/paths.js";
import { readJson } from "../utils/json.js";
import { runStateSchema } from "../core/state-machine.js";
import { VibestrateError } from "../utils/errors.js";

export class PolicyAssistError extends VibestrateError {
  constructor(message: string, cause?: unknown) {
    super("POLICY_ASSIST_ERROR", message, cause);
    this.name = "PolicyAssistError";
  }
}

const AUDIT_BUCKET = "policy-assist";

// Bounds. The description a user types, the number of recent runs we scan, and the
// total diff budget we feed the model - all capped so a caller can't flood the
// engine or the provider.
const MAX_DESCRIPTION = 500;
const MAX_SUGGEST_RUNS = 10;
const MAX_TEST_RUNS = 10;
const MAX_SNIPPET_BYTES = 20_000;
/** Per-run diff slice fed to /suggest, and the overall cap across all runs. */
const PER_RUN_DIFF_BUDGET = 20_000;
const TOTAL_SUGGEST_DIFF_BUDGET = 60_000;
/** How much of a matched line survives into a /test response (post-redaction). */
const MATCHED_LINE_MAX = 240;

// ── Shared draft shape (both /draft and /suggest emit this) ────────────────────
//
// The model proposes a candidate; NOTHING here is a commitment. `suggestedTier`
// and `matcher` are hints the owner reviews and edits before saving.
const draftShape = z
  .object({
    statement: z.string().min(1).max(300),
    message: z.string().min(1).max(POLICY_LIMITS.maxMessageLength).default(""),
    suggestedTier: z.enum(["advise", "block"]).default("advise"),
    matcher: z
      .object({
        regex: z.string().min(1).max(400),
        flags: z.string().max(8).default(""),
      })
      .nullable()
      .default(null),
    glob: z.string().min(1).max(POLICY_LIMITS.maxGlobLength).nullable().default(null),
    appliesTo: z.array(policySurfaceSchema).default(["suggestion-apply", "bundle-apply"]),
  })
  .strict();
export type PolicyDraft = z.infer<typeof draftShape>;

const draftAssistSchema = draftShape;
const suggestAssistSchema = z
  .object({ drafts: z.array(draftShape).max(MAX_SUGGEST_RUNS) })
  .strict();

/**
 * A candidate regex is only kept if it survives POLICY_LIMITS (length + flag
 * alphabet) AND compiles. An over-long / bad-flag / uncompilable suggestion is
 * DROPPED (returned as null), never surfaced as a commit-able matcher - so a
 * model can never talk the owner into a rule the engine would reject or that
 * blows the ReDoS budget. Returns the sanitized matcher or null.
 */
export function sanitizeSuggestedMatcher(
  matcher: { regex: string; flags?: string } | null | undefined,
): { regex: string; flags: string } | null {
  if (!matcher) return null;
  const regex = matcher.regex;
  const flags = matcher.flags ?? "";
  if (regex.length < 1 || regex.length > POLICY_LIMITS.maxRegexLength) return null;
  if (flags.length > 8 || !POLICY_LIMITS.allowedRegexFlags.test(flags)) return null;
  try {
    new RegExp(regex, flags);
  } catch {
    return null;
  }
  return { regex, flags };
}

/** Same discipline for a suggested glob (length only - globs aren't regex here). */
function sanitizeSuggestedGlob(glob: string | null | undefined): string | null {
  if (!glob) return null;
  if (glob.length < 1 || glob.length > POLICY_LIMITS.maxGlobLength) return null;
  return glob;
}

/** Normalize a raw model draft into a safe, editable draft: drop invalid
 *  matcher/glob, and a block with no valid matcher decays to advise (the owner
 *  can't commit a block without a matcher anyway - the schema refine rejects it,
 *  so surfacing "block" with no matcher would be a dead-end suggestion). */
function normalizeDraft(raw: PolicyDraft): PolicyDraft {
  const matcher = sanitizeSuggestedMatcher(raw.matcher);
  const glob = sanitizeSuggestedGlob(raw.glob);
  const tier = raw.suggestedTier === "block" && !matcher ? "advise" : raw.suggestedTier;
  return {
    statement: raw.statement,
    message: raw.message || raw.statement,
    suggestedTier: tier,
    matcher,
    glob,
    appliesTo: raw.appliesTo.length ? raw.appliesTo : ["suggestion-apply", "bundle-apply"],
  };
}

type ServiceCommon = {
  projectRoot: string;
  /** Test seam - a fake provider runner (the real one is the default). */
  runner?: AssistProviderRunner;
};

const DRAFT_SCHEMA_HINT =
  '{ "statement": "...", "message": "reviewer-facing message", ' +
  '"suggestedTier": "advise" | "block", ' +
  '"matcher": { "regex": "...", "flags": "" } | null, ' +
  '"glob": "src/**/*.ts" | null, ' +
  '"appliesTo": ["suggestion-apply", "bundle-apply"] }';

const DRAFT_GUIDANCE =
  "You are drafting a project policy for a code-review merge-gate. Two tiers exist:\n" +
  "- advise: the model reviewer flags it (advisory). Prefer this unless the rule is a " +
  "crisp, literal textual pattern.\n" +
  "- block: a DETERMINISTIC hard merge-cap driven by a regex `matcher` over added diff " +
  "lines. Only suggest block when the rule is a precise, low-false-positive textual " +
  "pattern (e.g. a forbidden character or token). The regex must be <=256 chars and use " +
  "only [gimsuy] flags.\n" +
  "The `matcher.regex` matches ADDED diff line content. `glob` optionally restricts to " +
  "touched files. Return `matcher: null` when no reliable regex exists - suggest advise " +
  "instead. Never invent a matcher you are unsure about; a false block is worse than an " +
  "advise. This is a SUGGESTION the owner will edit and explicitly save; you are not " +
  "committing anything.";

/**
 * /draft - turn one English description into an editable policy draft. Redacts the
 * description before the model sees it. NO WRITE. Any suggested regex is validated
 * against POLICY_LIMITS; an invalid one is dropped (statement-only draft).
 */
export async function draftPolicyFromDescription(
  input: ServiceCommon & { description: string },
): Promise<{ draft: PolicyDraft }> {
  const description = input.description.trim();
  if (!description) throw new PolicyAssistError("A description is required.");
  if (description.length > MAX_DESCRIPTION) {
    throw new PolicyAssistError(`Description exceeds ${MAX_DESCRIPTION} characters.`);
  }
  // INVARIANT 2: redact the user's free text before it reaches the model.
  const safe = redactSecretsInText(description).redacted;
  const instruction =
    DRAFT_GUIDANCE +
    "\n\nThe owner describes the rule they want:\n" +
    `"""${safe}"""\n\n` +
    "Produce ONE policy draft capturing it.";

  const res = await runAssist({
    projectRoot: input.projectRoot,
    label: "policy-draft",
    instruction,
    schema: draftAssistSchema,
    schemaHint: DRAFT_SCHEMA_HINT,
    auditBucket: AUDIT_BUCKET,
    runner: input.runner,
  });
  return { draft: normalizeDraft(res.parsed) };
}

/**
 * /suggest - propose candidate policies from recent runs' diffs. Each run's diff
 * is redacted before it reaches the model, the total is bounded, and the response
 * is normalized (invalid matchers dropped). NO WRITE.
 */
export async function suggestPoliciesFromRuns(
  input: ServiceCommon & { limit?: number },
): Promise<{ drafts: PolicyDraft[]; runsScanned: number }> {
  const limit = clamp(input.limit ?? 5, 1, MAX_SUGGEST_RUNS);
  const runs = await recentRunsWithWorktree(input.projectRoot, limit);
  const mainBranch = await resolveMainBranch(input.projectRoot);

  const blocks: string[] = [];
  let used = 0;
  for (const run of runs) {
    if (used >= TOTAL_SUGGEST_DIFF_BUDGET) break;
    const patch = await safeDiffForRun(run.worktreePath, mainBranch);
    if (!patch) continue;
    // INVARIANT 2: redact each diff before the model sees it.
    const redacted = redactSecretsInText(patch).redacted;
    const remaining = Math.min(PER_RUN_DIFF_BUDGET, TOTAL_SUGGEST_DIFF_BUDGET - used);
    const slice = redacted.slice(0, remaining);
    used += slice.length;
    blocks.push(`--- run ${run.runId} ---\n${slice}`);
  }

  if (blocks.length === 0) {
    return { drafts: [], runsScanned: runs.length };
  }

  const instruction =
    DRAFT_GUIDANCE +
    "\n\nBelow are recent runs' redacted diffs. Propose up to a few reusable project " +
    "policies the owner might want, grounded in patterns you actually see. Skip anything " +
    "speculative. Return an empty `drafts` array if nothing is worth proposing.\n\n" +
    blocks.join("\n\n");

  const res = await runAssist({
    projectRoot: input.projectRoot,
    label: "policy-suggest",
    instruction,
    schema: suggestAssistSchema,
    schemaHint: `{ "drafts": [ ${DRAFT_SCHEMA_HINT} ] }`,
    auditBucket: AUDIT_BUCKET,
    runner: input.runner,
  });
  return {
    drafts: res.parsed.drafts.map(normalizeDraft),
    runsScanned: runs.length,
  };
}

// ── /test - deterministic dry-run (no model, no write) ─────────────────────────

export type PolicyTestRule = {
  regex?: string;
  flags?: string;
  glob?: string;
  appliesTo: PolicySurface[];
};

export type PolicyTestSource =
  | { kind: "snippet"; patch: string }
  | { kind: "recent"; limit?: number };

export type PolicyTestMatch = {
  file: string | null;
  /** Redacted + truncated matched line - NEVER raw diff content. */
  line: string | null;
  runId?: string;
};

export type PolicyTestResult = {
  matches: PolicyTestMatch[];
  evaluatedCount: number;
};

/**
 * Build a transient PolicyRule from a candidate matcher/glob AFTER validating it
 * against POLICY_LIMITS. Throws a PolicyAssistError (-> 400) on an invalid regex
 * so /test fails closed rather than building an unbounded pattern. The rule is
 * never persisted; it exists only for one evaluation.
 */
function buildTransientRule(rule: PolicyTestRule): PolicyRule {
  if (!rule.regex && !rule.glob) {
    throw new PolicyAssistError("A test rule needs a regex, a glob, or both.");
  }
  let matchAddedContent: PolicyRule["matchAddedContent"];
  if (rule.regex) {
    const matcher = sanitizeSuggestedMatcher({ regex: rule.regex, flags: rule.flags });
    if (!matcher) {
      throw new PolicyAssistError(
        `Invalid regex: must be 1-${POLICY_LIMITS.maxRegexLength} chars, flags a subset of [gimsuy], and compile.`,
      );
    }
    matchAddedContent = matcher.flags
      ? { regex: matcher.regex, flags: matcher.flags }
      : { regex: matcher.regex };
  }
  let matchTouchedFiles: PolicyRule["matchTouchedFiles"];
  if (rule.glob) {
    const glob = sanitizeSuggestedGlob(rule.glob);
    if (!glob) {
      throw new PolicyAssistError(
        `Invalid glob: must be 1-${POLICY_LIMITS.maxGlobLength} chars.`,
      );
    }
    matchTouchedFiles = { glob };
  }
  return {
    id: "test-rule",
    description: "transient test rule (never persisted)",
    appliesTo: rule.appliesTo.length ? rule.appliesTo : ["suggestion-apply"],
    matchAddedContent,
    matchTouchedFiles,
    message: "test match",
  };
}

/**
 * /test - evaluate a candidate rule against a snippet OR each recent run's diff,
 * PURELY through `evaluatePatchAgainstPolicies` (inherits per-line truncation).
 * NO WRITE, no model. Matched lines are redacted + truncated. The regex is
 * validated against POLICY_LIMITS before the transient rule is built.
 */
export async function testPolicyRule(
  input: ServiceCommon & { rule: PolicyTestRule; source: PolicyTestSource },
): Promise<PolicyTestResult> {
  const rule = buildTransientRule(input.rule);
  const surface = rule.appliesTo[0]!;

  if (input.source.kind === "snippet") {
    const patch = input.source.patch ?? "";
    if (patch.length > MAX_SNIPPET_BYTES) {
      throw new PolicyAssistError(`Snippet exceeds ${MAX_SNIPPET_BYTES} bytes.`);
    }
    const matches = evaluateAndRedact(rule, patch, surface, undefined);
    return { matches, evaluatedCount: 1 };
  }

  const limit = clamp(input.source.limit ?? 5, 1, MAX_TEST_RUNS);
  const runs = await recentRunsWithWorktree(input.projectRoot, limit);
  const mainBranch = await resolveMainBranch(input.projectRoot);
  const matches: PolicyTestMatch[] = [];
  let evaluated = 0;
  for (const run of runs) {
    const patch = await safeDiffForRun(run.worktreePath, mainBranch);
    if (!patch) continue;
    evaluated += 1;
    for (const m of evaluateAndRedact(rule, patch, surface, run.runId)) {
      matches.push(m);
    }
  }
  return { matches, evaluatedCount: evaluated };
}

/**
 * Run the pure engine over one patch, then resolve + redact the matched line for
 * each violation. The engine returns a matched FILE; we re-find the first added
 * line in that file the rule's regex hits (through the SAME truncation the engine
 * used) so the response can show WHERE without ever echoing raw diff content.
 */
function evaluateAndRedact(
  rule: PolicyRule,
  patch: string,
  surface: PolicySurface,
  runId: string | undefined,
): PolicyTestMatch[] {
  const result = evaluatePatchAgainstPolicies([rule], { patch, surface });
  return result.violations.map((v) => ({
    file: v.matchedFile,
    line: resolveMatchedLine(rule, patch, v.matchedFile),
    ...(runId ? { runId } : {}),
  }));
}

/**
 * Find the first added line the rule's regex matches (in the matched file, if the
 * engine named one) and return it REDACTED + truncated. Uses the same per-line
 * truncation the engine applies, so this can never scan more than the engine did.
 * Returns null for a glob-only rule (no content line to show).
 */
function resolveMatchedLine(
  rule: PolicyRule,
  patch: string,
  matchedFile: string | null,
): string | null {
  if (!rule.matchAddedContent) return null;
  const re = new RegExp(rule.matchAddedContent.regex, rule.matchAddedContent.flags ?? "");
  const lines = patch.split(/\r?\n/);
  let currentFile: string | null = null;
  for (const raw of lines) {
    const header = /^\+\+\+ (?:b\/)?(.+)$/.exec(raw);
    if (header) {
      const target = header[1]!.trim();
      currentFile = target === "/dev/null" ? null : target;
      continue;
    }
    if (raw.startsWith("+++") || raw.startsWith("---")) continue;
    if (!raw.startsWith("+")) continue;
    if (matchedFile && currentFile !== matchedFile) continue;
    const content = raw.slice(1);
    const truncated =
      content.length > POLICY_LIMITS.maxScanItemLength
        ? content.slice(0, POLICY_LIMITS.maxScanItemLength)
        : content;
    re.lastIndex = 0;
    if (re.test(truncated)) {
      const redacted = redactSecretsInText(truncated).redacted;
      return redacted.length > MATCHED_LINE_MAX
        ? `${redacted.slice(0, MATCHED_LINE_MAX)}…`
        : redacted;
    }
  }
  return null;
}

// ── Recent-run helpers (read-only) ─────────────────────────────────────────────

type RunWithWorktree = { runId: string; worktreePath: string; startedAt: string };

/** The N most recently started runs that have a live worktree path on disk. */
async function recentRunsWithWorktree(
  projectRoot: string,
  limit: number,
): Promise<RunWithWorktree[]> {
  const runsDir = projectRunsDir(projectRoot);
  const ids = await readDirSafe(runsDir);
  const out: RunWithWorktree[] = [];
  for (const id of ids) {
    const stateFile = runStatePath(projectRoot, id);
    if (!(await pathExists(stateFile))) continue;
    try {
      const raw = await readJson<unknown>(stateFile);
      const parsed = runStateSchema.safeParse(raw);
      if (!parsed.success) continue;
      const state = parsed.data;
      if (!state.worktreePath) continue;
      if (!(await pathExists(state.worktreePath))) continue;
      out.push({
        runId: state.runId,
        worktreePath: state.worktreePath,
        startedAt: state.startedAt,
      });
    } catch {
      // skip unreadable run
    }
  }
  out.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return out.slice(0, limit);
}

/** A run's worktree diff text (secret-like FILES already skipped by the diff
 *  service). Best-effort: a diff failure yields "" and the run is skipped. */
async function safeDiffForRun(
  worktreePath: string,
  mainBranch: string | null,
): Promise<string> {
  try {
    return await getWorktreeDiffText({ worktreePath, baseBranch: mainBranch });
  } catch {
    return "";
  }
}

async function resolveMainBranch(projectRoot: string): Promise<string | null> {
  try {
    const { config } = await loadConfig(projectRoot);
    return config.git.mainBranch ?? null;
  } catch {
    return null;
  }
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

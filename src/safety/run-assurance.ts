// ── Run Assurance artifact (Epic S / S5) ────────────────────────────────────
//
// At a run's terminal state, derive a single honest verdict from *evidence* -
// the Action Broker log (`actions.ndjson`) plus the run's review/verification
// decisions - never from a model's self-assessment. The verdict is one of five
// discrete levels (no fake confidence %); the artifact records each sub-check
// and the caps (missing checks) that held the verdict below "verified".
//
// Design: docs/design/policy-enforcement-assurance.md (§ Run Assurance).

import path from "node:path";
import { pathExists, readText, writeText } from "../utils/fs.js";
import {
  runArtifactsDir,
  runAssurancePath,
  runEventsPath,
  runStatePath,
} from "../utils/paths.js";
import { readActionLog, type ActionRecord } from "./action-broker.js";
import { runStateSchema } from "../core/state-machine.js";
import { MetricsStore } from "../core/metrics-store.js";
import { loadConfig } from "../project/config-loader.js";
import { nowIso } from "../utils/time.js";

export type RunAssuranceVerdict =
  | "blocked"
  | "unsafe"
  | "unverified"
  | "partially_verified"
  | "verified";

/** A root cause that kept the run from merge_ready. `provider` blockers come
 *  from resilience events (usage-limit give-up, retries exhausted) and carry
 *  the classified failure; `step` blockers are failed/blocked flow steps with
 *  their recorded error. Details are already redacted at the source
 *  (failureExcerpt) - never raw provider output. */
export type RunAssuranceBlocker = {
  stepId: string | null;
  kind: "provider" | "step";
  /** Provider failure class (usage-limit/rate-limit/transient/hard), if known. */
  class: string | null;
  detail: string;
};

export type RunAssurance = {
  schemaVersion: 1;
  runId: string;
  verdict: RunAssuranceVerdict;
  summary: string;
  generatedAt: string;
  policy: {
    status: "passed" | "held" | "violated";
    /** Distinct policy rule ids that fired a non-allow decision. */
    rulesEvaluated: string[];
    violations: { kind: string; ruleIds: string[]; reason: string }[];
  };
  validation: {
    /** "environment" = commands could not run (missing toolchain in the
     *  worktree); nothing was validated, but nothing failed either.
     *  "not_applicable" = no validation was required for this run (the flow has
     *  no validation step, no validate commands are configured, or the change
     *  was inert and validation was scoped-skipped) - distinct from "missing"
     *  (= validation WAS expected but produced no evidence). */
    status: "passed" | "failed" | "environment" | "missing" | "not_applicable";
    total: number;
    passed: number;
    failed: number;
    environment: number;
  };
  review: {
    /** "not_applicable" = the flow has no review step (nothing to approve);
     *  distinct from "missing" (a review step existed but produced no decision)
     *  and "skipped_inert_diff" (a review turn was deterministically skipped on
     *  recorded inert-diff evidence). */
    status:
      | "approved"
      | "changes_requested"
      | "missing"
      | "skipped_inert_diff"
      | "not_applicable";
  };
  /** "not_applicable" = the flow has no verify (summary-turn) step, or the run
   *  was read-only; distinct from "not_run" (verification WAS expected but never
   *  produced a decision). */
  verification: { status: "passed" | "failed" | "not_run" | "not_applicable" };
  /** Coverage gaps from best-effort (continueOnError) steps that failed and were
   *  tolerated - those steps gave no scrutiny, so coverage is degraded even on a
   *  merge_ready run. On a merge_ready run a `failed` flow step is, by
   *  construction, a tolerated one (a fatal failure aborts the run). */
  coverage: { toleratedStepFailures: number };
  /** Root causes for a run that never reached merge_ready - the "WHY blocked"
   *  the caps cannot express. Empty on merge_ready runs. */
  blockers: RunAssuranceBlocker[];
  /** Why the verdict is below "verified" - REAL gaps or weak checks (a check
   *  was expected and is missing/failed/weak). A `not_applicable` lane or an
   *  inert-diff review skip is NOT a cap; it lands in `notes` instead. On a
   *  `blocked` verdict the trivially-implied missing-trio (validation_missing,
   *  review_missing, verification_not_run) is omitted - a run that never got
   *  there tells you nothing through them; `blockers` carries the cause. */
  caps: string[];
  /** Informational context that does NOT hold the verdict down: lanes that were
   *  not required for this run (not_applicable) and the recorded inert-diff
   *  review skip. Rendered muted, separate from `caps`, so "nothing to verify"
   *  reads as a clean state instead of a missing-evidence gap (T2). */
  notes: string[];
  /** True iff at least one REAL check actually ran and passed (validation
   *  passed, review approved, or verification passed). Lets a consumer (e.g. the
   *  T13 merge advisor) distinguish a `verified` run that was genuinely checked
   *  from one where nothing was required - WITHOUT re-deriving it from the lane
   *  statuses. A `verified` run with `anyRealCheckPassed: false` means "nothing
   *  needed checking", never "checked and approved". */
  anyRealCheckPassed: boolean;
  /** The supervisor persona + how independent its review was (orchestrator-
   *  personas.md). `independence` is honest, NOT a confidence source: it is
   *  "cross-model" only when >= 2 distinct non-null models actually ran;
   *  otherwise "single-profile" (a fresh-context self-check that, by the design's
   *  non-negotiables, can only LOWER confidence, never raise this verdict). */
  supervisor: {
    persona: string | null;
    independence: "cross-model" | "single-profile";
  };
  /** How confined the run's agents actually were, derived from per-turn provider
   *  events (NOT config - what ran, not what was set). Informational: it never
   *  caps the verdict (the worktree + diff gate are the baseline, so "none" is
   *  the intended default, not a gap). `posture`:
   *   - "sandboxed": >=1 turn under a real OS sandbox (codex Seatbelt/Landlock)
   *     and nothing was requested-but-unconfined.
   *   - "hardened": no OS sandbox, but >=1 claude turn under `--permission-mode
   *     plan` (provider-enforced no-write).
   *   - "partial": a sandbox was requested for a turn that ran unconfined (or a
   *     mix that didn't fully cover) - honest "not everything got it".
   *   - "none": no confinement signal (the default; baseline protection only). */
  isolation: {
    posture: "sandboxed" | "hardened" | "partial" | "none";
    /** Turns that ran under a real OS filesystem sandbox (provider.sandboxed). */
    osSandboxedTurns: number;
    /** Turns under claude `--permission-mode plan` hardening (provider.hardened). */
    hardenedTurns: number;
    /** Turns where a sandbox was requested but ran unconfined (provider.sandbox_unavailable). */
    unconfinedRequestedTurns: number;
  };
};

/** Derive the root-cause blockers from the run's step states + event stream.
 *  Pure - testable without disk. Provider-level signals (the resilience
 *  layer's give-up events) win over the generic step error for the same step;
 *  steps that failed without a provider signal still surface their recorded
 *  error string. Capped at 5 - a blocked run has one or two causes, not a log. */
export function deriveRunBlockers(input: {
  steps: { id: string; status: string; error: string | null }[];
  events: { type: string; data?: Record<string, unknown> }[];
}): RunAssuranceBlocker[] {
  const blockers: RunAssuranceBlocker[] = [];
  const coveredSteps = new Set<string>();
  const str = (d: Record<string, unknown> | undefined, k: string): string | null => {
    const v = d?.[k];
    return typeof v === "string" ? v : null;
  };
  for (const e of input.events) {
    if (blockers.length >= 5) break;
    if (e.type === "provider.retries_exhausted") {
      const stepId = str(e.data, "stepId");
      const cls = str(e.data, "class");
      blockers.push({
        stepId,
        kind: "provider",
        class: cls,
        detail:
          str(e.data, "detail") ??
          `provider ${cls ?? "failure"} unrecovered after retries`,
      });
      if (stepId) coveredSteps.add(stepId);
    } else if (
      e.type === "provider.usage_limit" &&
      str(e.data, "resolved") === "give-up"
    ) {
      const stepId = str(e.data, "stepId");
      blockers.push({
        stepId,
        kind: "provider",
        class: "usage-limit",
        detail: str(e.data, "detail") ?? "provider usage limit; gave up",
      });
      if (stepId) coveredSteps.add(stepId);
    }
  }
  for (const s of input.steps) {
    if (blockers.length >= 5) break;
    if (s.status !== "failed" && s.status !== "blocked") continue;
    if (coveredSteps.has(s.id)) continue;
    blockers.push({
      stepId: s.id,
      kind: "step",
      class: null,
      detail: s.error ?? `step ${s.status}`,
    });
  }
  return blockers;
}

/** Derive the run's isolation posture from its per-turn provider events. Pure -
 *  testable without disk. Counts what ACTUALLY ran (provider.sandboxed /
 *  provider.hardened / provider.sandbox_unavailable), never config. The posture
 *  is informational and never caps the verdict. */
export function deriveRunIsolation(
  events: { type: string }[],
): RunAssurance["isolation"] {
  let osSandboxedTurns = 0;
  let hardenedTurns = 0;
  let unconfinedRequestedTurns = 0;
  for (const e of events) {
    if (e.type === "provider.sandboxed") osSandboxedTurns += 1;
    else if (e.type === "provider.hardened") hardenedTurns += 1;
    else if (e.type === "provider.sandbox_unavailable") unconfinedRequestedTurns += 1;
  }
  const posture: RunAssurance["isolation"]["posture"] =
    osSandboxedTurns === 0 && hardenedTurns === 0 && unconfinedRequestedTurns === 0
      ? "none"
      : unconfinedRequestedTurns > 0
        ? "partial" // a sandbox was asked for but a turn ran unconfined
        : osSandboxedTurns > 0
          ? "sandboxed" // real OS confinement present (hardening may also apply)
          : "hardened"; // only the provider-enforced no-write hardening
  return { posture, osSandboxedTurns, hardenedTurns, unconfinedRequestedTurns };
}

/** Pure derivation - testable without disk. */
export function deriveRunAssurance(input: {
  runId: string;
  runStatus: string;
  finalDecision: "APPROVED" | "CHANGES_REQUESTED" | "BLOCKED" | null;
  /** A3 express: the review-turn was skipped on recorded inert-diff evidence
   *  (state.reviewSkipped). Only meaningful when finalDecision is null. */
  reviewSkipped?: boolean;
  verification: "PASSED" | "FAILED" | "NEEDS_HUMAN" | null;
  actionLog: ActionRecord[];
  // ── Applicability (T2): whether each lane's evidence was actually EXPECTED ──
  // for this run. When a lane is not applicable, the absence of evidence reads
  // as "nothing to verify" (a note), not "missing" (a verdict-capping gap).
  // All default to `true` so direct callers keep the pre-T2 behavior; the real
  // disk path (buildAndWriteRunAssurance) computes them from the run's flow +
  // events. `validationApplicable` false ⇒ a 0/0 validation tally is n/a;
  // `validationScopedInert` only refines the note (inert-diff skip vs no
  // commands). `reviewApplicable`/`verificationApplicable` false ⇒ a null
  // decision is n/a, not a gap.
  validationApplicable?: boolean;
  validationScopedInert?: boolean;
  reviewApplicable?: boolean;
  verificationApplicable?: boolean;
  /** Best-effort (continueOnError) steps that failed and were tolerated. On a
   *  merge_ready run, the count of `failed` flow steps. Defaults to 0. */
  toleratedStepFailures?: number;
  /** Root causes (deriveRunBlockers). Only surfaced on blocked/unsafe verdicts
   *  - a merge_ready run's coverage gaps are the caps' job. */
  blockers?: RunAssuranceBlocker[];
  /** Active supervisor persona id (orchestrator-personas.md). */
  persona?: string | null;
  /** Models that actually ran (per seated step). >= 2 distinct non-null models
   *  means the review was cross-model; else it's a single-profile self-check. */
  modelsUsed?: (string | null | undefined)[];
  /** Isolation posture (deriveRunIsolation). Defaults to "none" so direct
   *  callers that don't compute it keep the baseline. Informational only. */
  isolation?: RunAssurance["isolation"];
  generatedAt: string;
}): RunAssurance {
  const { actionLog } = input;
  const toleratedStepFailures = input.toleratedStepFailures ?? 0;
  const distinctModels = new Set(
    (input.modelsUsed ?? []).filter((m): m is string => !!m && m.trim().length > 0),
  );
  const supervisor: RunAssurance["supervisor"] = {
    persona: input.persona ?? null,
    independence: distinctModels.size >= 2 ? "cross-model" : "single-profile",
  };

  // ── Policy (from broker decisions) ──────────────────────────────────────
  const denies = actionLog.filter((r) => r.decision.effect === "deny");
  const holds = actionLog.filter(
    (r) => r.decision.effect === "require_approval",
  );
  const rollbackFailed = actionLog.some(
    (r) =>
      r.evidence?.ok === false &&
      /rollback failed/i.test(r.evidence?.summary ?? ""),
  );
  const policyStatus: RunAssurance["policy"]["status"] =
    denies.length > 0 ? "violated" : holds.length > 0 ? "held" : "passed";
  const rulesEvaluated = [
    ...new Set(
      [...denies, ...holds].flatMap((r) => r.decision.ruleIds),
    ),
  ].sort();
  const violations = denies.map((r) => ({
    kind: r.request.kind,
    ruleIds: r.decision.ruleIds,
    reason: "reason" in r.decision ? r.decision.reason : "denied",
  }));

  // ── Validation (from command.run evidence - broker truth, not model claims).
  // Only commands that actually RAN count: a denied command.run is recorded
  // with a deny decision + null evidence and belongs to policy.violations, not
  // the validation tally (otherwise it would silently inflate `total`).
  const cmds = actionLog.filter(
    (r) =>
      r.request.kind === "command.run" &&
      r.decision.effect === "allow" &&
      r.evidence !== null,
  );
  const cmdPassed = cmds.filter((r) => r.evidence?.ok === true).length;
  const isEnv = (r: (typeof cmds)[number]) =>
    r.evidence?.ok === false &&
    (r.evidence?.data as { environment?: unknown } | undefined)?.environment ===
      true;
  // A command whose toolchain was missing never validated anything - that is
  // an environment gap, not a failing change (the P8c false-block fix).
  const cmdEnvironment = cmds.filter(isEnv).length;
  const cmdFailed = cmds.filter(
    (r) => r.evidence?.ok === false && !isEnv(r),
  ).length;
  // T2: when validation isn't applicable (no validation step / no validate
  // commands / inert-diff scope-skip), a 0/0 tally is "not_applicable" - there
  // was nothing to verify - rather than "missing" (a check we expected and lost).
  const validationApplicable = input.validationApplicable ?? true;
  const verificationApplicable = input.verificationApplicable ?? true;
  const reviewApplicable = input.reviewApplicable ?? true;
  const validationStatus: RunAssurance["validation"]["status"] =
    cmds.length === 0
      ? validationApplicable
        ? "missing"
        : "not_applicable"
      : cmdFailed > 0
        ? "failed"
        : cmdEnvironment > 0
          ? "environment"
          : "passed";

  // ── Review + verification (from the run's recorded decisions) ────────────
  // A skip-evidence run (A3 express, deterministic inert-diff descent) reports
  // `skipped_inert_diff` - distinct from `missing` (the skip is recorded
  // evidence, not absence) and never `approved` (no reviewer spoke). A flow with
  // no review step at all reports `not_applicable` (nothing to approve).
  const reviewStatus: RunAssurance["review"]["status"] =
    input.finalDecision === "APPROVED"
      ? "approved"
      : input.finalDecision === null
        ? input.reviewSkipped
          ? "skipped_inert_diff"
          : reviewApplicable
            ? "missing"
            : "not_applicable"
        : "changes_requested";
  const verificationStatus: RunAssurance["verification"]["status"] =
    input.verification === "PASSED"
      ? "passed"
      : input.verification === "FAILED"
        ? "failed"
        : verificationApplicable
          ? "not_run"
          : "not_applicable";

  // ── Caps (REAL gaps / weak checks) vs notes (informational, n/a) ─────────
  // A cap holds the verdict below "verified"; a note never does. The split is
  // the heart of T2: a `not_applicable` lane or an inert-diff review skip is
  // honest context, not a missing-evidence gap.
  const caps: string[] = [];
  const notes: string[] = [];
  if (validationStatus === "missing") caps.push("validation_missing");
  if (validationStatus === "failed") caps.push("validation_failed");
  if (validationStatus === "environment") caps.push("validation_environment");
  if (validationStatus === "not_applicable")
    notes.push(
      input.validationScopedInert
        ? "validation_skipped_inert"
        : "validation_not_required",
    );
  if (reviewStatus === "missing") caps.push("review_missing");
  if (reviewStatus === "skipped_inert_diff") notes.push("review_skipped_inert_diff");
  if (reviewStatus === "not_applicable") notes.push("review_not_required");
  if (reviewStatus === "changes_requested") caps.push("review_not_approved");
  if (verificationStatus === "not_run") caps.push("verification_not_run");
  if (verificationStatus === "failed") caps.push("verification_failed");
  if (verificationStatus === "not_applicable") notes.push("verification_not_required");
  if (holds.length > 0) caps.push("approval_required");
  if (toleratedStepFailures > 0) caps.push("steps_failed_tolerated");

  // ── Verdict ─────────────────────────────────────────────────────────────
  const verdict = pickVerdict({
    runStatus: input.runStatus,
    policyStatus,
    rollbackFailed,
    validationStatus,
    reviewStatus,
    verificationStatus,
    toleratedStepFailures,
  });

  // Blocked/unsafe runs lead with the root cause, not downstream absence.
  const blockers =
    verdict === "blocked" || verdict === "unsafe" ? (input.blockers ?? []) : [];
  // On a `blocked` verdict the missing-trio is trivially implied (the run never
  // got there) - pure noise next to the blockers. `unsafe` keeps every cap: a
  // policy deny can land mid-run, so "what evidence exists" is still informative.
  const visibleCaps =
    verdict === "blocked"
      ? caps.filter(
          (c) =>
            c !== "validation_missing" &&
            c !== "review_missing" &&
            c !== "verification_not_run",
        )
      : caps;

  return {
    schemaVersion: 1,
    runId: input.runId,
    verdict,
    summary: summarize(verdict, {
      policyStatus,
      validationStatus,
      reviewStatus,
      verificationStatus,
      validationScopedInert: input.validationScopedInert ?? false,
      denies: denies.length,
      toleratedStepFailures,
      firstBlocker: blockers[0] ?? null,
    }),
    generatedAt: input.generatedAt,
    policy: { status: policyStatus, rulesEvaluated, violations },
    validation: {
      status: validationStatus,
      total: cmds.length,
      passed: cmdPassed,
      failed: cmdFailed,
      environment: cmdEnvironment,
    },
    review: { status: reviewStatus },
    verification: { status: verificationStatus },
    coverage: { toleratedStepFailures },
    blockers,
    caps: visibleCaps,
    notes,
    anyRealCheckPassed:
      validationStatus === "passed" ||
      reviewStatus === "approved" ||
      verificationStatus === "passed",
    supervisor,
    isolation: input.isolation ?? {
      posture: "none",
      osSandboxedTurns: 0,
      hardenedTurns: 0,
      unconfinedRequestedTurns: 0,
    },
  };
}

function pickVerdict(s: {
  runStatus: string;
  policyStatus: RunAssurance["policy"]["status"];
  rollbackFailed: boolean;
  validationStatus: RunAssurance["validation"]["status"];
  reviewStatus: RunAssurance["review"]["status"];
  verificationStatus: RunAssurance["verification"]["status"];
  toleratedStepFailures: number;
}): RunAssuranceVerdict {
  // A hard policy violation or a failed rollback poisons trust in the worktree.
  if (s.policyStatus === "violated" || s.rollbackFailed) return "unsafe";
  // Anything that didn't reach merge_ready cannot continue.
  if (s.runStatus !== "merge_ready") return "blocked";

  // merge_ready: weigh the evidence per lane (T2). Each lane is one of:
  //   PASS - a real check ran and passed
  //   NA   - the lane wasn't applicable (nothing to check) or an inert-diff
  //          review skip (recorded evidence that review wasn't needed)
  //   GAP  - a check was EXPECTED but produced no evidence (missing / not_run),
  //          or its toolchain was missing (environment)
  //   FAIL - a check ran and failed (validation failed, review changed-requested)
  const FAIL = "fail" as const;
  const GAP = "gap" as const;
  const NA = "na" as const;
  const PASS = "pass" as const;
  const validationLane =
    s.validationStatus === "failed"
      ? FAIL
      : s.validationStatus === "missing" || s.validationStatus === "environment"
        ? GAP
        : s.validationStatus === "not_applicable"
          ? NA
          : PASS;
  const reviewLane =
    s.reviewStatus === "changes_requested"
      ? FAIL
      : s.reviewStatus === "missing"
        ? GAP
        : s.reviewStatus === "not_applicable" ||
            s.reviewStatus === "skipped_inert_diff"
          ? NA
          : PASS;
  const verificationLane =
    s.verificationStatus === "failed"
      ? FAIL
      : s.verificationStatus === "not_run"
        ? GAP
        : s.verificationStatus === "not_applicable"
          ? NA
          : PASS;
  const lanes = [validationLane, reviewLane, verificationLane];

  // A failed check on a merge_ready run (tolerated/best-effort path) can never
  // read as verified.
  if (lanes.includes(FAIL)) return "partially_verified";
  if (lanes.includes(GAP)) {
    // Every lane is a gap with nothing passing and nothing n/a: genuinely no
    // evidence at all (the old `noEvidence` case).
    if (!lanes.includes(PASS) && !lanes.includes(NA)) return "unverified";
    return "partially_verified";
  }
  // No fail, no gap: every lane PASSED or was NOT APPLICABLE. The run is as
  // verified as it can be - including the "nothing was required" case (all NA),
  // which T2 stops shaming as partially_verified. A tolerated step failure still
  // degrades coverage, so it caps here.
  if (s.toleratedStepFailures > 0) return "partially_verified";
  return "verified";
}

function summarize(
  verdict: RunAssuranceVerdict,
  d: {
    policyStatus: string;
    validationStatus: string;
    reviewStatus: string;
    verificationStatus: string;
    validationScopedInert: boolean;
    denies: number;
    toleratedStepFailures: number;
    firstBlocker?: RunAssuranceBlocker | null;
  },
): string {
  switch (verdict) {
    case "unsafe":
      return d.denies > 0
        ? `A policy denied ${d.denies} action(s); the worktree is not trusted.`
        : "A rollback failed; the worktree may be partially modified.";
    case "blocked": {
      const b = d.firstBlocker;
      if (!b) return "The run did not reach merge_ready.";
      const where = b.stepId ? ` at "${b.stepId}"` : "";
      return `The run did not reach merge_ready. Cause${where}: ${b.detail}`;
    }
    case "unverified":
      return "No validation, review, or verification evidence exists for this run.";
    case "verified": {
      // Distinguish "real checks passed" from "nothing was required for this
      // change" (T2). The lane statuses stay visible, so "verified + nothing
      // required" is never confused with "review approved + tests passed".
      const passed: string[] = [];
      if (d.reviewStatus === "approved") passed.push("review");
      if (d.validationStatus === "passed") passed.push("validation");
      if (d.verificationStatus === "passed") passed.push("verification");
      if (passed.length === 0) {
        return d.validationScopedInert || d.reviewStatus === "skipped_inert_diff"
          ? "No checks were required - the change was inert (docs/text) and touched no protected path."
          : "No checks were required for this change.";
      }
      const naLanes: string[] = [];
      if (
        d.validationStatus === "not_applicable" &&
        d.reviewStatus !== "skipped_inert_diff"
      )
        naLanes.push("validation");
      if (d.verificationStatus === "not_applicable") naLanes.push("verification");
      if (d.reviewStatus === "not_applicable") naLanes.push("review");
      const naNote = naLanes.length
        ? ` ${naLanes.join(", ")}: not required for this change.`
        : "";
      return `Policy passed; ${passed.join(", ")} passed.${naNote}`;
    }
    case "partially_verified": {
      const gaps: string[] = [];
      if (d.validationStatus === "missing") gaps.push("validation never ran");
      if (d.validationStatus === "failed") gaps.push("validation failed");
      if (d.validationStatus === "environment")
        gaps.push("validation toolchain missing");
      if (d.reviewStatus === "missing") gaps.push("no review decision");
      if (d.reviewStatus === "changes_requested")
        gaps.push("review requested changes");
      if (d.verificationStatus === "not_run") gaps.push("verification never ran");
      if (d.verificationStatus === "failed") gaps.push("verification failed");
      if (d.toleratedStepFailures > 0)
        gaps.push(
          `${d.toleratedStepFailures} best-effort step(s) failed and were tolerated`,
        );
      const detail = gaps.length ? gaps.join("; ") : "some checks are weak";
      return `Reached merge-ready, but ${detail}.`;
    }
  }
}

/** Read run state + action log, derive, and write `assurance.json`. */
export async function buildAndWriteRunAssurance(
  projectRoot: string,
  runId: string,
): Promise<RunAssurance> {
  let runStatus = "unknown";
  let verification: "PASSED" | "FAILED" | "NEEDS_HUMAN" | null = null;
  let decision: "APPROVED" | "CHANGES_REQUESTED" | "BLOCKED" | null = null;
  let toleratedStepFailures = 0;
  let reviewSkipped = false;
  let stepStates: { id: string; status: string; error: string | null }[] = [];
  // T2 applicability: which lanes the flow actually exercised. A step that ran
  // (or would have) counts; a `skipped` step does not. Read-only runs skip
  // validation + verification entirely, so those lanes are n/a regardless.
  let flowHasValidationStep = false;
  let flowHasReviewStep = false;
  let flowHasVerifyStep = false;
  let readOnly = false;
  const statePath = runStatePath(projectRoot, runId);
  if (await pathExists(statePath)) {
    try {
      const state = runStateSchema.parse(JSON.parse(await readText(statePath)));
      runStatus = state.status;
      decision = state.finalDecision;
      verification = state.verification;
      reviewSkipped = state.reviewSkipped !== null;
      readOnly = state.readOnly === true;
      // On a merge_ready run, a `failed` flow step is a tolerated failure (a
      // fatal one would have aborted the run before merge_ready). Count them so
      // the verdict reflects the degraded coverage honestly.
      toleratedStepFailures = (state.flow?.steps ?? []).filter(
        (s) => s.status === "failed",
      ).length;
      stepStates = (state.flow?.steps ?? []).map((s) => ({
        id: s.id,
        status: s.status,
        error: s.error,
      }));
      const ranSteps = (state.flow?.steps ?? []).filter(
        (s) => s.status !== "skipped",
      );
      flowHasValidationStep = ranSteps.some((s) => s.kind === "validation");
      flowHasReviewStep = ranSteps.some((s) => s.kind === "review-turn");
      flowHasVerifyStep = ranSteps.some((s) => s.kind === "summary-turn");
    } catch {
      // Fall through with defaults; an unreadable state is itself "blocked".
    }
  }
  const actionLog = await readActionLog(projectRoot, runId);
  // Event stream (best-effort, parsed once): feeds the persona badge and the
  // root-cause blockers.
  let events: { type: string; data?: Record<string, unknown> }[] = [];
  try {
    const eventsPath = runEventsPath(projectRoot, runId);
    if (await pathExists(eventsPath)) {
      for (const line of (await readText(eventsPath)).split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
          const ev = JSON.parse(line) as { type?: unknown; data?: unknown };
          if (typeof ev.type === "string") {
            events.push({
              type: ev.type,
              data:
                ev.data && typeof ev.data === "object"
                  ? (ev.data as Record<string, unknown>)
                  : undefined,
            });
          }
        } catch {
          // a torn/corrupt line never blocks the verdict
        }
      }
    }
  } catch {
    // best-effort; an unreadable event log just means fewer blockers/persona
  }
  // Persona (best-effort): the selection record when present, else the always-
  // emitted persona.selected event (selection.json is only written for an
  // orchestrator selection / supervisor upgrade, but the persona is recorded for
  // every run, so the badge shows it on plain default runs too).
  let persona: string | null = null;
  try {
    const selPath = path.join(runArtifactsDir(projectRoot, runId), "selection.json");
    if (await pathExists(selPath)) {
      const sel = JSON.parse(await readText(selPath)) as { personaId?: string | null };
      persona = sel.personaId ?? null;
    }
  } catch {
    // best-effort; fall through to the event log
  }
  if (!persona) {
    for (const ev of events) {
      if (ev.type !== "persona.selected") continue;
      const id = ev.data?.personaId;
      if (typeof id === "string" && id) persona = id;
    }
  }
  // The models that actually ran (per seated role), for the honest independence
  // label. Best-effort - CLI providers often don't report a model string.
  let modelsUsed: (string | null | undefined)[] = [];
  try {
    const metrics = await new MetricsStore(projectRoot, runId).read();
    modelsUsed = (metrics?.roles ?? []).map((r) => r.model ?? null);
  } catch {
    // best-effort; independence falls back to "single-profile"
  }
  // ── T2 applicability: was each lane's evidence actually expected? ─────────
  // validation: applicable only when the flow ran a validation step AND the
  // project has validate commands AND the change wasn't inert-scoped AND the run
  // wasn't read-only. Otherwise a 0/0 tally is "nothing to verify", not a gap.
  //
  // NOTE (re-derive drift): the artifact is normally written ONCE at run
  // completion (the orchestrator's terminal step), so its lane statuses are
  // stamped against the run's own config + flow. This `loadConfig` only matters
  // when the artifact is absent and gets re-derived on read (a legacy run) - a
  // narrow path where current `commands.validate` stands in for the run-time
  // value. Real validation PASS/FAIL is never affected (it comes from the
  // immutable broker log, not config); only the evidence-less 0/0 case can shift
  // between `missing` and `not_applicable`. Persisting applicability into run
  // state is a T13 follow-up (it needs the verdict for merge advice).
  const validationScopedInert = events.some((e) => e.type === "validation.scoped");
  let validateCommandsConfigured = false;
  try {
    const cfg = await loadConfig(projectRoot);
    validateCommandsConfigured = (cfg.config.commands?.validate?.length ?? 0) > 0;
  } catch {
    // Config unreadable -> treat as "no validate commands"; a 0/0 then reads
    // not_applicable instead of falsely shaming the run with a missing gap.
  }
  const validationApplicable =
    flowHasValidationStep &&
    validateCommandsConfigured &&
    !validationScopedInert &&
    !readOnly;
  // verification: the flow must have a verify (summary-turn) step, and read-only
  // runs skip verification entirely. review: a review step must exist (review
  // runs even on read-only investigation runs).
  const verificationApplicable = flowHasVerifyStep && !readOnly;
  const reviewApplicable = flowHasReviewStep;
  const assurance = deriveRunAssurance({
    runId,
    runStatus,
    finalDecision: decision,
    reviewSkipped,
    verification,
    actionLog,
    toleratedStepFailures,
    validationApplicable,
    validationScopedInert,
    reviewApplicable,
    verificationApplicable,
    blockers: deriveRunBlockers({ steps: stepStates, events }),
    persona,
    modelsUsed,
    isolation: deriveRunIsolation(events),
    generatedAt: nowIso(),
  });
  await writeText(
    runAssurancePath(projectRoot, runId),
    JSON.stringify(assurance, null, 2),
  );
  return assurance;
}

export async function readRunAssurance(
  projectRoot: string,
  runId: string,
): Promise<RunAssurance | null> {
  const file = runAssurancePath(projectRoot, runId);
  if (!(await pathExists(file))) return null;
  try {
    const raw = JSON.parse(await readText(file)) as RunAssurance;
    // Backfill fields added after older artifacts were written so the function
    // honors its RunAssurance return contract. `coverage` landed in 0.7.11;
    // pre-0.7.11 assurance.json files lack it, which would otherwise surface as
    // an undefined dereference in every consumer (CLI, API, dashboard).
    return {
      ...raw,
      coverage: raw.coverage ?? { toleratedStepFailures: 0 },
      caps: raw.caps ?? [],
      notes: raw.notes ?? [],
      // Backfill from the persisted lane statuses (no re-derivation needed).
      anyRealCheckPassed:
        raw.anyRealCheckPassed ??
        (raw.validation?.status === "passed" ||
          raw.review?.status === "approved" ||
          raw.verification?.status === "passed"),
      blockers: raw.blockers ?? [],
    };
  } catch {
    return null;
  }
}

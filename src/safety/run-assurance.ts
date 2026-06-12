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
     *  worktree); nothing was validated, but nothing failed either. */
    status: "passed" | "failed" | "environment" | "missing";
    total: number;
    passed: number;
    failed: number;
    environment: number;
  };
  review: {
    status: "approved" | "changes_requested" | "missing" | "skipped_inert_diff";
  };
  verification: { status: "passed" | "failed" | "not_run" };
  /** Coverage gaps from best-effort (continueOnError) steps that failed and were
   *  tolerated - those steps gave no scrutiny, so coverage is degraded even on a
   *  merge_ready run. On a merge_ready run a `failed` flow step is, by
   *  construction, a tolerated one (a fatal failure aborts the run). */
  coverage: { toleratedStepFailures: number };
  /** Root causes for a run that never reached merge_ready - the "WHY blocked"
   *  the caps cannot express. Empty on merge_ready runs. */
  blockers: RunAssuranceBlocker[];
  /** Why the verdict is below "verified" (missing or weak checks). On a
   *  `blocked` verdict the trivially-implied missing-trio (validation_missing,
   *  review_missing, verification_not_run) is omitted - a run that never got
   *  there tells you nothing through them; `blockers` carries the cause. */
  caps: string[];
  /** The supervisor persona + how independent its review was (orchestrator-
   *  personas.md). `independence` is honest, NOT a confidence source: it is
   *  "cross-model" only when >= 2 distinct non-null models actually ran;
   *  otherwise "single-profile" (a fresh-context self-check that, by the design's
   *  non-negotiables, can only LOWER confidence, never raise this verdict). */
  supervisor: {
    persona: string | null;
    independence: "cross-model" | "single-profile";
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
  const validationStatus: RunAssurance["validation"]["status"] =
    cmds.length === 0
      ? "missing"
      : cmdFailed > 0
        ? "failed"
        : cmdEnvironment > 0
          ? "environment"
          : "passed";

  // ── Review + verification (from the run's recorded decisions) ────────────
  // A skip-evidence run (A3 express, deterministic inert-diff descent) reports
  // `skipped_inert_diff` - distinct from `missing` (the skip is recorded
  // evidence, not absence) and never `approved` (no reviewer spoke).
  const reviewStatus: RunAssurance["review"]["status"] =
    input.finalDecision === "APPROVED"
      ? "approved"
      : input.finalDecision === null
        ? input.reviewSkipped
          ? "skipped_inert_diff"
          : "missing"
        : "changes_requested";
  const verificationStatus: RunAssurance["verification"]["status"] =
    input.verification === "PASSED"
      ? "passed"
      : input.verification === "FAILED"
        ? "failed"
        : "not_run";

  // ── Caps (what's missing / weak) ────────────────────────────────────────
  const caps: string[] = [];
  if (validationStatus === "missing") caps.push("validation_missing");
  if (validationStatus === "failed") caps.push("validation_failed");
  if (validationStatus === "environment") caps.push("validation_environment");
  if (reviewStatus === "missing") caps.push("review_missing");
  if (reviewStatus === "skipped_inert_diff") caps.push("review_skipped_inert_diff");
  if (reviewStatus === "changes_requested") caps.push("review_not_approved");
  if (verificationStatus === "not_run") caps.push("verification_not_run");
  if (verificationStatus === "failed") caps.push("verification_failed");
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
    supervisor,
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
  // merge_ready: weigh the evidence.
  const noEvidence =
    s.validationStatus === "missing" &&
    s.reviewStatus === "missing" &&
    s.verificationStatus === "not_run";
  if (noEvidence) return "unverified";
  if (
    s.reviewStatus === "approved" &&
    s.verificationStatus === "passed" &&
    s.validationStatus === "passed" &&
    // A tolerated step failure means a best-effort step gave no scrutiny, so we
    // cannot honestly claim full verification - cap at partially_verified.
    s.toleratedStepFailures === 0
  ) {
    return "verified";
  }
  return "partially_verified";
}

function summarize(
  verdict: RunAssuranceVerdict,
  d: {
    policyStatus: string;
    validationStatus: string;
    reviewStatus: string;
    verificationStatus: string;
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
    case "verified":
      return "Policy passed, review approved, validation and verification passed.";
    case "partially_verified": {
      const tolerated =
        d.toleratedStepFailures > 0
          ? ` ${d.toleratedStepFailures} best-effort step(s) failed and were tolerated, so coverage is degraded.`
          : "";
      return `Some evidence passed but checks are missing - review: ${d.reviewStatus}, validation: ${d.validationStatus}, verification: ${d.verificationStatus}.${tolerated}`;
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
  const statePath = runStatePath(projectRoot, runId);
  if (await pathExists(statePath)) {
    try {
      const state = runStateSchema.parse(JSON.parse(await readText(statePath)));
      runStatus = state.status;
      decision = state.finalDecision;
      verification = state.verification;
      reviewSkipped = state.reviewSkipped !== null;
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
  const assurance = deriveRunAssurance({
    runId,
    runStatus,
    finalDecision: decision,
    reviewSkipped,
    verification,
    actionLog,
    toleratedStepFailures,
    blockers: deriveRunBlockers({ steps: stepStates, events }),
    persona,
    modelsUsed,
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
      blockers: raw.blockers ?? [],
    };
  } catch {
    return null;
  }
}

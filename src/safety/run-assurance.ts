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
  /** Why the verdict is below "verified" (missing or weak checks). */
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
    caps,
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
  },
): string {
  switch (verdict) {
    case "unsafe":
      return d.denies > 0
        ? `A policy denied ${d.denies} action(s); the worktree is not trusted.`
        : "A rollback failed; the worktree may be partially modified.";
    case "blocked":
      return "The run did not reach merge_ready.";
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
    } catch {
      // Fall through with defaults; an unreadable state is itself "blocked".
    }
  }
  const actionLog = await readActionLog(projectRoot, runId);
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
    try {
      const eventsPath = runEventsPath(projectRoot, runId);
      if (await pathExists(eventsPath)) {
        for (const line of (await readText(eventsPath)).split(/\r?\n/)) {
          if (!line.includes('"persona.selected"')) continue;
          const ev = JSON.parse(line) as { data?: { personaId?: string | null } };
          if (ev.data?.personaId) persona = ev.data.personaId;
        }
      }
    } catch {
      // best-effort; persona stays null
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
    };
  } catch {
    return null;
  }
}

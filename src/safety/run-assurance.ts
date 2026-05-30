// ── Run Assurance artifact (Epic S / S5) ────────────────────────────────────
//
// At a run's terminal state, derive a single honest verdict from *evidence* —
// the Action Broker log (`actions.ndjson`) plus the run's review/verification
// decisions — never from a model's self-assessment. The verdict is one of five
// discrete levels (no fake confidence %); the artifact records each sub-check
// and the caps (missing checks) that held the verdict below "verified".
//
// Design: docs/design/policy-enforcement-assurance.md (§ Run Assurance).

import { pathExists, readText, writeText } from "../utils/fs.js";
import { runAssurancePath, runStatePath } from "../utils/paths.js";
import { readActionLog, type ActionRecord } from "./action-broker.js";
import { runStateSchema } from "../core/state-machine.js";
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
    status: "passed" | "failed" | "missing";
    total: number;
    passed: number;
    failed: number;
  };
  review: { status: "approved" | "changes_requested" | "missing" };
  verification: { status: "passed" | "failed" | "not_run" };
  /** Why the verdict is below "verified" (missing or weak checks). */
  caps: string[];
};

/** Pure derivation — testable without disk. */
export function deriveRunAssurance(input: {
  runId: string;
  runStatus: string;
  finalDecision: "APPROVED" | "CHANGES_REQUESTED" | "BLOCKED" | null;
  verification: "PASSED" | "FAILED" | "NEEDS_HUMAN" | null;
  actionLog: ActionRecord[];
  generatedAt: string;
}): RunAssurance {
  const { actionLog } = input;

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

  // ── Validation (from command.run evidence — broker truth, not model claims).
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
  const cmdFailed = cmds.filter((r) => r.evidence?.ok === false).length;
  const validationStatus: RunAssurance["validation"]["status"] =
    cmds.length === 0 ? "missing" : cmdFailed > 0 ? "failed" : "passed";

  // ── Review + verification (from the run's recorded decisions) ────────────
  const reviewStatus: RunAssurance["review"]["status"] =
    input.finalDecision === "APPROVED"
      ? "approved"
      : input.finalDecision === null
        ? "missing"
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
  if (reviewStatus === "missing") caps.push("review_missing");
  if (reviewStatus === "changes_requested") caps.push("review_not_approved");
  if (verificationStatus === "not_run") caps.push("verification_not_run");
  if (verificationStatus === "failed") caps.push("verification_failed");
  if (holds.length > 0) caps.push("approval_required");

  // ── Verdict ─────────────────────────────────────────────────────────────
  const verdict = pickVerdict({
    runStatus: input.runStatus,
    policyStatus,
    rollbackFailed,
    validationStatus,
    reviewStatus,
    verificationStatus,
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
    }),
    generatedAt: input.generatedAt,
    policy: { status: policyStatus, rulesEvaluated, violations },
    validation: {
      status: validationStatus,
      total: cmds.length,
      passed: cmdPassed,
      failed: cmdFailed,
    },
    review: { status: reviewStatus },
    verification: { status: verificationStatus },
    caps,
  };
}

function pickVerdict(s: {
  runStatus: string;
  policyStatus: RunAssurance["policy"]["status"];
  rollbackFailed: boolean;
  validationStatus: RunAssurance["validation"]["status"];
  reviewStatus: RunAssurance["review"]["status"];
  verificationStatus: RunAssurance["verification"]["status"];
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
    s.validationStatus === "passed"
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
    case "partially_verified":
      return `Some evidence passed but checks are missing — review: ${d.reviewStatus}, validation: ${d.validationStatus}, verification: ${d.verificationStatus}.`;
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
  const statePath = runStatePath(projectRoot, runId);
  if (await pathExists(statePath)) {
    try {
      const state = runStateSchema.parse(JSON.parse(await readText(statePath)));
      runStatus = state.status;
      decision = state.finalDecision;
      verification = state.verification;
    } catch {
      // Fall through with defaults; an unreadable state is itself "blocked".
    }
  }
  const actionLog = await readActionLog(projectRoot, runId);
  const assurance = deriveRunAssurance({
    runId,
    runStatus,
    finalDecision: decision,
    verification,
    actionLog,
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
    return JSON.parse(await readText(file)) as RunAssurance;
  } catch {
    return null;
  }
}

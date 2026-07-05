// ── Merge advisor (design/merge-advisor.md) ───────────────────
//
// A READ-ONLY advisory layer over the integration machinery. It predicts and
// explains what the existing apply + finish path will do - it never widens it.
// The recommendation is deterministic code from observable git facts + the
// assurance lanes; same inputs, same advice. No LLM anywhere in this module
// (the optional "analyze deeper" pass is opt-in and can only add prose
// caution, never change `recommendation` or `flags`).
//
// Honesty contract: consume lane statuses +
// `anyRealCheckPassed`, never the bare verdict - `verified` with
// `anyRealCheckPassed: false` means "nothing needed checking", not "checked
// and approved", and is surfaced as the `no_real_check` caution.

import { execa } from "execa";
import { loadConfig } from "../project/config-loader.js";
import { refExists } from "../git/git.js";
import {
  listMergeReadyRuns,
  mergePreview,
  IntegrationError,
  type BranchPreview,
  type MergeReadyRun,
} from "./integration-service.js";
import {
  readRunAssurance,
  type RunAssurance,
  type RunAssuranceVerdict,
} from "../safety/run-assurance.js";
import { isProtectedDiff } from "../orchestrator/protected-paths.js";

export type MergeRecommendation =
  | "finish-now" // apply + finish via the existing actions
  | "stage-on-integration-branch" // apply, but hold finish: large, protected, or diverged
  | "resolve-first"; // preview conflicted: resolve before merging

export type MergeRiskFlagId =
  | "preview_conflict"
  | "validation_gap"
  | "review_gap"
  | "verification_gap"
  | "no_real_check" // verdict verified but anyRealCheckPassed=false
  | "assurance_missing" // no assurance artifact for the run at all
  | "branch_gone" // run is merge-ready but its branch no longer exists
  | "tolerated_failures" // best-effort steps failed and were tolerated
  | "protected_paths"
  | "large_change"
  | "diverged_main" // run branch far behind main: stale change
  | "overlaps_other_ready" // cumulative preview: conflict may be with an earlier selected branch
  | "isolation_incomplete"; // a sandbox was requested but a turn ran unconfined (posture "partial")

export type MergeRiskFlag = {
  id: MergeRiskFlagId;
  /** "warning" = bears on whether this should land at all;
   *  "caution" = land-able, but the human should know. */
  severity: "warning" | "caution";
  /** One plain-language line (non-developer headline material). */
  summary: string;
  /** Developer depth - numbers, file names, lane statuses. */
  detail: string;
};

/** Run-branch drift relative to main. Explicitly NOT the merge artifact's
 *  topology: the integration branch forks from the CURRENT main at apply time,
 *  so these numbers are a staleness/conflict signal, not the commit shape. */
export type BranchTopology = {
  branchName: string;
  aheadOfMain: number;
  behindMain: number;
  filesTouched: number;
  protectedPathHits: string[];
};

/** Projection of the run's assurance using the REAL lane-status unions - a
 *  renamed status must fail the typecheck, not silently stop matching. */
export type AssuranceProjection = {
  verdict: RunAssuranceVerdict;
  lanes: {
    validation: RunAssurance["validation"]["status"];
    review: RunAssurance["review"]["status"];
    verification: RunAssurance["verification"]["status"];
  };
  anyRealCheckPassed: boolean;
  toleratedStepFailures: number;
  /** How confined the run actually was (run-assurance isolation posture). Used
   *  only for the `isolation_incomplete` caution - a "partial" posture means a
   *  sandbox was requested but a turn ran unconfined. */
  isolationPosture: RunAssurance["isolation"]["posture"];
};

export type MergeAdvice = {
  runId: string;
  task: string;
  topology: BranchTopology;
  /** Cumulative dry-run result for this branch; null in cheap projections
   *  that skip the preview (the dashboard hub list, slice 1b). */
  preview: BranchPreview | null;
  /** null = no assurance artifact exists (surfaced as `assurance_missing`). */
  assurance: AssuranceProjection | null;
  recommendation: MergeRecommendation;
  recommendationReason: string;
  /** What the existing finish action will do. "fast-forward" = finish moves
   *  main onto the integration branch without adding a commit of its own
   *  (apply already records one --no-ff merge commit per integrated run
   *  there); if other merge-ready runs could land first, main may move and
   *  finish adds a merge commit on top (or refuses on conflict). */
  predictedShape: "fast-forward" | "merge-commit-if-main-moves";
  flags: MergeRiskFlag[];
  /** Plain-language advisory for a non-developer. Never contains git
   *  commands. */
  headline: string;
  /** Developer-depth advisory: numbers, lanes, shape, flag details. */
  detail: string;
  /** Attribution only - the persona may reorder which flags lead, never
   *  add/remove/soften one. */
  personaId: string;
  /** Git/CLI steps when the recommendation is not a single existing action
   *  (developer detail only). */
  manualSteps: string[] | null;
};

/** Advisor thresholds. User values come from project config
 *  (`merge.advisor.suggestIntegrationBranchWhen`, schema in
 *  config-schema.ts - its defaults mirror DEFAULT_ADVISOR_THRESHOLDS).
 *  Crossing one only flips the recommendation to
 *  stage-on-integration-branch - never blocks anything. */
export type MergeAdvisorThresholds = {
  filesTouched: number;
  protectedPaths: boolean;
  behindMain: number;
};

export const DEFAULT_ADVISOR_THRESHOLDS: MergeAdvisorThresholds = {
  filesTouched: 25,
  protectedPaths: true,
  behindMain: 50,
};

export function projectAssurance(a: RunAssurance): AssuranceProjection {
  return {
    verdict: a.verdict,
    lanes: {
      validation: a.validation.status,
      review: a.review.status,
      verification: a.verification.status,
    },
    anyRealCheckPassed: a.anyRealCheckPassed,
    toleratedStepFailures: a.coverage.toleratedStepFailures,
    isolationPosture: a.isolation.posture,
  };
}

/** Read-only git facts for one run branch vs main. Throws IntegrationError
 *  when the branch is gone - a merge-ready run whose branch was deleted is a
 *  real inconsistency the user should see, not a silent skip. */
export async function collectBranchTopology(input: {
  projectRoot: string;
  branchName: string;
  mainBranch: string;
  protectedPaths?: readonly string[];
  unprotectedPaths?: readonly string[];
}): Promise<BranchTopology> {
  const { projectRoot, branchName, mainBranch } = input;
  if (!(await refExists(projectRoot, branchName))) {
    throw new IntegrationError(
      `Branch "${branchName}" no longer exists - the run is merge-ready but its branch is gone.`,
    );
  }
  // main...branch with --left-right: left = only in main (behind), right =
  // only in branch (ahead).
  const counts = await execa(
    "git",
    ["rev-list", "--left-right", "--count", `${mainBranch}...${branchName}`],
    { cwd: projectRoot, reject: false },
  );
  if (counts.exitCode !== 0) {
    throw new IntegrationError(
      `Could not compare "${branchName}" with ${mainBranch}: ${counts.stderr || counts.stdout}`,
    );
  }
  const [behindRaw, aheadRaw] = counts.stdout.trim().split(/\s+/);
  const behindMain = Number(behindRaw ?? 0) || 0;
  const aheadOfMain = Number(aheadRaw ?? 0) || 0;

  // Three-dot diff = vs the merge-base: the change itself, not main's drift.
  const diff = await execa(
    "git",
    ["diff", "--name-only", `${mainBranch}...${branchName}`],
    { cwd: projectRoot, reject: false },
  );
  const files =
    diff.exitCode === 0
      ? diff.stdout.split("\n").map((l) => l.trim()).filter(Boolean)
      : [];
  const protectedHits = isProtectedDiff(files, {
    protectedPaths: input.protectedPaths,
    unprotectedPaths: input.unprotectedPaths,
  }).matches.map((m) => m.path);

  return {
    branchName,
    aheadOfMain,
    behindMain,
    filesTouched: files.length,
    protectedPathHits: [...new Set(protectedHits)],
  };
}

export type MergeAdviceInput = {
  runId: string;
  task: string;
  topology: BranchTopology;
  /** False when the run is merge-ready but its git branch was deleted - the
   *  advisor degrades to a branch_gone warning instead of failing the whole
   *  advice call (mergePreview degrades the same way). */
  branchExists: boolean;
  preview: BranchPreview | null;
  /** Position of this branch in the cumulative preview (0-based); -1 when no
   *  preview ran. A conflict at index > 0 may be with an earlier selected
   *  branch rather than main - the preview is cumulative by design. */
  previewIndex: number;
  assurance: AssuranceProjection | null;
  personaId: string;
  mainBranch: string;
  /** True when merge-ready runs exist OUTSIDE this selection - if one of them
   *  lands first, main moves and finish stops being a fast-forward. */
  othersInFlight: boolean;
  thresholds: MergeAdvisorThresholds;
};

/** Pure - same inputs, same advice. All judgment lives here so it is fully
 *  table-testable; the async wrappers only gather facts. */
export function computeMergeAdvice(input: MergeAdviceInput): MergeAdvice {
  const { topology, preview, assurance, mainBranch, thresholds } = input;
  const flags: MergeRiskFlag[] = [];

  // ── flags: "should this land at all" (warnings) + awareness (cautions) ──
  if (!input.branchExists) {
    flags.push({
      id: "branch_gone",
      severity: "warning",
      summary: "the run is merge-ready but its branch no longer exists",
      detail: `Branch "${topology.branchName}" was not found in the repository. Re-run the task to recreate it, or clean up the stale run.`,
    });
  }
  if (input.branchExists && preview && !preview.clean) {
    const files = preview.conflictedFiles;
    flags.push({
      id: "preview_conflict",
      severity: "warning",
      summary: "the change does not apply cleanly - merging now would conflict",
      detail: files.length
        ? `Dry-run merge conflicted in ${files.length} file(s): ${files.slice(0, 10).join(", ")}${files.length > 10 ? ", ..." : ""}.`
        : `Dry-run merge failed: ${preview.note}.`,
    });
    if (input.previewIndex > 0) {
      flags.push({
        id: "overlaps_other_ready",
        severity: "caution",
        summary: "the conflict may be with another selected run, not with main",
        detail:
          "The preview is cumulative (earlier selected branches are merged first), so this conflict can come from overlap with an earlier run rather than from main. Previewing this run alone would distinguish the two.",
      });
    }
  }

  if (assurance === null) {
    flags.push({
      id: "assurance_missing",
      severity: "warning",
      summary: "no assurance record exists for this run - its checks are unknown",
      detail:
        "No assurance artifact was found for the run, so validation/review/verification status cannot be shown. Treat the change as unchecked.",
    });
  } else {
    const v = assurance.lanes.validation;
    if (v === "failed" || v === "missing" || v === "environment") {
      flags.push({
        id: "validation_gap",
        severity: "warning",
        summary:
          v === "failed"
            ? "validation failed on this change"
            : v === "environment"
              ? "validation could not run (toolchain missing) - nothing was validated"
              : "validation was expected but produced no evidence",
        detail: `Validation lane status: ${v}.`,
      });
    }
    const r = assurance.lanes.review;
    if (r === "changes_requested" || r === "missing") {
      flags.push({
        id: "review_gap",
        severity: "warning",
        summary:
          r === "changes_requested"
            ? "the review asked for changes that have not been re-approved"
            : "a review was expected but never produced a decision",
        detail: `Review lane status: ${r}.`,
      });
    }
    const vf = assurance.lanes.verification;
    if (vf === "failed" || vf === "not_run") {
      flags.push({
        id: "verification_gap",
        severity: "warning",
        summary:
          vf === "failed"
            ? "verification failed on this change"
            : "verification was expected but never ran",
        detail: `Verification lane status: ${vf}.`,
      });
    }
    if (assurance.verdict === "verified" && !assurance.anyRealCheckPassed) {
      flags.push({
        id: "no_real_check",
        severity: "caution",
        summary: "nothing required checking - no check actually exercised this change",
        detail:
          'The verdict is "verified" with anyRealCheckPassed=false: every lane was not-applicable. That means "nothing needed checking", never "checked and approved".',
      });
    }
    // Derived from the projection, NOT the verdict - the verdict happens to
    // cap at partially_verified on tolerated failures today, but the advisor
    // must not depend on that coupling.
    if (assurance.toleratedStepFailures > 0) {
      flags.push({
        id: "tolerated_failures",
        severity: "caution",
        summary: "some best-effort steps failed and were tolerated - coverage is degraded",
        detail: `${assurance.toleratedStepFailures} continueOnError step(s) failed without aborting the run; whatever scrutiny they would have provided did not happen.`,
      });
    }
    // Only "partial" - a sandbox was REQUESTED but a turn ran unconfined. The
    // default "none" is the intended baseline (worktree + diff gate) and would
    // be noise on every run, so it is NOT flagged. Caution, never a warning: the
    // diff was still gated; this only says the run didn't get all the isolation
    // it asked for - worth a look when the change is also sensitive.
    if (assurance.isolationPosture === "partial") {
      const protectedNote =
        topology.protectedPathHits.length > 0
          ? ` The change also touches ${topology.protectedPathHits.length} protected path(s), so the partial confinement is worth a closer look.`
          : "";
      flags.push({
        id: "isolation_incomplete",
        severity: "caution",
        summary: "a sandbox was requested but at least one turn ran unconfined",
        detail: `Run isolation posture: partial - confinement was requested (execution.isolation / hardenReadOnlySeats) but a turn ran on a provider that couldn't honor it, so part of the run had broader filesystem access than intended. The diff was still gated and reviewed.${protectedNote}`,
      });
    }
  }

  if (topology.protectedPathHits.length > 0) {
    flags.push({
      id: "protected_paths",
      severity: "warning",
      summary: "the change touches protected files",
      detail: `Protected paths touched (${topology.protectedPathHits.length}): ${topology.protectedPathHits.slice(0, 10).join(", ")}${topology.protectedPathHits.length > 10 ? ", ..." : ""}.`,
    });
  }
  if (topology.filesTouched > thresholds.filesTouched) {
    flags.push({
      id: "large_change",
      severity: "caution",
      summary: "this is a large change",
      detail: `${topology.filesTouched} files changed (threshold ${thresholds.filesTouched}) - worth a deliberate look before it lands.`,
    });
  }
  if (topology.behindMain > thresholds.behindMain) {
    flags.push({
      id: "diverged_main",
      severity: "caution",
      summary: "the change is stale - main has moved a lot since it branched",
      detail: `The run branch is ${topology.behindMain} commits behind ${mainBranch} (threshold ${thresholds.behindMain}). The dry-run preview is the real conflict signal, but a stale base raises semantic-drift risk no textual merge can see.`,
    });
  }

  const ordered = orderFlagsForPersona(flags, input.personaId);

  // ── recommendation: "how should this land" - flags never change it ──────
  let recommendation: MergeRecommendation;
  let recommendationReason: string;
  if (!input.branchExists) {
    recommendation = "resolve-first";
    recommendationReason =
      "its branch no longer exists - re-run the task or clean up the stale run";
  } else if (preview && !preview.clean) {
    recommendation = "resolve-first";
    recommendationReason = preview.conflictedFiles.length
      ? `the dry-run merge conflicted in ${preview.conflictedFiles.length} file(s)`
      : `the dry-run merge failed (${preview.note})`;
  } else {
    const stageReasons: string[] = [];
    if (thresholds.protectedPaths && topology.protectedPathHits.length > 0) {
      stageReasons.push(
        `it touches ${topology.protectedPathHits.length} protected path(s)`,
      );
    }
    if (topology.filesTouched > thresholds.filesTouched) {
      stageReasons.push(`it changes ${topology.filesTouched} files`);
    }
    if (topology.behindMain > thresholds.behindMain) {
      stageReasons.push(
        `the branch is ${topology.behindMain} commits behind ${mainBranch}`,
      );
    }
    if (stageReasons.length > 0) {
      recommendation = "stage-on-integration-branch";
      recommendationReason = `${stageReasons.join("; ")} - apply to an integration branch now, validate there, finish deliberately`;
    } else {
      recommendation = "finish-now";
      recommendationReason =
        "small, clean change - the existing apply + finish path lands it";
    }
  }

  const predictedShape: MergeAdvice["predictedShape"] = input.othersInFlight
    ? "merge-commit-if-main-moves"
    : "fast-forward";
  // Truth nailed down by the predicted-shape smoke test: apply records one
  // --no-ff merge commit per integrated run ON the integration branch, and
  // finish then fast-forwards main onto that history when main is unmoved -
  // "fast-forward" means finish adds no EXTRA commit, not that history is
  // linear.
  const shapeSentence =
    predictedShape === "fast-forward"
      ? `Finish will fast-forward ${mainBranch} onto the integration branch (it forks from the current ${mainBranch} tip), adding no extra commit of its own - apply already records one merge commit per integrated run on that branch. If ${mainBranch} moves between apply and finish, finish adds a merge commit on top, or refuses on conflict.`
      : `Other merge-ready runs are in flight: if one of them lands first, ${mainBranch} moves and finish adds a merge commit on top (or refuses on conflict). Landing this selection alone fast-forwards onto the integration branch, which carries apply's per-run merge commits.`;

  const manualSteps =
    recommendation === "resolve-first" && input.branchExists
      ? [
          `vibe integrate apply ${input.runId} --into integration/<name>  (stops at the conflict; the integration worktree stays mergeable)`,
          "Resolve the conflicted files in the integration worktree and commit there, or re-run apply without the conflicting run.",
        ]
      : null;

  const headline = buildHeadline({
    flags: ordered,
    recommendation,
    recommendationReason,
    assurance,
    mainBranch,
  });

  const detailLines: string[] = [
    `Branch ${topology.branchName}: ${topology.aheadOfMain} ahead / ${topology.behindMain} behind ${mainBranch}; ${topology.filesTouched} file(s) changed vs the merge-base.`,
    assurance
      ? `Checks - validation: ${assurance.lanes.validation}; review: ${assurance.lanes.review}; verification: ${assurance.lanes.verification}; any real check passed: ${assurance.anyRealCheckPassed ? "yes" : "no"} (verdict: ${assurance.verdict}).`
      : "Checks - unknown: no assurance record for this run.",
  ];
  if (assurance && assurance.toleratedStepFailures > 0) {
    detailLines.push(
      `${assurance.toleratedStepFailures} best-effort step failure(s) were tolerated - coverage is degraded even though the run is merge-ready.`,
    );
  }
  detailLines.push(shapeSentence);
  detailLines.push(`Recommendation: ${recommendation} - ${recommendationReason}.`);
  for (const f of ordered) {
    detailLines.push(`[${f.severity}] ${f.detail}`);
  }
  if (manualSteps) {
    for (const s of manualSteps) detailLines.push(`Step: ${s}`);
  }

  return {
    runId: input.runId,
    task: input.task,
    topology,
    preview,
    assurance,
    recommendation,
    recommendationReason,
    predictedShape,
    flags: ordered,
    headline,
    detail: detailLines.join("\n"),
    personaId: input.personaId,
    manualSteps,
  };
}

/** Persona reorders which flags LEAD - it can never add, remove, or soften
 *  one (orchestrator-personas.md: personas cannot weaken evidence). */
function orderFlagsForPersona(
  flags: MergeRiskFlag[],
  personaId: string,
): MergeRiskFlag[] {
  const bySeverity = [...flags].sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === "warning" ? -1 : 1,
  );
  if (personaId !== "security") return bySeverity;
  const lead = bySeverity.filter((f) => f.id === "protected_paths");
  const rest = bySeverity.filter((f) => f.id !== "protected_paths");
  return [...lead, ...rest];
}

function buildHeadline(input: {
  flags: MergeRiskFlag[];
  recommendation: MergeRecommendation;
  recommendationReason: string;
  assurance: AssuranceProjection | null;
  mainBranch: string;
}): string {
  const warnings = input.flags.filter((f) => f.severity === "warning");
  const cautions = input.flags.filter((f) => f.severity === "caution");
  if (warnings.length > 0) {
    const moreW = warnings.length - 1;
    return `Hold on: ${warnings[0]!.summary}${moreW > 0 ? ` (+${moreW} more warning${moreW > 1 ? "s" : ""})` : ""}.`;
  }
  if (input.recommendation === "stage-on-integration-branch") {
    return `Mergeable, but worth staging: ${input.recommendationReason}.`;
  }
  if (cautions.length > 0) {
    const moreC = cautions.length - 1;
    return `Mergeable with care: ${cautions[0]!.summary}${moreC > 0 ? ` (+${moreC} more)` : ""}.`;
  }
  // No flags at all. Only claim "checks passed" when the verdict is the real
  // thing - a partially_verified run with clean lanes (tolerated step
  // failures) must not read as fully checked.
  if (input.assurance?.verdict === "verified") {
    return `Safe to merge: checks passed and the change applies cleanly onto ${input.mainBranch}.`;
  }
  return `Mergeable: the change applies cleanly onto ${input.mainBranch}, but the run's verdict is ${input.assurance?.verdict ?? "unknown"} - read the detail.`;
}

export type AdviseResult = {
  advice: MergeAdvice[];
  /** Requested run ids that are not merge-ready (or unknown). */
  missing: string[];
};

/** Cheap per-run facts for the Merge page hub list: lanes + topology only.
 *  Deliberately NO preview and NO recommendation - a recommendation computed
 *  blind to the dry-run conflict report would claim "finish-now" for a
 *  conflicting change. Facts here, judgment on drill-in (full advice). */
export type MergeReadyOverviewRow = {
  runId: string;
  task: string;
  branchName: string;
  taskId: string | null;
  branchExists: boolean;
  topology: BranchTopology;
  assurance: AssuranceProjection | null;
};

/** Fast read-only projection over all merge-ready runs (rev-list/diff counts
 *  + assurance artifact reads; no scratch worktree). Safe to call per page
 *  load. */
export async function mergeReadyOverview(
  projectRoot: string,
): Promise<MergeReadyOverviewRow[]> {
  const loaded = await loadConfig(projectRoot);
  const mainBranch = loaded.config.git.mainBranch;
  const policies = loaded.config.policies;
  const ready = await listMergeReadyRuns(projectRoot);
  const rows: MergeReadyOverviewRow[] = [];
  for (const run of ready) {
    const branchExists = await refExists(projectRoot, run.branchName);
    const topology = branchExists
      ? await collectBranchTopology({
          projectRoot,
          branchName: run.branchName,
          mainBranch,
          protectedPaths: policies.protectedPaths,
          unprotectedPaths: policies.unprotectedPaths,
        })
      : {
          branchName: run.branchName,
          aheadOfMain: 0,
          behindMain: 0,
          filesTouched: 0,
          protectedPathHits: [],
        };
    const assuranceRaw = await readRunAssurance(projectRoot, run.runId);
    rows.push({
      runId: run.runId,
      task: run.task,
      branchName: run.branchName,
      taskId: run.taskId,
      branchExists,
      topology,
      assurance: assuranceRaw ? projectAssurance(assuranceRaw) : null,
    });
  }
  return rows;
}

/** Advise the selected (or all) merge-ready runs. Runs ONE cumulative
 *  mergePreview over the selection - the same cost class as
 *  `vibe integrate preview` - then computes everything else from cheap
 *  read-only git facts. Mutates nothing the user keeps. */
export async function adviseMergeReadyRuns(input: {
  projectRoot: string;
  runIds?: string[];
}): Promise<AdviseResult> {
  const loaded = await loadConfig(input.projectRoot);
  const mainBranch = loaded.config.git.mainBranch;
  const personaDefault = loaded.config.defaultPersona;
  const policies = loaded.config.policies;
  // Advisor thresholds from project config (merge.advisor); schema defaults match
  // DEFAULT_ADVISOR_THRESHOLDS. Suggestion-only - crossing one never blocks.
  const thresholds: MergeAdvisorThresholds =
    loaded.config.merge.advisor.suggestIntegrationBranchWhen;

  const ready = await listMergeReadyRuns(input.projectRoot);
  let selected: MergeReadyRun[];
  const missing: string[] = [];
  if (!input.runIds || input.runIds.length === 0) {
    selected = ready;
  } else {
    const byId = new Map(ready.map((r) => [r.runId, r]));
    selected = [];
    for (const id of input.runIds) {
      const r = byId.get(id);
      if (r) selected.push(r);
      else missing.push(id);
    }
  }
  if (selected.length === 0) return { advice: [], missing };

  const preview = await mergePreview({
    projectRoot: input.projectRoot,
    branches: selected.map((r) => ({ branch: r.branchName, runId: r.runId })),
  });
  const othersInFlight = ready.length > selected.length;

  const advice: MergeAdvice[] = [];
  for (let i = 0; i < selected.length; i++) {
    const run = selected[i]!;
    // A merge-ready run whose branch was deleted must degrade to a flagged
    // per-run advice, not fail the whole call - mergePreview already records
    // "branch not found" and continues; the advisor matches that behavior.
    const branchExists = await refExists(input.projectRoot, run.branchName);
    const topology = branchExists
      ? await collectBranchTopology({
          projectRoot: input.projectRoot,
          branchName: run.branchName,
          mainBranch,
          protectedPaths: policies.protectedPaths,
          unprotectedPaths: policies.unprotectedPaths,
        })
      : {
          branchName: run.branchName,
          aheadOfMain: 0,
          behindMain: 0,
          filesTouched: 0,
          protectedPathHits: [],
        };
    const assuranceRaw = await readRunAssurance(input.projectRoot, run.runId);
    const assurance = assuranceRaw ? projectAssurance(assuranceRaw) : null;
    // Pre-personas assurance artifacts have no `supervisor` field at all
    // (readRunAssurance backfills coverage/caps/anyRealCheckPassed, not
    // supervisor) - caught by a live smoke against real run history.
    const personaId = assuranceRaw?.supervisor?.persona ?? personaDefault;
    advice.push(
      computeMergeAdvice({
        runId: run.runId,
        task: run.task,
        topology,
        branchExists,
        preview: preview.results[i] ?? null,
        previewIndex: i,
        assurance,
        personaId,
        mainBranch,
        othersInFlight,
        thresholds,
      }),
    );
  }
  return { advice, missing };
}

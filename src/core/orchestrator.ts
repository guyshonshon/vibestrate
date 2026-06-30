import path from "node:path";
import { randomUUID } from "node:crypto";
import { ArtifactStore } from "./artifact-store.js";
import { EventLog } from "./event-log.js";
import {
  RunStateStore,
  applyTransition,
  createInitialState,
  type RunState,
  type ReviewDecision,
  type VerificationDecision,
} from "./state-machine.js";
import {
  effectiveReviewDecision,
  effectiveVerificationDecision,
  detectNeedsTesting,
} from "./review-parser.js";
import { runValidationCommands, type ValidationResults } from "./validation-runner.js";
import { buildRolePrompt, type PriorArtifact } from "./prompt-builder.js";
import {
  initRunBrief,
  appendStepOutcome,
  updateRunBriefFacts,
  renderRunBrief,
  type RunBriefState,
} from "./run-brief.js";
import {
  listAnnotations,
  renderAnnotationsForPrompt,
} from "./annotations-service.js";
import {
  listControls,
  markPendingConsumed,
  pendingControls,
  renderControlNotes,
} from "./run-control.js";
import { renderFinalReport } from "./final-report.js";
import { runPreflightChecks, type PolicyWarning } from "./policy-engine.js";
import type { ProjectConfig, PermissionMode } from "../project/config-schema.js";
import { loadRolePrompt } from "../project/config-loader.js";
import { getCrew, getCrewRole, roleLabel } from "../crews/crew-registry.js";
import { resolveProfile } from "../permissions/permission-profiles.js";
import { assertExecutableContext, resolveCwd } from "../permissions/access-policy.js";
import { loadSkills } from "../skills/skill-loader.js";
import { resolveMcpServers } from "../mcp/mcp-resolve.js";
import { writeMcpConfigFile } from "../mcp/mcp-config-writer.js";
import { runProvider, type RichProviderRunResult } from "../providers/provider-runner.js";
import {
  classifyProviderFailure,
  computeBackoffMs,
  deriveAutoFallbackProfile,
  failureExcerpt,
  parseRetryAfterMs,
  sessionRequestForRetry,
  type ProviderFailureClass,
} from "./provider-resilience.js";
import { resolveCatalog } from "../providers/provider-catalog-overlay.js";
import { capabilitiesForProvider } from "../providers/provider-catalog.js";
import type { ResolvedCatalog, SandboxMode } from "../providers/provider-apply.js";
import {
  createActionBroker,
  type ActionBroker,
  type ActionRequest,
  type ActionEvaluator,
} from "../safety/action-broker.js";
import { buildAndWriteRunAssurance } from "../safety/run-assurance.js";
import {
  recordRunInLedger,
  recordRunStartInLedger,
  LedgerStore,
  renderLedgerForPrompt,
} from "./project-ledger.js";
import {
  findLedgerFlags,
  freshFlagMatches,
  buildFlagEntries,
  renderFlagsForPrompt,
} from "./ledger-match.js";
import {
  resolveFlowParams,
  substituteParams,
} from "../flows/runtime/prompt-params.js";
import {
  ParamStore,
  seedParamsFromStore,
} from "../project/project-params.js";
import {
  renderMethodologyForPrompt,
  resolveMethodology,
  KNOWN_METHODOLOGY_IDS,
} from "./known-methodologies.js";
import {
  capturePhaseSnapshot,
  pruneOldSnapshots,
  sweepOrphanedSnapshotRefs,
  readPhaseSnapshots,
  pickSnapshotForResume,
  restorePhaseSnapshot,
  checkRestoreTarget,
  type SnapshotStage,
  type DownstreamResumeStage,
} from "./phase-snapshots.js";
import {
  snapshotWorktree,
  restoreWorktree,
  evaluateTurnDiff,
} from "../safety/diff-gate.js";
import { applyProposedPatchThroughGateway } from "../safety/apply-gateway.js";
import { selectOutputAdapter } from "../providers/adapters/select.js";
import { estimateTokensFromText, resolveCost } from "./pricing.js";
import {
  computeDailySpendUsd,
  computeDailyUsage,
  evaluateSpendCap,
} from "./spend-cap-service.js";
import { providerCapabilities } from "../providers/provider-capabilities.js";
import {
  appendStreamLine,
  ensureStreamsDir,
} from "./provider-stream-store.js";
import { localWorktreeBackend } from "../execution/local-worktree-backend.js";
import { makeDockerBackend } from "../execution/docker-backend.js";
import type { ExecutionBackend, ExecStrategy, IsolationMode } from "../execution/execution-backend-schema.js";
import {
  isGitAvailable,
  stageAndCommitAll,
  filesInCommit,
  getCurrentBranch,
  discardWorktreeChanges,
} from "../git/git.js";
import { creditTrailers } from "../git/commit-credit.js";
import { linkWorktreeEnvironment } from "../git/worktree-env.js";
import { RoadmapService } from "../roadmap/roadmap-service.js";
import { renderTaskGrounding } from "../roadmap/task-grounding.js";
import { materializeContextSources } from "./context-sources.js";
import type { ContextSource } from "./context-source-schema.js";
import {
  renderCurrentItemBrief,
  buildPriorItemsContext,
  renderItemSummaryArtifact,
  compactImplementationSummary,
  type ChecklistItemOutcome,
} from "../pickup/item-summary.js";
import { GitError, VibestrateError, describeError } from "../utils/errors.js";
import { nowIso, durationMs } from "../utils/time.js";
import { makeUniqueRunId } from "../utils/run-id.js";
// Re-exported so existing importers (server routes, workflow runner) keep
// getting `makeRunId` from here; the implementation now lives in run-id.ts.
export { makeRunId } from "../utils/run-id.js";
import type {
  ProviderRunResult,
  ProviderSessionRequest,
} from "../providers/provider-types.js";
import { MetricsStore } from "./metrics-store.js";
import { makeEmptyMetrics, roleMetricsSchema, type RoleMetrics } from "./runtime-metrics.js";
import { computeRunSpendUsd, checkSagaStopConditions } from "../feature/budget.js";
import { extractTurnInternals } from "./turn-internals.js";
import { getDiffSnapshot, getWorktreeDiffText, redactSecretsInText } from "./diff-service.js";
import { buildStepPacket, readFreshFileReads } from "../feature/packet.js";
import {
  buildSupervisorPrompt,
  parseSupervisorDecision,
  parseNewInvariants,
} from "../feature/supervisor.js";
import {
  buildEnhancePrompt,
  parseStepDiff,
  classifyAuthority,
  applyStepDiff,
  type EnhanceStep,
} from "../feature/enhance.js";
import type { Provenance } from "../roadmap/roadmap-types.js";
import { evaluateBlockPolicies } from "../orchestrator/policy-block.js";
import { classifyChangedFilesForValidation } from "./validation-scope.js";
import { protectedPathMatch } from "../orchestrator/protected-paths.js";
import {
  evaluateReviewDescent,
  type ReviewDescentDecision,
} from "./review-descent.js";
import {
  computeMergeReady,
  type ReviewSkipEvidence,
} from "./merge-readiness.js";
import { ApprovalService } from "./approval-service.js";
import {
  detectApprovalRequest,
  type ApprovalRisk,
  type ApprovalSource,
} from "./approval-types.js";
import { NotificationService } from "../notifications/notification-service.js";
import {
  draftApprovalRequested,
  draftRunCompleted,
  draftValidationFailed,
  draftSpendCapHit,
  draftBudgetLimit,
  draftProviderFailed,
} from "../notifications/notification-router.js";
import type { NotificationDraft } from "../notifications/notification-router.js";
import type { RunStatus } from "../workflow/workflow-types.js";
import { ReviewSuggestionService } from "../reviews/review-suggestion-service.js";
import type { SuggestionSource } from "../reviews/review-suggestion-types.js";
import { applyPauseIfRequested } from "./pause-service.js";
import { isTerminal, runStateSchema } from "./state-machine.js";
import { writeJson, readJson } from "../utils/json.js";
import {
  runFlowSnapshotPath,
  projectRunsDir,
  runChecklistItemArbitrationPath,
  runStatePath,
} from "../utils/paths.js";
import {
  reconstructDoneOutcomes,
  checklistIdsChanged,
} from "../pickup/resume-checklist.js";
import { readdir } from "node:fs/promises";
import {
  isGraphFlow,
  parallelGroupsOf,
  MAX_PARALLEL_FANOUT,
  type ResolvedFlowSnapshot,
  type ResolvedFlowStep,
} from "../flows/schemas/flow-schema.js";
import { defaultFlow } from "../flows/catalog/builtin-flows.js";
import type { WorkflowSelection } from "../orchestrator/select-workflow.js";
import { resolvePersona } from "../orchestrator/personas.js";
import {
  renderPersonaReviewLensEmphasis,
  isReviewerStep,
  composeReviewerStepNotes,
} from "../orchestrator/review-lenses.js";
import { renderPolicyAdviseBlock } from "../orchestrator/policy-advise.js";
import {
  isSpecUpFlow,
  renderSpecUpPostureBlock,
} from "../spec-up/spec-up-posture.js";
import { findFlowById } from "../flows/catalog/flow-discovery.js";
import {
  resolveFlow,
  resolveLoopMaxIterations,
} from "../flows/runtime/flow-resolver.js";
import {
  buildItemDecisionOutput,
  openFindingCount,
} from "../flows/runtime/per-item-verdicts.js";
import { checklistItemGapsCap } from "../safety/run-assurance.js";
import {
  buildFlowContextPacket as buildFlowContextPacketValue,
  type FlowContextOutput,
} from "../flows/runtime/flow-context-builder.js";
import {
  FlowParticipantLedgerStore,
  createFlowParticipantLedger,
  prepareFlowParticipantTurn,
  recordFlowParticipantTurn,
  summarizeFlowParticipants,
  type FlowParticipantLedger,
  type PreparedFlowParticipantTurn,
} from "../flows/runtime/flow-participant-ledger.js";
import {
  FlowArbitrationStore,
  createFlowArbitrationLedger,
  formatFlowFindingSuggestionBody,
  flowAcceptedFindingResponses,
  flowArbitrationCanonicalFindings,
  flowArbitrationCanonicalResolutions,
  flowArbitrationCanonicalResponses,
  parseFlowJsonContract,
  recordFlowArbitrationParseIssue,
  recordFlowDecision,
  recordFlowFindingResolutions,
  recordFlowFindingResponses,
  recordFlowFindings,
  renderFlowDecisionSummaryMarkdown,
  renderFlowOutputContractNotes,
  setFlowAcceptedReviewPassId,
  setFlowDecisionSummaryPath,
  setFlowFindingSuggestionId,
  type FlowArbitrationLedger,
} from "../flows/runtime/flow-arbitration.js";
import {
  flowDecisionSummaryOutputSchema,
  flowFindingResolutionsOutputSchema,
  flowFindingResponsesOutputSchema,
  flowFindingsOutputSchema,
  flowHandoffContracts,
  isFlowHandoffToken,
} from "../flows/schemas/flow-output-contracts.js";
import { SuggestionBundleService } from "../reviews/suggestion-bundle-service.js";

/** Stages a run can be rewound to. The flow runner seeds the outputs of every
 *  step before the first step at this stage from the source run, then starts
 *  there. `planning` is the flow's first stage, so resuming there is just a
 *  normal from-scratch run; the executing stages regenerate the downstream code
 *  from a fresh worktree. The DOWNSTREAM stages (reviewing/fixing/verifying)
 *  operate on existing code, so they additionally restore the source run's
 *  per-phase worktree snapshot (Rewind phase 2). */
export type ResumeStage =
  | "planning"
  | "architecting"
  | "executing"
  | "reviewing"
  | "fixing"
  | "verifying";

/** The subset that needs the source run's code restored before running. */
const DOWNSTREAM_RESUME_STAGES = new Set<ResumeStage>([
  "reviewing",
  "fixing",
  "verifying",
]);

export type ResumeFromInput = {
  /** The run whose upstream step outputs are reused (seeded) by the runner. */
  sourceRunId: string;
  fromStage: ResumeStage;
};

export type OrchestratorInput = {
  projectRoot: string;
  config: ProjectConfig;
  rules: string;
  task: string;
  isGitRepo: boolean;
  onProgress?: (message: string) => void;
  /** Raw flow parameter values (T11), name -> string, from the caller (CLI
   *  flags / dashboard form / interactive prompts). Resolved against the flow's
   *  declared `params` at run start, substituted into the task + step
   *  instructions, and recorded (secrets redacted). */
  params?: Record<string, string>;
  /** Optional roadmap task this run is bound to. Persisted on state.json + events. */
  taskId?: string | null;
  /** Pre-assigned run id (dashboard spawns compute it server-side so the UI
   * can navigate to the run immediately). Omitted = derive from the task. */
  runId?: string | null;
  /** Crew to resolve the flow against. null = project.defaultCrew. Ignored when
   * an already-resolved `flow` snapshot is supplied (it carries its own crew). */
  crewId?: string | null;
  /** Run-wide Profile override applied to every seated step at resolve time. */
  profileOverride?: string | null;
  /** Per-step Profile overrides (step id → profile id) applied at resolve time. */
  stepProfileOverrides?: Record<string, string>;
  /** Pin a Role to a Seat (seat → roleId) - disambiguates a seat filled by
   *  more than one Crew role. Applied at resolve time. */
  seatRoleOverrides?: Record<string, string>;
  /** Investigation-only run: force readOnly permissions on every agent,
   * skip the executor / fix loop entirely, refuse write-side actions. */
  readOnly?: boolean;
  /** Unattended run: never pause for a human. Forces budget `onLimit` to stop
   * and resilience `onExhausted` to fail, so the run always reaches a terminal
   * state on its own even if pause is configured. */
  unattended?: boolean;
  /** Skill ids to attach to every agent for this single run, merged
   * (deduped) with the agent's configured skill list. Empty / omitted
   * means "use the agent's configured skills only". */
  runtimeSkills?: string[];
  /** Brevity directive applied to every agent prompt for this run. */
  concise?: boolean;
  /** Immutable resolved flow recipe to run. When omitted, the orchestrator
   * resolves the built-in `default` flow - every run executes a flow through
   * the one runner. */
  flow?: ResolvedFlowSnapshot | null;
  /** Rewind: fork a fresh run that resumes at a chosen stage, reusing the
   *  upstream artifacts from a prior run instead of regenerating them.
   *  Mutually exclusive with `flow`. */
  resumeFrom?: ResumeFromInput | null;
  /** Pick-up execution (Phase 3): when the linked task has a checklist and the
   *  flow declares a checklistSegment, iterate the segment once per item.
   *  "continuous" runs items back-to-back; "step" pauses between items. null /
   *  omitted = no checklist iteration (the instant-task N=1 case). */
  checklistMode?: "continuous" | "step" | null;
  /** Saga mode (Phase 2 Conductor): when the linked task is `kind:"saga"`, run
   *  the checklist band as a supervised saga - a step that exhausts self-heal
   *  halts the run cleanly instead of committing a green-but-broken item, and
   *  each step starts a fresh model context. Set by the saga launch path. */
  sagaMode?: boolean;
  /** Per-saga budget envelope (Phase 2 Conductor, M4): bounds the saga's TOTAL
   *  cost/length, enforced BETWEEN steps (see src/feature/budget.ts). Null
   *  fields mean no limit on that axis. The launch path sets it from
   *  `task.sagaBudget`; defaults to no limits. */
  sagaBudget?: { maxSpendUsd: number | null; maxSteps: number | null };
  /** Saga supervisor (Phase 2b, M3): the between-steps PROCEED/ESCALATE turn +
   *  invariants ledger. The launch path sets it from `config.saga.supervisor`;
   *  defaults to enabled on the `reviewer` role with the role's own profile. */
  sagaSupervisor?: { enabled: boolean; profile: string | null; roleId: string };
  /** Context sources (Phase 4): files/URLs materialized once at run start and
   *  injected into every agent's prompt (path-guarded / SSRF-guarded + secret
   *  redacted). */
  contextSources?: ContextSource[];
  /** How this run's Flow was chosen (forced / default / orchestrator-selected).
   *  Recorded for transparency: persisted as `selection.json` + a
   *  `workflow.selected` event at run start. Does not affect execution - the
   *  launcher has already resolved `flow` from it. */
  selection?: WorkflowSelection | null;
  /** The resolved supervisor persona id, independent of `selection` so it survives
   *  the resume path (where `selection` is null because the flow is fixed by the
   *  source run). The launcher passes `spec.persona ?? selection?.personaId`. */
  personaId?: string | null;
  /** Adaptive spec-up (P1): the flow the chain should BUILD after spec-up. Set on a
   *  spec-up-phase run (intake/spec-up) so the chosen flow is carried across the
   *  detached chain; persisted as the `spec-up-target-flow.json` sidecar at run
   *  start and read by the `approve & build` handoff. null = no build target. */
  specUpTargetFlowId?: string | null;
  /** Deep-questioning loop: the round this intake run represents + the chain-root
   *  run id (where accumulated answers live). Persisted as `spec-up-round.json` /
   *  `spec-up-root-run.json` sidecars at run start, read by the spec-up-chain. */
  specUpRound?: number | null;
  specUpRootRunId?: string | null;
  /** Permission mode (T14 P4): read-only / ask / accept-edits / auto. The
   *  model-agnostic policy Vibestrate applies to this run's writes. Omitted ⇒
   *  config.policies.defaultPermissionMode (default "auto"). */
  permissionMode?: PermissionMode;
  /** Per-run isolation override (Slice 2b posture-applies): when set, it raises
   *  this run's OS-sandbox posture above `config.execution.isolation` for this run
   *  only (never lowers; never mutates config). Today only "sandboxed". Omitted ⇒
   *  use the config value. */
  isolationOverride?: IsolationMode | null;
  /** Human-facing notes about an auto-applied posture (Slice 2b): what was applied
   *  or why it was suppressed. Surfaced once at run start; empty ⇒ nothing applied. */
  postureNotes?: string[];
  /** CLI/process lifecycle signal. Aborting it kills the active provider
   * invocation and records the run as aborted instead of leaving orphan CLIs. */
  abortSignal?: AbortSignal;
};

export type OrchestratorOutput = {
  runId: string;
  state: RunState;
  worktreePath: string | null;
  branchName: string | null;
  finalReportPath: string;
  policyWarnings: PolicyWarning[];
};

type RoleRunResult = {
  roleId: string;
  output: string;
  outputArtifactPath: string;
  promptArtifactPath: string;
  providerResult: RichProviderRunResult;
};

type FlowRoleTurn = {
  seat: string;
  contextMode: PreparedFlowParticipantTurn["contextMode"];
  fallbackReason: string | null;
  sessionRequest?: ProviderSessionRequest;
};

class __ApprovalRejectedSignal extends Error {
  constructor() {
    super("Run blocked after approval rejected");
    this.name = "ApprovalRejectedSignal";
  }
}

class __RunAbortedSignal extends Error {
  constructor() {
    super("Run aborted by user signal");
    this.name = "RunAbortedSignal";
  }
}

/** Thrown when the daily spend cap is hit and the action is (or falls back to)
 *  "stop" - the run() loop catches it and blocks the run with this message. */
class __SpendCapStopSignal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpendCapStopSignal";
  }
}

/** Thrown when the Action Broker denies (or requires unavailable approval for)
 *  a proposed effect. Fail-closed: the run() loop catches it and blocks the
 *  run rather than failing it - the decision is already recorded as evidence. */
class __ActionDeniedSignal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionDeniedSignal";
  }
}

/**
 * Permission mode (T14 P4) as broker evaluators, scoped to the run-level effects
 * Vibestrate actually owns (NOT per-shell-command - codex is opaque, claude
 * tool_use is display-only):
 *  - ask: every turn diff (file.patch) requires human approval before it's kept.
 *  - accept-edits: writes auto-apply, but the run does NOT auto-complete - it
 *    HOLDS at the completion boundary (require_approval on run.complete) for human
 *    sign-off and RESUMES to merge_ready on approval (reject / unattended-timeout
 *    -> blocked). See the run.complete handler in runFlowSequence.
 *  - auto / read-only: none here (read-only is the readOnly clamp).
 */
export function permissionModeEvaluators(mode: PermissionMode): ActionEvaluator[] {
  if (mode === "ask") {
    return [
      (req) =>
        req.kind === "file.patch"
          ? {
              effect: "require_approval",
              ruleIds: ["permission-mode.ask"],
              reason: "Permission mode 'ask': a human approves each change.",
            }
          : null,
    ];
  }
  if (mode === "accept-edits") {
    return [
      (req) =>
        req.kind === "run.complete"
          ? {
              effect: "require_approval",
              ruleIds: ["permission-mode.accept-edits"],
              reason:
                "Permission mode 'accept-edits': the run holds for human review (the applied diff) before it can be merged.",
            }
          : null,
    ];
  }
  return [];
}

/** Thrown when a count/time budget ceiling is hit (unattended-resilience U1).
 *  Like the spend cap, the run() loop catches it and blocks the run (not fails)
 *  - hitting a configured ceiling is an intentional stop, not an error. */
class __BudgetLimitSignal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetLimitSignal";
  }
}

/** Control-flow signals that must ALWAYS propagate - they are not ordinary
 *  step failures and must never be swallowed by continueOnError (Slice 5). An
 *  aborted/approval-rejected/spend-capped/denied run has to unwind regardless. */
function __isControlSignal(err: unknown): boolean {
  return (
    err instanceof __ApprovalRejectedSignal ||
    err instanceof __RunAbortedSignal ||
    err instanceof __SpendCapStopSignal ||
    err instanceof __ActionDeniedSignal ||
    err instanceof __BudgetLimitSignal
  );
}

function summarizeApprovals(
  approvals: import("./approval-types.js").ApprovalRequest[],
): {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  expired: number;
  totalWaitMs: number;
} {
  let pending = 0;
  let approved = 0;
  let rejected = 0;
  let expired = 0;
  let totalWaitMs = 0;
  for (const a of approvals) {
    switch (a.status) {
      case "pending":
        pending += 1;
        break;
      case "approved":
        approved += 1;
        break;
      case "rejected":
        rejected += 1;
        break;
      case "expired":
        expired += 1;
        break;
    }
    if (a.resolvedAt) {
      totalWaitMs +=
        Date.parse(a.resolvedAt) - Date.parse(a.createdAt) || 0;
    }
  }
  return {
    total: approvals.length,
    pending,
    approved,
    rejected,
    expired,
    totalWaitMs,
  };
}

function flowFindingSuggestionTitle(
  finding: import("../flows/schemas/flow-output-contracts.js").FlowFinding,
): string {
  const prefix = `Quality Arbitration ${finding.id}: `;
  const claim = finding.claim.replace(/\s+/g, " ").trim();
  return `${prefix}${claim}`.slice(0, 200);
}

export class Orchestrator {
  private readonly projectRoot: string;
  private readonly config: ProjectConfig;
  /** Resolved capability catalog (built-in + project overlay), loaded once. */
  private resolvedCatalog: ResolvedCatalog | null = null;
  /** Dedupe key set for the "effort won't take effect" warning (per provider+effort). */
  private readonly warnedEffort = new Set<string>();
  /** Dedupe key set for the "isolation requested but no provider sandbox" warning (per provider). */
  private readonly warnedSandbox = new Set<string>();
  private readonly rules: string;
  private task: string;
  private readonly rawParams: Record<string, string>;
  /** Resolved param values to persist on state (secrets redacted). */
  private recordedParams: Record<string, string | number | boolean> = {};
  private readonly isGitRepo: boolean;
  private readonly onProgress: (message: string) => void;
  private readonly taskId: string | null;
  private readonly preassignedRunId: string | null;
  private readonly crewId: string | null;
  private readonly profileOverride: string | null;
  private readonly stepProfileOverrides: Record<string, string>;
  private readonly seatRoleOverrides: Record<string, string>;
  /** Crew the active flow snapshot was resolved against; set in run(). Used by
   *  runRole to look up the resolved Role's config (prompt/permissions/skills). */
  private activeCrewId: string | null = null;
  /** Action Broker for this run; set in run(). Every real effect (S0: provider
   *  spawn) is decided + recorded through it. Null only before run() is called. */
  private broker: ActionBroker | null = null;
  /** One-time guard so the spend warning fires once per run, not every turn. */
  private spendWarned = false;
  // Count/time budget ceilings (U1): agent turns started in this run, and the
  // run's wall-clock anchor (set lazily on the first turn).
  private turnsStarted = 0;
  private runStartMs: number | null = null;
  // Spend-cap action override (U4): set once when the daily $ cap is hit with a
  // continue-action, then applied to every subsequent turn (downgrade -> switch
  // to the cheaper fallback Profile; reduce-effort -> minimum effort). The hard
  // count/time ceilings remain the ultimate stop.
  private budgetOverride:
    | { kind: "downgrade"; profileId: string }
    | { kind: "reduce-effort" }
    | null = null;
  // onLimit: pause (U5) - once a human approves continuing past a ceiling, don't
  // re-pause every turn for the rest of the run.
  private budgetCeilingAcknowledged = false;
  private readonly readOnly: boolean;
  private readonly unattended: boolean;
  private readonly runtimeSkills: string[];
  private readonly concise: boolean;
  private readonly flow: ResolvedFlowSnapshot | null;
  private readonly resumeFrom: ResumeFromInput | null;
  private readonly checklistMode: "continuous" | "step" | null;
  private readonly sagaMode: boolean;
  private readonly sagaBudget: { maxSpendUsd: number | null; maxSteps: number | null };
  private readonly sagaSupervisor: { enabled: boolean; profile: string | null; roleId: string };
  private readonly contextSources: ContextSource[];
  /** Materialized once at run start; merged into every role's prior artifacts. */
  private materializedContext: PriorArtifact[] = [];
  /** Pre-rendered + redacted continuity-ledger block (T9), loaded once at run
   *  start and injected into the PLANNER turn (the planning context) so a fresh
   *  run picks up where the project stands. "" when the ledger is empty. */
  private ledgerPromptBlock = "";
  /** Pre-rendered persona review-lens emphasis block (orchestrator-personas.md
   *  follow-up), computed once at run start from the active persona's
   *  `reviewLenses` (closed vocabulary) and appended to independent-reviewer turns
   *  so switching persona changes what the reviewers scrutinise. null = the
   *  persona declared no known lens, so review turns are byte-identical to before. */
  private reviewLensEmphasis: string | null = null;
  /** Pre-rendered persona spec-up posture block (spec-up-phase.md), computed once
   *  at run start from the active persona's `specUpPosture` and appended to the
   *  spec-up phase's planning turns so a persona aims intake/scope/spec/architecture.
   *  null = not a spec-up run, or the persona declared no posture (turns unchanged). */
  private specUpPostureBlock: string | null = null;
  /** Pre-rendered project-policy advise block (policy-advise.ts), computed once at
   *  run start from the project's confirmed advise policies and appended to lensed
   *  reviewer turns so a model verifies the change against them. null = no
   *  confirmed/in-scope policies (review turns byte-identical to before). */
  private policyAdviseBlock: string | null = null;
  /** Pre-rendered "# Continuity flags" block (T9) for THIS run's task - the
   *  suspected dup/conflict heads-up. Injected into the planner turn alongside
   *  the ledger block. "" when nothing was flagged. */
  private ledgerFlagsBlock = "";
  /** Pre-rendered "# Methodology" block (durable-memory Slice 4): the project's
   *  selected methodology (`vibe params set methodology=tdd`) as bounded planning
   *  guidance. Injected into the PLANNER turn alongside the ledger. "" when unset
   *  or set to an unknown value. */
  private methodologyBlock = "";
  /** One-shot guard so the ledger + flags blocks go to a single planner turn. */
  private ledgerInjected = false;
  private readonly abortSignal: AbortSignal | null;
  private readonly selection: WorkflowSelection | null;
  /** The active supervisor persona id, resolved from selection OR (on resume, where
   *  selection is null) the carried `spec.persona`. The single source for persona
   *  resolution so reviewLens + specUpPosture fire on resumed runs too. */
  private readonly personaId: string | null;
  private readonly specUpTargetFlowId: string | null;
  private readonly specUpRound: number | null;
  private readonly specUpRootRunId: string | null;
  /** Container/cloud execution strategy (T14 slice 2), set at run startup when
   *  execution.backend runs turns off-host. null ⇒ host execution. */
  private execStrategy: ExecStrategy | null = null;
  /** Backend teardown (e.g. `docker rm -f`), run when the flow finishes. */
  private containerTeardown: (() => Promise<void>) | null = null;
  /** Permission mode (T14 P4) governing this run's writes. */
  private readonly permissionMode: PermissionMode;
  /** Per-run isolation override (Slice 2b): raises the OS-sandbox posture for this
   *  run only. null ⇒ use config.execution.isolation. */
  private readonly isolationOverride: IsolationMode | null;
  /** Notes about an auto-applied posture, surfaced once at run start. */
  private readonly postureNotes: string[];

  constructor(input: OrchestratorInput) {
    this.projectRoot = input.projectRoot;
    this.config = input.config;
    this.rules = input.rules;
    this.task = input.task;
    this.rawParams = input.params ?? {};
    this.isGitRepo = input.isGitRepo;
    this.onProgress = input.onProgress ?? (() => {});
    this.taskId = input.taskId ?? null;
    this.preassignedRunId = input.runId ?? null;
    this.crewId = input.crewId ?? null;
    this.profileOverride = input.profileOverride ?? null;
    this.stepProfileOverrides = input.stepProfileOverrides ?? {};
    this.seatRoleOverrides = input.seatRoleOverrides ?? {};
    this.readOnly = input.readOnly ?? false;
    this.unattended = input.unattended ?? false;
    this.runtimeSkills = Array.from(new Set(input.runtimeSkills ?? []));
    this.concise = input.concise ?? false;
    this.flow = input.flow ?? null;
    // Safety clamp (root cause): a resolved flow with no write step (no step
    // emits a `diff`, e.g. spec-up-intake / plan-only) must NEVER run write-capable
    // - on EVERY launch path. run-launcher clamps too; this also covers the
    // direct `vibe run` adaptive-spec-up path, which resolves spec-up-intake without
    // going through the launcher's clamp. The real guard is this clamp, not the
    // mere absence of write steps (a write-capable profile can still touch disk).
    if (
      this.flow &&
      !this.flow.steps.some((s) => (s.outputs ?? []).includes("diff"))
    ) {
      this.readOnly = true;
    }
    // Permission mode (T14 P4). "read-only" forces the read-only clamp (no write
    // grant on any seat) - the honest model-agnostic no-write guarantee. The
    // ask/accept-edits approval policy is wired into the broker at run start.
    this.permissionMode = input.permissionMode ?? input.config.policies.defaultPermissionMode ?? "auto";
    // --read-only (the legacy flag / a no-diff flow) is the STRICTER guarantee, so
    // it wins over a weaker explicit mode: resolve to read-only rather than ship
    // an incoherent "auto mode but readOnly clamp on" state.
    if (this.readOnly) {
      this.permissionMode = "read-only";
    }
    if (this.permissionMode === "read-only") {
      this.readOnly = true;
    }
    // Posture-applies (Slice 2b): a per-run isolation override that only ever
    // RAISES the OS sandbox (never lowers); claude seats degrade per-seat at
    // runtime. Notes are surfaced once at run start.
    this.isolationOverride = input.isolationOverride ?? null;
    this.postureNotes = input.postureNotes ?? [];
    this.resumeFrom = input.resumeFrom ?? null;
    this.checklistMode = input.checklistMode ?? null;
    this.sagaMode = input.sagaMode ?? false;
    this.sagaBudget = input.sagaBudget ?? { maxSpendUsd: null, maxSteps: null };
    this.sagaSupervisor = input.sagaSupervisor ?? {
      enabled: true,
      profile: null,
      roleId: "reviewer",
    };
    this.contextSources = input.contextSources ?? [];
    this.abortSignal = input.abortSignal ?? null;
    this.selection = input.selection ?? null;
    this.specUpTargetFlowId = input.specUpTargetFlowId ?? null;
    this.specUpRound = input.specUpRound ?? null;
    this.specUpRootRunId = input.specUpRootRunId ?? null;
    this.personaId = input.personaId ?? input.selection?.personaId ?? null;
  }

  /** Resolve the `default` flow against this run's config. Used when a run
   *  doesn't pick an explicit flow - a plain `vibe run` executes the default
   *  flow through the same runner as every other flow. A project may fork + edit
   *  the default (`.vibestrate/flows/default`); that shadows the builtin here too, so
   *  editing the default actually takes effect for plain runs. Falls back to the
   *  builtin. Throws if the configured roles/providers can't satisfy it. */
  private async resolveDefaultFlow(): Promise<ResolvedFlowSnapshot> {
    const discovered = await findFlowById(this.projectRoot, defaultFlow.id);
    const persona = resolvePersona(this.config, this.personaId);
    return resolveFlow({
      flow: discovered?.definition ?? defaultFlow,
      source: discovered?.source ?? { kind: "builtin", ref: defaultFlow.id },
      config: this.config,
      task: this.task,
      crewId: this.crewId,
      profileOverride: this.profileOverride,
      stepProfileOverrides: this.stepProfileOverrides,
      seatRoleOverrides: this.seatRoleOverrides,
      reviewerProfile: persona.config.reviewerProfile ?? null,
    });
  }

  /** Pick the execution backend from config. Unknown/unimplemented backends fall
   *  back to local-worktree (host) rather than silently pretending to sandbox. */
  private selectExecutionBackend(): ExecutionBackend {
    if ((this.config.execution?.backend ?? "local-worktree") === "docker") {
      const c = this.config.execution?.container;
      return makeDockerBackend({
        image: c?.image ?? "node:22-bookworm-slim",
        onUnavailable: c?.onUnavailable ?? "fail",
      });
    }
    return localWorktreeBackend;
  }

  /** Tear down the disposable container (T14 slice 2), idempotent. MUST run on
   *  any throw once the container exists, not only on a flow-end throw - else a
   *  failure between container creation and the flow leaks a container with the
   *  worktree (RW) + provider credential (RO) still mounted. */
  private async teardownContainer(): Promise<void> {
    if (this.containerTeardown) {
      const t = this.containerTeardown;
      this.containerTeardown = null;
      await t().catch(() => {});
    }
  }

  async run(): Promise<OrchestratorOutput> {
    if (!(await isGitAvailable())) {
      throw new GitError("git is not available on PATH.");
    }

    const policy = await runPreflightChecks({
      projectRoot: this.projectRoot,
      config: this.config,
      isGitRepo: this.isGitRepo,
    });

    // Every run executes a flow. An explicit `--flow` snapshot wins; otherwise
    // the `default` flow is resolved here. There is one runner.
    let flow = this.flow ?? (await this.resolveDefaultFlow());

    // ── Flow parameters (T11) + durable param memory (Profiling) ───────────
    // Seed the caller's explicit values with the durable project profile and
    // `VIBESTRATE_PARAM_*` env, WITHOUT overwriting anything explicit, so the
    // precedence is: explicit (--param / body.params) > env > project profile >
    // flow default > prompt / fail-fast. Then resolve against the flow's declared
    // `params`, fail fast on missing-required / bad values, and substitute
    // {{params.x}} into the task + each step's instructions (a secret renders a
    // placeholder, never the value). Recorded values (secrets redacted) land on
    // run state. Both the CLI and the dashboard reach this single chokepoint (the
    // server route spawns `vibe run`), so seeding here covers every run.
    let seededParams = this.rawParams;
    if (flow.params && Object.keys(flow.params).length > 0) {
      const profile = await new ParamStore(this.projectRoot).read();
      seededParams = seedParamsFromStore(
        flow.params,
        flow.flowId,
        this.rawParams,
        profile,
      );
    }
    const resolvedParams = resolveFlowParams(flow.params, seededParams);
    if (resolvedParams.errors.length > 0) {
      throw new GitError(`Flow parameter error: ${resolvedParams.errors.join(" ")}`);
    }
    if (resolvedParams.missing.length > 0) {
      throw new GitError(
        `Missing required flow parameter(s): ${resolvedParams.missing.join(
          ", ",
        )}. Provide each with --param <name>=<value>, persist them once with ` +
          `\`vibe profile set --flow ${flow.flowId} <name>=<value>\`, or export ` +
          `VIBESTRATE_PARAM_<NAME> (the CI path - never hangs unattended).`,
      );
    }
    if (Object.keys(resolvedParams.substitution).length > 0) {
      this.task = substituteParams(this.task, resolvedParams.substitution);
      flow = {
        ...flow,
        task: substituteParams(flow.task, resolvedParams.substitution),
        steps: flow.steps.map((s) =>
          s.instructions
            ? { ...s, instructions: substituteParams(s.instructions, resolvedParams.substitution) }
            : s,
        ),
      };
    }
    this.recordedParams = resolvedParams.recorded;
    // runRole resolves the Role's config from the Crew the snapshot was built
    // against - not necessarily this.crewId (a pre-resolved snapshot carries its
    // own crew).
    this.activeCrewId = flow.crewId;

    const runId =
      this.preassignedRunId ??
      makeUniqueRunId(this.projectRoot, this.config.git.worktreeDir);

    const artifactStore = new ArtifactStore(this.projectRoot, runId);
    const stateStore = new RunStateStore(this.projectRoot, runId);
    const eventLog = new EventLog(this.projectRoot, runId);
    const metricsStore = new MetricsStore(this.projectRoot, runId);
    const approvalService = new ApprovalService(this.projectRoot, runId);
    this.broker = createActionBroker(this.projectRoot, runId, {
      evaluators: permissionModeEvaluators(this.permissionMode),
    });
    const notifications = new NotificationService(this.projectRoot);
    const notify = (draft: NotificationDraft): void => {
      // Fire-and-forget: gateway delivery never blocks the orchestrator and
      // never bubbles errors. Failed delivery is recorded as a receipt.
      void notifications.notify(draft).catch(() => {});
    };
    // Stash for private methods (maybeAwaitApproval, etc.) so they can fire
    // notifications without the call sites threading the closure through.
    (this as unknown as { _notify?: typeof notify })._notify = notify;
    await artifactStore.init();
    await metricsStore.write(
      makeEmptyMetrics({
        runId,
        task: this.task,
        startedAt: nowIso(),
      }),
    );

    let state = createInitialState({
      runId,
      task: this.task,
      projectRoot: this.projectRoot,
      worktreePath: null,
      branchName: null,
      // Display value only (final report's "max"). The real budget is the
      // resolved snapshot's loop.maxIterations (which already has any crew
      // override + global ceiling baked in by resolveFlow) - mirror it so the
      // report can never disagree with what actually ran. Falls back to 2 only
      // for a loop-less flow with no global ceiling (the global is now opt-in).
      maxReviewLoops: flow.loop?.maxIterations ?? this.config.workflow.maxReviewLoops ?? 2,
    });
    // Persist the run-level Crew/Profile choices. The exact per-step
    // profile/provider resolution lives in flow.json (the immutable snapshot).
    // Read-only runs are stamped too - every subsequent enforcement (route
    // guards, executor short-circuit) reads from state.readOnly.
    state = {
      ...state,
      taskId: this.taskId,
      crewId: flow.crewId,
      profileOverride: this.profileOverride,
      stepProfileOverrides: this.stepProfileOverrides,
      seatRoleOverrides: this.seatRoleOverrides,
      runtimeSkills: this.runtimeSkills,
      concise: this.concise,
      readOnly: this.readOnly,
      permissionMode: this.permissionMode,
      params: this.recordedParams,
      checklistMode: this.checklistMode,
      sagaMode: this.sagaMode,
      sagaBudget: this.sagaBudget,
      contextSources: this.contextSources,
      flow: this.createFlowRunState(flow, "flow.json"),
      resumedFrom: this.resumeFrom
        ? {
            sourceRunId: this.resumeFrom.sourceRunId,
            fromStage: this.resumeFrom.fromStage,
          }
        : null,
    };
    await writeJson(runFlowSnapshotPath(this.projectRoot, runId), flow);
    await stateStore.write(state);
    // Project memory (Slice 3): record this run's goal as an open intent at
    // start, so STATE.md shows what's in flight / not yet shipped. Skips
    // read-only investigations; a resumed run carries the source run's intent
    // forward. Best-effort - the ledger is advisory.
    try {
      await recordRunStartInLedger(this.projectRoot, runId, nowIso(), {
        task: state.task,
        displayName: state.displayName,
        readOnly: state.readOnly,
        resumeFromSourceRunId: state.resumedFrom?.sourceRunId ?? null,
      });
    } catch {
      // ledger is advisory; swallow.
    }
    await eventLog.append({
      type: "run.created",
      message: `Run ${runId} created.`,
      data: {
        task: this.task,
        taskId: this.taskId,
        crewId: flow.crewId,
        profileOverride: this.profileOverride,
        stepProfileOverrides: this.stepProfileOverrides,
        readOnly: this.readOnly,
      },
    });
    // OPT-IN snapshot retention (ISSUE-001 #1). Vibestrate never prunes on its
    // own (default 0 = off). When the USER has set a positive retention, run this
    // their-configured automation at run start (not finalize, so a prior run that
    // crashed or was killed still gets reclaimed on the next run). Keyed on
    // snapshot recency, so recent runs stay resumable.
    const snapshotKeep = this.config.git.snapshotRetentionRuns;
    if (snapshotKeep > 0) {
      const pruned = await pruneOldSnapshots(this.projectRoot, snapshotKeep);
      if (pruned.length > 0) {
        await eventLog.append({
          type: "run.snapshot.pruned",
          message: `Pruned rewind snapshots for ${pruned.length} old run(s) beyond the ${snapshotKeep}-run retention window.`,
          data: { prunedRuns: pruned.length, keepRuns: snapshotKeep },
        });
      }
      // Also reclaim refs orphaned out-of-band (a run dir removed manually) -
      // they can never be rewound, so they're pure git clutter. Rides the SAME
      // opt-in (only when the user enabled retention); never a behind-the-back
      // purge. ISSUE-001 P1.
      //
      // FAIL CLOSED on the run-dir read: a real readdir (not the error-swallowing
      // readDirSafe), and ANY failure - or an empty result - skips the sweep.
      // An unknown/empty run-set must never be read as "every ref is an orphan"
      // (that would wipe live runs' snapshots). The current run's dir always
      // exists here, so a healthy read is never empty.
      let existingRunIds: Set<string> | null = null;
      try {
        existingRunIds = new Set(await readdir(projectRunsDir(this.projectRoot)));
      } catch {
        existingRunIds = null; // couldn't enumerate runs -> do not sweep
      }
      if (existingRunIds && existingRunIds.size > 0) {
        const sweptOrphans = await sweepOrphanedSnapshotRefs(this.projectRoot, existingRunIds);
        if (sweptOrphans.length > 0) {
          await eventLog.append({
            type: "run.snapshot.pruned",
            message: `Reclaimed rewind snapshots for ${sweptOrphans.length} deleted run(s) (run directory gone).`,
            data: { orphanedRuns: sweptOrphans.length, reason: "run-dir-gone" },
          });
        }
      }
    }
    await eventLog.append({
      type: "flow.snapshot.written",
      message: `Resolved flow ${flow.flowId} snapshot persisted.`,
      data: {
        flowId: flow.flowId,
        flowVersion: flow.flowVersion,
        snapshotPath: "flow.json",
      },
    });
    if (this.readOnly) {
      await eventLog.append({
        type: "policy.warning",
        message:
          "Read-only run: write, validation, and verify steps are skipped. Every role is forced to the read-only permission profile. Apply/validate/revert routes are refused.",
        data: { kind: "read-only-run" },
      });
    }

    for (const w of policy.warnings) {
      await eventLog.append({
        type: "policy.warning",
        message: w.message,
        data: { code: w.code },
      });
    }

    await artifactStore.write("00-idea.md", `# Task\n\n${this.task}\n`);

    // Adaptive spec-up (P1): record the flow this spec-up-phase run should BUILD once its
    // spec is approved. The chain is detached runs glued by artifacts, so the
    // chosen flow id rides as a small sidecar (read by readSpecUpQuestions and the
    // `approve & build` handoff) - no run-state schema change, no durable pause.
    if (this.specUpTargetFlowId) {
      await artifactStore.writeJson("spec-up-target-flow.json", {
        flowId: this.specUpTargetFlowId,
      });
    }

    // Deep-questioning loop: persist the server-owned round counter + the chain
    // root (where accumulated answers live), so the next gap-check round resolves
    // them from disk - never from the model or the request body.
    if (this.specUpRound !== null) {
      await artifactStore.writeJson("spec-up-round.json", { round: this.specUpRound });
    }
    if (this.specUpRootRunId) {
      await artifactStore.writeJson("spec-up-root-run.json", {
        rootRunId: this.specUpRootRunId,
      });
    }
    // specUpPosture: persist the active persona id on a spec-up run so the next
    // chain link (a fresh detached run that carries neither persona nor root id on
    // its spec) can read it back and aim its planning agents with the same persona.
    // Fail-safe: if it's missing/unreadable, the next link falls back to the default
    // persona (no posture injected) - never a corruption.
    if (isSpecUpFlow(flow.flowId) && this.personaId) {
      await artifactStore.writeJson("spec-up-persona.json", {
        personaId: this.personaId,
      });
    }

    // Record how this run's Flow was chosen, but only for an actual orchestrator
    // judgment (LLM `selected`, persona `supervisor-upgraded`, or the A1
    // `sized` route) - a forced/default run's flow is already in flow.json, so
    // we add no extra artifact/event there (keeps normal runs unchanged).
    if (
      this.selection &&
      (this.selection.source === "selected" ||
        this.selection.source === "supervisor-upgraded" ||
        this.selection.source === "sized" ||
        this.selection.source === "spec-up" ||
        // Adaptive spec-up (P1): a needs-spec-up run is an orchestrator judgment
        // worth recording even on the `default`/`forced` source, so the
        // dashboard can narrate "spec'd up first, then builds with <flow>".
        this.selection.needsSpecUp === true)
    ) {
      await artifactStore.writeJson("selection.json", this.selection);
      await eventLog.append({
        type: "workflow.selected",
        message: `Flow "${this.selection.flowId}" (${this.selection.source})`,
        data: {
          flowId: this.selection.flowId,
          crewId: this.selection.crewId,
          source: this.selection.source,
          confidence: this.selection.confidence,
          reasons: this.selection.reasons,
          risks: this.selection.risks,
          posture: this.selection.posture,
        },
      });
    }
    // The active supervisor persona (orchestrator-personas.md): always recorded
    // for transparency, and the upgrade-only flow bias when it fired.
    if (this.selection?.personaId) {
      await eventLog.append({
        type: "persona.selected",
        message: `Supervisor persona "${this.selection.personaId}"`,
        data: { personaId: this.selection.personaId },
      });
    }
    if (this.selection?.personaUpgrade) {
      const up = this.selection.personaUpgrade;
      await eventLog.append({
        type: "persona.upgraded",
        message: `Supervisor upgraded ${up.from} -> ${up.to} (risk signal: ${up.signals.join(", ")})`,
        data: {
          personaId: this.selection.personaId ?? null,
          from: up.from,
          to: up.to,
          signals: up.signals,
        },
      });
    }
    // The cost lever is a recorded judgment, never silent (adversarial
    // review): when the persona's reviewerProfile actually pinned review
    // seats, say so - the panel feed and the audit both show it.
    {
      const personaForRun = resolvePersona(this.config, this.personaId);
      const rp = personaForRun.config.reviewerProfile ?? null;
      const pinned = rp
        ? flow.steps.filter((st) => st.profileId === rp && st.seat).map((st) => st.id)
        : [];
      if (rp && pinned.length > 0) {
        await eventLog.append({
          type: "supervisor.reviewer_profile",
          message: `Supervisor pinned review seat(s) to profile "${rp}" (${pinned.join(", ")}).`,
          data: { personaId: personaForRun.id, reviewerProfile: rp, steps: pinned },
        });
      }
      // reviewLens emphasis (orchestrator-personas.md follow-up): map the persona's
      // declared lenses through the closed vocabulary and stash the block for
      // injection into reviewer turns. Recorded as evidence (behavioral-or-cut):
      // the audit shows which lenses aimed the review, and which lens strings were
      // ignored (unknown -> never injected).
      const lensEmphasis = renderPersonaReviewLensEmphasis(
        personaForRun.config.reviewLenses ?? [],
      );
      this.reviewLensEmphasis = lensEmphasis?.block ?? null;
      if (lensEmphasis) {
        await eventLog.append({
          type: "supervisor.review_lenses",
          message: `Supervisor "${personaForRun.config.label}" aims review through: ${lensEmphasis.known.join(", ")}.`,
          data: {
            personaId: personaForRun.id,
            lenses: lensEmphasis.known,
            ignored: lensEmphasis.unknown,
          },
        });
      }
      // Project policies, advise tier (policy-advise.ts): render the project's
      // confirmed, in-scope advise policies into a block appended to lensed reviewer
      // turns so a model verifies the change against them - the active persona (ANY
      // persona) is the enforcer; the rules belong to the project, not the persona.
      // Trust gate: an unconfirmed entry is inert (its text never reaches a prompt).
      const adviseSelection = renderPolicyAdviseBlock(
        this.config.projectPolicies ?? [],
        { activeLenses: lensEmphasis?.known ?? [] },
      );
      this.policyAdviseBlock = adviseSelection?.block ?? null;
      if (adviseSelection) {
        await eventLog.append({
          type: "supervisor.policy_advise",
          message: `Supervisor "${personaForRun.config.label}" checks ${adviseSelection.injected.length} project policy(ies) in review.`,
          data: {
            personaId: personaForRun.id,
            policies: adviseSelection.injected.map((p) => p.id),
            droppedForCap: adviseSelection.droppedForCap,
          },
        });
      }
      // specUpPosture (spec-up-phase.md): on a spec-up phase run, aim the planning
      // agents through the persona's CTO posture. Free text (planning trust class:
      // committed config, never remotely sourced; it also reaches the spec-up-review
      // turn, but that decision gates only a read-only, no-diff terminal status, not
      // a code merge). Recorded as evidence.
      if (isSpecUpFlow(flow.flowId)) {
        const postureBlock = renderSpecUpPostureBlock(personaForRun.config.specUpPosture ?? null);
        this.specUpPostureBlock = postureBlock;
        if (postureBlock) {
          await eventLog.append({
            type: "supervisor.spec_up_posture",
            message: `Supervisor "${personaForRun.config.label}" aims the spec-up phase.`,
            data: { personaId: personaForRun.id },
          });
        }
      }
    }

    let worktreePath: string | null = null;
    let branchName: string | null = null;

    // Staged startup progress (T7): emit a `run.startup` event at each setup
    // boundary so the dashboard + TUI show a checklist instead of a blank screen.
    const startup = async (
      stage: "workspace" | "environment" | "context" | "models" | "provider",
      status: "active" | "done" | "skipped" | "failed",
      detail?: string,
    ) => {
      await eventLog.append({
        type: "run.startup",
        message: `Startup: ${stage} ${status}${detail ? ` (${detail})` : ""}.`,
        data: { stage, status, ...(detail ? { detail } : {}) },
      });
    };

    try {
      await startup("workspace", "active");
      // Execution backend (T14 slice 2): local-worktree (host) by default, or a
      // disposable Docker container when execution.backend = "docker". A failed
      // container preflight throws here (fail-closed) before any turn runs.
      const backend = this.selectExecutionBackend();
      if (backend.id === "docker") {
        await eventLog.append({
          type: "policy.warning",
          message:
            "Container backend: turns run in a disposable Docker container (writes confined to the worktree). " +
            "WARNING: network egress is OPEN and a mounted provider credential is reachable in-container - " +
            "this is NOT credential-safe against malicious code. The image must carry the provider CLI.",
          data: { kind: "container-backend", image: this.config.execution?.container?.image ?? null },
        });
      }
      const prep = await backend.prepareRun({
        projectRoot: this.projectRoot,
        runId,
        branchPrefix: this.config.git.branchPrefix,
        worktreeDir: this.config.git.worktreeDir,
        mainBranch: this.config.git.mainBranch,
      });
      worktreePath = prep.worktreePath;
      branchName = prep.branchName;
      // Record the RESOLVED permission mode (P4) so the audit/assurance reflect
      // the policy that actually governed this run, not just the request.
      await eventLog.append({
        type: "policy.permission_mode",
        message: `Permission mode: ${this.permissionMode}.`,
        data: { permissionMode: this.permissionMode },
      });
      // Posture-applies (Slice 2b): surface what an auto-applied posture did (or
      // why it was suppressed) once at run start. Empty ⇒ nothing applied.
      if (this.postureNotes.length > 0) {
        await eventLog.append({
          type: "policy.posture_applied",
          message: `Posture: ${this.postureNotes.join("; ")}.`,
          data: {
            notes: this.postureNotes,
            isolationOverride: this.isolationOverride,
          },
        });
      }
      this.execStrategy = prep.exec ?? null;
      this.containerTeardown = prep.teardown ?? null;
      if (prep.exec) {
        await eventLog.append({
          type: "execution.containerized",
          message: `Run executes in a ${prep.exec.location} (execution.backend=${backend.id}).`,
          data: { backend: backend.id, location: prep.exec.location },
        });
      } else if (backend.id === "docker") {
        // backend=docker but no strategy ⇒ onUnavailable:"degrade" fell back to
        // host. Record it honestly so the assurance posture never claims a sandbox.
        await eventLog.append({
          type: "execution.container_unavailable",
          message: "Docker unavailable; degraded to host execution (execution.container.onUnavailable=degrade).",
          data: { backend: backend.id },
        });
      }
      state = { ...state, worktreePath, branchName, updatedAt: nowIso() };
      await stateStore.write(state);
      await eventLog.append({
        type: "git.worktree.created",
        message: `Worktree ${prep.worktreePath} on branch ${prep.branchName}.`,
        data: { worktreePath: prep.worktreePath, branchName: prep.branchName },
      });
      await startup("workspace", "done");
      // P8c: a bare worktree has no gitignored environment, so validation
      // commands fail with "command not found" and a correct change gets
      // blocked for an environmental reason. Link the project's env dirs in
      // (lockfile-guarded for JS). Best-effort: skips are events, not errors.
      if (this.config.git.linkEnvironment !== "off") {
        await startup("environment", "active");
        const env = await linkWorktreeEnvironment({
          projectRoot: this.projectRoot,
          worktreePath: prep.worktreePath,
        }).catch(() => ({ linked: [], skipped: [] }));
        if (env.linked.length > 0 || env.skipped.length > 0) {
          await eventLog.append({
            type: "git.worktree.env",
            message:
              env.linked.length > 0
                ? `Linked ${env.linked.map((l) => l.dir).join(", ")} into the worktree.`
                : `No environment linked: ${env.skipped
                    .map((s) => `${s.dir} (${s.reason})`)
                    .join("; ")}.`,
            data: env,
          });
        }
        await startup(
          "environment",
          "done",
          env.linked.length > 0
            ? `${env.linked.length} linked`
            : "nothing to link",
        );
      } else {
        await startup("environment", "skipped", "linkEnvironment off");
      }
    } catch (err) {
      await startup("workspace", "failed", describeError(err));
      state = applyTransition(state, "failed");
      state = { ...state, error: describeError(err) };
      await stateStore.write(state);
      await eventLog.append({
        type: "run.failed",
        message: `Failed to prepare worktree: ${describeError(err)}`,
      });
      // A container may already be up (created inside the workspace try); reap it.
      await this.teardownContainer();
      throw err;
    }

    // Everything past here can throw too (context sources, model resolution, the
    // flow run); wrap it so the container is always torn down once it exists.
    try {

    // Materialize context sources once (path-guarded files / SSRF-guarded URLs,
    // secret-redacted). Merged into every role's prompt below. Failures are
    // non-fatal notes - a bad attachment never blocks a run.
    if (this.contextSources.length > 0) {
      await startup("context", "active");
      const ctxResult = await materializeContextSources({
        sources: this.contextSources,
        projectRoot: this.projectRoot,
        worktreePath,
        allowUrlFetch: true,
        allowPrivateHosts: false,
      });
      this.materializedContext = ctxResult.artifacts;
      await artifactStore.writeJson("context/sources.json", {
        sources: this.contextSources,
        materialized: ctxResult.artifacts.map((a) => a.label),
        notes: ctxResult.notes,
      });
      await eventLog.append({
        type: "context.materialized",
        message: `Context: ${ctxResult.artifacts.length} source(s) attached${ctxResult.notes.length ? `, ${ctxResult.notes.length} skipped` : ""}.`,
        data: { attached: ctxResult.artifacts.length, notes: ctxResult.notes },
      });
      await startup(
        "context",
        "done",
        `${ctxResult.artifacts.length} attached`,
      );
    } else {
      await startup("context", "skipped", "no context sources");
    }

    // Preparing models (run-start auto-detection): refresh each probe-capable
    // provider's real model/effort catalog from its offline bundled catalog
    // (codex `debug models --bundled` - instant). Best-effort and time-boxed:
    // a missing binary or slow spawn never blocks or fails the run. Keeps the
    // model/effort pickers + this run on real models without a manual refresh.
    await startup("models", "active");
    try {
      const { autoDetectRunModels } = await import(
        "../providers/provider-model-autodetect.js"
      );
      const summary = await Promise.race([
        autoDetectRunModels({ projectRoot: this.projectRoot }),
        new Promise<{ detail: string }>((resolve) =>
          setTimeout(() => resolve({ detail: "timed out" }), 8_000).unref?.(),
        ),
      ]);
      await startup("models", "done", summary.detail);
    } catch (err) {
      // Detection is advisory - a failure leaves the prior catalog in place.
      await startup("models", "skipped", describeError(err));
    }

    // Load the continuity ledger once (T9): render the bounded brief, redact
    // it, and stash it for the planner's planning context. Then run the
    // duplicate/conflict matcher on this run's task and FLAG (never remove) any
    // suspected overlap as an append-only ledger entry linking the two, surface
    // it to the supervisor (planner prompt + a `ledger.flagged` event), and
    // stash the heads-up block. Best-effort throughout - a ledger hiccup or a
    // failed flag append must never block a run.
    try {
      const store = new LedgerStore(this.projectRoot);
      const fullState = await store.state();
      // This run's own start-intent (Slice 3) is not prior context: drop it so
      // the planner's ledger block doesn't echo the current goal back, and the
      // duplicate matcher doesn't flag the run against its own just-recorded
      // intent.
      const state = {
        ...fullState,
        intents: fullState.intents.filter((e) => e.id !== `intent:${runId}`),
      };
      const block = renderLedgerForPrompt(state, nowIso());
      this.ledgerPromptBlock = block ? redactSecretsInText(block).redacted : "";

      const matches = findLedgerFlags({ title: this.task, state });
      if (matches.length > 0) {
        // Warn the planner on EVERY match (the overlap is relevant this run,
        // even if a prior run already recorded the same flag).
        const flagBlock = renderFlagsForPrompt(matches);
        this.ledgerFlagsBlock = flagBlock ? redactSecretsInText(flagBlock).redacted : "";

        // Cross-run dedup: only APPEND flags for a (relation, target) that
        // doesn't already have an open flag - so a recurring task can't grow
        // the ledger without bound.
        const fresh = freshFlagMatches(matches, state.flags);
        let appended = 0;
        if (fresh.length > 0) {
          try {
            await store.append(
              buildFlagEntries({ matches: fresh, runId, taskTitle: this.task, now: nowIso() }),
            );
            appended = fresh.length;
          } catch {
            // a flag-append hiccup is non-fatal
          }
        }
        // Event is advisory + must reflect what actually persisted; an event
        // hiccup must not discard the stashed prompt blocks (own try/catch).
        try {
          await eventLog.append({
            type: "ledger.flagged",
            message:
              `Continuity: this task may overlap ${matches.length} prior item(s)` +
              (appended > 0 ? ` (${appended} newly flagged).` : " (already flagged)."),
            data: {
              appended,
              flags: matches.map((m) => ({
                relation: m.relation,
                targetId: m.target.id,
                targetKind: m.target.kind,
                targetTitle: m.target.title,
                score: Number(m.score.toFixed(3)),
              })),
            },
          });
        } catch {
          // event log hiccup is non-fatal; the prompt blocks stand
        }
      }
    } catch {
      this.ledgerPromptBlock = "";
      this.ledgerFlagsBlock = "";
    }

    // Methodology (durable-memory Slice 4): the project's selected methodology is
    // a durable param (`methodology`, project-global). If it resolves to a known
    // value, stash that one's bounded planning guidance for the planner turn; an
    // unknown value is warned once and ignored (no silent wrong-doing, no block).
    // Best-effort - a params hiccup never blocks a run.
    try {
      const stored = await new ParamStore(this.projectRoot).read();
      const methodology = stored.values["methodology"]?.value;
      this.methodologyBlock = renderMethodologyForPrompt(methodology);
      if (methodology && !resolveMethodology(methodology)) {
        await eventLog.append({
          type: "methodology.unknown",
          message:
            `Project methodology "${methodology}" is not recognized (known: ` +
            `${KNOWN_METHODOLOGY_IDS.join(", ")}); ignoring it for planning.`,
          data: { value: methodology, known: KNOWN_METHODOLOGY_IDS },
        });
      }
    } catch {
      this.methodologyBlock = "";
    }

    const ctx = {
      runId,
      worktreePath,
      branchName,
      artifactStore,
      eventLog,
      stateStore,
      onProgress: this.onProgress,
    };

    // One runner for every run. Stages that already triggered a policy approval
    // this run are tracked so the same stage re-running (e.g. review inside the
    // fix loop) doesn't re-prompt.
    const policyStagesAlreadyForced = new Set<string>();

    // Last startup stage: the model is about to start. The live timeline takes
    // over from here; the startup checklist steps aside once this fires.
    await startup("provider", "active");

      return await this.runFlowSequence({
        snapshot: flow,
        runId,
        state,
        worktreePath,
        branchName,
        artifactStore,
        stateStore,
        eventLog,
        metricsStore,
        approvalService,
        notify,
        policyWarnings: policy.warnings,
        policyStagesAlreadyForced,
        ctx,
      });
    } finally {
      // Tear down the disposable container (T14 slice 2) on ANY exit of the
      // post-prepare region - success or throw. The worktree persists (the host
      // diff-gate reads it). Idempotent + null when no container was created.
      await this.teardownContainer();
    }
  }

  private createFlowRunState(
    snapshot: ResolvedFlowSnapshot,
    snapshotPath: string,
  ): NonNullable<RunState["flow"]> {
    return {
      flowId: snapshot.flowId,
      flowVersion: snapshot.flowVersion,
      label: snapshot.label,
      snapshotPath,
      participantLedgerPath: "participants.json",
      participants: [],
      currentStepId: null,
      steps: snapshot.steps.map((step) => ({
        id: step.id,
        label: step.label,
        kind: step.kind,
        status: step.enabled ? "pending" : "skipped",
        optional: step.optional,
        stage: step.stage,
        seat: step.seat,
        needs: step.needs,
        resolvedRoleId: step.resolvedRoleId,
        resolvedRoleLabel: step.resolvedRoleLabel,
        profileId: step.profileId,
        providerId: step.providerId,
        promptArtifactPath: null,
        outputArtifactPath: null,
        contextPacketPath: null,
        validationArtifactPath: null,
        startedAt: null,
        endedAt: null,
        error: null,
      })),
    };
  }

  private patchFlowStep(
    state: RunState,
    stepId: string,
    patch: Partial<NonNullable<RunState["flow"]>["steps"][number]>,
    currentStepId = state.flow?.currentStepId ?? null,
  ): RunState {
    if (!state.flow) {
      throw new Error("Cannot update a flow step before flow state is initialized.");
    }
    return {
      ...state,
      updatedAt: nowIso(),
      flow: {
        ...state.flow,
        currentStepId,
        steps: state.flow.steps.map((step) =>
          step.id === stepId ? { ...step, ...patch } : step,
        ),
      },
    };
  }

  private patchFlowParticipants(
    state: RunState,
    ledger: FlowParticipantLedger,
  ): RunState {
    if (!state.flow) {
      throw new Error("Cannot update flow participants before flow state is initialized.");
    }
    return {
      ...state,
      updatedAt: nowIso(),
      flow: {
        ...state.flow,
        participantLedgerPath: "participants.json",
        participants: summarizeFlowParticipants(ledger),
      },
    };
  }

  private flowStatusForStep(step: ResolvedFlowStep): RunStatus {
    switch (step.kind) {
      case "review-turn":
        return "reviewing";
      case "response-turn":
        return "fixing";
      case "validation":
        return "validating";
      case "summary-turn":
        return "verifying";
      case "approval-gate":
        return "waiting_for_approval";
      case "agent-turn":
      default:
        // Prefer the declared stage (planning/architecting/executing) so the
        // run status and policy-approval matching are accurate (e.g. architect
        // → "architecting"). Falls back to the planner/other heuristic.
        if (
          step.stage === "planning" ||
          step.stage === "architecting" ||
          step.stage === "executing"
        ) {
          return step.stage;
        }
        return step.resolvedRoleId === "planner" ? "planning" : "executing";
    }
  }

  private async moveToFlowStepStatus(input: {
    state: RunState;
    step: ResolvedFlowStep;
    stateStore: RunStateStore;
  }): Promise<RunState> {
    const target = this.flowStatusForStep(input.step);
    if (target === "waiting_for_approval" || input.state.status === target) {
      return input.state;
    }
    const next = applyTransition(input.state, target);
    await input.stateStore.write(next);
    return next;
  }

  private renderFlowStepNotes(input: {
    snapshot: ResolvedFlowSnapshot;
    step: ResolvedFlowStep;
  }): string {
    const brief = input.snapshot.brief
      ? `Run brief:\n${input.snapshot.brief.trim()}\n\n`
      : "";
    const outputs =
      input.step.outputs.length > 0
        ? input.step.outputs.map((token) => `- ${token}`).join("\n")
        : "- No named outputs declared.";
    const contractNotes = renderFlowOutputContractNotes(input.step);
    return [
      `Flow: ${input.snapshot.label} (${input.snapshot.flowId} v${input.snapshot.flowVersion})`,
      `Flow step: ${input.step.label} (${input.step.id})`,
      `Flow step kind: ${input.step.kind}`,
      `Context policy: ${input.snapshot.contextPolicy}`,
      "",
      brief.trimEnd(),
      "",
      "Only this step should be completed now. Use the named prior artifacts as the handoff packet.",
      "Expected named outputs:",
      outputs,
      "",
      contractNotes,
    ]
      .filter((line, index, all) => line !== "" || all[index - 1] !== "")
      .join("\n");
  }

  private async buildFlowContextPacket(input: {
    snapshot: ResolvedFlowSnapshot;
    step: ResolvedFlowStep;
    outputs: Map<string, FlowContextOutput>;
    artifactStore: ArtifactStore;
    contextMode: PreparedFlowParticipantTurn["contextMode"];
    forceFullTokens?: ReadonlySet<string>;
  }): Promise<{
    priorArtifacts: PriorArtifact[];
    contextPacketPath: string;
    budget: ReturnType<typeof buildFlowContextPacketValue>["packet"]["budget"];
  }> {
    const built = buildFlowContextPacketValue({
      snapshot: input.snapshot,
      step: input.step,
      outputs: input.outputs,
      contextMode: input.contextMode,
      forceFullTokens: input.forceFullTokens,
      generatedAt: nowIso(),
    });
    const absPath = await input.artifactStore.writeJson(
      path.posix.join("flows", input.step.id, "context-packet.json"),
      built.packet,
    );
    return {
      priorArtifacts: built.priorArtifacts,
      contextPacketPath: input.artifactStore.relPath(absPath),
      budget: built.packet.budget,
    };
  }

  // Honest turn outcome: a model turn "succeeded" only if its provider exited 0
  // AND it produced usable output. A non-zero exit (an invocation failure the
  // runner used to swallow) or empty/whitespace output (a silent no-op) is a
  // real failure - the caller fails the run (or, for a continueOnError graph
  // step, tolerates it) instead of registering empty output as success.
  private assessTurnResult(result: RoleRunResult): {
    ok: boolean;
    reason: string;
    failureClass: ProviderFailureClass | null;
  } {
    const exit = result.providerResult.exitCode;
    if (exit !== 0) {
      // Carry the resilience layer's diagnosis (class + redacted excerpt)
      // instead of laundering every failure into "provider exited N".
      const f = result.providerResult.failure;
      return {
        ok: false,
        reason: f
          ? `provider exited ${exit} (${f.class}: ${f.excerpt})`
          : `provider exited ${exit}`,
        failureClass: f?.class ?? null,
      };
    }
    if (result.output.trim().length === 0) {
      return { ok: false, reason: "provider returned no output", failureClass: null };
    }
    return { ok: true, reason: "", failureClass: null };
  }

  private async registerFlowRoleOutputs(input: {
    step: ResolvedFlowStep;
    result: RoleRunResult;
    outputs: Map<string, FlowContextOutput>;
    artifactStore: ArtifactStore;
    worktreePath: string | null;
  }): Promise<void> {
    for (const token of input.step.outputs) {
      if (token === "diff") {
        if (!input.worktreePath) continue;
        const snapshot = await getDiffSnapshot({
          worktreePath: input.worktreePath,
        });
        const absPath = await input.artifactStore.writeJson(
          path.posix.join("flows", input.step.id, "diff-snapshot.json"),
          snapshot,
        );
        input.outputs.set(token, {
          token,
          label: `${input.step.label}: ${token}`,
          content: `${JSON.stringify(snapshot, null, 2)}\n`,
          artifactPath: input.artifactStore.relPath(absPath),
        });
        continue;
      }
      input.outputs.set(token, {
        token,
        label: `${input.step.label}: ${token}`,
        content: input.result.output,
        artifactPath: input.result.outputArtifactPath,
      });
    }
  }

  private registerFlowValidationOutputs(input: {
    step: ResolvedFlowStep;
    validation: ValidationResults;
    validationArtifactPath: string;
    outputs: Map<string, FlowContextOutput>;
  }): void {
    for (const token of input.step.outputs) {
      input.outputs.set(token, {
        token,
        label: `${input.step.label}: ${token}`,
        content: `${JSON.stringify(input.validation, null, 2)}\n`,
        artifactPath: input.validationArtifactPath,
      });
    }
  }

  private async recordFlowArbitrationOutputs(input: {
    step: ResolvedFlowStep;
    result: RoleRunResult;
    outputs: Map<string, FlowContextOutput>;
    validation: ValidationResults | null;
    artifactStore: ArtifactStore;
    eventLog: EventLog;
    ledger: FlowArbitrationLedger;
    store: FlowArbitrationStore;
  }): Promise<FlowArbitrationLedger> {
    let ledger = input.ledger;
    let findingsChanged = false;

    if (input.step.outputs.includes("findings")) {
      const parsed = parseFlowJsonContract({
        text: input.result.output,
        schema: flowFindingsOutputSchema,
        expectedStepId: input.step.id,
      });
      if (parsed.ok) {
        ledger = recordFlowFindings({
          ledger,
          output: parsed.output,
          sourceArtifactPath: input.result.outputArtifactPath,
        });
        const absPath = await input.artifactStore.writeJson(
          path.posix.join("flows", "findings.json"),
          flowArbitrationCanonicalFindings(ledger, input.step.id),
        );
        input.outputs.set("findings", {
          token: "findings",
          label: "Flow Findings",
          content: `${JSON.stringify(
            flowArbitrationCanonicalFindings(ledger, input.step.id),
            null,
            2,
          )}\n`,
          artifactPath: input.artifactStore.relPath(absPath),
        });
        findingsChanged = true;
      } else {
        ledger = recordFlowArbitrationParseIssue({
          ledger,
          stepId: input.step.id,
          outputToken: "findings",
          sourceArtifactPath: input.result.outputArtifactPath,
          message: parsed.message,
        });
      }
    }

    if (input.step.outputs.includes("finding-responses")) {
      const parsed = parseFlowJsonContract({
        text: input.result.output,
        schema: flowFindingResponsesOutputSchema,
        expectedStepId: input.step.id,
      });
      if (parsed.ok) {
        ledger = recordFlowFindingResponses({
          ledger,
          output: parsed.output,
          sourceArtifactPath: input.result.outputArtifactPath,
        });
        ledger = await this.feedFlowAcceptedFindings(ledger);
        const canonical = flowArbitrationCanonicalResponses(
          ledger,
          input.step.id,
        );
        const absPath = await input.artifactStore.writeJson(
          path.posix.join("flows", "finding-responses.json"),
          canonical,
        );
        input.outputs.set("finding-responses", {
          token: "finding-responses",
          label: "Flow Finding Responses",
          content: `${JSON.stringify(canonical, null, 2)}\n`,
          artifactPath: input.artifactStore.relPath(absPath),
        });
        findingsChanged = true;
      } else {
        ledger = recordFlowArbitrationParseIssue({
          ledger,
          stepId: input.step.id,
          outputToken: "finding-responses",
          sourceArtifactPath: input.result.outputArtifactPath,
          message: parsed.message,
        });
      }
    }

    if (input.step.outputs.includes("finding-resolutions")) {
      const parsed = parseFlowJsonContract({
        text: input.result.output,
        schema: flowFindingResolutionsOutputSchema,
        expectedStepId: input.step.id,
      });
      if (parsed.ok) {
        ledger = recordFlowFindingResolutions({
          ledger,
          output: parsed.output,
          sourceArtifactPath: input.result.outputArtifactPath,
        });
        const canonical = flowArbitrationCanonicalResolutions(
          ledger,
          input.step.id,
        );
        const absPath = await input.artifactStore.writeJson(
          path.posix.join("flows", "finding-resolutions.json"),
          canonical,
        );
        input.outputs.set("finding-resolutions", {
          token: "finding-resolutions",
          label: "Flow Finding Resolutions",
          content: `${JSON.stringify(canonical, null, 2)}\n`,
          artifactPath: input.artifactStore.relPath(absPath),
        });
        findingsChanged = true;
      } else {
        ledger = recordFlowArbitrationParseIssue({
          ledger,
          stepId: input.step.id,
          outputToken: "finding-resolutions",
          sourceArtifactPath: input.result.outputArtifactPath,
          message: parsed.message,
        });
      }
    }

    if (input.step.outputs.includes("decision-summary")) {
      const parsed = parseFlowJsonContract({
        text: input.result.output,
        schema: flowDecisionSummaryOutputSchema,
        expectedStepId: input.step.id,
      });
      if (parsed.ok) {
        ledger = recordFlowDecision({
          ledger,
          output: parsed.output,
          sourceArtifactPath: input.result.outputArtifactPath,
        });
        const absPath = await input.artifactStore.writeJson(
          path.posix.join("flows", "decision-summary.json"),
          parsed.output,
        );
        input.outputs.set("decision-summary", {
          token: "decision-summary",
          label: "Flow Decision Summary",
          content: `${JSON.stringify(parsed.output, null, 2)}\n`,
          artifactPath: input.artifactStore.relPath(absPath),
        });
      } else {
        ledger = recordFlowArbitrationParseIssue({
          ledger,
          stepId: input.step.id,
          outputToken: "decision-summary",
          sourceArtifactPath: input.result.outputArtifactPath,
          message: parsed.message,
        });
      }
      ledger = await this.writeFlowDecisionSummaryArtifact({
        ledger,
        stepId: input.step.id,
        outputs: input.outputs,
        validation: input.validation,
        artifactStore: input.artifactStore,
      });
      await input.eventLog.append({
        type: "flow.decision.completed",
        message: `Flow decision summary persisted for ${input.step.id}.`,
        data: {
          stepId: input.step.id,
          decisionSummaryPath: ledger.decisionSummaryPath,
          structuredDecisionParsed: ledger.decision !== null,
        },
      });
    }

    if (findingsChanged) {
      await input.eventLog.append({
        type: "flow.findings.updated",
        message: `Flow arbitration records updated at ${input.step.id}.`,
        data: {
          stepId: input.step.id,
          findings: ledger.findings.length,
          responses: ledger.responses.length,
          resolutions: ledger.resolutions.length,
        },
      });
    }

    await input.store.write(ledger);
    return ledger;
  }

  // Builder-side structured handoffs (plan/architecture/execution). Mirrors the
  // review-side contract handling but stateless: for each handoff token a step
  // declares, parse the step output against its contract; on success replace the
  // registered output with the canonical JSON (so the next step consumes clean
  // structured data) and persist it as an artifact; on failure leave the raw
  // text in place (already registered by registerFlowRoleOutputs) and record a
  // parse issue. Either way emit `flow.handoff.parsed` so adoption is visible.
  private async recordFlowHandoffOutputs(input: {
    step: ResolvedFlowStep;
    result: RoleRunResult;
    outputs: Map<string, FlowContextOutput>;
    artifactStore: ArtifactStore;
    eventLog: EventLog;
  }): Promise<void> {
    for (const token of input.step.outputs) {
      if (!isFlowHandoffToken(token)) continue;
      const spec = flowHandoffContracts[token];
      const parsed = parseFlowJsonContract({
        text: input.result.output,
        schema: spec.schema,
        expectedStepId: input.step.id,
      });
      if (parsed.ok) {
        const absPath = await input.artifactStore.writeJson(
          path.posix.join("flows", input.step.id, `${token}.json`),
          parsed.output,
        );
        input.outputs.set(token, {
          token,
          label: spec.label,
          content: `${JSON.stringify(parsed.output, null, 2)}\n`,
          artifactPath: input.artifactStore.relPath(absPath),
        });
      }
      await input.eventLog.append({
        type: "flow.handoff.parsed",
        message: parsed.ok
          ? `Structured ${token} parsed at ${input.step.id}.`
          : `Structured ${token} at ${input.step.id} did not parse; kept raw output.`,
        data: {
          stepId: input.step.id,
          token,
          parsed: parsed.ok,
          ...(parsed.ok ? {} : { message: parsed.message }),
        },
      });
    }
  }

  private async feedFlowAcceptedFindings(
    ledger: FlowArbitrationLedger,
  ): Promise<FlowArbitrationLedger> {
    const svc = new ReviewSuggestionService(this.projectRoot, ledger.runId);
    for (const accepted of flowAcceptedFindingResponses(ledger)) {
      if (accepted.finding.suggestionId) continue;
      const fileRef = accepted.finding.finding.evidence.find(
        (evidence) => evidence.kind === "file",
      );
      const suggestion = await svc.addArtifactSuggestion({
        title: flowFindingSuggestionTitle(accepted.finding.finding),
        body: formatFlowFindingSuggestionBody({
          finding: accepted.finding.finding,
          response: accepted.response.response,
        }),
        file: fileRef?.ref ?? null,
        sourceArtifactPath: accepted.finding.sourceArtifactPath,
      });
      ledger = setFlowFindingSuggestionId({
        ledger,
        findingId: accepted.finding.finding.id,
        suggestionId: suggestion.id,
      });
    }

    if (ledger.acceptedReviewPassId) return ledger;
    const suggestionIds = flowAcceptedFindingResponses(ledger)
      .map((accepted) => accepted.finding.suggestionId)
      .filter((id): id is string => id !== null);
    if (suggestionIds.length === 0) return ledger;
    const bundle = await new SuggestionBundleService(
      this.projectRoot,
      ledger.runId,
    ).create({
      title: "Quality Arbitration accepted findings",
      description:
        "Findings the builder accepted or fixed during the Flow challenge response.",
      suggestionIds,
    });
    return setFlowAcceptedReviewPassId(ledger, bundle.id);
  }

  private async writeFlowDecisionSummaryArtifact(input: {
    ledger: FlowArbitrationLedger;
    stepId: string;
    outputs: Map<string, FlowContextOutput>;
    validation: ValidationResults | null;
    artifactStore: ArtifactStore;
  }): Promise<FlowArbitrationLedger> {
    await input.artifactStore.writeJson(
      path.posix.join("flows", "findings.json"),
      flowArbitrationCanonicalFindings(input.ledger, input.stepId),
    );
    await input.artifactStore.writeJson(
      path.posix.join("flows", "finding-responses.json"),
      flowArbitrationCanonicalResponses(input.ledger, input.stepId),
    );
    await input.artifactStore.writeJson(
      path.posix.join("flows", "finding-resolutions.json"),
      flowArbitrationCanonicalResolutions(input.ledger, input.stepId),
    );
    const absPath = await input.artifactStore.write(
      path.posix.join("flows", "decision-summary.md"),
      `${renderFlowDecisionSummaryMarkdown({
        ledger: input.ledger,
        validation: input.validation,
        validationArtifactPath:
          input.outputs.get("validation")?.artifactPath ?? null,
      })}\n`,
    );
    return setFlowDecisionSummaryPath(
      input.ledger,
      input.artifactStore.relPath(absPath),
    );
  }

  /** Capture a per-phase worktree snapshot after a code-producing step, so a
   *  later run can rewind to review/verify/fix with this code. Best-effort. */
  private async maybeCapturePhaseSnapshot(input: {
    step: { kind: string; stage: string | null };
    worktreePath: string | null;
    runId: string;
    eventLog: EventLog;
  }): Promise<void> {
    if (!input.worktreePath) return;
    const { step } = input;
    let stage: SnapshotStage | null = null;
    if (step.kind === "agent-turn" && step.stage === "executing") stage = "executing";
    else if (step.kind === "response-turn") stage = "fixing";
    if (!stage) return;
    const snap = await capturePhaseSnapshot({
      projectRoot: this.projectRoot,
      runId: input.runId,
      worktree: input.worktreePath,
      stage,
    });
    if (snap) {
      await input.eventLog.append({
        type: "run.snapshot.captured",
        message: `Captured ${stage} worktree snapshot (#${snap.seq}) for rewind.`,
        data: { seq: snap.seq, stage, treeSha: snap.treeSha },
      });
    }
  }

  /** Resolve the step index to resume at. Upstream stages match the step's
   *  declared `stage`; the downstream `fixing` resume targets the fixer step by
   *  KIND (the fix step is declared stage "executing", not "fixing"). */
  private resolveResumeIndex(
    snapshot: ResolvedFlowSnapshot,
    fromStage: ResumeStage,
  ): number {
    if (fromStage === "fixing") {
      return snapshot.steps.findIndex((s) => s.kind === "response-turn");
    }
    if (fromStage === "reviewing") {
      return snapshot.steps.findIndex(
        (s) => s.stage === "reviewing" || s.kind === "review-turn",
      );
    }
    if (fromStage === "verifying") {
      return snapshot.steps.findIndex(
        (s) => s.stage === "verifying" || s.kind === "summary-turn",
      );
    }
    return snapshot.steps.findIndex((s) => s.stage === fromStage);
  }

  /** Seed the outputs of every step before the resume stage from the source
   *  run and mark them skipped. Returns the index to start the walk at, the
   *  updated state, and seeded plan/execution artifacts (for the report). */
  private async seedResumedSteps(input: {
    snapshot: ResolvedFlowSnapshot;
    resumeFrom: ResumeFromInput;
    state: RunState;
    worktreePath: string | null;
    outputs: Map<string, FlowContextOutput>;
    targetStore: ArtifactStore;
    stateStore: RunStateStore;
    eventLog: EventLog;
  }): Promise<{
    state: RunState;
    resumeStartIndex: number;
    planArtifact: RoleRunResult | null;
    executionArtifact: RoleRunResult | null;
  }> {
    const { snapshot, resumeFrom } = input;
    const resumeStartIndex = this.resolveResumeIndex(snapshot, resumeFrom.fromStage);
    if (resumeStartIndex < 0) {
      throw new Error(
        `Cannot resume from stage "${resumeFrom.fromStage}": flow "${snapshot.flowId}" has no step at that stage.`,
      );
    }

    // Downstream stages (review/fix/verify) operate on existing code - restore
    // the source run's per-phase worktree snapshot into this run's worktree.
    if (DOWNSTREAM_RESUME_STAGES.has(resumeFrom.fromStage) && input.worktreePath) {
      const sourceSnaps = await readPhaseSnapshots(
        this.projectRoot,
        resumeFrom.sourceRunId,
      );
      const pick = pickSnapshotForResume(
        sourceSnaps,
        resumeFrom.fromStage as DownstreamResumeStage,
      );
      if (pick) {
        // Defense in depth: restore is destructive (checkout-index -f +
        // clean -fd), so positively verify the target is a real run worktree
        // (≠ root, inside the configured worktreeDir, an actual git worktree
        // root) before touching it - never the user's checkout or a stray dir.
        const worktreeDir = this.config.git.worktreeDir;
        const check = await checkRestoreTarget(
          input.worktreePath,
          this.projectRoot,
          worktreeDir,
        );
        const ok = check.safe
          ? await restorePhaseSnapshot(input.worktreePath, pick.treeSha, this.projectRoot, worktreeDir)
          : false;
        await input.eventLog.append({
          type: "run.rewound.restored",
          message: !check.safe
            ? `Refused to restore: ${check.reason}.`
            : ok
              ? `Restored ${pick.stage} worktree snapshot (#${pick.seq}) from run ${resumeFrom.sourceRunId}.`
              : `Failed to restore worktree snapshot from run ${resumeFrom.sourceRunId}; the resumed stage may see no code.`,
          data: { sourceRunId: resumeFrom.sourceRunId, seq: pick.seq, stage: pick.stage, ok, safe: check.safe },
        });
      } else {
        await input.eventLog.append({
          type: "run.rewound.restored",
          message: `Source run ${resumeFrom.sourceRunId} has no worktree snapshot to restore for stage "${resumeFrom.fromStage}".`,
          data: { sourceRunId: resumeFrom.sourceRunId, ok: false },
        });
      }
    }
    let state = input.state;
    let planArtifact: RoleRunResult | null = null;
    let executionArtifact: RoleRunResult | null = null;
    const sourceStore = new ArtifactStore(
      this.projectRoot,
      resumeFrom.sourceRunId,
    );

    // Downstream resumes (review/fix/verify) seed everything before the resume
    // step - which can include non-agent steps (validation) whose outputs aren't
    // artifact files. A missing output there is fine (the code itself is restored
    // from the worktree snapshot), so tolerate it; upstream resumes keep the
    // strict contract (a missing plan/architecture is a real error).
    const tolerateMissing = DOWNSTREAM_RESUME_STAGES.has(resumeFrom.fromStage);
    for (let i = 0; i < resumeStartIndex; i += 1) {
      const upstream = snapshot.steps[i]!;
      for (const token of upstream.outputs) {
        const seeded = await this.seedResumedOutput({
          token,
          step: upstream,
          sourceStore,
          targetStore: input.targetStore,
          tolerateMissing,
        });
        if (!seeded) continue; // missing non-essential output - skip
        input.outputs.set(token, seeded);
        if (token === "plan" || token === "plan-handoff")
          planArtifact = this.seededFlowResult(upstream, seeded);
        if (token === "execution" || token === "execution-handoff")
          executionArtifact = this.seededFlowResult(upstream, seeded);
      }
      state = this.patchFlowStep(
        state,
        upstream.id,
        { status: "skipped", endedAt: nowIso() },
        upstream.id,
      );
      await input.stateStore.write(state);
      await input.eventLog.append({
        type: "flow.step.skipped",
        message: `Flow step ${upstream.id} skipped (resumed from ${resumeFrom.fromStage}).`,
        data: {
          flowId: snapshot.flowId,
          stepId: upstream.id,
          resumedFrom: resumeFrom.fromStage,
        },
      });
    }

    await input.eventLog.append({
      type: "run.rewound",
      message: `Resumed from run ${resumeFrom.sourceRunId} at stage ${resumeFrom.fromStage}; seeded ${resumeStartIndex} upstream step(s).`,
      data: {
        sourceRunId: resumeFrom.sourceRunId,
        fromStage: resumeFrom.fromStage,
        seededSteps: resumeStartIndex,
      },
    });

    return { state, resumeStartIndex, planArtifact, executionArtifact };
  }

  /** Read a single upstream output from the source run and copy it into this
   *  run's artifacts. `diff` outputs come from the step's diff snapshot; every
   *  other token comes from the step's role output. Throws clearly if missing. */
  private async seedResumedOutput(input: {
    token: string;
    step: ResolvedFlowStep;
    sourceStore: ArtifactStore;
    targetStore: ArtifactStore;
    /** When true, a missing source output returns null instead of throwing. */
    tolerateMissing?: boolean;
  }): Promise<FlowContextOutput | null> {
    const isDiff = input.token === "diff";
    const rel = path.posix.join(
      "flows",
      input.step.id,
      isDiff ? "diff-snapshot.json" : "output.md",
    );
    if (!(await input.sourceStore.exists(rel))) {
      if (input.tolerateMissing) return null;
      throw new Error(
        `Cannot resume: source run is missing "${rel}" (output "${input.token}" of step "${input.step.id}").`,
      );
    }
    const content = await input.sourceStore.read(rel);
    const abs = await input.targetStore.write(rel, content);
    return {
      token: input.token,
      label: `${input.step.label}: ${input.token} (seeded)`,
      content,
      artifactPath: input.targetStore.relPath(abs),
    };
  }

  /** Synthetic RoleRunResult for an output seeded from a prior run during a
   *  resume. Only `.output`/`.outputArtifactPath` are read downstream; the
   *  provider stub records that no agent turn was spent regenerating it. */
  private seededFlowResult(
    step: ResolvedFlowStep,
    output: FlowContextOutput,
  ): RoleRunResult {
    const ts = nowIso();
    return {
      roleId: step.resolvedRoleId ?? "(seeded)",
      output: output.content,
      outputArtifactPath: output.artifactPath,
      promptArtifactPath: "",
      providerResult: {
        providerId: "(seeded)",
        command: "(seeded)",
        args: [],
        cwd: this.projectRoot,
        exitCode: 0,
        stdout: output.content,
        stderr: "",
        durationMs: 0,
        startedAt: ts,
        endedAt: ts,
        session: null,
        normalized: { responseText: output.content, metrics: null },
      },
    };
  }

  /**
   * The bounded read-only fan-out/join scheduler for graph (DAG) flows
   * (custom-workflow-dags.md Phase B). Walks the dependency frontier: a step is
   * ready once all its `needs` are done. Ready steps that belong to a parallel
   * group (>= 2 steps sharing one `needs` set - guaranteed read-only at resolve
   * time) run CONCURRENTLY; every other step runs one at a time, so a write turn
   * or validation never overlaps anything (one writer per worktree).
   *
   * Concurrency is "parallel compute, serial commit": only the provider turns
   * (the expensive part, with per-step-isolated artifacts) overlap; all
   * shared-state bookkeeping (run state, outputs map, run brief, arbitration
   * ledger, approval gates) is applied serially in flow order, so nothing races.
   * Graph turns are stateless (no provider session reuse across parallel turns).
   * The schema forbids loop/checklist/repeat in a graph flow, so this scheduler
   * never has to reason about them.
   */
  private async runGraphFrontier(input: {
    snapshot: ResolvedFlowSnapshot;
    // Phase D (checklist DAGs): run a SUBSET of the snapshot's steps - the
    // per-item band - instead of the whole flow. Default = snapshot.steps (the
    // whole-flow path, byte-for-byte unchanged). All frontier reasoning
    // (parallel groups, readiness, the processed-count exit) is over this set.
    stepsOverride?: ResolvedFlowStep[];
    // Phase D: seed the done/processed sets explicitly instead of deriving them
    // from persisted state. The band passes an EMPTY set so its steps re-run on
    // every checklist item (their persisted "passed" status from the prior item
    // must NOT make the frontier treat them as already-done and stall). The
    // whole-flow path omits this and seeds from state for mid-DAG resume.
    priorDoneOverride?: Set<string>;
    // Phase D: gate the flow.graph.started / flow.graph.completed lifecycle
    // events. The band runs once per item, so it suppresses them to avoid N
    // duplicate pairs (the per-wave flow.frontier.scheduled events still fire,
    // so the fan-out stays visible). Default true (the whole-flow path).
    emitLifecycle?: boolean;
    runId: string;
    state: RunState;
    worktreePath: string | null;
    artifactStore: ArtifactStore;
    stateStore: RunStateStore;
    eventLog: EventLog;
    metricsStore: MetricsStore;
    approvalService: ApprovalService;
    notify: (draft: NotificationDraft) => void;
    policyStagesAlreadyForced: Set<string>;
    outputs: Map<string, FlowContextOutput>;
    arbitrationLedger: FlowArbitrationLedger;
    arbitrationStore: FlowArbitrationStore;
    runBriefState: RunBriefState;
    ctx: {
      runId: string;
      worktreePath: string | null;
      branchName: string | null;
      artifactStore: ArtifactStore;
      eventLog: EventLog;
      stateStore: RunStateStore;
      onProgress: (message: string) => void;
    };
  }): Promise<{
    state: RunState;
    lastValidation: ValidationResults | null;
    reviewDecision: ReviewDecision;
    verificationDecision: VerificationDecision;
    needsTestingAdvisory: { reason: string | null } | null;
    planArtifact: RoleRunResult | null;
    executionArtifact: RoleRunResult | null;
    reviewArtifact: RoleRunResult | null;
    verificationArtifact: RoleRunResult | null;
  }> {
    const { snapshot } = input;
    const steps = input.stepsOverride ?? snapshot.steps;
    const emitLifecycle = input.emitLifecycle ?? true;
    let state = input.state;
    let lastValidation: ValidationResults | null = null;
    let reviewDecision: ReviewDecision = "BLOCKED";
    let verificationDecision: VerificationDecision = "NEEDS_HUMAN";
    let needsTestingAdvisory: { reason: string | null } | null = null;
    let planArtifact: RoleRunResult | null = null;
    let executionArtifact: RoleRunResult | null = null;
    let reviewArtifact: RoleRunResult | null = null;
    let verificationArtifact: RoleRunResult | null = null;
    let arbitrationLedger = input.arbitrationLedger;
    // Continue-past-failure (Slice 5): count of best-effort steps that hard-failed
    // but were tolerated, for the graph-completed event (honest partial coverage).
    let continuedFailures = 0;

    const TURN_KINDS = new Set([
      "agent-turn",
      "review-turn",
      "response-turn",
      "summary-turn",
    ]);
    const keyOf = (step: ResolvedFlowStep) => [...step.needs].sort().join(" ");
    const groupSizeByKey = new Map<string, number>();
    for (const group of parallelGroupsOf(steps)) {
      groupSizeByKey.set(keyOf(group[0]!), group.length);
    }
    const maxFanout = Math.max(0, ...groupSizeByKey.values());
    // A step may run concurrently only if it's a model turn AND belongs to a
    // parallel group (>=2 steps share its `needs`). Resolve-time enforcement
    // already guaranteed every such step is read-only.
    const concurrencyEligible = (step: ResolvedFlowStep) =>
      TURN_KINDS.has(step.kind) && (groupSizeByKey.get(keyOf(step)) ?? 0) >= 2;

    if (emitLifecycle) {
      await input.eventLog.append({
        type: "flow.graph.started",
        message: `Graph flow ${snapshot.flowId}: ${steps.length} steps, max fan-out ${maxFanout}.`,
        data: { flowId: snapshot.flowId, steps: steps.length, maxFanout },
      });
    }

    const done = new Set<string>();
    const processed = new Set<string>();
    if (input.priorDoneOverride) {
      // Phase D: the caller owns what's already done (the per-item band passes an
      // EMPTY set so every band step re-runs this item). We deliberately do NOT
      // read persisted state here - the band steps carry "passed" status from the
      // prior item, which would otherwise make them count as done and stall.
      for (const id of input.priorDoneOverride) {
        done.add(id);
        processed.add(id);
      }
    } else {
      // Resume: a prior run's completed ("passed") or seeded ("skipped") steps are
      // already in the persisted state. Treat them as done so the frontier only
      // advances the steps that still need to run, and so a re-entered fan-out
      // isn't re-spawned. On a fresh run every step is "pending", so this is a
      // no-op and the normal traversal is unchanged.
      for (const s of state.flow?.steps ?? []) {
        if (s.status === "passed" || s.status === "skipped") {
          done.add(s.id);
          processed.add(s.id);
        }
      }
    }

    // Serial: move the run to the step's status and build its context packet.
    const prepareStep = async (step: ResolvedFlowStep) => {
      state = await this.moveToFlowStepStatus({
        state,
        step,
        stateStore: input.stateStore,
      });
      const context = await this.buildFlowContextPacket({
        snapshot,
        step,
        outputs: input.outputs,
        artifactStore: input.artifactStore,
        contextMode: "stateless",
        // Preference-gate review must see the exact diff, not a summary, or it is
        // blind to the line-level violation. Only forced when this is a lensed
        // reviewer turn AND there are preferences to check (else behavior unchanged).
        forceFullTokens:
          isReviewerStep(step) && this.policyAdviseBlock
            ? new Set(["diff"])
            : undefined,
      });
      state = this.patchFlowStep(
        state,
        step.id,
        {
          status: "running",
          startedAt: nowIso(),
          contextPacketPath: context.contextPacketPath,
          error: null,
        },
        step.id,
      );
      await input.stateStore.write(state);
      await input.eventLog.append({
        type: "flow.context.built",
        message: `Flow context packet built for ${step.id}.`,
        data: {
          flowId: snapshot.flowId,
          stepId: step.id,
          contextPolicy: snapshot.contextPolicy,
          contextMode: "stateless",
          contextPacketPath: context.contextPacketPath,
          budget: context.budget,
        },
      });
      await input.eventLog.append({
        type: "flow.step.started",
        message: `Flow step ${step.id} starting.`,
        data: {
          flowId: snapshot.flowId,
          stepId: step.id,
          kind: step.kind,
          seat: step.seat,
          resolvedRoleId: step.resolvedRoleId,
          profileId: step.profileId,
          providerId: step.providerId,
          contextPacketPath: context.contextPacketPath,
        },
      });
      return context;
    };
    type StepContext = Awaited<ReturnType<typeof prepareStep>>;

    // Concurrency-safe: only spawns the provider turn (no shared-state writes).
    const runTurn = (step: ResolvedFlowStep, context: StepContext) => {
      // Persona reviewLens emphasis is appended to lensed reviewer turns only
      // (never the arbiter, never executors/planners), so the active persona
      // actually aims WHAT is scrutinised. Composition is a pure, tested helper.
      const additionalNotes = composeReviewerStepNotes({
        baseNotes: this.renderFlowStepNotes({ snapshot, step }),
        stepInstructions: step.instructions,
        lensEmphasis: this.reviewLensEmphasis,
        isReviewer: isReviewerStep(step),
        policyAdviseBlock: this.policyAdviseBlock,
        specUpPostureBlock: this.specUpPostureBlock,
      });
      return this.runRole({
        roleId: step.resolvedRoleId!,
        providerId: step.providerId,
        profileId: step.profileId,
        stageId: step.id,
        promptIndex: 0,
        promptName: path.posix.join("flows", step.id, "prompt.md"),
        outputName: path.posix.join("flows", step.id, "output.md"),
        priorArtifacts: context.priorArtifacts,
        validationResults: lastValidation,
        runBrief: renderRunBrief(input.runBriefState),
        cleanRoom: step.cleanRoom,
        skills: step.skills,
        additionalNotes,
        metricsStore: input.metricsStore,
        ctx: input.ctx,
      });
    };

    // Per-step retries (Slice 5): re-run a flaky turn up to `step.retries` extra
    // times before its outcome is final. A non-zero exit or an ordinary throw on
    // a non-final attempt triggers a retry; a control signal is never retried (it
    // propagates immediately). The final attempt's result is returned (or its
    // throw rethrown) unchanged, so the caller's continueOnError + commit logic is
    // untouched - retries simply happen transparently first. Each attempt is a
    // real provider invocation, so its metrics are recorded honestly.
    const runTurnWithRetries = async (
      step: ResolvedFlowStep,
      context: StepContext,
    ): Promise<RoleRunResult> => {
      const maxAttempts = step.retries + 1;
      // A failure the resilience layer already retried to exhaustion
      // (rate-limit/transient backoff, usage-limit waits, fallback attempt) is
      // final for this step too - re-entering it from this outer loop would
      // multiply the whole backoff schedule per step retry, burning wall-clock
      // and quota on a provider we already know is limited/down. Hard failures
      // keep the step-level retry semantics (they were never retried below).
      const exhaustedBelow = (r: RoleRunResult): boolean => {
        const cls = r.providerResult.failure?.class;
        return cls !== undefined && cls !== "hard";
      };
      for (let attempt = 1; ; attempt += 1) {
        const last = attempt >= maxAttempts;
        try {
          const result = await runTurn(step, context);
          if (result.providerResult.exitCode === 0 || last || exhaustedBelow(result)) {
            return result;
          }
          await input.eventLog.append({
            type: "flow.step.retried",
            message: `Flow step ${step.id} attempt ${attempt}/${maxAttempts} failed (provider exited ${result.providerResult.exitCode}); retrying.`,
            data: {
              flowId: snapshot.flowId,
              stepId: step.id,
              attempt,
              maxAttempts,
              exitCode: result.providerResult.exitCode,
            },
          });
        } catch (err) {
          const cls = (err as { failureClass?: ProviderFailureClass } | null)?.failureClass;
          if (__isControlSignal(err) || last || (cls && cls !== "hard")) throw err;
          await input.eventLog.append({
            type: "flow.step.retried",
            message: `Flow step ${step.id} attempt ${attempt}/${maxAttempts} errored (${describeError(err)}); retrying.`,
            data: {
              flowId: snapshot.flowId,
              stepId: step.id,
              attempt,
              maxAttempts,
              error: describeError(err),
            },
          });
        }
      }
    };

    // Serial: record outputs/decisions, update the brief, run the approval gate.
    const commitTurn = async (
      step: ResolvedFlowStep,
      result: RoleRunResult,
    ): Promise<void> => {
      await this.registerFlowRoleOutputs({
        step,
        result,
        outputs: input.outputs,
        artifactStore: input.artifactStore,
        worktreePath: input.worktreePath,
      });
      arbitrationLedger = await this.recordFlowArbitrationOutputs({
        step,
        result,
        outputs: input.outputs,
        validation: lastValidation,
        artifactStore: input.artifactStore,
        eventLog: input.eventLog,
        ledger: arbitrationLedger,
        store: input.arbitrationStore,
      });
      await this.recordFlowHandoffOutputs({
        step,
        result,
        outputs: input.outputs,
        artifactStore: input.artifactStore,
        eventLog: input.eventLog,
      });
      if (step.outputs.includes("plan") || step.outputs.includes("plan-handoff"))
        planArtifact = result;
      if (
        step.outputs.includes("execution") ||
        step.outputs.includes("execution-handoff")
      )
        executionArtifact = result;
      if (
        step.kind === "review-turn" &&
        (step.outputs.includes("review-decision") ||
          step.outputs.includes("finding-resolutions"))
      ) {
        reviewArtifact = result;
        reviewDecision = effectiveReviewDecision(result.output);
        await input.eventLog.append({
          type: "review.decision",
          message: `Flow review decision at ${step.id}: ${reviewDecision}`,
          data: { decision: reviewDecision, stepId: step.id },
        });
      }
      if (step.kind === "summary-turn") {
        verificationArtifact = result;
        verificationDecision = effectiveVerificationDecision(result.output);
        await input.eventLog.append({
          type: "verification.decision",
          message: `Flow summary decision at ${step.id}: ${verificationDecision}`,
          data: { decision: verificationDecision, stepId: step.id },
        });
      }
      if (step.kind === "review-turn" || step.kind === "summary-turn") {
        await this.ingestSuggestionsFromArtifact({
          runId: input.runId,
          artifactRelPath: result.outputArtifactPath,
          artifactBody: result.output,
          source: step.kind === "summary-turn" ? "verifier" : "reviewer",
          notify: input.notify,
        });
        const advisory = detectNeedsTesting(result.output);
        if (advisory.advisory) {
          needsTestingAdvisory = { reason: advisory.reason };
          await input.eventLog.append({
            type: "needs_testing.flagged",
            message: `Flagged for human testing at ${step.id}${advisory.reason ? `: ${advisory.reason}` : "."}`,
            data: { stepId: step.id, reason: advisory.reason },
          });
        }
      }
      appendStepOutcome(input.runBriefState, {
        stepId: step.id,
        label: step.label,
        kind: step.kind,
        output: result.output,
        decision:
          step.kind === "review-turn"
            ? reviewDecision
            : step.kind === "summary-turn"
              ? verificationDecision
              : null,
      });
      if (lastValidation) {
        updateRunBriefFacts(input.runBriefState, {
          validation: lastValidation.summary,
        });
      }
      await input.artifactStore.write(
        "flows/run-brief.md",
        renderRunBrief(input.runBriefState),
      );
      const gate = await this.maybeAwaitApproval({
        state,
        fromStatus: state.status,
        stageId: this.flowStatusForStep(step),
        roleId: step.resolvedRoleId!,
        roleArtifact: result,
        approvalService: input.approvalService,
        stateStore: input.stateStore,
        eventLog: input.eventLog,
        policyStagesAlreadyForced: input.policyStagesAlreadyForced,
      });
      state = gate.state;
      if (gate.rejected) {
        state = this.patchFlowStep(
          state,
          step.id,
          {
            status: "blocked",
            promptArtifactPath: result.promptArtifactPath,
            outputArtifactPath: result.outputArtifactPath,
            endedAt: nowIso(),
          },
          step.id,
        );
        await input.stateStore.write(state);
        await input.eventLog.append({
          type: "flow.step.failed",
          message: `Flow step ${step.id} blocked by approval decision.`,
          data: { flowId: snapshot.flowId, stepId: step.id },
        });
        throw new __ApprovalRejectedSignal();
      }
      state = this.patchFlowStep(
        state,
        step.id,
        {
          status: "passed",
          promptArtifactPath: result.promptArtifactPath,
          outputArtifactPath: result.outputArtifactPath,
          endedAt: nowIso(),
        },
        step.id,
      );
      await input.stateStore.write(state);
      await input.eventLog.append({
        type: "flow.step.completed",
        message: `Flow step ${step.id} completed.`,
        data: {
          flowId: snapshot.flowId,
          stepId: step.id,
          promptArtifactPath: result.promptArtifactPath,
          outputArtifactPath: result.outputArtifactPath,
        },
      });
    };

    // Continue-past-failure (Slice 5): record a best-effort turn's hard failure
    // without aborting the run, and let the graph advance - the step counts as
    // "done" so a downstream join proceeds with the surviving siblings. The
    // failure is on the record (a `flow.step.failed` event with `continued: true`
    // and a FAILED line in the run brief), so the join can weigh the gap.
    const markStepFailedContinue = async (
      step: ResolvedFlowStep,
      err: unknown,
      failureClass: ProviderFailureClass | null = null,
    ): Promise<void> => {
      const reason = describeError(err);
      // The class travels structured (not just inside the reason string) so
      // Run Assurance blockers and the audit trail can read it without parsing.
      const cls =
        failureClass ??
        (err as { failureClass?: ProviderFailureClass } | null)?.failureClass ??
        null;
      state = this.patchFlowStep(
        state,
        step.id,
        { status: "failed", endedAt: nowIso(), error: reason },
        step.id,
      );
      await input.stateStore.write(state);
      await input.eventLog.append({
        type: "flow.step.failed",
        message: `Flow step ${step.id} failed but was tolerated (continueOnError): ${reason}`,
        data: {
          flowId: snapshot.flowId,
          stepId: step.id,
          continued: true,
          error: reason,
          failureClass: cls,
        },
      });
      appendStepOutcome(input.runBriefState, {
        stepId: step.id,
        label: step.label,
        kind: step.kind,
        output: `(step failed and was skipped: ${reason})`,
        decision: "FAILED",
      });
      await input.artifactStore.write(
        "flows/run-brief.md",
        renderRunBrief(input.runBriefState),
      );
    };

    // A required (non-best-effort) turn that failed: mark the step failed, point
    // currentStepId at it (so the run() catch targets the right step in a
    // parallel wave), and throw to fail the run honestly.
    const failStepFatal = async (
      step: ResolvedFlowStep,
      reason: string,
    ): Promise<never> => {
      state = this.patchFlowStep(
        state,
        step.id,
        { status: "failed", endedAt: nowIso(), error: reason },
        step.id,
      );
      await input.stateStore.write(state);
      throw new Error(`Flow step "${step.id}" failed: ${reason}.`);
    };

    // One non-parallel step: validation / approval-gate / a single seated turn.
    const runSerialStep = async (step: ResolvedFlowStep): Promise<void> => {
      if (step.kind === "validation") {
        await prepareStep(step);
        const out = await this.runFlowValidationStep({
          step,
          state,
          outputs: input.outputs,
          artifactStore: input.artifactStore,
          stateStore: input.stateStore,
          ctx: input.ctx,
        });
        state = out.state;
        lastValidation = out.validation;
        if (out.validation.summary.failed > 0) {
          input.notify(
            draftValidationFailed({
              runId: input.runId,
              taskId: this.taskId,
              failedCount: out.validation.summary.failed,
            }),
          );
        }
        await input.eventLog.append({
          type: "flow.step.completed",
          message: `Flow step ${step.id} completed.`,
          data: { flowId: snapshot.flowId, stepId: step.id },
        });
        return;
      }
      if (step.kind === "approval-gate") {
        const context = await prepareStep(step);
        if (!step.approval) {
          throw new Error(`Flow approval gate "${step.id}" has no metadata.`);
        }
        const gate = await this.awaitApprovalRequest({
          state,
          fromStatus: state.status,
          stageId: step.id,
          roleId: "flow",
          reason: step.approval.reason,
          prompt: null,
          sourceArtifactPath: context.contextPacketPath,
          requestedAction: step.approval.requestedAction,
          riskLevel: step.approval.riskLevel,
          source: "policy",
          userMessage: step.approval.userMessage ?? null,
          progressMessage: `Pausing for Flow approval at ${step.id}...`,
          requestedMessage: `Flow approval gate ${step.id} is waiting for a decision.`,
          resumedMessage: `Run resumed after Flow approval gate ${step.id}.`,
          approvalService: input.approvalService,
          stateStore: input.stateStore,
          eventLog: input.eventLog,
        });
        state = gate.state;
        if (gate.rejected) {
          state = this.patchFlowStep(
            state,
            step.id,
            { status: "blocked", endedAt: nowIso() },
            step.id,
          );
          await input.stateStore.write(state);
          await input.eventLog.append({
            type: "flow.step.failed",
            message: `Flow approval gate ${step.id} blocked the run.`,
            data: { flowId: snapshot.flowId, stepId: step.id },
          });
          throw new __ApprovalRejectedSignal();
        }
        state = this.patchFlowStep(
          state,
          step.id,
          { status: "passed", endedAt: nowIso() },
          step.id,
        );
        await input.stateStore.write(state);
        await input.eventLog.append({
          type: "flow.step.completed",
          message: `Flow approval gate ${step.id} completed.`,
          data: { flowId: snapshot.flowId, stepId: step.id },
        });
        return;
      }
      const context = await prepareStep(step);
      if (!step.resolvedRoleId) {
        throw new Error(`Flow step "${step.id}" needs a seated role.`);
      }
      let result: RoleRunResult;
      try {
        result = await runTurnWithRetries(step, context);
      } catch (err) {
        // A best-effort step that hard-fails is tolerated; everything else
        // (required failures, control signals) aborts the run as before.
        if (__isControlSignal(err) || !step.continueOnError) throw err;
        await markStepFailedContinue(step, err);
        continuedFailures += 1;
        return;
      }
      // The turn returned: a non-zero exit or empty output is still a failure.
      const turn = this.assessTurnResult(result);
      if (turn.ok) {
        await commitTurn(step, result);
      } else if (step.continueOnError) {
        await markStepFailedContinue(step, new Error(turn.reason), turn.failureClass);
        continuedFailures += 1;
      } else {
        await failStepFatal(step, turn.reason);
      }
    };

    // ── Frontier loop: advance the ready set until every step is processed ──
    while (processed.size < steps.length) {
      state = await applyPauseIfRequested({
        state,
        store: input.stateStore,
        events: input.eventLog,
      });
      if (isTerminal(state.status)) throw new __ApprovalRejectedSignal();

      const ready = steps.filter(
        (s) => !processed.has(s.id) && s.needs.every((n) => done.has(n)),
      );
      if (ready.length === 0) {
        throw new Error(
          `Graph flow ${snapshot.flowId} stalled: no ready step (check the dependency graph).`,
        );
      }

      // Skip disabled / read-only-skipped ready steps first, marking them done
      // so their dependents can proceed.
      const skips = ready.filter(
        (s) => !s.enabled || (this.readOnly && s.skipWhenReadOnly),
      );
      if (skips.length > 0) {
        for (const step of skips) {
          const readOnlySkip = this.readOnly && step.skipWhenReadOnly;
          state = this.patchFlowStep(
            state,
            step.id,
            { status: "skipped", endedAt: nowIso() },
            step.id,
          );
          await input.stateStore.write(state);
          await input.eventLog.append({
            type: "flow.step.skipped",
            message: readOnlySkip
              ? `Flow step ${step.id} skipped (read-only run).`
              : `Flow step ${step.id} skipped.`,
            data: {
              flowId: snapshot.flowId,
              stepId: step.id,
              readOnly: readOnlySkip,
            },
          });
          processed.add(step.id);
          done.add(step.id);
        }
        continue;
      }

      const batch = ready.filter(concurrencyEligible);
      if (batch.length >= 2) {
        const wave = batch.slice(0, MAX_PARALLEL_FANOUT);
        // Reserve frontier budget once before fanning out (each turn also
        // re-checks). For CLI providers token spend is often unmeasured, so the
        // cap there is wall-clock/turn-count bounded - the event says so.
        await this.enforceSpendCap(input.ctx);
        await input.eventLog.append({
          type: "flow.frontier.scheduled",
          message: `Fan-out: ${wave.length} read-only steps running concurrently (${wave
            .map((s) => s.id)
            .join(
              ", ",
            )}). Each turn is an opaque box that may itself parallelize, so real spend can exceed the per-turn estimate.`,
          data: {
            flowId: snapshot.flowId,
            stepIds: wave.map((s) => s.id),
            width: wave.length,
          },
        });
        this.onProgress(`Review panel: ${wave.length} agents in parallel...`);
        const contexts: StepContext[] = [];
        for (const step of wave) contexts.push(await prepareStep(step));
        // allSettled (not all): one reviewer's hard failure must not cancel its
        // siblings' in-flight work. We then commit the survivors and, per step,
        // either tolerate the failure (continueOnError) or abort the run.
        const settled = await Promise.allSettled(
          wave.map((step, i) => runTurnWithRetries(step, contexts[i]!)),
        );
        for (let i = 0; i < wave.length; i += 1) {
          const step = wave[i]!;
          const outcome = settled[i]!;
          if (outcome.status === "fulfilled") {
            // A turn whose provider failed (non-zero exit) or returned no output
            // is a failure, not a silent empty commit. Best-effort steps record
            // it and continue (the join knows the lens is missing); required
            // steps fail the run.
            const turn = this.assessTurnResult(outcome.value);
            if (turn.ok) {
              await commitTurn(step, outcome.value);
            } else if (step.continueOnError) {
              await markStepFailedContinue(step, new Error(turn.reason), turn.failureClass);
              continuedFailures += 1;
            } else {
              await failStepFatal(step, turn.reason);
            }
          } else {
            // A control signal always aborts. A hard throw on a required step
            // aborts; on a best-effort step it's tolerated. (Survivors committed
            // before this index keep their evidence.)
            if (__isControlSignal(outcome.reason)) throw outcome.reason;
            if (step.continueOnError) {
              await markStepFailedContinue(step, outcome.reason);
              continuedFailures += 1;
            } else {
              await failStepFatal(step, describeError(outcome.reason));
            }
          }
          processed.add(step.id);
          done.add(step.id);
        }
        continue;
      }

      // Otherwise run exactly one ready step (deterministic: flow order).
      const step = ready[0]!;
      await runSerialStep(step);
      processed.add(step.id);
      done.add(step.id);
    }

    if (emitLifecycle) {
      await input.eventLog.append({
        type: "flow.graph.completed",
        message:
          continuedFailures > 0
            ? `Graph flow ${snapshot.flowId} traversal complete (${continuedFailures} best-effort step(s) failed and were tolerated).`
            : `Graph flow ${snapshot.flowId} traversal complete.`,
        data: { flowId: snapshot.flowId, continuedFailures },
      });
    }

    return {
      state,
      lastValidation,
      reviewDecision,
      verificationDecision,
      needsTestingAdvisory,
      planArtifact,
      executionArtifact,
      reviewArtifact,
      verificationArtifact,
    };
  }

  private async runFlowSequence(input: {
    snapshot: ResolvedFlowSnapshot;
    runId: string;
    state: RunState;
    worktreePath: string | null;
    branchName: string | null;
    artifactStore: ArtifactStore;
    stateStore: RunStateStore;
    eventLog: EventLog;
    metricsStore: MetricsStore;
    approvalService: ApprovalService;
    notify: (draft: NotificationDraft) => void;
    policyWarnings: PolicyWarning[];
    policyStagesAlreadyForced: Set<string>;
    ctx: {
      runId: string;
      worktreePath: string | null;
      branchName: string | null;
      artifactStore: ArtifactStore;
      eventLog: EventLog;
      stateStore: RunStateStore;
      onProgress: (message: string) => void;
    };
  }): Promise<OrchestratorOutput> {
    let state = input.state;
    // Widened initializers (`as`): these are reassigned inside the per-step
    // `runStep` closure below, which TS control-flow analysis can't see - a
    // plain literal initializer would pin them to the initial value and break
    // the post-loop comparisons. The `as` keeps the full union type.
    let lastValidation = null as ValidationResults | null;
    let reviewDecision = "BLOCKED" as ReviewDecision;
    // A3 express: skip evidence is set ONLY by the deterministic inert-diff
    // evaluator; reviewTurnRan is true once ANY review-turn executed (a review
    // that ran always beats evidence). Widened (`as`) - assigned in runStep.
    let reviewSkipEvidence = null as ReviewSkipEvidence | null;
    let reviewTurnRan = false as boolean;
    let verificationDecision = "NEEDS_HUMAN" as VerificationDecision;
    // Non-blocking "a human should look at this" advisory (Phase 3). Set if a
    // reviewer/verifier emits HUMAN_REVIEW: ADVISORY; surfaced at finalize.
    // Widened initializer (`as`) - reassigned inside the runStep closure, which
    // TS control-flow can't see (same pattern as reviewDecision above).
    let needsTestingAdvisory = null as { reason: string | null } | null;
    let planArtifact: RoleRunResult | null = null;
    let executionArtifact: RoleRunResult | null = null;
    let reviewArtifact: RoleRunResult | null = null;
    let verificationArtifact: RoleRunResult | null = null;
    // Number of times the adaptive loop body ran (review passes). Hoisted so the
    // final report can derive the fix-cycle count even on the error path.
    let loopIteration = 0;
    const outputs = new Map<string, FlowContextOutput>();
    // The run brief (story so far) - a compact, deterministic through-line the
    // orchestrator carries across steps. Seeded from the task + flow selection;
    // each completed step appends its outcome. Injected into every step's prompt.
    const runBriefState = initRunBrief({ task: this.task, selection: this.selection });
    const participantStore = new FlowParticipantLedgerStore(
      this.projectRoot,
      input.runId,
    );
    let participantLedger =
      (await participantStore.read()) ??
      createFlowParticipantLedger({
        snapshot: input.snapshot,
        capabilities: (providerId) =>
          providerCapabilities(this.config.providers, providerId),
      });
    await participantStore.write(participantLedger);
    state = this.patchFlowParticipants(state, participantLedger);
    await input.stateStore.write(state);
    for (const participant of participantLedger.participants) {
      await input.eventLog.append({
        type: "flow.participant.capabilities",
        message: `Flow participant ${participant.seat} uses ${participant.providerId} with ${participant.capabilities.sessionReuse} session reuse.`,
        data: {
          flowId: input.snapshot.flowId,
          seat: participant.seat,
          providerId: participant.providerId,
          capabilities: participant.capabilities,
        },
      });
    }
    const arbitrationStore = new FlowArbitrationStore(
      this.projectRoot,
      input.runId,
    );
    let arbitrationLedger =
      (await arbitrationStore.read()) ??
      createFlowArbitrationLedger({
        runId: input.runId,
        snapshot: input.snapshot,
      });
    await arbitrationStore.write(arbitrationLedger);

    // ── Pick-up execution setup (Phase 3) ──────────────────────────────────
    // When this run is bound to a task, the task has a Checklist, the flow
    // declares a checklistSegment, and a checklist mode was requested, the
    // segment band repeats once per item (in this one worktree, carrying
    // compact summaries forward). Otherwise the segment runs once - the N=1
    // instant-task case, identical to today.
    const roadmap = new RoadmapService(this.projectRoot);
    // Carries the saga step fields (objective / acceptanceCheck / fileHints)
    // alongside id/text so the saga curated packet can ground each step in them.
    // Non-saga reads only ever touch id/text, so this is inert for them.
    let checklistItems: {
      id: string;
      text: string;
      objective: string;
      acceptanceCheck: string;
      fileHints: string[];
      // Phase 3 Enhance: carried so the ENHANCE pass can classify authority
      // (a conductor may not remove an `owner` step) without a second task read.
      provenance: Provenance;
    }[] = [];
    // F1: ground the brief in the bound card's own context (description + open
    // checklist) for ANY `--task` run, not just the pickup band - otherwise the
    // planner sees only the task string and guesses. The per-item checklist
    // ITERATION still gates on the pickup flow + --checklist-mode (below);
    // grounding is unconditional when a card is bound. Redacted + bounded.
    let cardGrounding = "";
    // On a RESUME of a checklist run, the still-pending items would otherwise run
    // with an empty prior-items ledger (the done items were committed in the
    // source run). These terse outcomes re-seed that ledger so cross-item
    // coherence + the holistic postlude survive a resume.
    let resumeSeedOutcomes: ChecklistItemOutcome[] = [];
    if (this.taskId) {
      const task = await roadmap.getTask(this.taskId);
      if (task) {
        cardGrounding = redactSecretsInText(renderTaskGrounding(task)).redacted;
        if (input.snapshot.checklistSegment && this.checklistMode) {
          checklistItems = task.checklist
            .filter((c) => c.status !== "done")
            .map((c) => ({
              id: c.id,
              text: c.text,
              objective: c.objective,
              acceptanceCheck: c.acceptanceCheck,
              fileHints: c.fileHints,
              provenance: c.provenance,
            }));
          // Phase 3 Enhance: if a prior pass left a saga-scoped pending overlay,
          // it supersedes the original pending steps (refined text/objective,
          // resequenced, with removed steps absent). The overlay carries only
          // EXISTING ids (autonomous add is excluded), so `task.checklist` - and
          // thus the resume guard below, which compares its ids - is untouched.
          // Any overlay step that has since completed is filtered out by status.
          //
          // FAIL-CLOSED: only apply the overlay if every id it lists still exists
          // in the checklist. A structural checklist edit clears the overlay at
          // the source (RoadmapService.writeChecklist), but if a stale/foreign
          // overlay ever slips through, we ignore it and run the real checklist
          // rather than silently dropping owner steps it doesn't know about.
          const overlay = task.supervised.pendingRevision;
          const checklistIdSet = new Set(task.checklist.map((c) => c.id));
          if (
            this.sagaMode &&
            overlay &&
            overlay.pending.every((p) => checklistIdSet.has(p.id))
          ) {
            const doneIds = new Set(
              task.checklist.filter((c) => c.status === "done").map((c) => c.id),
            );
            checklistItems = overlay.pending
              .filter((p) => !doneIds.has(p.id))
              .map((p) => ({
                id: p.id,
                text: p.text,
                objective: p.objective,
                acceptanceCheck: p.acceptanceCheck,
                fileHints: p.fileHints,
                provenance: p.provenance,
              }));
          }
          const currentIds = task.checklist.map((c) => c.id);
          if (this.resumeFrom) {
            // Refuse if the checklist was edited between the original run and this
            // resume: resume skips items by their per-item done status, so a
            // mutated list could skip un-built work or re-run the wrong item.
            const sourceRaw = await readJson<unknown>(
              runStatePath(this.projectRoot, this.resumeFrom.sourceRunId),
            ).catch(() => null);
            const sourceParsed = sourceRaw
              ? runStateSchema.safeParse(sourceRaw)
              : null;
            const recordedIds = sourceParsed?.success
              ? sourceParsed.data.checklistItemIds
              : null;
            if (checklistIdsChanged(recordedIds, currentIds)) {
              throw new Error(
                "This task's checklist changed since the run being resumed (items added, removed, or reordered). Re-run the task instead of resuming - resume-from-item relies on a stable checklist.",
              );
            }
            resumeSeedOutcomes = reconstructDoneOutcomes(task.checklist);
          }
          // Record the ordered ids so a later resume of THIS run can verify the
          // checklist hasn't shifted under it (fails open when absent).
          state = { ...state, checklistItemIds: currentIds };
          await input.stateStore.write(state);
        }
      }
    }
    // Hoisted above the try so the finalize block (final report) and the catch
    // (mark a failed item blocked) can see them.
    const itemOutcomes: ChecklistItemOutcome[] = [];
    // On resume, start the ledger with the items the source run already
    // committed (see resumeSeedOutcomes above), so pending items + the postlude
    // see them instead of an empty list.
    itemOutcomes.push(...resumeSeedOutcomes);
    let currentChecklistItemId: string | null = null;
    // Per-item REVIEW band (Shape B): the band can't emit a ledger token, so the
    // per-item loop records its resolved verdict here, and commitChecklistItem
    // stamps it onto the item outcome. null for non-review bands / Shape A.
    let pendingItemReview:
      | {
          verdict: "approved" | "changes_requested";
          openFindingCount: number;
          fixIterations: number;
        }
      | null = null;

    const taskBriefBody = [
      "# Flow Task Brief",
      "",
      `Task: ${this.task}`,
      "",
      input.snapshot.brief ? input.snapshot.brief : "_No extra Flow brief._",
      cardGrounding ? `\n${cardGrounding}` : "",
      checklistItems.length
        ? "\n## Checklist (work these in order, one per item band)\n" +
          checklistItems.map((c, i) => `${i + 1}. ${c.text}`).join("\n")
        : "",
    ].join("\n");
    const taskBriefAbs = await input.artifactStore.write(
      path.posix.join("flows", "task-brief.md"),
      `${taskBriefBody}\n`,
    );
    outputs.set("task-brief", {
      token: "task-brief",
      label: "Task Brief",
      content: `${taskBriefBody}\n`,
      artifactPath: input.artifactStore.relPath(taskBriefAbs),
    });

    try {
      const steps = input.snapshot.steps;
      const loop = input.snapshot.loop;
      // Per-item band indices (Phase 3). Disjoint from the adaptive loop by
      // schema (segment ends before any loop), so the two jump-backs never
      // collide. Read-only runs never iterate items (the band writes code).
      const segment = input.snapshot.checklistSegment;
      const segFrom = segment
        ? steps.findIndex((s) => s.sourceStepId === segment.from)
        : -1;
      const segTo = segment
        ? steps.findIndex((s) => s.sourceStepId === segment.to)
        : -1;
      // Phase D (checklist DAGs): the per-item band itself declares `needs`, so
      // each item runs the band as a mini-DAG through the frontier scheduler
      // (read-only fan-out -> serial writer join) rather than the linear walk.
      // The schema confines graph edges to the band, so this is true iff a band
      // step has `needs`. Independent of `usingChecklist`: a read-only / N=1 run
      // (no items) still runs the band ONCE through the frontier (the fan-out is
      // valuable regardless) - see the band branch in the walk below.
      const bandIsGraph =
        segment !== null &&
        segFrom >= 0 &&
        segTo >= segFrom &&
        steps.slice(segFrom, segTo + 1).some((s) => s.needs.length > 0);
      const usingChecklist =
        segment !== null &&
        segFrom >= 0 &&
        segTo >= 0 &&
        checklistItems.length > 0 &&
        !this.readOnly;
      let itemIndex = 0;
      if (usingChecklist) {
        state = {
          ...state,
          checklistProgress: {
            total: checklistItems.length,
            completed: 0,
            currentItemId: checklistItems[0]!.id,
            currentIndex: 0,
          },
        };
        await input.stateStore.write(state);
        await input.eventLog.append({
          type: "checklist.run.started",
          message: `Pick-up run over ${checklistItems.length} checklist item(s) (${this.checklistMode}).`,
          data: {
            total: checklistItems.length,
            mode: this.checklistMode,
            segment: { from: segment!.from, to: segment!.to },
          },
        });
      }
      const loopFrom = loop
        ? steps.findIndex((s) => s.sourceStepId === loop.from)
        : -1;
      const loopTo = loop
        ? steps.findIndex((s) => s.sourceStepId === loop.to)
        : -1;
      if (loop && (loopFrom < 0 || loopTo < 0)) {
        throw new Error(
          `Flow loop references unknown step(s) (from=${loop.from}, to=${loop.to}).`,
        );
      }

      // Resume: rewind to a stage by seeding the outputs of every step before
      // the first step at that stage from the source run, marking them skipped,
      // and starting the walk there. Native to the flow runner - driven by the
      // step `stage` metadata, no run() delegation.
      let stepIndex = 0;
      // ── Whole-flow graph (DAG) flows: the bounded fan-out/join scheduler ──
      // A graph flow with NO checklist band runs the WHOLE flow through the
      // frontier scheduler instead of the linear walk. It sets the same decision
      // locals the finalize block reads, then we park the linear cursor at the
      // end so the `while` below is a no-op - the linear path stays byte-for-byte
      // unchanged for every other flow. A graph flow that DOES declare a
      // checklistSegment (Phase D) takes the linear path below instead, which
      // runs the per-item band through the frontier once per item (see the
      // `bandIsGraph` branch in the walk) - so it is excluded here.
      if (isGraphFlow(input.snapshot) && !input.snapshot.checklistSegment) {
        // Resume works for graph flows too: seed the upstream prefix (mark it
        // skipped, copy its artifacts, restore the worktree snapshot) exactly
        // as the linear path does, then let the frontier scheduler treat those
        // seeded steps as already-done (see runGraphFrontier) and advance only
        // the remaining fan-out/join. The steps array is a valid topological
        // sort, so seeding [0, resumeStartIndex) can never strand a dependency.
        if (this.resumeFrom) {
          const seeded = await this.seedResumedSteps({
            snapshot: input.snapshot,
            resumeFrom: this.resumeFrom,
            state,
            worktreePath: input.worktreePath,
            outputs,
            targetStore: input.artifactStore,
            stateStore: input.stateStore,
            eventLog: input.eventLog,
          });
          state = seeded.state;
          if (seeded.planArtifact) planArtifact = seeded.planArtifact;
          if (seeded.executionArtifact) executionArtifact = seeded.executionArtifact;
        }
        let gr: Awaited<ReturnType<typeof this.runGraphFrontier>>;
        try {
          gr = await this.runGraphFrontier({
            snapshot: input.snapshot,
            runId: input.runId,
            state,
            worktreePath: input.worktreePath,
            artifactStore: input.artifactStore,
            stateStore: input.stateStore,
            eventLog: input.eventLog,
            metricsStore: input.metricsStore,
            approvalService: input.approvalService,
            notify: input.notify,
            policyStagesAlreadyForced: input.policyStagesAlreadyForced,
            outputs,
            arbitrationLedger,
            arbitrationStore,
            runBriefState,
            ctx: input.ctx,
          });
        } catch (err) {
          // The frontier owns its own `state` and persists it directly. On a
          // throw, re-sync from disk so the run()-level catch sees the frontier's
          // final per-step statuses (e.g. the step it marked failed) instead of
          // this method's now-stale copy, which it would otherwise clobber.
          state = await input.stateStore.read().catch(() => state);
          throw err;
        }
        state = gr.state;
        lastValidation = gr.lastValidation;
        reviewDecision = gr.reviewDecision;
        verificationDecision = gr.verificationDecision;
        needsTestingAdvisory = gr.needsTestingAdvisory;
        // On a resume the seeded prefix (plan/execution) wasn't re-run by the
        // frontier, so keep the seeded artifact when the frontier produced none.
        planArtifact = gr.planArtifact ?? planArtifact;
        executionArtifact = gr.executionArtifact ?? executionArtifact;
        reviewArtifact = gr.reviewArtifact ?? reviewArtifact;
        verificationArtifact = gr.verificationArtifact ?? verificationArtifact;
        stepIndex = steps.length; // frontier ran everything; linear walk is a no-op
      } else if (this.resumeFrom) {
        const seeded = await this.seedResumedSteps({
          snapshot: input.snapshot,
          resumeFrom: this.resumeFrom,
          state,
          worktreePath: input.worktreePath,
          outputs,
          targetStore: input.artifactStore,
          stateStore: input.stateStore,
          eventLog: input.eventLog,
        });
        state = seeded.state;
        stepIndex = seeded.resumeStartIndex;
        if (seeded.planArtifact) planArtifact = seeded.planArtifact;
        if (seeded.executionArtifact) executionArtifact = seeded.executionArtifact;
        // Phase D: resuming INTO a per-item band DAG is out of scope this slice -
        // the band is run as a unit (per item) by the frontier, so landing the
        // cursor between segFrom and segTo would seed a partial band and stall
        // (a band root's `needs` is unsatisfied). Resuming at/before segFrom
        // (re-runs the not-yet-done items) or after segTo (postlude) is fine.
        if (bandIsGraph && stepIndex > segFrom && stepIndex <= segTo) {
          throw new Error(
            `Cannot resume into the per-item band of a checklist + graph flow (stage lands inside ${segment!.from}..${segment!.to}). Resume at or before "${segment!.from}", or after "${segment!.to}".`,
          );
        }
      }

      // Adaptive-loop-aware traversal. Linear flows (loop === null) advance one
      // step at a time, exactly as before. When a flow declares a loop, the
      // decisionStep (a review-turn at/inside from..to) gates re-entry: after it
      // runs we exit past `to` when the review isn't CHANGES_REQUESTED or the
      // iteration budget is spent; otherwise we finish the body and jump back to
      // `from`. The gate can sit at the body head so an early APPROVED skips the
      // remaining body (e.g. the default flow's fix) - mirroring run()'s loop.

      // ── Per-item band entry/exit, factored (Phase 3 + D) ──────────────────
      // The side-effecting bodies of the per-item band entry (scope the segment
      // to one item) and exit (commit/summarize/carry the item) are shared by
      // BOTH the linear walk and the Phase-D graph band so there is one source of
      // truth for per-item commit. Control flow (jump-back, itemIndex, the
      // step-mode pause) stays inline at the call sites.
      const enterChecklistItem = async (i: number): Promise<void> => {
        // Fresh per-item review state; the band's loop (review bands only) sets it.
        pendingItemReview = null;
        const item = checklistItems[i]!;
        const briefContent = renderCurrentItemBrief(item, i, checklistItems.length);
        const briefAbs = await input.artifactStore.write(
          path.posix.join("flows", "checklist", `item-${i + 1}-brief.md`),
          briefContent,
        );
        outputs.set("checklist-item", {
          token: "checklist-item",
          label: `Checklist item ${i + 1}/${checklistItems.length}`,
          content: briefContent,
          artifactPath: input.artifactStore.relPath(briefAbs),
        });
        const priorContent = buildPriorItemsContext(itemOutcomes, 1400);
        if (priorContent) {
          const priorAbs = await input.artifactStore.write(
            path.posix.join("flows", "checklist", `before-item-${i + 1}.md`),
            priorContent,
          );
          outputs.set("prior-items", {
            token: "prior-items",
            label: "Completed checklist items",
            content: priorContent,
            artifactPath: input.artifactStore.relPath(priorAbs),
          });
        }
        // ── Saga: fresh session + curated packet per step (M2b) ──────────────
        // enterChecklistItem fires ONCE per item, at the band head, BEFORE the
        // fix loop. So both effects below are guarded to the item boundary, NOT
        // the fix loop: the session is reset per step (not per fix iteration),
        // and the packet is built once per step. Gated on sagaMode so non-saga
        // and plain checklist runs are byte-for-byte unchanged.
        if (this.sagaMode) {
          // Deliverable 1: null every participant's sessionId and persist, so the
          // next provider turn that DOES reuse sessions opens a FRESH one
          // (prepareFlowParticipantTurn opens a new session when sessionId is
          // null - flow-participant-ledger.ts). Resetting the whole band is
          // intentional: the micro-plan -> implement -> review-item step starts
          // from a clean context, the anti-rot guarantee sagas exist for.
          // (The saga band steps run via the graph frontier's runRole, which is
          // already stateless per turn, so for them this is a guard, not a
          // change; it bites for the linear plan/review participants and any
          // future session-reusing band.) The context_reset event is the robust
          // per-step signal: it fires ONCE per step at the band head, NOT per fix
          // iteration, which is what makes each step a fresh context.
          let sessionsReset = 0;
          for (const participant of participantLedger.participants) {
            if (participant.sessionId !== null) {
              participant.sessionId = null;
              sessionsReset += 1;
            }
          }
          if (sessionsReset > 0) {
            await participantStore.write(participantLedger);
            state = this.patchFlowParticipants(state, participantLedger);
          }
          await input.eventLog.append({
            type: "supervised.step.context_reset",
            message: `Saga step ${i + 1}/${checklistItems.length}: fresh context (${sessionsReset} session(s) reset).`,
            data: { itemId: item.id, index: i, sessionsReset },
          });

          // Deliverable 2: build the curated packet from in-scope values and set
          // it as the `checklist-item` token (the saga flow's steps read it). The
          // packet SUPERSEDES the plain brief written above. We still keep the
          // brief artifact (audit) and also write the packet artifact.
          let accumulatedDiff = "";
          if (input.worktreePath) {
            // Diff from the fork point of the branch the worktree forked from, so
            // committed prior steps are captured (git diff HEAD would miss them).
            const baseBranch = await getCurrentBranch(this.projectRoot).catch(
              () => null,
            );
            accumulatedDiff = await getWorktreeDiffText({
              worktreePath: input.worktreePath,
              baseBranch,
            }).catch(() => "");
          }
          const fileReads = input.worktreePath
            ? await readFreshFileReads({
                worktreePath: input.worktreePath,
                fileHints: item.fileHints,
              }).catch(() => [])
            : [];
          // Re-read the invariants ledger FRESH each step: the between-steps
          // supervisor (M3d) appends to it after the previous step, so a value
          // cached at band head would be stale by step 2.
          const sagaInvariants = this.taskId
            ? (await roadmap.getTask(this.taskId).catch(() => null))
                ?.supervised.invariants ?? []
            : [];
          const packet = buildStepPacket({
            goal: this.task,
            priorItemsContext: priorContent,
            accumulatedDiff,
            fileReads,
            invariants: sagaInvariants,
            item: {
              text: item.text,
              objective: item.objective,
              acceptanceCheck: item.acceptanceCheck,
              index: i,
              total: checklistItems.length,
              fileHints: item.fileHints,
            },
          });
          const packetAbs = await input.artifactStore.write(
            path.posix.join("flows", "checklist", `item-${i + 1}-packet.md`),
            packet,
          );
          outputs.set("checklist-item", {
            token: "checklist-item",
            label: `Saga step ${i + 1}/${checklistItems.length}`,
            content: packet,
            artifactPath: input.artifactStore.relPath(packetAbs),
          });
        }
        currentChecklistItemId = item.id;
        await roadmap
          .setChecklistItemStatus(this.taskId!, item.id, "in_progress")
          .catch(() => {});
        state = {
          ...state,
          checklistProgress: {
            total: checklistItems.length,
            completed: i,
            currentItemId: item.id,
            currentIndex: i,
          },
        };
        await input.stateStore.write(state);
        await input.eventLog.append({
          type: "checklist.item.started",
          message: `Checklist item ${i + 1}/${checklistItems.length}: ${item.text}`,
          data: { itemId: item.id, index: i, text: item.text },
        });
        this.onProgress(`Item ${i + 1}/${checklistItems.length}: ${item.text}`);
      };

      // Commit + summarize this item; returns whether more items remain. The
      // caller advances itemIndex / jumps back / pauses. "proceed" also means the
      // full prior-items ledger has been rebuilt for the holistic postlude.
      const commitChecklistItem = async (
        i: number,
      ): Promise<"repeat" | "proceed"> => {
        const item = checklistItems[i]!;
        let commitSha: string | null = null;
        let filesTouched: string[] = [];
        if (input.worktreePath) {
          const committed = await stageAndCommitAll({
            cwd: input.worktreePath,
            message: `${item.text}\n\nChecklist item ${i + 1}/${checklistItems.length}.`,
            trailers: {
              "Vibestrate-Run": input.runId,
              "Vibestrate-Checklist-Item": item.id,
              ...creditTrailers(this.config.commits),
            },
          });
          commitSha = committed?.sha ?? null;
          if (committed && committed.excludedSymlinks.length > 0) {
            // Never silent: the commit refused to carry out-of-tree symlinks
            // (worktree env links a dir-only ignore pattern missed).
            await input.eventLog.append({
              type: "git.commit.excluded-symlinks",
              message: `Commit excluded out-of-tree symlink(s): ${committed.excludedSymlinks.join(", ")}.`,
              data: { excludedSymlinks: committed.excludedSymlinks },
            });
          }
          if (commitSha) {
            filesTouched = await filesInCommit(input.worktreePath, commitSha);
          }
        }
        // Summarize the item by the writer's `execution` output when present
        // (Phase D: the band tail `segTo` may be a read-only join/arbiter whose
        // first output is a verdict, not the build) - fall back to segTo's output.
        const implTok = outputs.has("execution")
          ? "execution"
          : steps[segTo]!.outputs[0];
        const implOutput = implTok ? outputs.get(implTok)?.content ?? "" : "";
        const outcome: ChecklistItemOutcome = {
          itemId: item.id,
          index: i,
          total: checklistItems.length,
          text: item.text,
          status: "done",
          commitSha,
          filesTouched,
          summary: redactSecretsInText(compactImplementationSummary(implOutput)).redacted,
          error: null,
          reviewVerdict: pendingItemReview?.verdict ?? null,
          openFindingCount: pendingItemReview?.openFindingCount ?? 0,
          fixIterations: pendingItemReview?.fixIterations ?? 0,
        };
        itemOutcomes.push(outcome);
        currentChecklistItemId = null;
        await input.artifactStore.write(
          path.posix.join("flows", "checklist", `item-${i + 1}-summary.md`),
          renderItemSummaryArtifact(outcome),
        );
        await roadmap
          .updateChecklistItem(this.taskId!, item.id, {
            status: "done",
            commitSha,
            // Saga mode (M1): stamp the step's run + curated outcome so a saga's
            // checklist records which run executed each step and a one-line
            // result. Reuse the SAME redacted summary already computed for the
            // outcome (no second redaction pass). Non-saga checklist runs leave
            // these fields untouched (their false-capability gap is unchanged).
            ...(this.sagaMode
              ? { runId: input.runId, outcomeSummary: outcome.summary }
              : {}),
          })
          .catch(() => {});
        state = {
          ...state,
          checklistProgress: {
            total: checklistItems.length,
            completed: i + 1,
            currentItemId: null,
            currentIndex: i,
          },
        };
        await input.stateStore.write(state);
        await input.eventLog.append({
          type: "checklist.item.completed",
          message: `Checklist item ${i + 1}/${checklistItems.length} done${commitSha ? ` (${commitSha.slice(0, 8)})` : " (no file changes)"}.`,
          data: { itemId: item.id, index: i, commitSha, files: filesTouched },
        });
        if (i < checklistItems.length - 1) return "repeat";
        // Last item done -> rebuild prior-items with the FULL ledger so the
        // holistic postlude (review/verify) sees every item.
        const fullPrior = buildPriorItemsContext(itemOutcomes, 1400);
        if (fullPrior) {
          const fullAbs = await input.artifactStore.write(
            path.posix.join("flows", "checklist", "all-items.md"),
            fullPrior,
          );
          outputs.set("prior-items", {
            token: "prior-items",
            label: "All completed checklist items",
            content: fullPrior,
            artifactPath: input.artifactStore.relPath(fullAbs),
          });
        }
        return "proceed";
      };

      // Step-by-step gate between items (shared by both paths): pause so the next
      // item's first step (or the next band) holds until the human resumes.
      const maybeStepModeGate = async (nextIndex: number): Promise<void> => {
        if (this.checklistMode !== "step") return;
        state = { ...state, pauseRequested: true };
        await input.stateStore.write(state);
        await input.eventLog.append({
          type: "checklist.item.gate",
          message: `Step-by-step: paused before item ${nextIndex + 1}/${checklistItems.length}.`,
          data: { nextIndex },
        });
      };

      while (stepIndex < steps.length) {
        const step = steps[stepIndex]!;
        if (loop && stepIndex === loopFrom) {
          loopIteration += 1;
          await input.eventLog.append({
            type: "flow.loop.iteration",
            message: `Flow loop pass ${loopIteration}/${loop.maxIterations} (body ${loop.from}..${loop.to}).`,
            data: {
              flowId: input.snapshot.flowId,
              iteration: loopIteration,
              maxIterations: loop.maxIterations,
              from: loop.from,
              to: loop.to,
            },
          });
        }
        // ── Per-item band as a DAG (Phase D): run the band via the frontier ──
        // When the band declares `needs`, run [segFrom..segTo] through the
        // frontier scheduler (read-only fan-out -> serial writer join) instead of
        // the linear walk: once per checklist item, or ONCE for a read-only / N=1
        // run (no items - the fan-out is valuable regardless). priorDoneOverride
        // is EMPTY so the band steps re-run each item (their persisted "passed"
        // status from the prior item must not make them count as done).
        if (bandIsGraph && stepIndex === segFrom) {
          if (usingChecklist) await enterChecklistItem(itemIndex);
          const bandSteps = steps.slice(segFrom, segTo + 1);
          // A REVIEW band ends in a review-turn (Shape B `pickup-review`: the
          // arbiter at `segTo` renders a per-item verdict). A non-review band
          // (Shape A `pickup-analysis`) ends in the writer - it must run the
          // frontier ONCE against the RUN-LEVEL ledger/store and commit, exactly
          // as before. The whole new loop is gated on `isReviewBand` so that path
          // stays byte-identical.
          //
          // (The resolved snapshot does not carry `checklistReview` - only the
          // flow definition does - so detect on the segTo step kind, which is the
          // brief's sanctioned fallback and the real, type-safe signal.)
          const isReviewBand = steps[segTo]?.kind === "review-turn";

          // Per-item review-loop budget. `pickup-review` declares no flow-level
          // `loop`, so default `flowMax` to 2 (one fix attempt) and let the crew
          // override / global ceiling adjust it - sourced exactly as the run-level
          // loop is in flow-resolver.ts (crew.maxReviewLoops > config ceiling).
          const { crew: bandCrew } = getCrew(this.config, this.activeCrewId);
          const maxItns = isReviewBand
            ? resolveLoopMaxIterations({
                flowMax: input.snapshot.loop?.maxIterations ?? 2,
                crewMax: bandCrew.maxReviewLoops,
                globalCeiling: this.config.workflow.maxReviewLoops,
              })
            : 1;

          // Review bands record into their OWN per-item ledger/store so item N's
          // verdict never collides with item N-1's (or the run-level
          // arbitration.json). Non-review bands keep using the run-level ledger.
          const itemStore = isReviewBand
            ? new FlowArbitrationStore(
                this.projectRoot,
                input.runId,
                runChecklistItemArbitrationPath(
                  this.projectRoot,
                  input.runId,
                  itemIndex,
                ),
              )
            : arbitrationStore;
          let itemLedger = isReviewBand
            ? createFlowArbitrationLedger({
                runId: input.runId,
                snapshot: input.snapshot,
              })
            : arbitrationLedger;
          if (isReviewBand) await itemStore.write(itemLedger);

          let fixIterations = 0;
          let lastDecision: ReviewDecision = "BLOCKED";
          for (let itn = 0; itn < maxItns; itn++) {
            // On a fix iteration, hand the writer the arbiter's consolidated
            // must-fix list (its prior `review-decision` output) as a named input
            // (`per-item-findings`, declared on `implement`). Iteration 0 has no
            // findings yet, so the token is removed (the context builder marks an
            // unproduced input omitted-unavailable - no stale carry-over).
            if (isReviewBand && itn > 0) {
              const mustFix = outputs.get("review-decision")?.content ?? "";
              const mustFixAbs = await input.artifactStore.write(
                path.posix.join(
                  "flows",
                  "checklist",
                  `item-${itemIndex + 1}-must-fix-${itn}.md`,
                ),
                mustFix,
              );
              outputs.set("per-item-findings", {
                token: "per-item-findings",
                label: "Open review findings to fix for this item",
                content: mustFix,
                artifactPath: input.artifactStore.relPath(mustFixAbs),
              });
            } else {
              outputs.delete("per-item-findings");
            }
            let gr: Awaited<ReturnType<typeof this.runGraphFrontier>>;
            try {
              gr = await this.runGraphFrontier({
                snapshot: input.snapshot,
                stepsOverride: bandSteps,
                priorDoneOverride: new Set<string>(),
                emitLifecycle: false,
                runId: input.runId,
                state,
                worktreePath: input.worktreePath,
                artifactStore: input.artifactStore,
                stateStore: input.stateStore,
                eventLog: input.eventLog,
                metricsStore: input.metricsStore,
                approvalService: input.approvalService,
                notify: input.notify,
                policyStagesAlreadyForced: input.policyStagesAlreadyForced,
                outputs,
                arbitrationLedger: itemLedger,
                arbitrationStore: itemStore,
                runBriefState,
                ctx: input.ctx,
              });
            } catch (err) {
              // The frontier persists its own `state`; re-sync from disk on a throw
              // so the run()-level catch sees the band's final per-step statuses.
              state = await input.stateStore.read().catch(() => state);
              throw err;
            }
            // Adopt the frontier's state BEFORE the per-item commit, or the commit
            // would write a stale copy over the band's per-step writes (P-HIGH-3).
            state = gr.state;
            // Carry the writer's artifacts forward (last item wins). The band's own
            // review/verify decisions are per-item and deliberately NOT propagated:
            // run-level verdicts come from the linear postlude (P4).
            planArtifact = gr.planArtifact ?? planArtifact;
            executionArtifact = gr.executionArtifact ?? executionArtifact;
            // Read the per-item verdict IMMEDIATELY this pass: the run-scoped
            // reviewDecision is overwritten by each item then the holistic
            // postlude, so the loop must trust `gr.reviewDecision` here, not it.
            lastDecision = gr.reviewDecision;
            if (isReviewBand) {
              await input.eventLog.append({
                type: "flow.checklist.item.review",
                message: `Item ${itemIndex + 1} review pass ${itn + 1}/${maxItns}: ${lastDecision}.`,
                data: {
                  itemId: checklistItems[itemIndex]?.id ?? null,
                  iteration: itn + 1,
                  maxIterations: maxItns,
                  verdict: lastDecision,
                },
              });
            }
            // Stop once approved (or any non-CHANGES_REQUESTED verdict), or for a
            // non-review band (which never loops). A surviving CHANGES_REQUESTED
            // counts as one more fix attempt only if the budget allows another
            // pass; on exhaustion we cap-and-continue (the item still commits).
            if (!isReviewBand || lastDecision !== "CHANGES_REQUESTED") break;
            if (itn + 1 < maxItns) fixIterations += 1;
          }

          if (isReviewBand) {
            // The band can't emit a ledger token (`decision-summary`), so record
            // the resolved verdict EXPLICITLY into the per-item ledger.
            const recommendation =
              lastDecision === "APPROVED"
                ? "merge-ready"
                : lastDecision === "BLOCKED"
                  ? "blocked"
                  : "changes-requested";
            itemLedger = (await itemStore.read()) ?? itemLedger;
            itemLedger = recordFlowDecision({
              ledger: itemLedger,
              output: buildItemDecisionOutput({
                stepId: steps[segTo]!.id,
                recommendation,
                summary: outputs.get("review-decision")?.content ?? "",
              }),
              sourceArtifactPath:
                outputs.get("review-decision")?.artifactPath ??
                `flows/checklist/item-${itemIndex + 1}-arbitration.json`,
            });
            await itemStore.write(itemLedger);
            pendingItemReview = {
              verdict:
                recommendation === "merge-ready"
                  ? "approved"
                  : "changes_requested",
              openFindingCount: openFindingCount(itemLedger),
              fixIterations,
            };
          }

          // ── Saga clean halt (Phase 2 Conductor) ─────────────────────────
          // In saga mode a step whose per-item self-heal is exhausted (still
          // CHANGES_REQUESTED after maxReviewLoops, or BLOCKED) must NOT commit
          // a green-but-broken item and must NOT let a later step build on a
          // broken one. Discard this step's uncommitted work so the branch ends
          // at the last good item, record the halt on the task (the item stays
          // `pending`, so a later resume re-attempts it from the clean tip),
          // force a BLOCKED run verdict, and exit the band - the terminal logic
          // then ends the run blocked, skipping the holistic postlude over
          // incomplete work.
          if (
            this.sagaMode &&
            isReviewBand &&
            (lastDecision === "CHANGES_REQUESTED" || lastDecision === "BLOCKED")
          ) {
            const haltItem = checklistItems[itemIndex]!;
            if (input.worktreePath) {
              await discardWorktreeChanges(input.worktreePath).catch(() => {});
            }
            if (this.taskId) {
              await roadmap
                .setChecklistItemStatus(this.taskId, haltItem.id, "pending")
                .catch(() => {});
              await roadmap
                .recordSagaHalt(this.taskId, {
                  reason: "self-heal-exhausted",
                  atStepId: haltItem.id,
                  summary: compactImplementationSummary(
                    outputs.get("review-decision")?.content ?? "",
                  ),
                })
                .catch(() => {});
            }
            currentChecklistItemId = null;
            await input.eventLog.append({
              type: "supervised.halted",
              message: `Saga halted at step ${itemIndex + 1}/${checklistItems.length}: ${haltItem.text} (self-heal exhausted, verdict ${lastDecision}).`,
              data: { itemId: haltItem.id, index: itemIndex, verdict: lastDecision },
            });
            reviewDecision = "BLOCKED";
            stepIndex = steps.length;
            continue;
          }
          if (usingChecklist) {
            const dir = await commitChecklistItem(itemIndex);
            if (dir === "repeat") {
              // ── Saga budget halt (Phase 2 Conductor, M4) ────────────────
              // A clean step just finished and committed; more steps remain.
              // In saga mode, check the per-saga budget BEFORE starting the
              // next step. This is a BETWEEN-STEPS checkpoint, not a mid-step
              // wall: the just-finished step may have overshot `maxSpendUsd`
              // by up to its own cost (the only mid-step ceiling is the global
              // DAILY spend cap, enforced pre-turn). On halt, KEEP the
              // completed/committed work (do NOT discardWorktreeChanges - that
              // differs from the M1 self-heal halt, which resets a FAILED
              // step), record the halt, force a BLOCKED verdict, and exit the
              // band so the run ends blocked without the holistic postlude.
              if (this.sagaMode) {
                const completedItem = checklistItems[itemIndex]!;
                const spentUsd = await computeRunSpendUsd(
                  input.metricsStore,
                ).catch(() => 0);
                const stepsCompleted = itemIndex + 1;
                const stop = checkSagaStopConditions({
                  spentUsd,
                  stepsCompleted,
                  budget: this.sagaBudget,
                });
                if (stop.halt) {
                  if (this.taskId) {
                    await roadmap
                      .recordSagaHalt(this.taskId, {
                        reason: stop.reason ?? "budget reached",
                        atStepId: completedItem.id,
                        summary: `Saga halted after step ${stepsCompleted}/${checklistItems.length} (${completedItem.text}): ${stop.reason ?? "budget reached"}. Completed work is committed and kept.`,
                      })
                      .catch(() => {});
                  }
                  currentChecklistItemId = null;
                  await input.eventLog.append({
                    type: "supervised.halted",
                    message: `Saga halted after step ${stepsCompleted}/${checklistItems.length}: ${stop.reason ?? "budget reached"} (completed work kept).`,
                    data: {
                      itemId: completedItem.id,
                      index: itemIndex,
                      reason: stop.reason,
                      spentUsd,
                      stepsCompleted,
                    },
                  });
                  reviewDecision = "BLOCKED";
                  stepIndex = steps.length;
                  continue;
                }

                // ── Saga supervisor turn (Phase 2b, M3) ─────────────────
                // The step committed and is within budget. Before the next
                // step a cheap model judges PROCEED vs ESCALATE and records
                // any new cross-cutting invariant into the durable ledger.
                // ESCALATE halts cleanly KEEPING the committed work (unlike
                // the M1 self-heal halt, which resets a BROKEN step) - the
                // supervisor caught saga-level drift the per-item review
                // can't see, not a broken step. A failed/unparseable turn
                // folds to PROCEED (advisory; the per-item review already
                // fail-closes correctness). This is the ONLY place a saga
                // touches `reviewDecision`, and only on the ESCALATE halt.
                if (this.sagaSupervisor.enabled && this.taskId) {
                  const verdict = await this.runSagaSupervisorTurn({
                    completedItem,
                    itemIndex,
                    checklistItems,
                    input,
                  }).catch((err: unknown) => {
                    // A blown daily spend cap HALTS the run (stopped-by-cap),
                    // exactly like a real role turn - it is not a supervisor
                    // failure. Every other failure folds to PROCEED (advisory).
                    if (err instanceof __SpendCapStopSignal) throw err;
                    return "PROCEED" as const;
                  });
                  if (verdict === "ESCALATE") {
                    // KEEP the committed work - do NOT discardWorktreeChanges.
                    await roadmap
                      .recordSagaHalt(this.taskId, {
                        reason: "supervisor-escalate",
                        atStepId: completedItem.id,
                        summary: `Saga escalated by the supervisor after step ${stepsCompleted}/${checklistItems.length} (${completedItem.text}): off-goal or building on something wrong. Completed work is committed and kept.`,
                      })
                      .catch(() => {});
                    currentChecklistItemId = null;
                    await input.eventLog.append({
                      type: "supervised.halted",
                      message: `Saga halted after step ${stepsCompleted}/${checklistItems.length}: supervisor ESCALATE (completed work kept).`,
                      data: {
                        itemId: completedItem.id,
                        index: itemIndex,
                        reason: "supervisor-escalate",
                        stepsCompleted,
                      },
                    });
                    reviewDecision = "BLOCKED";
                    stepIndex = steps.length;
                    continue;
                  }
                  // ── Saga ENHANCE pass (Phase 3) ───────────────────────
                  // The supervisor judged the plan has diverged from reality.
                  // Re-ground the PENDING steps (refine/reorder/remove) before
                  // the next one. The pass mutates the in-memory pending tail in
                  // place and persists a saga-scoped overlay atomically (the
                  // resume guard is untouched). A structural change it may not
                  // make autonomously (an add, or removing an owner step)
                  // escalates - a clean halt keeping the committed work, exactly
                  // like a supervisor ESCALATE.
                  if (verdict === "ENHANCE") {
                    const outcome = await this.runSagaEnhanceTurn({
                      completedItem,
                      itemIndex,
                      checklistItems,
                      input,
                    }).catch((err: unknown) => {
                      if (err instanceof __SpendCapStopSignal) throw err;
                      return "noop" as const;
                    });
                    if (outcome === "escalate") {
                      await roadmap
                        .recordSagaHalt(this.taskId, {
                          reason: "enhance-escalate",
                          atStepId: completedItem.id,
                          summary: `Saga escalated by the conductor's Enhance pass after step ${stepsCompleted}/${checklistItems.length} (${completedItem.text}): a structural plan change (a new step, or dropping an owner-authored step) needs the owner. Completed work is committed and kept.`,
                        })
                        .catch(() => {});
                      currentChecklistItemId = null;
                      await input.eventLog.append({
                        type: "supervised.halted",
                        message: `Saga halted after step ${stepsCompleted}/${checklistItems.length}: Enhance escalated to the owner (completed work kept).`,
                        data: {
                          itemId: completedItem.id,
                          index: itemIndex,
                          reason: "enhance-escalate",
                          stepsCompleted,
                        },
                      });
                      reviewDecision = "BLOCKED";
                      stepIndex = steps.length;
                      continue;
                    }
                  }
                }
              }
              itemIndex += 1;
              await maybeStepModeGate(itemIndex);
              stepIndex = segFrom;
              continue;
            }
          }
          stepIndex = segTo + 1;
          continue;
        }
        // ── Per-item band entry (Phase 3, linear band): scope it to this item ──
        if (usingChecklist && stepIndex === segFrom) {
          await enterChecklistItem(itemIndex);
        }
        const runStep = async (): Promise<void> => {
          // Read-only runs skip write/validation/verify steps the same way
          // run() does - investigation only. Disabled (skipped-optional) steps
          // skip too.
          const readOnlySkip = this.readOnly && step.skipWhenReadOnly;
          if (!step.enabled || readOnlySkip) {
            state = this.patchFlowStep(
              state,
              step.id,
              { status: "skipped", endedAt: nowIso() },
              step.id,
            );
            await input.stateStore.write(state);
            await input.eventLog.append({
              type: "flow.step.skipped",
              message: readOnlySkip
                ? `Flow step ${step.id} skipped (read-only run).`
                : `Flow step ${step.id} skipped.`,
              data: {
                flowId: input.snapshot.flowId,
                stepId: step.id,
                readOnly: readOnlySkip,
              },
            });
            return;
          }

          // A3 (express): deterministic review descent. A review-turn marked
          // `skipWhen: "inert_diff"` is skipped ONLY on recorded diff evidence -
          // every changed file strict-prose AND unprotected (review-descent.ts).
          // Model judgment and task text play no part. Read-only runs always
          // review (their diff is empty, so "evidence" there would be vacuous).
          // Any uncertainty (no worktree, diff error) -> the review runs.
          if (
            step.kind === "review-turn" &&
            step.skipWhen === "inert_diff" &&
            !this.readOnly
          ) {
            const descent = await this.evaluateReviewDescentForWorktree(
              input.worktreePath,
            );
            if (descent?.skip) {
              reviewSkipEvidence = { stepId: step.id, files: descent.files };
              state = this.patchFlowStep(
                state,
                step.id,
                { status: "skipped", endedAt: nowIso() },
                step.id,
              );
              state = {
                ...state,
                reviewSkipped: {
                  reason: "inert_diff",
                  stepId: step.id,
                  files: descent.files,
                },
              };
              await input.stateStore.write(state);
              await input.eventLog.append({
                type: "flow.step.skipped",
                message: `Flow review ${step.id} skipped on diff evidence: ${descent.files.length} strict-prose, unprotected file(s) changed.`,
                data: {
                  flowId: input.snapshot.flowId,
                  stepId: step.id,
                  reason: "inert_diff",
                  files: descent.files,
                },
              });
              return;
            }
          }

          state = await applyPauseIfRequested({
            state,
            store: input.stateStore,
            events: input.eventLog,
          });
          if (isTerminal(state.status)) throw new __ApprovalRejectedSignal();
          state = await this.moveToFlowStepStatus({
            state,
            step,
            stateStore: input.stateStore,
          });

          const preparedTurn = step.seat && step.resolvedRoleId
            ? prepareFlowParticipantTurn(
                participantLedger,
                step.seat,
                this.config.session?.maxReuseTurns ?? 0,
              )
            : null;
          const context = await this.buildFlowContextPacket({
            snapshot: input.snapshot,
            step,
            outputs,
            artifactStore: input.artifactStore,
            contextMode: preparedTurn?.contextMode ?? "stateless",
            // Preference-gate review needs the exact diff (not a summary) on the
            // linear walk too. Only forced on a reviewer turn carrying preferences.
            forceFullTokens:
              isReviewerStep(step) && this.policyAdviseBlock
                ? new Set(["diff"])
                : undefined,
          });
          state = this.patchFlowStep(
            state,
            step.id,
            {
              status: "running",
              startedAt: nowIso(),
              contextPacketPath: context.contextPacketPath,
              error: null,
            },
            step.id,
          );
          await input.stateStore.write(state);
          await input.eventLog.append({
            type: "flow.context.built",
            message: `Flow context packet built for ${step.id}.`,
            data: {
              flowId: input.snapshot.flowId,
              stepId: step.id,
              contextPolicy: input.snapshot.contextPolicy,
              contextMode: preparedTurn?.contextMode ?? "stateless",
              contextPacketPath: context.contextPacketPath,
              budget: context.budget,
            },
          });
          await input.eventLog.append({
            type: "flow.step.started",
            message: `Flow step ${step.id} starting.`,
            data: {
              flowId: input.snapshot.flowId,
              stepId: step.id,
              kind: step.kind,
              seat: step.seat,
              resolvedRoleId: step.resolvedRoleId,
              profileId: step.profileId,
              providerId: step.providerId,
              contextPacketPath: context.contextPacketPath,
            },
          });
          this.onProgress(`Flow ${step.id}...`);

          if (step.kind === "validation") {
            const validationOutput = await this.runFlowValidationStep({
              step,
              state,
              outputs,
              artifactStore: input.artifactStore,
              stateStore: input.stateStore,
              ctx: input.ctx,
            });
            state = validationOutput.state;
            lastValidation = validationOutput.validation;
            if (validationOutput.validation.summary.failed > 0) {
              input.notify(
                draftValidationFailed({
                  runId: input.runId,
                  taskId: this.taskId,
                  failedCount: validationOutput.validation.summary.failed,
                }),
              );
            }
            await input.eventLog.append({
              type: "flow.step.completed",
              message: `Flow step ${step.id} completed.`,
              data: { flowId: input.snapshot.flowId, stepId: step.id },
            });
            return;
          }

          if (step.kind === "approval-gate") {
            if (!step.approval) {
              throw new Error(`Flow approval gate "${step.id}" has no metadata.`);
            }
            const gate = await this.awaitApprovalRequest({
              state,
              fromStatus: state.status,
              stageId: step.id,
              roleId: "flow",
              reason: step.approval.reason,
              prompt: null,
              sourceArtifactPath: context.contextPacketPath,
              requestedAction: step.approval.requestedAction,
              riskLevel: step.approval.riskLevel,
              source: "policy",
              userMessage: step.approval.userMessage ?? null,
              progressMessage: `Pausing for Flow approval at ${step.id}...`,
              requestedMessage: `Flow approval gate ${step.id} is waiting for a decision.`,
              resumedMessage: `Run resumed after Flow approval gate ${step.id}.`,
              approvalService: input.approvalService,
              stateStore: input.stateStore,
              eventLog: input.eventLog,
            });
            state = gate.state;
            if (gate.rejected) {
              state = this.patchFlowStep(
                state,
                step.id,
                { status: "blocked", endedAt: nowIso() },
                step.id,
              );
              await input.stateStore.write(state);
              await input.eventLog.append({
                type: "flow.step.failed",
                message: `Flow approval gate ${step.id} blocked the run.`,
                data: { flowId: input.snapshot.flowId, stepId: step.id },
              });
              throw new __ApprovalRejectedSignal();
            }

            state = this.patchFlowStep(
              state,
              step.id,
              { status: "passed", endedAt: nowIso() },
              step.id,
            );
            await input.stateStore.write(state);
            await input.eventLog.append({
              type: "flow.step.completed",
              message: `Flow approval gate ${step.id} completed.`,
              data: { flowId: input.snapshot.flowId, stepId: step.id },
            });
            return;
          }

          if (!step.resolvedRoleId) {
            throw new Error(`Flow step "${step.id}" needs a seated role.`);
          }

          const result = await this.runRole({
            roleId: step.resolvedRoleId,
            providerId: step.providerId,
            profileId: step.profileId,
            stageId: step.id,
            promptIndex: 0,
            promptName: path.posix.join("flows", step.id, "prompt.md"),
            outputName: path.posix.join("flows", step.id, "output.md"),
            priorArtifacts: context.priorArtifacts,
            validationResults: lastValidation,
            runBrief: renderRunBrief(runBriefState),
            cleanRoom: step.cleanRoom,
            skills: step.skills,
            // Linear walk: the persona blocks (review lenses, owner preferences,
            // spec-up posture) inject here too, not just on the graph frontier -
            // the default flow is linear, so this is the path a plain run takes.
            additionalNotes: composeReviewerStepNotes({
              baseNotes: this.renderFlowStepNotes({
                snapshot: input.snapshot,
                step,
              }),
              stepInstructions: step.instructions,
              lensEmphasis: this.reviewLensEmphasis,
              isReviewer: isReviewerStep(step),
              policyAdviseBlock: this.policyAdviseBlock,
              specUpPostureBlock: this.specUpPostureBlock,
            }),
            ...(preparedTurn
              ? {
                  flowTurn: {
                    seat: preparedTurn.seat,
                    contextMode: preparedTurn.contextMode,
                    fallbackReason: preparedTurn.fallbackReason,
                    ...(preparedTurn.sessionRequest
                      ? { sessionRequest: preparedTurn.sessionRequest }
                      : {}),
                  },
                }
              : {}),
            metricsStore: input.metricsStore,
            ctx: input.ctx,
          });
          if (preparedTurn) {
            participantLedger = recordFlowParticipantTurn({
              ledger: participantLedger,
              prepared: preparedTurn,
              stepId: step.id,
              roleId: step.resolvedRoleId,
              providerId: step.providerId ?? result.providerResult.providerId,
              contextPacketPath: context.contextPacketPath,
              promptArtifactPath: result.promptArtifactPath,
              outputArtifactPath: result.outputArtifactPath,
              providerSessionId: result.providerResult.session?.sessionId ?? null,
            });
            await participantStore.write(participantLedger);
            state = this.patchFlowParticipants(state, participantLedger);
            await input.stateStore.write(state);
            await input.eventLog.append({
              type:
                preparedTurn.contextMode === "opened"
                  ? "flow.session.opened"
                  : preparedTurn.contextMode === "reused"
                    ? "flow.session.reused"
                    : preparedTurn.contextMode === "rehydrated"
                      ? "flow.session.rehydrated"
                      : "flow.session.stateless",
              message: `Flow participant ${preparedTurn.seat} completed ${step.id} with ${preparedTurn.contextMode} context.`,
              data: {
                flowId: input.snapshot.flowId,
                stepId: step.id,
                seat: preparedTurn.seat,
                providerId: step.providerId,
                contextMode: preparedTurn.contextMode,
                fallbackReason: preparedTurn.fallbackReason,
                sessionId: result.providerResult.session?.sessionId ?? null,
              },
            });
          }
          // A failed turn (provider error or empty output) must not be
          // registered as a successful step. Throw so the run fails honestly -
          // the outer catch marks this step (currentStepId) failed. Linear steps
          // are always required (continueOnError is graph-only).
          const turn = this.assessTurnResult(result);
          if (!turn.ok) {
            throw new Error(`Flow step "${step.id}" failed: ${turn.reason}.`);
          }
          // Any executed review-turn invalidates skip evidence at finalize -
          // a review that ran always wins over the deterministic descent.
          if (step.kind === "review-turn") reviewTurnRan = true;
          await this.registerFlowRoleOutputs({
            step,
            result,
            outputs,
            artifactStore: input.artifactStore,
            worktreePath: input.worktreePath,
          });
          arbitrationLedger = await this.recordFlowArbitrationOutputs({
            step,
            result,
            outputs,
            validation: lastValidation,
            artifactStore: input.artifactStore,
            eventLog: input.eventLog,
            ledger: arbitrationLedger,
            store: arbitrationStore,
          });
          await this.recordFlowHandoffOutputs({
            step,
            result,
            outputs,
            artifactStore: input.artifactStore,
            eventLog: input.eventLog,
          });

          if (step.outputs.includes("plan") || step.outputs.includes("plan-handoff"))
            planArtifact = result;
          if (
            step.outputs.includes("execution") ||
            step.outputs.includes("execution-handoff")
          )
            executionArtifact = result;
          if (
            step.kind === "review-turn" &&
            (step.outputs.includes("review-decision") ||
              step.outputs.includes("finding-resolutions"))
          ) {
            reviewArtifact = result;
            reviewDecision = effectiveReviewDecision(result.output);
            await input.eventLog.append({
              type: "review.decision",
              message: `Flow review decision at ${step.id}: ${reviewDecision}`,
              data: { decision: reviewDecision, stepId: step.id },
            });
          }
          if (step.kind === "summary-turn") {
            verificationArtifact = result;
            verificationDecision = effectiveVerificationDecision(result.output);
            await input.eventLog.append({
              type: "verification.decision",
              message: `Flow summary decision at ${step.id}: ${verificationDecision}`,
              data: { decision: verificationDecision, stepId: step.id },
            });
          }
          if (step.kind === "review-turn" || step.kind === "summary-turn") {
            await this.ingestSuggestionsFromArtifact({
              runId: input.runId,
              artifactRelPath: result.outputArtifactPath,
              artifactBody: result.output,
              source: step.kind === "summary-turn" ? "verifier" : "reviewer",
              notify: input.notify,
            });
            // Non-blocking advisory: a reviewer/verifier can flag that a human
            // should eyeball the result (something the model can't perceive).
            // It never changes the verdict - last writer wins.
            const advisory = detectNeedsTesting(result.output);
            if (advisory.advisory) {
              needsTestingAdvisory = { reason: advisory.reason };
              await input.eventLog.append({
                type: "needs_testing.flagged",
                message: `Flagged for human testing at ${step.id}${advisory.reason ? `: ${advisory.reason}` : "."}`,
                data: { stepId: step.id, reason: advisory.reason },
              });
            }
          }

          // Update the run brief (story so far) with this step's outcome + facts,
          // and refresh the inspectable artifact. The next step's prompt picks it up.
          appendStepOutcome(runBriefState, {
            stepId: step.id,
            label: step.label,
            kind: step.kind,
            output: result.output,
            decision:
              step.kind === "review-turn"
                ? reviewDecision
                : step.kind === "summary-turn"
                  ? verificationDecision
                  : null,
          });
          if (lastValidation) {
            updateRunBriefFacts(runBriefState, { validation: lastValidation.summary });
          }
          await input.artifactStore.write("flows/run-brief.md", renderRunBrief(runBriefState));

          const gate = await this.maybeAwaitApproval({
            state,
            fromStatus: state.status,
            // Policy approvals are configured per run phase
            // (planning/architecting/executing/validating/reviewing/fixing/
            // verifying); match on the step's phase, not its id.
            stageId: this.flowStatusForStep(step),
            roleId: step.resolvedRoleId,
            roleArtifact: result,
            approvalService: input.approvalService,
            stateStore: input.stateStore,
            eventLog: input.eventLog,
            policyStagesAlreadyForced: input.policyStagesAlreadyForced,
          });
          state = gate.state;
          if (gate.rejected) {
            state = this.patchFlowStep(
              state,
              step.id,
              {
                status: "blocked",
                promptArtifactPath: result.promptArtifactPath,
                outputArtifactPath: result.outputArtifactPath,
                endedAt: nowIso(),
              },
              step.id,
            );
            await input.stateStore.write(state);
            await input.eventLog.append({
              type: "flow.step.failed",
              message: `Flow step ${step.id} blocked by approval decision.`,
              data: { flowId: input.snapshot.flowId, stepId: step.id },
            });
            throw new __ApprovalRejectedSignal();
          }

          state = this.patchFlowStep(
            state,
            step.id,
            {
              status: "passed",
              promptArtifactPath: result.promptArtifactPath,
              outputArtifactPath: result.outputArtifactPath,
              endedAt: nowIso(),
            },
            step.id,
          );
          await input.stateStore.write(state);
          await input.eventLog.append({
            type: "flow.step.completed",
            message: `Flow step ${step.id} completed.`,
            data: {
              flowId: input.snapshot.flowId,
              stepId: step.id,
              promptArtifactPath: result.promptArtifactPath,
              outputArtifactPath: result.outputArtifactPath,
            },
          });
        };
        await runStep();
        // ── Rewind phase 2: snapshot the worktree after code-producing steps ──
        // (implement → "executing", fix → "fixing") so a later run can rewind to
        // review/verify/fix with this exact code. Best-effort; never blocks.
        await this.maybeCapturePhaseSnapshot({
          step,
          worktreePath: input.worktreePath,
          runId: input.runId,
          eventLog: input.eventLog,
        });
        // ── Per-item band exit (Phase 3, linear band): commit, summarize, carry ──
        // Runs at the segment tail (disjoint from the adaptive loop by schema).
        // The graph band (above) commits via the same closure; only the linear
        // band reaches this site (a graph band already `continue`d).
        if (usingChecklist && stepIndex === segTo) {
          const dir = await commitChecklistItem(itemIndex);
          if (dir === "repeat") {
            itemIndex += 1;
            await maybeStepModeGate(itemIndex);
            stepIndex = segFrom;
            continue;
          }
          // "proceed": last item done, full prior-items rebuilt - fall through to
          // the holistic postlude (review/verify).
        }
        // Adaptive loop control (no-op for linear flows). The decisionStep
        // gates the loop; an early non-CHANGES_REQUESTED exit skips the rest of
        // the body, and exhausting the budget exits with the last decision
        // (left CHANGES_REQUESTED → the run blocks below).
        if (loop && step.sourceStepId === loop.decisionStep) {
          const wantsChanges = reviewDecision === "CHANGES_REQUESTED";
          const budgetLeft = loopIteration < loop.maxIterations;
          // Read-only runs never loop - the fix body is skipped, so re-running
          // would just repeat the same review. They traverse the body once
          // (the write steps mark themselves skipped) and don't jump back.
          const continuing = !this.readOnly && wantsChanges && budgetLeft;
          await input.eventLog.append({
            type: "flow.loop.decision",
            message: `Flow loop decision at ${step.id}: ${reviewDecision} on pass ${loopIteration}/${loop.maxIterations}.`,
            data: {
              flowId: input.snapshot.flowId,
              stepId: step.id,
              decision: reviewDecision,
              iteration: loopIteration,
              maxIterations: loop.maxIterations,
              continuing,
            },
          });
          // Non-read-only early exit: an APPROVED/BLOCKED review or a spent
          // budget skips the rest of the body and continues past `to`.
          if (!this.readOnly && !continuing) {
            stepIndex = loopTo + 1;
            continue;
          }
        }
        if (loop && stepIndex === loopTo && !this.readOnly) {
          stepIndex = loopFrom;
          continue;
        }
        stepIndex += 1;
      }

      // Read-only runs skip the executor, validation, and verify steps, so no
      // verification decision is produced - an APPROVED review is the bar for
      // merge_ready, mirroring run(). A read-only CHANGES_REQUESTED can't be
      // fixed, so record it as BLOCKED for an honest verdict.
      if (this.readOnly && reviewDecision === "CHANGES_REQUESTED") {
        reviewDecision = "BLOCKED";
      }
      const validationPassed =
        lastValidation === null || lastValidation.summary.failed === 0;
      // A flow only requires a passing verification if it actually has a verify
      // (summary-turn) step that ran. Minimal flows (e.g. coder + reviewer with
      // no verify) reach merge_ready on an APPROVED review + passing validation.
      const verified = verificationArtifact !== null;
      // Read-only runs skip verification entirely, so there's no decision to
      // report - null keeps the report/events honest ("skipped") rather than
      // leaking the NEEDS_HUMAN default as if a verifier had run.
      const finalVerification = this.readOnly || !verified ? null : verificationDecision;
      // Extracted predicate (merge-readiness.ts) so the express skip semantics
      // are a tested invariant: skip evidence satisfies review ONLY when no
      // review turn ran; it never substitutes for validation/verification.
      //
      // Shape B: per-item checklist items with open findings or changes_requested
      // cap the run from merge_ready regardless of the main review lane. For a
      // non-checklist run, itemOutcomes is empty so caps:false -> clean:true ->
      // no behavior change.
      const itemGaps = checklistItemGapsCap(
        itemOutcomes.map((o) => ({
          itemIndex: o.index,
          verdict: (o.reviewVerdict ?? "none") as "approved" | "changes_requested" | "none",
          openFindingCount: o.openFindingCount ?? 0,
          fixIterations: o.fixIterations ?? 0,
        })),
      );
      // Project policy block gate (policy-block.ts): a confirmed `block` policy whose
      // regex matches the run's added diff caps merge-readiness - DETERMINISTIC,
      // independent of the review decision (it never touches reviewDecision, so no
      // clobber). Project-scoped: the policies belong to the project, so this fires
      // under ANY active supervisor, not only one that "owns" them. Computed only for
      // a write run that actually declares block policies, so a run with none is
      // byte-unchanged. The violation is surfaced as an event, which deriveRunBlockers
      // turns into the blocking reason (run-assurance.ts).
      let policiesClean = true;
      if (!this.readOnly && input.worktreePath) {
        const blockPolicies = (this.config.projectPolicies ?? []).filter(
          (p) => p.tier === "block" && p.confirmedAt != null,
        );
        if (blockPolicies.length > 0) {
          try {
            // Scan from the fork point so committed-mid-run changes are caught.
            const baseBranch = await getCurrentBranch(this.projectRoot);
            const diffText = await getWorktreeDiffText({
              worktreePath: input.worktreePath,
              baseBranch,
            });
            const gate = evaluateBlockPolicies(blockPolicies, diffText);
            policiesClean = gate.clean;
            for (const v of gate.violations) {
              await input.eventLog.append({
                type: "supervisor.policy_block",
                message: `Merge blocked by policy "${v.id}"${v.file ? ` (${v.file})` : ""}: ${v.statement}`,
                data: { policyId: v.id, file: v.file, statement: v.statement },
              });
            }
            for (const inert of gate.inert) {
              await input.eventLog.append({
                type: "supervisor.policy_block",
                message: `Block policy "${inert.id}" is not enforcing: ${inert.reason}`,
                data: { policyId: inert.id, inert: true, reason: inert.reason },
              });
            }
          } catch (err) {
            // A block gate that cannot read the diff blocks CONSERVATIVELY (fail
            // closed) rather than letting an unchecked change through - surfaced so
            // it is diagnosable, not a silent pass.
            policiesClean = false;
            await input.eventLog.append({
              type: "supervisor.policy_block",
              message: "Block gate could not read the run diff; blocking conservatively.",
              data: {
                policyId: "(diff-read-error)",
                file: null,
                statement: `could not read the diff to check block policies: ${err instanceof Error ? err.message : "unknown error"}`,
              },
            });
          }
        }
      }
      const mergeReadinessInput = {
        readOnly: this.readOnly,
        reviewDecision,
        // A read-only flow with no review step (the spec-up-intake enrichment phase)
        // has nothing to approve - it lands merge_ready on completion, not blocked.
        hasReviewStep: input.snapshot.steps.some((s) => s.kind === "review-turn"),
        reviewTurnRan,
        reviewSkipEvidence,
        validationPassed,
        verified,
        verificationDecision,
        checklistItemsClean: !itemGaps.caps,
        policiesClean,
      };
      const reviewSatisfiedByEvidence =
        !reviewTurnRan && reviewSkipEvidence !== null && !this.readOnly;
      const mergeReady = computeMergeReady(mergeReadinessInput);
      // ── Action Broker boundary (S0): run.complete ─────────────────────
      // The run's terminal verdict crosses the broker. A non-allow decision
      // cannot reach merge_ready - it downgrades to blocked (fail-closed). The
      // verdict + evidence anchor the S5 Run Assurance artifact.
      const completeReq: ActionRequest = {
        runId: input.runId,
        kind: "run.complete",
        subject: {
          status: mergeReady ? "merge_ready" : "blocked",
          // A skip-evidence run reports its decision honestly as null (no
          // reviewer spoke) - the skip evidence rides alongside, never as a
          // fake APPROVED.
          decision: reviewSatisfiedByEvidence ? null : reviewDecision,
          reviewSkipped: reviewSatisfiedByEvidence,
          verification: finalVerification,
          validationPassed,
        },
        proposedBy: "system",
      };
      const completeDecision = await this.broker!.decide(completeReq);
      let effectiveMergeReady = mergeReady;
      // `accept-edits` (and any require_approval run.complete policy) HOLDS a run
      // that earned merge_ready for human sign-off, then RESUMES to merge_ready on
      // approval (reject / unattended-expire -> blocked). awaitApprovalRequest
      // already transitions to blocked on reject, so guard the terminal transition
      // below to avoid a blocked->blocked double-transition.
      let completionApprovalRejected = false;
      if (completeDecision.effect === "require_approval" && mergeReady) {
        const reason =
          "reason" in completeDecision ? completeDecision.reason : "policy";
        const held = await this.awaitApprovalRequest({
          state,
          fromStatus: state.status,
          stageId: "run.complete",
          roleId: "supervisor",
          reason,
          prompt: null,
          sourceArtifactPath: null,
          requestedAction: "run.complete",
          riskLevel: "medium",
          source: "policy",
          alsoRequiredByPolicy: true,
          progressMessage: "Pausing for human sign-off before completing the run...",
          requestedMessage: "Run completion is held for your review (permission mode).",
          resumedMessage: "Approved - completing the run.",
          approvalService: input.approvalService,
          stateStore: input.stateStore,
          eventLog: input.eventLog,
        });
        state = held.state;
        completionApprovalRejected = held.rejected;
        effectiveMergeReady = !held.rejected;
      } else if (completeDecision.effect !== "allow") {
        // deny, or require_approval on a run that DIDN'T earn merge_ready anyway.
        effectiveMergeReady = false;
        const reason =
          "reason" in completeDecision ? completeDecision.reason : "policy";
        await input.eventLog.append({
          type:
            completeDecision.effect === "deny"
              ? "action.denied"
              : "action.approval_required",
          message: `Action broker ${completeDecision.effect} run.complete for ${input.runId}: ${reason}`,
          data: {
            kind: "run.complete",
            effect: completeDecision.effect,
            ruleIds: completeDecision.ruleIds,
            reason,
          },
        });
      }
      state = {
        ...state,
        // No reviewer spoke on a skip-evidence run - finalDecision stays null
        // (assurance reports `skipped_inert_diff` from state.reviewSkipped).
        finalDecision: reviewSatisfiedByEvidence ? null : reviewDecision,
        verification: finalVerification,
        needsTesting: needsTestingAdvisory,
      };
      await input.stateStore.write(state);
      // Skip the terminal transition when the completion-approval already moved
      // the run to a terminal `blocked` (else blocked->blocked is illegal).
      if (!completionApprovalRejected) {
        state = applyTransition(
          state,
          effectiveMergeReady ? "merge_ready" : "blocked",
        );
        await input.stateStore.write(state);
      }
      // Propagate a needs-testing advisory to the linked card (best-effort,
      // non-blocking). The run keeps its real verdict; the card is flagged so a
      // human can pass it or send it back.
      if (needsTestingAdvisory && this.taskId) {
        await roadmap
          .flagNeedsTesting(this.taskId, needsTestingAdvisory.reason)
          .catch(() => {});
      }
      await this.broker!.record(completeReq, completeDecision, {
        ok: effectiveMergeReady,
        summary: `run ${input.runId} ${state.status}`,
        data: { decision: reviewDecision, validationPassed },
      });
      await input.eventLog.append({
        type: "run.completed",
        message: `Flow run ${input.runId} ${state.status}.`,
        data: {
          flowId: input.snapshot.flowId,
          decision: reviewSatisfiedByEvidence ? null : reviewDecision,
          reviewSkipped: reviewSatisfiedByEvidence,
          verification: finalVerification,
          validationPassed,
        },
      });
      input.notify(
        draftRunCompleted({
          runId: input.runId,
          taskId: this.taskId,
          status: state.status as "merge_ready" | "blocked",
          decision: reviewDecision,
          verification: finalVerification,
        }),
      );
    } catch (err) {
      // Aborted by user signal → terminal "aborted", not "failed". Falls through
      // to the finalize block below (metrics + report).
      if (err instanceof __RunAbortedSignal || this.abortSignal?.aborted) {
        try {
          state = applyTransition(state, "aborted");
        } catch {
          // already terminal
        }
        state = { ...state, error: "Run aborted by user signal." };
        await input.stateStore.write(state);
        await input.eventLog.append({
          type: "run.aborted",
          message: "Run aborted by user signal.",
        });
      } else if (err instanceof __SpendCapStopSignal) {
        // Daily spend cap with capAction=stop → "blocked" (not "failed"); the
        // spend.capped event was already logged. Falls through to finalize.
        try {
          state = applyTransition(state, "blocked");
        } catch {
          // already terminal
        }
        state = { ...state, error: err.message };
        await input.stateStore.write(state);
      } else if (err instanceof __ActionDeniedSignal) {
        // Action Broker denied an effect → "blocked" (not "failed"); the
        // action.denied event + actions.ndjson record were already written.
        try {
          state = applyTransition(state, "blocked");
        } catch {
          // already terminal
        }
        state = { ...state, error: err.message };
        await input.stateStore.write(state);
      } else if (err instanceof __BudgetLimitSignal) {
        // Count/time budget ceiling hit → "blocked" (not "failed"); the
        // budget.limit event was already logged. An intentional stop, like the
        // spend cap. Falls through to finalize.
        try {
          state = applyTransition(state, "blocked");
        } catch {
          // already terminal
        }
        state = { ...state, error: err.message };
        await input.stateStore.write(state);
      } else if (!(err instanceof __ApprovalRejectedSignal)) {
        const stepId = state.flow?.currentStepId;
        if (stepId) {
          state = this.patchFlowStep(
            state,
            stepId,
            {
              status: "failed",
              endedAt: nowIso(),
              error: describeError(err),
            },
            stepId,
          );
          await input.stateStore.write(state);
          await input.eventLog.append({
            type: "flow.step.failed",
            message: `Flow step ${stepId} failed: ${describeError(err)}`,
            data: { flowId: input.snapshot.flowId, stepId },
          });
        }
        // Pick-up: an item that failed mid-band is marked blocked on the task
        // (remaining items keep their pending status - stop-on-failure, linear).
        if (currentChecklistItemId && this.taskId) {
          await roadmap
            .setChecklistItemStatus(this.taskId, currentChecklistItemId, "blocked")
            .catch(() => {});
          await input.eventLog.append({
            type: "checklist.item.blocked",
            message: `Checklist item blocked after a failed step: ${currentChecklistItemId}.`,
            data: { itemId: currentChecklistItemId },
          });
        }
        const message = describeError(err);
        try {
          state = applyTransition(state, "failed");
        } catch {
          // already terminal
        }
        state = { ...state, error: message };
        await input.stateStore.write(state);
        await input.eventLog.append({
          type: "run.failed",
          message: `Flow run failed: ${message}`,
        });
        input.notify(
          draftRunCompleted({
            runId: input.runId,
            taskId: this.taskId,
            status: "failed",
          }),
        );
        try {
          await input.metricsStore.update((metrics) => ({
            ...metrics,
            finalStatus: state.status,
          }));
        } catch {
          // metrics finalize best-effort
        }
        await this.writeFlowFinalReport({
          ...input,
          state,
          lastValidation,
          reviewLoops: Math.max(0, loopIteration - 1),
          planArtifact,
          executionArtifact,
          reviewArtifact,
          verificationArtifact,
        });
        if (err instanceof VibestrateError) throw err;
        throw err instanceof Error ? err : new Error(message);
      }
    }

    const approvals = await input.approvalService.readAll();
    await input.metricsStore.update((metrics) => ({
      ...metrics,
      finalStatus: state.status,
      reviewLoopCount: Math.max(0, loopIteration - 1),
      validationSummary: lastValidation
        ? {
            total: lastValidation.summary.total,
            passed: lastValidation.summary.passed,
            failed: lastValidation.summary.failed,
          }
        : null,
      approvalsSummary: summarizeApprovals(approvals),
    }));

    // ── Run Assurance artifact (S5) ───────────────────────────────────────
    // Derive a single evidence-backed verdict from the broker log + the run's
    // review/verification decisions and persist runs/<id>/assurance.json.
    // Best-effort: a failure here must never mask the run's real outcome.
    try {
      await buildAndWriteRunAssurance(this.projectRoot, input.runId);
    } catch {
      // assurance is advisory; swallow.
    }

    // ── Project continuity ledger (T9 + Slice 3) ──────────────────────────
    // Record the run's terminal outcome so a future session can pick up "what
    // shipped" and "what's blocked + how to resume" across runs. Idempotent
    // (keyed by runId) + best-effort - a ledger hiccup never masks the run's
    // real outcome. Read-only investigations leave no durable goal state.
    try {
      await recordRunInLedger(this.projectRoot, input.runId, nowIso(), {
        status: state.status,
        displayName: state.displayName,
        task: state.task,
        readOnly: state.readOnly,
        blockedStage: state.flow?.currentStepId ?? state.pausedAtStatus ?? null,
      });
    } catch {
      // ledger is advisory; swallow.
    }

    const finalReportPath = await this.writeFlowFinalReport({
      ...input,
      state,
      lastValidation,
      reviewLoops: Math.max(0, loopIteration - 1),
      planArtifact,
      executionArtifact,
      reviewArtifact,
      verificationArtifact,
      checklistOutcomes: itemOutcomes,
    });
    return {
      runId: input.runId,
      state,
      worktreePath: input.worktreePath,
      branchName: input.branchName,
      finalReportPath,
      policyWarnings: input.policyWarnings,
    };
  }

  private async runFlowValidationStep(input: {
    step: ResolvedFlowStep;
    state: RunState;
    outputs: Map<string, FlowContextOutput>;
    artifactStore: ArtifactStore;
    stateStore: RunStateStore;
    ctx: {
      worktreePath: string | null;
      artifactStore: ArtifactStore;
      eventLog: EventLog;
    };
  }): Promise<{ state: RunState; validation: ValidationResults }> {
    const artifactsName = path.posix.join(
      "flows",
      input.step.id,
      "validation-results.json",
    );
    const validation = await this.runValidation({
      artifactsName,
      prefix: path.posix.join("flows", input.step.id, "validation"),
      ctx: input.ctx,
    });
    const validationArtifactPath = input.artifactStore.relPath(
      input.artifactStore.resolveArtifactPath(artifactsName),
    );
    this.registerFlowValidationOutputs({
      step: input.step,
      validation,
      validationArtifactPath,
      outputs: input.outputs,
    });
    const state = this.patchFlowStep(
      input.state,
      input.step.id,
      {
        status: "passed",
        validationArtifactPath,
        endedAt: nowIso(),
      },
      input.step.id,
    );
    await input.stateStore.write(state);
    return { state, validation };
  }

  private async writeFlowFinalReport(input: {
    artifactStore: ArtifactStore;
    state: RunState;
    lastValidation: ValidationResults | null;
    policyWarnings: PolicyWarning[];
    reviewLoops: number;
    metricsStore: MetricsStore;
    approvalService: ApprovalService;
    planArtifact: RoleRunResult | null;
    executionArtifact: RoleRunResult | null;
    reviewArtifact: RoleRunResult | null;
    verificationArtifact: RoleRunResult | null;
    checklistOutcomes?: ChecklistItemOutcome[];
  }): Promise<string> {
    const metrics = (await input.metricsStore.read()) ?? null;
    const approvals = await input.approvalService.readAll().catch(() => []);
    // Pick-up runs: a consolidated per-item outcomes table alongside the report.
    const outcomes = input.checklistOutcomes ?? [];
    if (outcomes.length > 0) {
      const done = outcomes.filter((o) => o.status === "done").length;
      const table = [
        "# Checklist outcomes",
        "",
        `${done}/${outcomes.length} items completed.`,
        "",
        "| # | Item | Status | Commit | Files |",
        "| --- | --- | --- | --- | --- |",
        ...outcomes.map(
          (o) =>
            `| ${o.index + 1} | ${o.text.replace(/\|/g, "\\|")} | ${o.status} | ${o.commitSha ? o.commitSha.slice(0, 8) : "-"} | ${o.filesTouched.length} |`,
        ),
        "",
      ].join("\n");
      await input.artifactStore
        .write(path.posix.join("flows", "checklist", "outcomes.md"), table)
        .catch(() => {});
    }
    return this.writeFinalReport({
      artifactStore: input.artifactStore,
      state: input.state,
      validation: input.lastValidation,
      policyWarnings: input.policyWarnings,
      reviewLoops: input.reviewLoops,
      metrics,
      approvals,
      artifacts: {
        plan: input.planArtifact?.outputArtifactPath,
        execution: input.executionArtifact?.outputArtifactPath,
        review: input.reviewArtifact?.outputArtifactPath,
        verification: input.verificationArtifact?.outputArtifactPath,
      },
    });
  }

  /**
   * Capture VIBESTRATE_SUGGESTION marker blocks from a stage artifact. Best-effort:
   * never throws into the orchestrator's hot path. Notifies the dashboard via
   * the notification service when a suggestion was extracted (one summary
   * notification per stage, not one per suggestion).
   */
  private async ingestSuggestionsFromArtifact(input: {
    runId: string;
    artifactRelPath: string;
    artifactBody: string;
    source: SuggestionSource;
    notify?: (draft: NotificationDraft) => void;
  }): Promise<void> {
    try {
      const svc = new ReviewSuggestionService(this.projectRoot, input.runId);
      const created = await svc.ingestArtifact({
        artifactRelPath: input.artifactRelPath,
        artifactBody: input.artifactBody,
        source: input.source,
      });
      if (created.length === 0) return;
      input.notify?.({
        severity: "attention",
        category: "review",
        title: `${created.length} suggestion${created.length > 1 ? "s" : ""} ready for review`,
        message: `Captured from ${input.source} artifact ${input.artifactRelPath}.`,
        runId: input.runId,
        sourceEventType: "suggestion.created",
        actionRequired: true,
        actionLabel: "Open run",
        actionUrl: `#/runs/${input.runId}`,
      });
    } catch {
      // Suggestion ingestion is best-effort - never fail a run because the
      // marker parser hiccupped.
    }
  }

  private async awaitApprovalRequest(input: {
    state: RunState;
    fromStatus: RunStatus;
    stageId: string;
    roleId: string;
    reason: string | null;
    prompt: string | null;
    sourceArtifactPath: string | null;
    requestedAction: string | null;
    riskLevel: ApprovalRisk;
    source: ApprovalSource;
    alsoRequiredByPolicy?: boolean;
    userMessage?: string | null;
    progressMessage: string;
    requestedMessage: string;
    resumedMessage: string;
    approvalService: ApprovalService;
    stateStore: RunStateStore;
    eventLog: EventLog;
  }): Promise<{ state: RunState; rejected: boolean }> {
    this.onProgress(input.progressMessage);

    const req = await input.approvalService.create({
      stageId: input.stageId,
      roleId: input.roleId,
      reason: input.reason,
      prompt: input.prompt,
      sourceArtifactPath: input.sourceArtifactPath,
      requestedAction: input.requestedAction,
      riskLevel: input.riskLevel,
      source: input.source,
      alsoRequiredByPolicy: input.alsoRequiredByPolicy,
      userMessage: input.userMessage,
    });

    let pendingState: RunState = applyTransition(
      input.state,
      "waiting_for_approval",
    );
    pendingState = {
      ...pendingState,
      pendingApprovalId: req.id,
      approvalRequestedFromStatus: input.fromStatus,
    };
    await input.stateStore.write(pendingState);
    const _notify = (
      this as unknown as { _notify?: (d: NotificationDraft) => void }
    )._notify;
    if (_notify) {
      _notify(
        draftApprovalRequested({
          runId: input.state.runId,
          approvalId: req.id,
          roleId: input.roleId,
          stageId: input.stageId,
          reason: input.reason,
        }),
      );
    }
    await input.eventLog.append({
      type: "approval.requested",
      message: input.requestedMessage,
      data: {
        approvalId: req.id,
        roleId: input.roleId,
        stageId: input.stageId,
        reason: input.reason,
        requestedAction: input.requestedAction,
        riskLevel: input.riskLevel,
        source: input.source,
        alsoRequiredByPolicy: input.alsoRequiredByPolicy ?? false,
      },
    });

    // Unattended runs must not hang at a gate: no human is watching, so an
    // unanswered approval would wedge a scheduler worker forever. Bound the wait
    // so it `expires` -> the run goes `blocked` honestly. Attended runs keep the
    // indefinite wait (a human is there). This NEVER approves; it only stops the
    // hang. `forbidAutoMerge`/`forbidAutoPush` and every gate are untouched.
    const resolved = await input.approvalService.waitForResolution(req.id, {
      pollMs: 1500,
      ...(this.unattended
        ? {
            timeoutMs: Math.max(
              1,
              this.config.policies.unattendedApprovalTimeoutMs,
            ),
          }
        : {}),
    });

    if (resolved.status === "approved") {
      let next: RunState = applyTransition(pendingState, input.fromStatus);
      next = {
        ...next,
        pendingApprovalId: null,
        approvalRequestedFromStatus: null,
      };
      await input.stateStore.write(next);
      await input.eventLog.append({
        type: "approval.approved",
        message: `Approval ${req.id} approved by ${resolved.resolvedBy ?? "local-user"}.`,
        data: {
          approvalId: req.id,
          decisionNote: resolved.decisionNote ?? null,
        },
      });
      await input.eventLog.append({
        type: "run.resumed",
        message: input.resumedMessage,
        data: { stageId: input.stageId },
      });
      return { state: next, rejected: false };
    }

    let blockedState: RunState = applyTransition(pendingState, "blocked");
    blockedState = {
      ...blockedState,
      pendingApprovalId: null,
      approvalRequestedFromStatus: null,
    };
    await input.stateStore.write(blockedState);
    await input.eventLog.append({
      type:
        resolved.status === "rejected"
          ? "approval.rejected"
          : "approval.expired",
      message:
        resolved.status === "rejected"
          ? `Approval ${req.id} rejected by ${resolved.resolvedBy ?? "local-user"}.`
          : `Approval ${req.id} expired without a decision.`,
      data: {
        approvalId: req.id,
        decisionNote: resolved.decisionNote ?? null,
      },
    });
    return { state: blockedState, rejected: true };
  }

  /**
   * If `roleArtifact.output` contains `HUMAN_APPROVAL: REQUIRED`, transition
   * the run to `waiting_for_approval`, persist a pending approval request, and
   * poll until the user resolves it via CLI/API. Returns the new state and
   * whether the run was rejected (caller must transition to `blocked`).
   *
   * If no approval signal is present, returns the input state unchanged.
   */
  private async maybeAwaitApproval(input: {
    state: RunState;
    fromStatus: RunStatus;
    stageId: string;
    roleId: string;
    roleArtifact: RoleRunResult | null;
    approvalService: ApprovalService;
    stateStore: RunStateStore;
    eventLog: EventLog;
    /** Tracks which policy stages have already triggered approval this run (mutated). */
    policyStagesAlreadyForced: Set<string>;
  }): Promise<{ state: RunState; rejected: boolean }> {
    const detection = input.roleArtifact
      ? detectApprovalRequest(input.roleArtifact.output)
      : null;
    const policyStages = this.config.policies.requireApprovalAtStages;
    const policyForcedThisStage =
      policyStages.includes(input.stageId as (typeof policyStages)[number]) &&
      !input.policyStagesAlreadyForced.has(input.stageId);

    const roleRequested = !!detection?.required;
    if (!roleRequested && !policyForcedThisStage) {
      return { state: input.state, rejected: false };
    }

    // Build approval payload. Prefer agent-provided metadata when present,
    // fall back to policy defaults otherwise. If both apply, we record one
    // approval with source="agent" and alsoRequiredByPolicy=true.
    const fallbackReason = `Project policy requires approval before continuing past the ${input.stageId} stage.`;
    const fallbackRequestedAction = `Approve continuing after ${input.stageId}.`;
    const reason = detection?.reason ?? (policyForcedThisStage ? fallbackReason : null);
    const requestedAction =
      detection?.requestedAction ??
      (policyForcedThisStage
        ? fallbackRequestedAction
        : `Continue past the ${input.stageId} stage.`);
    const riskLevel = detection?.riskLevel ?? "medium";
    const source: "agent" | "policy" = roleRequested ? "agent" : "policy";
    const alsoRequiredByPolicy = roleRequested && policyForcedThisStage;

    if (policyForcedThisStage) {
      input.policyStagesAlreadyForced.add(input.stageId);
    }

    return this.awaitApprovalRequest({
      state: input.state,
      fromStatus: input.fromStatus,
      stageId: input.stageId,
      roleId: input.roleId,
      reason,
      prompt: input.roleArtifact?.promptArtifactPath ?? null,
      sourceArtifactPath: input.roleArtifact?.outputArtifactPath ?? null,
      requestedAction,
      riskLevel,
      source,
      alsoRequiredByPolicy,
      progressMessage: roleRequested
        ? `Pausing for human approval (${input.roleId} requested it)...`
        : `Pausing for human approval (project policy requires approval at ${input.stageId})...`,
      requestedMessage: roleRequested
        ? `Approval requested by ${input.roleId} at stage ${input.stageId}.`
        : `Approval required by project policy at stage ${input.stageId}.`,
      resumedMessage: `Run resumed at stage ${input.stageId}.`,
      approvalService: input.approvalService,
      stateStore: input.stateStore,
      eventLog: input.eventLog,
    });
  }

  /**
   * The between-steps SUPERVISOR turn (Phase 2b, M3). Runs a cheap, READ-ONLY
   * model turn (no write grant - all context is in the prompt) that judges
   * whether the saga should PROCEED to the next step or ESCALATE (halt), and
   * records any new cross-cutting INVARIANT into the durable ledger. Pure logic
   * lives in src/feature/supervisor.ts; this method only wires the provider call
   * + persistence. It NEVER assigns the run-scoped `reviewDecision` (the caller
   * owns the ESCALATE halt). Every failure mode - unresolved provider/role,
   * provider error, unparseable output - folds to PROCEED + a logged event: the
   * supervisor is advisory ON TOP of the per-item review, which already
   * fail-closes correctness, so a supervisor hiccup must not halt a good saga.
   */
  private async runSagaSupervisorTurn(args: {
    completedItem: { id: string; text: string };
    itemIndex: number;
    checklistItems: { id: string; text: string }[];
    input: {
      worktreePath: string | null;
      eventLog: EventLog;
      runId: string;
      metricsStore: MetricsStore;
    };
  }): Promise<"PROCEED" | "ENHANCE" | "ESCALATE"> {
    const { completedItem, itemIndex, checklistItems, input } = args;
    const taskId = this.taskId!;
    const roadmap = new RoadmapService(this.projectRoot);

    // Gate on the daily spend cap BEFORE spending on this turn, exactly like a
    // real role turn (runRole). A blown cap throws __SpendCapStopSignal; the
    // call-site re-throws THAT (so the run halts stopped-by-cap, not a silent
    // supervisor skip) while folding ordinary supervisor failures to PROCEED.
    // warn/downgrade/reduce-effort side-effects mirror runRole.
    await this.enforceSpendCap({ eventLog: input.eventLog, runId: input.runId });

    // Resolve the supervisor's provider + cheap-profile knobs: the configured
    // `profile` wins, else the supervisor role's own profile.
    let profileName = this.sagaSupervisor.profile;
    if (!profileName) {
      try {
        const { crew } = getCrew(this.config, this.activeCrewId);
        profileName = getCrewRole(crew, this.sagaSupervisor.roleId).profile;
      } catch {
        profileName = null;
      }
    }
    const profileCfg = profileName ? this.config.profiles[profileName] : undefined;
    const providerId =
      profileCfg?.provider ?? Object.values(this.config.profiles)[0]?.provider;
    if (!providerId || !this.config.providers[providerId]) {
      await input.eventLog.append({
        type: "supervised.supervisor",
        message: `Saga supervisor skipped after step ${itemIndex + 1}: no resolvable provider.`,
        data: { index: itemIndex, decision: null, skipped: "no-provider" },
      });
      return "PROCEED";
    }

    // Fresh task read: latest invariants ledger + the just-stamped outcome.
    const task = await roadmap.getTask(taskId).catch(() => null);
    const invariants = task?.supervised.invariants ?? [];
    const outcomeSummary =
      task?.checklist.find((c) => c.id === completedItem.id)?.outcomeSummary ?? "";

    // Accumulated committed work (fork-point diff) for goal-alignment judgment.
    let diffSoFar = "";
    if (input.worktreePath) {
      const baseBranch = await getCurrentBranch(this.projectRoot).catch(() => null);
      diffSoFar = await getWorktreeDiffText({
        worktreePath: input.worktreePath,
        baseBranch,
      }).catch(() => "");
    }

    const prompt = buildSupervisorPrompt({
      goal: this.task,
      lastStep: { text: completedItem.text, outcomeSummary },
      diffSoFar,
      remainingSteps: checklistItems.slice(itemIndex + 1).map((c) => c.text),
      invariants,
    });

    // Apply the project's catalog overlay (custom model/effort) like a real turn.
    if (!this.resolvedCatalog) {
      this.resolvedCatalog = await resolveCatalog(this.projectRoot).catch(() => null);
    }
    let text = "";
    try {
      const result = await runProvider(this.config.providers, {
        providerId,
        prompt,
        cwd: input.worktreePath ?? this.projectRoot,
        model: profileCfg?.model ?? null,
        effort: profileCfg?.power ?? null,
        maxTokens: profileCfg?.maxTokens ?? null,
        catalog: this.resolvedCatalog ?? undefined,
        // allowWrite omitted -> no write grant: a read-only judgment turn.
      });
      text = result.exitCode === 0 ? result.normalized.responseText : "";
      // Record the turn's cost as a RoleMetrics entry so it counts toward the
      // per-saga budget (computeRunSpendUsd reads metrics.totalCostUsd) and the
      // daily total - the supervisor is NOT free. roleMetricsSchema.parse fills
      // every defaulted field so we only pass the cost-relevant ones.
      const m = result.normalized.metrics;
      let tokenUsage = m?.tokenUsage ?? null;
      let tokensEstimated = false;
      const hasRealTokens =
        !!tokenUsage && ((tokenUsage.input ?? 0) + (tokenUsage.output ?? 0)) > 0;
      if (!hasRealTokens) {
        tokenUsage = {
          input: estimateTokensFromText(prompt),
          output: estimateTokensFromText(text),
        };
        tokensEstimated = true;
      }
      const { costUsd, estimated } = resolveCost({
        reportedCostUsd: m?.totalCostUsd ?? null,
        model: m?.model ?? null,
        tokenUsage,
      });
      await input.metricsStore
        .appendRoleMetrics(
          roleMetricsSchema.parse({
            roleId: "saga-supervisor",
            stageId: "saga-supervisor",
            providerId,
            providerType: this.config.providers[providerId]?.type ?? "cli",
            command: result.command,
            cwd: result.cwd,
            startedAt: result.startedAt,
            endedAt: result.endedAt,
            durationMs: result.durationMs,
            exitCode: result.exitCode,
            model: m?.model ?? null,
            totalCostUsd: costUsd,
            costEstimated: estimated,
            tokenUsage,
            tokensEstimated,
          }),
        )
        .catch(() => {});
    } catch (err) {
      await input.eventLog.append({
        type: "supervised.supervisor",
        message: `Saga supervisor errored after step ${itemIndex + 1}; proceeding. ${
          err instanceof Error ? err.message : ""
        }`.trim(),
        data: { index: itemIndex, decision: null, skipped: "error" },
      });
      return "PROCEED";
    }

    const parsed = parseSupervisorDecision(text);
    // Phase 3: the 3-way decision drives control flow (ENHANCE no longer folds).
    // An unparseable turn still folds to PROCEED (advisory guard).
    const verdict = parsed.decision ?? "PROCEED";
    const newInvariants = parseNewInvariants(text);
    if (newInvariants.length > 0) {
      await roadmap.appendSagaInvariants(taskId, newInvariants).catch(() => {});
    }
    await input.eventLog.append({
      type: "supervised.supervisor",
      message: `Saga supervisor after step ${itemIndex + 1}/${checklistItems.length}: ${
        parsed.decision ?? "PROCEED (unparsed)"
      }${
        newInvariants.length
          ? ` (+${newInvariants.length} invariant${newInvariants.length > 1 ? "s" : ""})`
          : ""
      }.`,
      data: {
        index: itemIndex,
        decision: parsed.decision,
        effective: verdict,
        newInvariants,
        unparsed: parsed.decision === null,
      },
    });
    return verdict;
  }

  // The conductor's ENHANCE pass (Phase 3). A plan-only model turn: it re-grounds
  // the PENDING steps against the code as-built and emits a step-diff. On `auto`
  // (refine/reorder/remove of existing ids) it mutates `checklistItems` in place
  // (tail only, `> itemIndex`, so the band's absolute-index addressing survives)
  // and persists the revised pending plan to the saga-scoped overlay atomically.
  // On `escalate` (a structural change it may not make autonomously) it returns
  // "escalate" and the band halts cleanly. Spend-accounted as a `saga-enhance`
  // role; any failure/empty diff is a "noop" (advisory, never corrupts the plan).
  private async runSagaEnhanceTurn(args: {
    completedItem: { id: string; text: string };
    itemIndex: number;
    checklistItems: EnhanceStep[];
    input: {
      worktreePath: string | null;
      eventLog: EventLog;
      runId: string;
      metricsStore: MetricsStore;
    };
  }): Promise<"applied" | "escalate" | "noop"> {
    const { completedItem, itemIndex, checklistItems, input } = args;
    const taskId = this.taskId!;
    const roadmap = new RoadmapService(this.projectRoot);

    await this.enforceSpendCap({ eventLog: input.eventLog, runId: input.runId });

    // Reuse the supervisor's cheap provider/profile resolution.
    let profileName = this.sagaSupervisor.profile;
    if (!profileName) {
      try {
        const { crew } = getCrew(this.config, this.activeCrewId);
        profileName = getCrewRole(crew, this.sagaSupervisor.roleId).profile;
      } catch {
        profileName = null;
      }
    }
    const profileCfg = profileName ? this.config.profiles[profileName] : undefined;
    const providerId =
      profileCfg?.provider ?? Object.values(this.config.profiles)[0]?.provider;
    if (!providerId || !this.config.providers[providerId]) {
      await input.eventLog.append({
        type: "supervised.enhance",
        message: `Saga enhance skipped after step ${itemIndex + 1}: no resolvable provider.`,
        data: { index: itemIndex, authority: null, skipped: "no-provider" },
      });
      return "noop";
    }

    // The PENDING tail is everything after the just-finished step.
    const pending = checklistItems.slice(itemIndex + 1);
    if (pending.length === 0) return "noop"; // nothing left to re-ground

    const task = await roadmap.getTask(taskId).catch(() => null);
    const invariants = task?.supervised.invariants ?? [];
    const doneOutcomes = checklistItems.slice(0, itemIndex + 1).map((c) => ({
      text: c.text,
      summary:
        task?.checklist.find((t) => t.id === c.id)?.outcomeSummary ?? "",
    }));

    let diffSoFar = "";
    let freshRead = "";
    if (input.worktreePath) {
      const baseBranch = await getCurrentBranch(this.projectRoot).catch(() => null);
      diffSoFar = await getWorktreeDiffText({
        worktreePath: input.worktreePath,
        baseBranch,
      }).catch(() => "");
      const hints = [...new Set(pending.flatMap((s) => s.fileHints))];
      if (hints.length > 0) {
        const reads = await readFreshFileReads({
          worktreePath: input.worktreePath,
          fileHints: hints,
        }).catch(() => []);
        freshRead = reads
          .map((r) => `--- ${r.path} ---\n${r.content ?? ""}`)
          .join("\n\n");
      }
    }

    const prompt = buildEnhancePrompt({
      goal: this.task,
      doneOutcomes,
      pending,
      diff: diffSoFar,
      freshRead,
      invariants,
      mode: "conductor",
    });

    if (!this.resolvedCatalog) {
      this.resolvedCatalog = await resolveCatalog(this.projectRoot).catch(() => null);
    }
    let text = "";
    try {
      const result = await runProvider(this.config.providers, {
        providerId,
        prompt,
        cwd: input.worktreePath ?? this.projectRoot,
        model: profileCfg?.model ?? null,
        effort: profileCfg?.power ?? null,
        maxTokens: profileCfg?.maxTokens ?? null,
        catalog: this.resolvedCatalog ?? undefined,
        // allowWrite omitted -> a read-only, plan-only turn.
      });
      text = result.exitCode === 0 ? result.normalized.responseText : "";
      const m = result.normalized.metrics;
      let tokenUsage = m?.tokenUsage ?? null;
      let tokensEstimated = false;
      const hasRealTokens =
        !!tokenUsage && ((tokenUsage.input ?? 0) + (tokenUsage.output ?? 0)) > 0;
      if (!hasRealTokens) {
        tokenUsage = {
          input: estimateTokensFromText(prompt),
          output: estimateTokensFromText(text),
        };
        tokensEstimated = true;
      }
      const { costUsd, estimated } = resolveCost({
        reportedCostUsd: m?.totalCostUsd ?? null,
        model: m?.model ?? null,
        tokenUsage,
      });
      await input.metricsStore
        .appendRoleMetrics(
          roleMetricsSchema.parse({
            roleId: "saga-enhance",
            stageId: "saga-enhance",
            providerId,
            providerType: this.config.providers[providerId]?.type ?? "cli",
            command: result.command,
            cwd: result.cwd,
            startedAt: result.startedAt,
            endedAt: result.endedAt,
            durationMs: result.durationMs,
            exitCode: result.exitCode,
            model: m?.model ?? null,
            totalCostUsd: costUsd,
            costEstimated: estimated,
            tokenUsage,
            tokensEstimated,
          }),
        )
        .catch(() => {});
    } catch (err) {
      await input.eventLog.append({
        type: "supervised.enhance",
        message: `Saga enhance errored after step ${itemIndex + 1}; proceeding. ${
          err instanceof Error ? err.message : ""
        }`.trim(),
        data: { index: itemIndex, authority: null, skipped: "error" },
      });
      return "noop";
    }

    const { diff } = parseStepDiff(text);
    const empty =
      !diff ||
      (diff.refine.length === 0 &&
        diff.remove.length === 0 &&
        diff.add.length === 0 &&
        (diff.reorder === null || diff.reorder.length === 0));
    if (!diff || empty) {
      await input.eventLog.append({
        type: "supervised.enhance",
        message: `Saga enhance after step ${itemIndex + 1}: no change (plan already grounded).`,
        data: { index: itemIndex, authority: "auto", applied: null, noop: true },
      });
      return "noop";
    }

    const authority = classifyAuthority(diff, pending, "conductor");
    if (authority === "escalate") {
      await input.eventLog.append({
        type: "supervised.enhance",
        message: `Saga enhance after step ${itemIndex + 1}: escalating to the owner (structural change).`,
        data: {
          index: itemIndex,
          authority: "escalate",
          adds: diff.add.length,
          removes: diff.remove.length,
        },
      });
      return "escalate";
    }

    // auto: apply to the pending tail. REDACT the model-authored fields FIRST -
    // they get persisted (overlay + reconciled checklist) and re-injected into
    // later packets, so they follow the same redaction rule as every other
    // model-prose path (commit summaries, the supervisor ledger).
    const revisedTail: EnhanceStep[] = applyStepDiff(pending, diff).map((s) => ({
      ...s,
      text: redactSecretsInText(s.text).redacted,
      objective: redactSecretsInText(s.objective).redacted,
      acceptanceCheck: redactSecretsInText(s.acceptanceCheck).redacted,
      fileHints: s.fileHints.map((h) => redactSecretsInText(h).redacted),
    }));
    // A diff that removes every remaining pending step = "drop all remaining
    // work" - a structural decision (and emptying the tail would break the
    // band's `itemIndex` re-entry). Escalate rather than auto-apply.
    if (revisedTail.length === 0) {
      await input.eventLog.append({
        type: "supervised.enhance",
        message: `Saga enhance after step ${itemIndex + 1}: escalating - the diff would drop all remaining steps.`,
        data: { index: itemIndex, authority: "escalate", emptiedTail: true },
      });
      return "escalate";
    }
    // Mutate the in-memory pending tail IN PLACE (preserve itemIndex + the done
    // prefix so the band's absolute-index addressing stays valid).
    checklistItems.splice(
      itemIndex + 1,
      checklistItems.length - (itemIndex + 1),
      ...revisedTail,
    );
    // Persist the revised plan to the saga-scoped overlay (one atomic write;
    // never touches task.checklist). Skip when the task read came back null - a
    // null read would write an empty, corrupt overlay that strands a resume.
    if (task) {
      const canonicalById = new Map(task.checklist.map((c) => [c.id, c]));
      const overlayPending = revisedTail
        .map((s) => {
          const base = canonicalById.get(s.id);
          if (!base) return null;
          return {
            ...base,
            text: s.text,
            objective: s.objective,
            acceptanceCheck: s.acceptanceCheck,
            fileHints: s.fileHints,
          };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);
      await roadmap
        .setSagaPendingRevision(taskId, {
          revisedAtStepIndex: itemIndex,
          pending: overlayPending,
        })
        .catch(async (err: unknown) => {
          await input.eventLog.append({
            type: "supervised.enhance",
            message: `Saga enhance: could not persist the revised plan; the run continues but a resume would fall back to the original plan. ${
              err instanceof Error ? err.message : ""
            }`.trim(),
            data: { index: itemIndex, authority: "auto", persistFailed: true },
          });
        });
    }

    await input.eventLog.append({
      type: "supervised.enhance",
      message: `Saga enhance after step ${itemIndex + 1}: re-grounded the pending plan (${diff.refine.length} refined, ${diff.remove.length} removed${diff.reorder ? ", resequenced" : ""}).`,
      data: {
        index: itemIndex,
        authority: "auto",
        applied: {
          refine: diff.refine.length,
          remove: diff.remove.length,
          reorder: diff.reorder ? diff.reorder.length : 0,
        },
      },
    });
    return "applied";
  }

  private async runRole(input: {
    roleId: string;
    providerId?: string | null;
    profileId?: string | null;
    stageId: string;
    promptIndex: number;
    outputName: string;
    promptName?: string;
    priorArtifacts: PriorArtifact[];
    validationResults: ValidationResults | null;
    additionalNotes?: string;
    /** The run brief (story so far), injected as a prompt section. */
    runBrief?: string;
    /**
     * Clean-room seat (context-scaling.md rung 2): drop the run-level grounding
     * injected on top of this turn (attached context sources, run brief, human
     * annotations, ledger/continuity) - keep only the flow's declared prior
     * artifacts + task/rules/role. Opt-in per flow step; default behaviour
     * (undefined/false) is unchanged.
     */
    cleanRoom?: boolean;
    /**
     * Per-step skills (P2 / "flow owns skills"): skill ids declared on the flow
     * step, merged (deduped) with the agent's own skills + run-level
     * runtimeSkills for THIS turn only. Omitted/undefined = the step declares no
     * skills (unchanged behaviour).
     */
    skills?: string[];
    flowTurn?: FlowRoleTurn;
    metricsStore: MetricsStore;
    reviewDecisionForStage?: string | null;
    verificationDecisionForStage?: string | null;
    ctx: {
      runId: string;
      worktreePath: string | null;
      branchName: string | null;
      artifactStore: ArtifactStore;
      eventLog: EventLog;
      stateStore: RunStateStore;
      onProgress: (message: string) => void;
    };
  }): Promise<RoleRunResult> {
    const { roleId, ctx } = input;
    // Budget gates: before spending on this turn, check the count/time ceilings
    // (which bind without measured cost) and the daily USD cap. Both run before
    // provider resolution.
    await this.enforceBudgetCeilings(ctx);
    await this.enforceSpendCap(ctx);
    // Resolve the Role from the Crew the run's flow snapshot was built against.
    const { crew } = getCrew(this.config, this.activeCrewId);
    const agent = getCrewRole(crew, roleId);
    // Read-only runs override every role's permission profile to the built-in
    // `read_only` (allowWrite/allowShell false), regardless of how the role is
    // configured. Using the builtin name guarantees resolution via
    // resolveProfile's builtin fallback even on a project that hasn't defined a
    // read-only profile of its own.
    // S4 - strict apply-only: a write-capable role runs READ-ONLY (no direct
    // disk writes); it proposes a diff that Vibestrate applies through the
    // gateway after the turn. Detect write-capability from the role's own
    // profile, then force read_only execution.
    const applyOnly =
      this.config.policies.strictApplyOnly &&
      !this.readOnly &&
      resolveProfile(this.config.permissions.profiles, agent.permissions)
        .allowWrite;
    const effectivePermissions =
      this.readOnly || applyOnly ? "read_only" : agent.permissions;
    const profile = resolveProfile(
      this.config.permissions.profiles,
      effectivePermissions,
    );
    // Effective provider id: the resolved snapshot already mapped this step's
    // Seat → Role → Profile → Provider, so input.providerId is authoritative.
    // Fall back to the role's Profile's provider if (defensively) absent.
    // Budget downgrade (U4): when the daily $ cap forced a downgrade, this turn
    // runs on the cheaper fallback Profile instead of its resolved one.
    const downgradeProfileId =
      this.budgetOverride?.kind === "downgrade"
        ? this.budgetOverride.profileId
        : null;
    const effectiveProviderId = downgradeProfileId
      ? this.config.profiles[downgradeProfileId]?.provider
      : input.providerId ?? this.config.profiles[agent.profile]?.provider;
    if (!effectiveProviderId) {
      throw new VibestrateError(
        "provider-unresolved",
        `Role "${roleId}" has no resolvable provider (profile "${agent.profile}").`,
      );
    }

    assertExecutableContext({
      roleId,
      profile,
      projectRoot: this.projectRoot,
      worktreePath: ctx.worktreePath,
    });

    const cwd = resolveCwd({
      roleId,
      profile,
      projectRoot: this.projectRoot,
      worktreePath: ctx.worktreePath,
    });

    const promptTemplate = await loadRolePrompt(this.projectRoot, agent.prompt);
    // Merge the agent's configured skills with the per-run runtimeSkills and the
    // per-STEP skills (P2 / "flow owns skills") into one deduped, order-preserving
    // list, scoped to THIS turn (the set is rebuilt per runRole call, so step
    // skills never leak into the next step). All-empty is a no-op, so existing
    // runs keep their exact behavior.
    const stepSkills = input.skills ?? [];
    const effectiveSkillIds =
      this.runtimeSkills.length === 0 && stepSkills.length === 0
        ? agent.skills
        : Array.from(
            new Set([...agent.skills, ...this.runtimeSkills, ...stepSkills]),
          );
    const skills = await loadSkills(this.projectRoot, effectiveSkillIds);

    // MCP: gather servers from the agent + each skill, materialize them
    // into a per-invocation `mcp/<stage>-mcp.json` under the run's
    // artifacts directory, and surface the attachment as an event so
    // the run replay / dashboard can show what was wired in.
    const mcpResolved = resolveMcpServers({
      roleServers: agent.mcpServers,
      skills: skills.map((s) => ({ name: s.name, servers: s.mcpServers })),
    });
    const mcpConfigRelDir = path.join("mcp");
    const mcpConfigRelPath = path.join(
      mcpConfigRelDir,
      `${input.stageId}-${roleId}.json`,
    );
    let mcpConfigAbsPath: string | null = null;
    if (mcpResolved.servers.length > 0) {
      mcpConfigAbsPath = await writeMcpConfigFile({
        dir: path.dirname(ctx.artifactStore.resolveArtifactPath(mcpConfigRelPath)),
        servers: mcpResolved.servers,
        broker: this.broker ?? undefined,
        runId: ctx.runId,
      });
      await ctx.eventLog.append({
        type: "mcp.attached",
        message: `Attached ${mcpResolved.servers.length} MCP server(s) for ${roleId}.`,
        data: {
          roleId,
          stageId: input.stageId,
          configPath: ctx.artifactStore.relPath(mcpConfigAbsPath ?? ""),
          servers: mcpResolved.servers.map((s) => ({
            name: s.name,
            source: s.source,
            command: s.config.command,
          })),
          collisions: mcpResolved.collisions,
        },
      });
    }

    // Pull any user-queued control directives (notes, compaction
    // requests) that have arrived since the previous stage. They are
    // rendered into the `additionalNotes` slot of the prompt and then
    // marked consumed so the next agent doesn't see them again.
    const allControls = await listControls(this.projectRoot, ctx.runId);
    const pending = pendingControls(allControls);
    const controlNotes = renderControlNotes(pending);
    const applyOnlyNote = applyOnly
      ? "STRICT APPLY-ONLY MODE: you do NOT have write access to the filesystem. " +
        "Do not attempt to edit files directly. Instead, output ALL of your changes " +
        "as a single unified diff inside one fenced ```diff code block (git-apply " +
        "compatible, paths relative to the repo root). Vibestrate will review and " +
        "apply it for you through a safety gateway."
      : null;
    const additionalNotes = [input.additionalNotes, controlNotes, applyOnlyNote]
      .filter((note): note is string => !!note && note.trim().length > 0)
      .join("\n\n");
    // Pull the user's shared, open codebase annotations and inject them so
    // every agent acknowledges them. Read per turn so notes added mid-run are
    // picked up by the next stage; a corrupt/missing file yields "".
    const humanAnnotations = renderAnnotationsForPrompt(
      await listAnnotations(this.projectRoot, { status: "open" }),
    );
    // Continuity ledger (T9): inject the planning-context block into the
    // PLANNER turn only - it primes the role that decides the approach with
    // where the project stands. Other roles build on the run's own brief, and
    // resumed runs (no planner re-run) correctly skip it. One-shot guards
    // against a flow with more than one planner turn.
    const injectContinuity = roleId === "planner" && !this.ledgerInjected;
    const projectLedger =
      injectContinuity && this.ledgerPromptBlock ? this.ledgerPromptBlock : "";
    const continuityFlags =
      injectContinuity && this.ledgerFlagsBlock ? this.ledgerFlagsBlock : "";
    // Methodology rides the same planner-only, one-shot channel as the ledger.
    const methodologyGuidance =
      injectContinuity && this.methodologyBlock ? this.methodologyBlock : "";
    if (projectLedger || continuityFlags || methodologyGuidance)
      this.ledgerInjected = true;
    // Clean-room seat (context-scaling.md rung 2): drop the producer's run-derived
    // NARRATIVE - the run brief (the "story so far") and the planner-only
    // ledger/continuity - so a judge reasons without being anchored to how the
    // producer framed things. It deliberately KEEPS ground truth: attached context
    // sources (the spec), user annotations, and the step's declared inputs. A
    // controlled eval (see context-scaling.md) showed that dropping the attached
    // spec from a reviewer measurably weakened spec-compliance review, while
    // dropping only the brief cost nothing - so ground truth stays, chatter goes.
    const cleanRoom = input.cleanRoom === true;
    const prompt = buildRolePrompt({
      roleId,
      task: this.task,
      rules: this.rules,
      rolePromptTemplate: promptTemplate,
      skills,
      // Run-level context sources (ground truth) are visible to every role,
      // ahead of the flow's per-step handoff artifacts - clean-room included.
      priorArtifacts: [...this.materializedContext, ...input.priorArtifacts],
      permission: profile,
      permissionName: agent.permissions,
      worktreePath: ctx.worktreePath,
      branchName: ctx.branchName,
      projectName: this.config.project.name,
      validationResults: input.validationResults,
      concise: this.concise,
      ...(additionalNotes ? { additionalNotes } : {}),
      ...(humanAnnotations ? { humanAnnotations } : {}),
      ...(!cleanRoom && input.runBrief ? { runBrief: input.runBrief } : {}),
      ...(!cleanRoom && projectLedger ? { projectLedger } : {}),
      ...(!cleanRoom && continuityFlags ? { continuityFlags } : {}),
      ...(!cleanRoom && methodologyGuidance ? { methodologyGuidance } : {}),
    });
    if (pending.length > 0) {
      const consumed = await markPendingConsumed(
        this.projectRoot,
        ctx.runId,
        roleId,
      );
      await ctx.eventLog.append({
        type: "control.applied",
        message: `Applied ${consumed.length} user-queued directive(s) to ${roleId}.`,
        data: {
          roleId,
          kinds: consumed.map((d) => d.kind),
          ids: consumed.map((d) => d.id),
        },
      });
    }

    const promptName = input.promptName ?? this.defaultPromptName(input.promptIndex, roleId);
    // The artifact is the RECORD copy (and feeds later steps' context + the
    // P5 control center) - scrub high-precision token shapes before persisting.
    // The prompt actually sent to the provider below is the unredacted local.
    const promptArtifactPathAbs = await ctx.artifactStore.write(
      promptName,
      redactSecretsInText(prompt).redacted,
    );

    await ctx.eventLog.append({
      type: "role.started",
      message: `Agent ${roleId} starting.`,
      data: {
        roleId,
        provider: effectiveProviderId,
        permissions: effectivePermissions,
        // Skills attached to this agent's prompt. The provider's
        // underlying model decides whether to use them - we can only
        // honestly report what we made available, not what it picked.
        skillsAttached: skills.map((s) => s.name),
        skillsConfigured: agent.skills.slice(),
        skillsFromRuntime: this.runtimeSkills.slice(),
        flowSeat: input.flowTurn?.seat ?? null,
        flowContextMode: input.flowTurn?.contextMode ?? null,
      },
    });
    await ctx.eventLog.append({
      type: "provider.started",
      message: `Provider ${effectiveProviderId} invoked for ${roleId}.`,
      data: { roleId, provider: effectiveProviderId, cwd },
    });

    // ── Action Broker boundary (S0) ──────────────────────────────────────
    // Every provider spawn is decided and recorded as evidence before the
    // child process is started. Fail-closed: a non-allow decision blocks the
    // run (default policy is allow, so behavior is unchanged until S2 wires
    // evaluators). The post-execution evidence is appended after runProvider.
    const actionRequest: ActionRequest = {
      runId: ctx.runId,
      roleId,
      kind: "provider.spawn",
      subject: {
        providerId: effectiveProviderId,
        seat: input.flowTurn?.seat ?? null,
        cwd,
      },
      proposedBy: "system",
    };
    const actionDecision = await this.broker!.decide(actionRequest);
    if (actionDecision.effect !== "allow") {
      await this.broker!.record(actionRequest, actionDecision, null);
      const reason =
        "reason" in actionDecision ? actionDecision.reason : "policy denied";
      await ctx.eventLog.append({
        type:
          actionDecision.effect === "deny"
            ? "action.denied"
            : "action.approval_required",
        message: `Action broker ${actionDecision.effect} provider.spawn for ${roleId}: ${reason}`,
        data: {
          roleId,
          kind: "provider.spawn",
          provider: effectiveProviderId,
          effect: actionDecision.effect,
          ruleIds: actionDecision.ruleIds,
          reason,
        },
      });
      throw new __ActionDeniedSignal(
        `Action broker ${actionDecision.effect} provider.spawn for ${roleId}: ${reason}`,
      );
    }

    // ── Post-turn diff gate (S3): pre-turn snapshot ──────────────────────
    // For write-capable turns, snapshot the worktree so the diff this turn
    // produces can be evaluated (and rolled back) after the provider returns.
    // Best-effort: a snapshot failure disables the gate for this turn, never
    // blocks the run.
    let preTurnTree: string | null = null;
    if (profile.allowWrite && ctx.worktreePath) {
      preTurnTree = await snapshotWorktree(ctx.worktreePath).catch(() => null);
      if (preTurnTree === null) {
        // Fail-CLOSED (T14 P4): a write-capable turn with no pre-turn baseline
        // can't be diff-gated OR rolled back. Refuse it BEFORE the provider runs,
        // so no unevaluated writes ever land - rather than silently skipping the
        // gate (the second fail-open seam the broker fix alone wouldn't close).
        await ctx.eventLog.append({
          type: "action.denied",
          message: `Refused a write turn (${roleId}): the worktree could not be snapshotted, so its writes can't be gated or rolled back. Failing closed.`,
          data: { kind: "snapshot.unavailable", roleId, stageId: input.stageId },
        });
        throw new __ActionDeniedSignal(
          `Write turn refused: could not snapshot the worktree for ${roleId} (failing closed - no baseline to gate or roll back writes).`,
        );
      }
    }

    let providerResult: RichProviderRunResult;
    const stageStart = new Date();
    // Materialize a live stream file for this agent invocation so the
    // dashboard can tail what the provider's CLI is saying in real
    // time - bridges the gap between "spawned" and "artifact written".
    await ensureStreamsDir(this.projectRoot, ctx.runId).catch(() => undefined);
    const streamName = promptName;

    // Structured providers (e.g. claude stream-json) emit JSON events, not
    // readable text. The adapter's live filter turns those into the assistant's
    // text for the live panel (display only). Plain providers have no filter →
    // chunks stream verbatim. `liveEmitted` lets us skip the end-of-turn flush
    // when the stream already showed the text incrementally.
    const outputAdapter = selectOutputAdapter(
      this.config.providers[effectiveProviderId]!,
    );
    // P2: prefer the typed transcript filter (text/thinking/tool/subagent)
    // over the text-only live filter - it's what lets the live view show the
    // model *working* (tools, thinking) instead of going silent between
    // visible-text stretches. Both are display-only, never the control path.
    const transcriptFilter = outputAdapter.createTranscriptFilter?.();
    const liveFilter = transcriptFilter
      ? null
      : outputAdapter.createLiveFilter?.();
    let liveEmitted = false;
    // Raw stdout already streamed verbatim (plain-text providers). The
    // end-of-turn flush dedupes against it - a text-mode CLI that emits its
    // whole answer as one final chunk used to get the same response appended
    // twice (once raw, once as the normalized flush). Capped: past the cap we
    // stop accumulating and accept a possible duplicate over losing output.
    let rawStdout = "";
    const RAW_DEDUP_CAP = 1_000_000;

    // Honor `vibe abort` mid-stage: poll state.json every 500ms; when
    // we see `aborted`, abort the controller to SIGTERM the provider
    // child. Without this the run waited for the current CLI call to
    // finish on its own, which could mean minutes per stage. Cleared
    // in the finally block so we don't leak intervals.
    const providerAbort = new AbortController();
    if (this.abortSignal?.aborted) {
      providerAbort.abort();
    }
    const abortFromSignal = (): void => {
      if (!providerAbort.signal.aborted) providerAbort.abort();
    };
    this.abortSignal?.addEventListener("abort", abortFromSignal, {
      once: true,
    });
    const observer = setInterval(() => {
      void (async () => {
        try {
          const cur = await ctx.stateStore.read();
          if (cur && cur.status === "aborted" && !providerAbort.signal.aborted) {
            providerAbort.abort();
          }
        } catch {
          /* ignore - state file may be mid-write */
        }
      })();
    }, 500);
    try {
      // Resolved runtime profile for this turn (model + effort + caps). Applied
      // to the spawn where the provider supports it; advisory otherwise.
      const runtimeProfile =
        this.config.profiles[downgradeProfileId ?? input.profileId ?? agent.profile];
      // Resolve the capability catalog (built-in + project overlay) once; the
      // provider applies model/effort from it so a user's custom catalog entry
      // actually reaches the spawn.
      if (!this.resolvedCatalog) {
        this.resolvedCatalog = await resolveCatalog(this.projectRoot);
      }
      // Fail-loud (not silent): if the profile sets an effort the provider won't
      // honor (no effort knob, or not one of its real levels), the provider would
      // just ignore it - an advisory dial. Surface it once per provider+effort.
      const profileEffort = runtimeProfile?.power;
      if (profileEffort) {
        const provCfg = this.config.providers[effectiveProviderId];
        const levels = provCfg
          ? capabilitiesForProvider(effectiveProviderId, provCfg, this.resolvedCatalog).powerLevels
          : [];
        if (!levels.includes(profileEffort)) {
          const key = `${effectiveProviderId}:${profileEffort}`;
          if (!this.warnedEffort.has(key)) {
            this.warnedEffort.add(key);
            const why =
              levels.length === 0
                ? `${effectiveProviderId} exposes no effort control`
                : `valid: ${levels.join("/")}`;
            const msg = `Effort "${profileEffort}" won't take effect on ${effectiveProviderId} (${why}) - the provider ignores it.`;
            this.onProgress(msg);
            await ctx.eventLog.append({
              type: "provider.effort_ignored",
              message: msg,
              data: {
                roleId,
                provider: effectiveProviderId,
                effort: profileEffort,
                validLevels: levels,
              },
            });
          }
        }
      }
      // ── Provider-native OS sandbox (T14 slice 1) ────────────────────────
      // Only when execution.isolation = "sandboxed". A write-capable seat asks
      // for "workspace-write" (writes confined to the worktree); a read-only
      // seat for "read-only". This is only the REQUEST passed to the provider;
      // whether a real OS sandbox actually applied is read off the result AFTER
      // the turn (a turn can fall back to a provider that can't sandbox), so the
      // honest record is emitted post-run, never from this requested value.
      const effectiveIsolation =
        this.isolationOverride ?? this.config.execution?.isolation;
      const requestedSandbox: SandboxMode | null =
        effectiveIsolation === "sandboxed"
          ? profile.allowWrite
            ? "workspace-write"
            : "read-only"
          : null;
      providerResult = await this.runProviderResilient({
        args: {
          providerId: effectiveProviderId,
          prompt,
          cwd,
          sandbox: requestedSandbox ?? undefined,
          // The resolved, POST-OVERRIDE write capability for this turn. read-only
          // runs, strict-apply-only, and read-only seats already collapsed
          // `effectivePermissions` to read_only above, so `profile.allowWrite` is
          // false there and the provider grants no write. A write-capable seat on
          // a claude provider gets `--permission-mode acceptEdits` (see
          // claude-code-settings.ts) so it can actually write in the worktree.
          allowWrite: profile.allowWrite,
          // Opt-in read-only hardening (policies.hardenReadOnlySeats): the
          // provider applies it only on a non-write-capable turn (claude-code ->
          // `--permission-mode plan`). A no-op when off or on a write turn.
          hardenReadOnly: this.config.policies?.hardenReadOnlySeats === true,
          model: runtimeProfile?.model ?? undefined,
          // reduce-effort (U4): drop to the provider's minimum effort if it has one.
          effort:
            this.budgetOverride?.kind === "reduce-effort"
              ? this.lowestEffort(effectiveProviderId) ?? runtimeProfile?.power ?? undefined
              : runtimeProfile?.power ?? undefined,
          maxTokens: runtimeProfile?.maxTokens ?? undefined,
          // Real wall-clock cap (no longer advisory): the provider tree-kills the
          // whole turn if it overruns - matters most for fanned-out review turns.
          timeoutMs: runtimeProfile?.timeoutMs ?? undefined,
          catalog: this.resolvedCatalog,
          mcpConfigPath: mcpConfigAbsPath ?? undefined,
          // Container/cloud execution (T14 slice 2): run this turn off-host.
          execStrategy: this.execStrategy ?? undefined,
          onChunk: (c) => {
            if (transcriptFilter && c.stream === "stdout") {
              for (const t of transcriptFilter(c.chunk)) {
                // Only visible text counts as "the stream showed the answer" -
                // tool/thinking activity alone still gets the final flush.
                if (t.kind === "text") liveEmitted = true;
                void appendStreamLine(this.projectRoot, ctx.runId, streamName, {
                  ...c,
                  kind: t.kind,
                  chunk: t.text,
                });
              }
              return;
            }
            if (liveFilter && c.stream === "stdout") {
              const text = liveFilter(c.chunk);
              if (text) {
                liveEmitted = true;
                void appendStreamLine(this.projectRoot, ctx.runId, streamName, {
                  ...c,
                  chunk: text,
                });
              }
              return;
            }
            if (c.stream === "stdout" && rawStdout.length < RAW_DEDUP_CAP) {
              rawStdout += c.chunk;
            }
            void appendStreamLine(this.projectRoot, ctx.runId, streamName, c);
          },
          signal: providerAbort.signal,
          ...(input.flowTurn?.sessionRequest
            ? { session: input.flowTurn.sessionRequest }
            : {}),
        },
        ctx,
        stageId: input.stageId,
        abortSignal: providerAbort.signal,
      });
      if (providerAbort.signal.aborted) {
        throw new __RunAbortedSignal();
      }
      // ── Honest, post-run OS-sandbox record ──────────────────────────────
      // Record what was ACTUALLY enforced (`providerResult.appliedSandbox`),
      // never the requested mode: the turn may have fallen back to a provider
      // that can't sandbox, so only the result tells the truth. Emitting from
      // the request (pre-run) would assert OS sandboxing for a turn that ran
      // unconfined - the exact over-claim the repo forbids. Off (no request)
      // records nothing. Keyed off the provider that actually ran.
      if (requestedSandbox) {
        const ranProvider = providerResult.providerId;
        if (providerResult.appliedSandbox) {
          await ctx.eventLog.append({
            type: "provider.sandboxed",
            message: `Provider ${ranProvider} ran this turn under OS sandbox "${providerResult.appliedSandbox}".`,
            data: { roleId, stageId: input.stageId, provider: ranProvider, mode: providerResult.appliedSandbox },
          });
        } else if (!this.warnedSandbox.has(ranProvider)) {
          // Sandbox was asked for but this provider has no OS sandbox - warn once
          // (per provider that actually ran) and be explicit it ran unconfined.
          this.warnedSandbox.add(ranProvider);
          const msg = `Isolation is "sandboxed" but provider ${ranProvider} has no OS-level sandbox - this turn ran unsandboxed (worktree + diff gate still apply). codex provides provider-native OS confinement.`;
          this.onProgress(msg);
          await ctx.eventLog.append({
            type: "provider.sandbox_unavailable",
            message: msg,
            data: { roleId, stageId: input.stageId, provider: ranProvider, requested: requestedSandbox },
          });
        }
      }
      // Read-only hardening that ACTUALLY applied (claude `--permission-mode
      // plan` on a non-write turn). Sourced from the result, not config, so the
      // assurance posture reflects what ran. One event per hardened turn.
      if (providerResult.appliedReadOnlyHardening) {
        await ctx.eventLog.append({
          type: "provider.hardened",
          message: `Provider ${providerResult.providerId} ran this read-only turn under --permission-mode plan (no-write enforced by the CLI).`,
          data: { roleId, stageId: input.stageId, provider: providerResult.providerId, mode: "plan" },
        });
      }
      // Fallback flush - most providers buffer all output until exit, so the
      // live panel would be empty mid-flight. Persist the *normalized* response
      // text (the clean answer, not raw JSON for structured providers) as one
      // chunk. Skip it when a structured stream already showed text live, so we
      // don't duplicate.
      if (
        !liveEmitted &&
        providerResult.normalized.responseText &&
        providerResult.normalized.responseText.length > 0 &&
        !rawStdout.includes(providerResult.normalized.responseText.trim())
      ) {
        await appendStreamLine(this.projectRoot, ctx.runId, streamName, {
          stream: "stdout",
          chunk: providerResult.normalized.responseText,
          at: new Date().toISOString(),
        }).catch(() => undefined);
      }
      if (
        providerResult.stderr &&
        providerResult.stderr.length > 0
      ) {
        await appendStreamLine(this.projectRoot, ctx.runId, streamName, {
          stream: "stderr",
          chunk: providerResult.stderr,
          at: new Date().toISOString(),
        }).catch(() => undefined);
      }
      // Post-execution evidence for the allowed action (S0 audit trail).
      await this.broker!.record(actionRequest, actionDecision, {
        ok: providerResult.exitCode === 0,
        summary: `provider.spawn ${effectiveProviderId} exited ${providerResult.exitCode}`,
        data: {
          exitCode: providerResult.exitCode,
          durationMs: Date.now() - stageStart.getTime(),
        },
      });
      // A non-zero exit is an invocation failure (e.g. a rejected flag). The run
      // continues, but surface it as a notification tied to this phase so it's
      // not silent.
      if (providerResult.exitCode !== 0) {
        (this as unknown as { _notify?: (d: NotificationDraft) => void })._notify?.(
          draftProviderFailed({
            runId: ctx.runId,
            providerId: effectiveProviderId,
            error: `${roleId} at "${input.stageId}" exited ${providerResult.exitCode}`,
          }),
        );
      }
    } catch (err) {
      const stageEnd = new Date();
      await ctx.eventLog.append({
        type: "provider.failed",
        message: `Provider ${effectiveProviderId} failed for ${roleId}: ${describeError(err)}`,
        data: { roleId, provider: effectiveProviderId },
      });
      await ctx.eventLog.append({
        type: "role.failed",
        message: `Agent ${roleId} failed.`,
        data: { roleId },
      });
      // Surface the failed invocation as a notification tied to this phase, so a
      // rejected flag / missing CLI is visible, not just an event-log line.
      (this as unknown as { _notify?: (d: NotificationDraft) => void })._notify?.(
        draftProviderFailed({
          runId: ctx.runId,
          providerId: effectiveProviderId,
          error: `${roleId} at "${input.stageId}": ${describeError(err)}`,
        }),
      );
      // Record a partial metric so the dashboard reflects the failure.
      const providerCfg = this.config.providers[effectiveProviderId];
      const failedMetric: RoleMetrics = {
        roleId,
        stageId: input.stageId,
        providerId: effectiveProviderId,
        providerType: providerCfg?.type ?? "cli",
        command:
          providerCfg && "command" in providerCfg ? providerCfg.command : "",
        args:
          providerCfg && "args" in providerCfg ? [...providerCfg.args] : [],
        cwd,
        startedAt: stageStart.toISOString(),
        endedAt: stageEnd.toISOString(),
        durationMs: durationMs(stageStart, stageEnd),
        exitCode: -1,
        sessionId: null,
        flowSeat: input.flowTurn?.seat ?? null,
        flowContextMode: input.flowTurn?.contextMode ?? null,
        flowContextFallbackReason: input.flowTurn?.fallbackReason ?? null,
        model: null,
        totalCostUsd: null,
        costEstimated: false,
        perModelCost: [],
        tokenUsage: null,
        tokensEstimated: false,
        toolCallCount: null,
        internalsAvailable: false,
        tools: [],
        subAgents: [],
        filesChangedBefore: null,
        filesChangedAfter: null,
        diffInsertionsAfter: null,
        diffDeletionsAfter: null,
        validationSummary: null,
        reviewDecision: null,
        verificationDecision: null,
        skillsAttached: skills.map((s) => s.name),
        skillsRequested: agent.skills.slice(),
        notes: ["agent invocation failed before completion"],
      };
      await input.metricsStore.appendRoleMetrics(failedMetric);
      if (providerAbort.signal.aborted) {
        throw new __RunAbortedSignal();
      }
      throw err;
    } finally {
      clearInterval(observer);
      this.abortSignal?.removeEventListener("abort", abortFromSignal);
    }

    // ── Post-turn diff gate (S3) ──────────────────────────────────────────
    // The turn ran with write access; evaluate what it wrote. `accept` →
    // continue; `rollback` (deny/unsafe) → restore the worktree to the pre-turn
    // snapshot and block; `approve` (require_approval) → pause for a human via
    // the standard approval flow - on approval keep the changes, on rejection
    // roll back and block. Default-allow (no policies) → no behavior change.
    if (preTurnTree && ctx.worktreePath) {
      const verdict = await evaluateTurnDiff({
        broker: this.broker!,
        runId: ctx.runId,
        roleId,
        worktree: ctx.worktreePath,
        baseTree: preTurnTree,
      });
      if (verdict.verdict === "rollback") {
        const restored = await restoreWorktree(
          ctx.worktreePath,
          preTurnTree,
        ).catch(() => false);
        // Record the rollback outcome as broker evidence. A failed rollback
        // leaves the worktree dirty - the "rollback failed" summary is what the
        // Run Assurance artifact (S5) keys on to render the verdict `unsafe`.
        await this.broker!.record(
          {
            runId: ctx.runId,
            roleId,
            kind: "file.patch",
            subject: { op: "agent.turn.diff.rollback", roleId, files: verdict.files },
            proposedBy: "system",
          },
          { effect: "deny", ruleIds: [], reason: verdict.reason },
          {
            ok: false,
            summary: restored
              ? `rolled back ${roleId}'s denied changes`
              : `rollback failed for ${roleId} - worktree may be partially modified`,
          },
        );
        await ctx.eventLog.append({
          type: "action.denied",
          message: `Post-turn diff gate ${restored ? "rolled back" : "FAILED to roll back"} ${roleId}'s changes: ${verdict.reason}`,
          data: {
            kind: "agent.turn.diff",
            roleId,
            verdict: "rollback",
            reason: verdict.reason,
            files: verdict.files,
            rolledBack: restored,
          },
        });
        throw new __ActionDeniedSignal(
          `Post-turn diff gate rolled back ${roleId}'s changes: ${verdict.reason}`,
        );
      }
      if (verdict.verdict === "approve") {
        const cur = await ctx.stateStore.read();
        if (!cur) {
          throw new __ActionDeniedSignal(
            `Post-turn diff gate requires approval for ${roleId} but run state is unavailable.`,
          );
        }
        const res = await this.awaitApprovalRequest({
          state: cur,
          fromStatus: cur.status,
          stageId: input.stageId,
          roleId,
          reason: verdict.reason,
          prompt: null,
          sourceArtifactPath: null,
          requestedAction: "agent.turn.diff",
          riskLevel: "high",
          source: "policy",
          alsoRequiredByPolicy: true,
          progressMessage: `Pausing: ${roleId}'s changes need approval...`,
          requestedMessage: `Approval required for ${roleId}'s changes (${verdict.files.length} file(s)): ${verdict.reason}`,
          resumedMessage: `Approved ${roleId}'s changes; continuing.`,
          approvalService: new ApprovalService(this.projectRoot, ctx.runId),
          stateStore: ctx.stateStore,
          eventLog: ctx.eventLog,
        });
        if (res.rejected) {
          await restoreWorktree(ctx.worktreePath, preTurnTree).catch(
            () => undefined,
          );
          throw new __ApprovalRejectedSignal();
        }
      }
    }

    // Control + artifact read the adapter-normalized response text, not raw
    // stdout. For the text adapter these are identical; for a structured
    // adapter this is the losslessly-extracted assistant text (the markers the
    // approval/review parsers depend on live here).
    const stdout = providerResult.normalized.responseText || "";
    const stderr = providerResult.stderr || "";

    const outputBody = stderr
      ? `${stdout}\n\n---\n## stderr\n\n${stderr}`
      : stdout;

    // Record copy only - control parsing reads the in-memory responseText.
    const outputArtifactPathAbs = await ctx.artifactStore.write(
      input.outputName,
      redactSecretsInText(outputBody).redacted,
    );

    // ── Apply-only gateway (S4) ───────────────────────────────────────────
    // The role ran read-only; apply its proposed diff through the broker. A
    // refusal (unsafe patch / denied policy / failed apply) blocks the run.
    if (applyOnly && ctx.worktreePath) {
      const result = await applyProposedPatchThroughGateway({
        broker: this.broker!,
        runId: ctx.runId,
        roleId,
        worktree: ctx.worktreePath,
        output: stdout,
      });
      if (result.status === "refused") {
        await ctx.eventLog.append({
          type: "action.denied",
          message: `Apply-only gateway refused ${roleId}'s patch: ${result.reason}`,
          data: { kind: "apply-only", roleId, reason: result.reason },
        });
        throw new __ActionDeniedSignal(
          `Apply-only gateway refused ${roleId}'s patch: ${result.reason}`,
        );
      }
      await ctx.eventLog.append({
        type:
          result.status === "applied" ? "suggestion.applied" : "action.allowed",
        message:
          result.status === "applied"
            ? `Apply-only: applied ${roleId}'s patch (${result.files.length} file(s)).`
            : `Apply-only: ${roleId} proposed no patch this turn.`,
        data: {
          roleId,
          applyOnly: true,
          files: result.status === "applied" ? result.files : [],
        },
      });
    }

    await ctx.eventLog.append({
      type: "provider.completed",
      message: `Provider ${effectiveProviderId} completed for ${roleId}.`,
      data: {
        roleId,
        provider: effectiveProviderId,
        exitCode: providerResult.exitCode,
        durationMs: providerResult.durationMs,
      },
    });
    await ctx.eventLog.append({
      type: "role.completed",
      message: `Agent ${roleId} completed.`,
      data: { roleId, exitCode: providerResult.exitCode },
    });

    // Compute diff snapshot after this stage when worktree exists.
    let filesChangedAfter: number | null = null;
    let diffInsertionsAfter: number | null = null;
    let diffDeletionsAfter: number | null = null;
    if (ctx.worktreePath) {
      try {
        const snap = await getDiffSnapshot({ worktreePath: ctx.worktreePath });
        filesChangedAfter = snap.totals.files;
        diffInsertionsAfter = snap.totals.insertions;
        diffDeletionsAfter = snap.totals.deletions;
      } catch {
        // Diff unavailable; leave nulls.
      }
    }

    const metrics = providerResult.normalized.metrics;
    const providerCfg = this.config.providers[effectiveProviderId];

    // Token + cost ledger: prefer the provider's real numbers; otherwise
    // estimate tokens from the prompt/response text and price them from the
    // local list-price table. Estimates are flagged so the UI labels them.
    let tokenUsage = metrics?.tokenUsage ?? null;
    let tokensEstimated = false;
    const hasRealTokens =
      !!tokenUsage && ((tokenUsage.input ?? 0) + (tokenUsage.output ?? 0)) > 0;
    if (!hasRealTokens) {
      tokenUsage = {
        input: estimateTokensFromText(prompt),
        output: estimateTokensFromText(stdout),
      };
      tokensEstimated = true;
    }
    const { costUsd, estimated: costEstimated } = resolveCost({
      reportedCostUsd: metrics?.totalCostUsd ?? null,
      model: metrics?.model ?? null,
      tokenUsage,
    });
    // Turn internals (audit Phase C): what the provider did inside this turn,
    // from its raw stream-json stdout (opaque for plain-text providers).
    const internals = extractTurnInternals(providerResult.stdout ?? "");
    const metric: RoleMetrics = {
      roleId,
      stageId: input.stageId,
      providerId: effectiveProviderId,
      providerType: providerCfg?.type ?? "cli",
      command: providerResult.command,
      args: providerResult.args,
      cwd: providerResult.cwd,
      startedAt: providerResult.startedAt,
      endedAt: providerResult.endedAt,
      durationMs: providerResult.durationMs,
      exitCode: providerResult.exitCode,
      promptArtifactPath: ctx.artifactStore.relPath(promptArtifactPathAbs),
      outputArtifactPath: ctx.artifactStore.relPath(outputArtifactPathAbs),
      sessionId:
        metrics?.sessionId ?? providerResult.session?.sessionId ?? null,
      flowSeat: input.flowTurn?.seat ?? null,
      flowContextMode: input.flowTurn?.contextMode ?? null,
      flowContextFallbackReason: input.flowTurn?.fallbackReason ?? null,
      model: metrics?.model ?? null,
      totalCostUsd: costUsd,
      costEstimated,
      perModelCost: metrics?.perModelCost ?? [],
      tokenUsage,
      tokensEstimated,
      toolCallCount: metrics?.toolCallCount ?? null,
      internalsAvailable: internals.streamParsed,
      tools: internals.tools,
      subAgents: internals.subAgents,
      filesChangedBefore: null,
      filesChangedAfter,
      diffInsertionsAfter,
      diffDeletionsAfter,
      validationSummary: input.validationResults
        ? {
            total: input.validationResults.summary.total,
            passed: input.validationResults.summary.passed,
            failed: input.validationResults.summary.failed,
          }
        : null,
      reviewDecision: input.reviewDecisionForStage ?? null,
      verificationDecision: input.verificationDecisionForStage ?? null,
      skillsAttached: skills.map((s) => s.name),
      skillsRequested: agent.skills.slice(),
      notes:
        providerResult.claudeMetrics &&
        !providerResult.claudeMetrics.parseAvailable
          ? ["claude-code metrics not reported by provider"]
          : [],
    };
    await input.metricsStore.appendRoleMetrics(metric);

    return {
      roleId,
      output: stdout,
      outputArtifactPath: ctx.artifactStore.relPath(outputArtifactPathAbs),
      promptArtifactPath: ctx.artifactStore.relPath(promptArtifactPathAbs),
      providerResult,
    };
  }

  /** A3 express: evaluate the deterministic review descent against the run's
   *  actual diff. Null on any uncertainty (no worktree, diff error) - the
   *  caller then runs the review (fail toward more checking). */
  private async evaluateReviewDescentForWorktree(
    worktreePath: string | null | undefined,
  ): Promise<ReviewDescentDecision | null> {
    if (!worktreePath) return null;
    try {
      const snap = await getDiffSnapshot({ worktreePath });
      return evaluateReviewDescent(
        snap.files.map((f) => f.path),
        this.config.policies,
      );
    } catch {
      return null;
    }
  }

  private async runValidation(input: {
    artifactsName: string;
    prefix?: string;
    ctx: {
      worktreePath: string | null;
      artifactStore: ArtifactStore;
      eventLog: EventLog;
    };
  }): Promise<ValidationResults> {
    const { ctx } = input;
    if (!ctx.worktreePath) {
      throw new GitError("Cannot run validation: worktree not prepared.");
    }
    await ctx.eventLog.append({
      type: "validation.started",
      message: `Validation starting in ${ctx.worktreePath}.`,
    });

    // Proportional validation scoping (proportional-orchestration.md, slice 1):
    // when the run's entire diff is provably-inert (docs/text/assets) skip the
    // configured code checks - running `pnpm test` for a `.md` change is pure
    // waste. Keyed on the ACTUAL changed files (same uncommitted-vs-HEAD diff the
    // orchestrator uses elsewhere), never the task text, and fail-safe: any
    // non-inert/unknown file, an empty diff, or a diff error -> validate as
    // configured. Off when `commands.scopeValidationByChange` is false.
    const configured = this.config.commands.validate;
    if (configured.length > 0 && this.config.commands.scopeValidationByChange) {
      let decision: ReturnType<typeof classifyChangedFilesForValidation> | null = null;
      try {
        const snap = await getDiffSnapshot({ worktreePath: ctx.worktreePath });
        // A2 floor: a protected path (built-in globs + policies.protectedPaths)
        // is never inert - a workflow .yml or a user-protected .md still
        // validates in full. See orchestrator/protected-paths.ts.
        decision = classifyChangedFilesForValidation(
          snap.files.map((f) => f.path),
          {
            isProtected: (p) =>
              protectedPathMatch(p, this.config.policies) !== null,
          },
        );
      } catch {
        // Diff unavailable -> fail safe: fall through and validate as configured.
        decision = null;
      }
      if (decision?.allInert) {
        await ctx.eventLog.append({
          type: "validation.scoped",
          message: `Validation scoped: ${decision.changedFileCount} inert file(s) changed (docs/text/assets); skipped ${configured.length} configured command(s).`,
          data: {
            reason: "all-changed-files-inert",
            changedFiles: decision.changedFileCount,
            inert: decision.inert,
            skippedCommands: [...configured],
          },
        });
        const scoped: ValidationResults = {
          commands: [],
          summary: { total: 0, passed: 0, failed: 0, environment: 0 },
          note: `Scoped: ${decision.inert.length} inert file(s) changed (docs/text/assets); ${configured.length} configured validation command(s) skipped.`,
        };
        await ctx.artifactStore.writeJson(input.artifactsName, scoped);
        return scoped;
      }
    }

    const results = await runValidationCommands({
      commands: configured,
      cwd: ctx.worktreePath,
      store: ctx.artifactStore,
      prefix: input.prefix,
      broker: this.broker ?? undefined,
      runId: ctx.artifactStore.runIdValue,
    });
    for (const c of results.commands) {
      await ctx.eventLog.append({
        type: "validation.command.completed",
        message: `${c.command} → exit ${c.exitCode}`,
        data: {
          command: c.command,
          exitCode: c.exitCode,
          status: c.status,
          durationMs: c.durationMs,
        },
      });
    }
    // P5: the linked card's machine-checkable acceptance commands run as an
    // extra validation pass, feeding the SAME gate (a failure caps merge_ready).
    await this.mergeAcceptanceValidation(results, ctx, input.prefix);
    await ctx.artifactStore.writeJson(input.artifactsName, results);
    return results;
  }

  /**
   * P5 acceptance gate (machine half): run the linked roadmap card's
   * `acceptanceCommands` (USER-authored - same trust as `commands.validate`) and
   * merge them into `results`, so an unmet machine criterion fails validation and
   * caps the verdict. No-op when there's no linked card / no commands. The prose
   * `acceptanceCriteria` are the LLM-judge half (verifier confirms each).
   */
  private async mergeAcceptanceValidation(
    results: ValidationResults,
    ctx: { worktreePath: string | null; artifactStore: ArtifactStore; eventLog: EventLog },
    prefix: string | undefined,
  ): Promise<void> {
    if (!this.taskId || !ctx.worktreePath) return;
    let commands: string[] = [];
    try {
      const { RoadmapService } = await import("../roadmap/roadmap-service.js");
      const card = await new RoadmapService(this.projectRoot).getTask(this.taskId);
      commands = card?.acceptanceCommands ?? [];
    } catch {
      return;
    }
    if (commands.length === 0) return;
    const acc = await runValidationCommands({
      commands,
      cwd: ctx.worktreePath,
      store: ctx.artifactStore,
      prefix: prefix ? `${prefix}-acceptance` : "acceptance",
      broker: this.broker ?? undefined,
      runId: ctx.artifactStore.runIdValue,
    });
    for (const c of acc.commands) {
      await ctx.eventLog.append({
        type: "validation.command.completed",
        message: `[acceptance] ${c.command} → exit ${c.exitCode}`,
        data: {
          command: c.command,
          exitCode: c.exitCode,
          status: c.status,
          durationMs: c.durationMs,
          acceptance: true,
        },
      });
    }
    results.commands.push(...acc.commands);
    results.summary.total += acc.summary.total;
    results.summary.passed += acc.summary.passed;
    results.summary.failed += acc.summary.failed;
    results.summary.environment += acc.summary.environment;
  }

  private defaultPromptName(index: number, roleId: string): string {
    const padded = index.toString().padStart(2, "0");
    return `${padded}-${roleId}-prompt.md`;
  }

  /**
   * Enforce the daily spend cap before an agent turn. Warns once at the
   * threshold; at the cap, stops the run. NOTE: in the new Profile model the
   * `reduce-effort` / `downgrade-model` cap actions are not yet implemented -
   * mid-run Profile downgrade (switching every seated step to
   * `budget.fallbackProfile`) is a TODO. Until then every cap action stops the
   * run honestly rather than silently continuing at full cost. No cap
   * configured ⇒ no-op.
   */
  /**
   * Pause the run for a human at a limit (U5), reusing the standard approval
   * flow. Returns true if approved (continue), false if rejected (stop/give up).
   * For ATTENDED runs only - the caller must already have checked `!unattended`.
   */
  private async pauseForApproval(input: {
    ctx: { eventLog: EventLog; runId: string; stateStore: RunStateStore };
    stageId: string;
    reason: string;
    requestedAction: string;
    requestedMessage: string;
    resumedMessage: string;
  }): Promise<boolean> {
    const cur = await input.ctx.stateStore.read();
    if (!cur) return false; // no state to pause on -> treat as reject (stop).
    const res = await this.awaitApprovalRequest({
      state: cur,
      fromStatus: cur.status,
      stageId: input.stageId,
      roleId: "budget",
      reason: input.reason,
      prompt: null,
      sourceArtifactPath: null,
      requestedAction: input.requestedAction,
      riskLevel: "medium",
      source: "policy",
      progressMessage: `Pausing: ${input.reason}`,
      requestedMessage: input.requestedMessage,
      resumedMessage: input.resumedMessage,
      approvalService: new ApprovalService(this.projectRoot, input.ctx.runId),
      stateStore: input.ctx.stateStore,
      eventLog: input.ctx.eventLog,
    });
    return !res.rejected;
  }

  /**
   * Count/time budget ceilings (unattended-resilience U1). Checked before every
   * agent turn. Unlike the dollar cap, these bind WITHOUT measured cost - the
   * reliable backstop for unattended runs where CLI token cost is unmeasured.
   * `onLimit: stop` blocks the run honestly (a __BudgetLimitSignal → "blocked").
   * All ceilings null ⇒ no-op. Under a parallel fan-out the per-run turn count
   * can overshoot by up to (wave width - 1); it still binds (stops at/just past
   * the limit), which is the point.
   */
  private async enforceBudgetCeilings(ctx: {
    eventLog: EventLog;
    runId: string;
    stateStore: RunStateStore;
  }): Promise<void> {
    const budget = this.config.budget;
    if (!budget) return;
    // A human already approved continuing past a ceiling this run - don't re-check.
    if (this.budgetCeilingAcknowledged) {
      this.turnsStarted += 1;
      return;
    }
    const {
      maxTurnsPerRun,
      maxWallClockMinPerRun,
      maxTurnsPerDay,
      maxWallClockMinPerDay,
    } = budget;
    const anySet =
      maxTurnsPerRun != null ||
      maxWallClockMinPerRun != null ||
      maxTurnsPerDay != null ||
      maxWallClockMinPerDay != null;
    if (!anySet) return;

    if (this.runStartMs === null) this.runStartMs = Date.now();
    // Count this turn as started up front (synchronous; safe under fan-out).
    this.turnsStarted += 1;
    const now = Date.now();
    const runWallMs = now - this.runStartMs;

    let daily = { turns: 0, wallClockMs: 0 };
    if (maxTurnsPerDay != null || maxWallClockMinPerDay != null) {
      daily = await computeDailyUsage(this.projectRoot, ctx.runId, now).catch(
        () => ({ turns: 0, wallClockMs: 0 }),
      );
    }
    const dailyTurns = daily.turns + this.turnsStarted;
    const dailyWallMs = daily.wallClockMs + runWallMs;
    const mins = (ms: number) => Math.round(ms / 60000);

    const hit =
      maxTurnsPerRun != null && this.turnsStarted > maxTurnsPerRun
        ? { kind: "per-run turns", value: this.turnsStarted, limit: maxTurnsPerRun, unit: "turns" }
        : maxWallClockMinPerRun != null && runWallMs > maxWallClockMinPerRun * 60000
          ? { kind: "per-run wall-clock", value: mins(runWallMs), limit: maxWallClockMinPerRun, unit: "min" }
          : maxTurnsPerDay != null && dailyTurns > maxTurnsPerDay
            ? { kind: "daily turns", value: dailyTurns, limit: maxTurnsPerDay, unit: "turns" }
            : maxWallClockMinPerDay != null && dailyWallMs > maxWallClockMinPerDay * 60000
              ? { kind: "daily wall-clock", value: mins(dailyWallMs), limit: maxWallClockMinPerDay, unit: "min" }
              : null;
    if (!hit) return;

    const detail = `${hit.kind} ${hit.value}/${hit.limit} ${hit.unit}`;

    // onLimit: pause (attended) - ask a human to continue or stop. --unattended
    // forces stop (an unattended run can't be resumed, so it must not hang).
    if (budget.onLimit === "pause" && !this.unattended) {
      const approved = await this.pauseForApproval({
        ctx,
        stageId: "budget-limit",
        reason: `Budget ceiling reached: ${detail}`,
        requestedAction: "budget.limit",
        requestedMessage: `Budget ceiling reached (${detail}). Approve to continue this run past its budget, or reject to stop.`,
        resumedMessage: `Approved continuing past the budget ceiling (${detail}).`,
      });
      if (approved) {
        this.budgetCeilingAcknowledged = true;
        await ctx.eventLog.append({
          type: "budget.limit",
          message: `Budget ceiling ${detail} reached; a human approved continuing.`,
          data: { kind: hit.kind, value: hit.value, limit: hit.limit, unit: hit.unit, onLimit: "pause", resolved: "approved" },
        });
        return;
      }
      // rejected -> fall through to stop.
    }

    const msg = `Budget ceiling reached: ${detail}. Run stopped (budget.onLimit=stop).`;
    await ctx.eventLog.append({
      type: "budget.limit",
      message: msg,
      data: { kind: hit.kind, value: hit.value, limit: hit.limit, unit: hit.unit, onLimit: "stop" },
    });
    const notify = (this as unknown as { _notify?: (d: NotificationDraft) => void })._notify;
    notify?.(draftBudgetLimit({ runId: ctx.runId, taskId: this.taskId, detail }));
    throw new __BudgetLimitSignal(msg);
  }

  /**
   * Provider resilience (unattended-resilience U2). Wraps a single provider
   * invocation: a recoverable failure - rate limit (429/quota) or transient blip
   * (5xx, "server temporarily unavailable", overloaded, timeout) - is retried
   * with backoff (rate-limit honors a parsed Retry-After) before the turn's
   * outcome is final, so an overnight run rides it out. Hard failures and
   * exhausted retries surface the original outcome to runRole's existing handling
   * (a non-zero result flows to assessTurnResult; a thrown error rethrows). The
   * backoff sleep is interruptible - an abort during a wait stops immediately.
   * Failed rate-limit/transient attempts typically incur no token cost, so the
   * single role-metric for the final attempt is honest enough.
   */
  private async runProviderResilient(input: {
    args: Parameters<typeof runProvider>[1];
    ctx: { eventLog: EventLog; runId: string; stateStore: RunStateStore };
    stageId: string;
    abortSignal: AbortSignal;
  }): Promise<RichProviderRunResult> {
    const r = this.config.resilience;
    const providers = this.config.providers;
    if (!r || !r.enabled) return runProvider(providers, input.args);

    let usageWaits = 0; // U6: reset-waits used for a usage-limit, separate budget.
    // ISSUE-002 (B): a retried `open` session must not re-send an id a prior
    // attempt already opened (claude: "Session ID <U> is already in use."). Track
    // whether an open was ever issued across the WHOLE loop - NOT keyed off
    // `attempt`, which resets to 0 on the onExhausted=pause human-approval round
    // (below), yet the id was opened on the first attempt. Re-mint a fresh open
    // id thereafter; an "opened" turn re-sends full context, so a fresh id is
    // identical in effect. (The resilience FALLBACK path drops the session
    // entirely; the graph/fan-out retry path carries no session - this loop is
    // the only place a fixed open id is replayed.)
    let openIssued = false;
    for (let attempt = 1; ; attempt += 1) {
      const session = sessionRequestForRetry(input.args.session, openIssued, randomUUID);
      const args =
        session === input.args.session ? input.args : { ...input.args, session };
      if (args.session?.action === "open") openIssued = true;
      let result: RichProviderRunResult | null = null;
      let lastError: unknown = null;
      let failureText: string;
      try {
        result = await runProvider(providers, args);
        if (result.exitCode === 0) return result; // success
        failureText = `${result.stderr ?? ""}\n${result.stdout ?? ""}`;
      } catch (err) {
        if (err instanceof __RunAbortedSignal || input.abortSignal.aborted) {
          throw err;
        }
        lastError = err;
        failureText = err instanceof Error ? err.message : String(err);
      }
      const cls = classifyProviderFailure(failureText, r);
      // Give up WITH the diagnosis: the classified class + a short redacted
      // excerpt ride on the result (or the thrown error), so the step record
      // and Run Assurance can say "rate-limit: This model is being rate
      // limited..." instead of laundering it into "provider exited 1".
      const excerpt = failureExcerpt(failureText);
      const giveUp = (): RichProviderRunResult => {
        if (result) return { ...result, failure: { class: cls, excerpt } };
        const err = lastError ?? new Error(failureText);
        if (err instanceof Error) {
          (err as Error & { failureClass?: ProviderFailureClass }).failureClass = cls;
        }
        throw err;
      };
      if (cls === "hard") return giveUp();

      // Usage limit / quota (U6): a windowed quota that resets (often hours out),
      // handled separately from the seconds-scale rate-limit/transient backoff.
      if (cls === "usage-limit") {
        const ul = r.usageLimit;
        if (ul.action === "wait" && usageWaits < ul.maxWaits) {
          usageWaits += 1;
          const hint = parseRetryAfterMs(failureText);
          const waitMs = Math.min(ul.maxWaitMin * 60_000, hint ?? 5 * 60_000);
          await input.ctx.eventLog.append({
            type: "provider.usage_limit",
            message: `Usage limit at ${input.stageId}; waiting ${Math.round(waitMs / 60000)}m for reset (wait ${usageWaits}/${ul.maxWaits}).`,
            data: { stepId: input.stageId, action: "wait", waitMs, wait: usageWaits, maxWaits: ul.maxWaits },
          });
          await this.interruptibleSleep(waitMs, input.abortSignal);
          continue; // retry the same provider after the reset window
        }
        // Give-up point (action=stop, action=fallback, or waits exhausted):
        // try to reseat the turn before failing. The EXPLICIT fallbackProfile
        // only applies when the user opted into fallback semantics; the
        // auto-derived one (resilience.autoFallback, trust-scoped) applies at
        // every give-up - "stop" means "don't wait hours", not "don't use a
        // provider the run already trusts".
        const explicitFb =
          ul.action === "fallback" || (ul.action === "wait" && usageWaits >= ul.maxWaits)
            ? (ul.fallbackProfile ?? r.rateLimit.fallbackProfile)
            : null;
        if (explicitFb || r.autoFallback !== "off") {
          const fb = await this.tryProviderFallback({
            baseArgs: input.args,
            fallbackProfile: explicitFb,
            cls,
            ctx: input.ctx,
            stageId: input.stageId,
            abortSignal: input.abortSignal,
          });
          if (fb) return fb;
        }
        await input.ctx.eventLog.append({
          type: "provider.usage_limit",
          message: `Usage limit at ${input.stageId}; giving up (action=${ul.action}): ${excerpt}`,
          data: { stepId: input.stageId, action: ul.action, resolved: "give-up", detail: excerpt },
        });
        return giveUp();
      }

      const spec = cls === "rate-limit" ? r.rateLimit : r.transient;
      if (attempt > spec.maxRetries) {
        // Retries exhausted: try an alternate Profile once (explicitly
        // configured, else auto-derived per resilience.autoFallback - a model
        // that may not be limited/down), then give up with the original outcome.
        if (spec.fallbackProfile || r.autoFallback !== "off") {
          const fb = await this.tryProviderFallback({
            baseArgs: input.args,
            fallbackProfile: spec.fallbackProfile,
            cls,
            ctx: input.ctx,
            stageId: input.stageId,
            abortSignal: input.abortSignal,
          });
          if (fb) return fb;
        }
        // onExhausted: pause (attended) - wait for a human to approve a fresh
        // round of retries, or reject (give up). --unattended forces fail.
        if (r.onExhausted === "pause" && !this.unattended) {
          const approved = await this.pauseForApproval({
            ctx: input.ctx,
            stageId: input.stageId,
            reason: `Provider ${cls} unrecovered at ${input.stageId} after ${spec.maxRetries} retries`,
            requestedAction: "provider.exhausted",
            requestedMessage: `Provider ${cls} hasn't recovered at ${input.stageId} after ${spec.maxRetries} retries. Approve to retry again, or reject to fail.`,
            resumedMessage: `Retrying ${input.stageId} after approval.`,
          });
          if (approved) {
            attempt = 0; // fresh retry budget after the human waited/fixed it
            continue;
          }
        }
        // The terminal moment used to be silent - the single worst gap when a
        // run died overnight. Now it's on the record (and in the supervisor's
        // engagement feed) before the failure surfaces to the step.
        await input.ctx.eventLog.append({
          type: "provider.retries_exhausted",
          message: `Provider ${cls} at ${input.stageId} unrecovered after ${spec.maxRetries} retries; giving up: ${excerpt}`,
          data: { stepId: input.stageId, class: cls, retries: spec.maxRetries, detail: excerpt },
        });
        return giveUp();
      }

      const delayMs = computeBackoffMs(cls, attempt, spec, failureText);
      await input.ctx.eventLog.append({
        type: "flow.step.retried",
        message: `Provider ${cls} at ${input.stageId} (attempt ${attempt}/${spec.maxRetries + 1}); retrying in ${Math.round(delayMs / 1000)}s.`,
        data: {
          stepId: input.stageId,
          attempt,
          maxAttempts: spec.maxRetries + 1,
          class: cls,
          delayMs,
        },
      });
      await this.interruptibleSleep(delayMs, input.abortSignal);
    }
  }

  /**
   * Resilience fallback (U3 + U8): after retries for a recoverable class are
   * exhausted, run the turn once on an alternate Profile (a different model that
   * may not be limited/down). The profile is the explicitly configured
   * fallbackProfile when set; otherwise one is auto-derived per
   * resilience.autoFallback - trust-scoped to profiles already seated in this
   * run's flow by default ("crew"), so no provider outside the run's trust set
   * ever sees its context. Returns the result only on a clean success;
   * otherwise null (the caller gives up with the original outcome). The fallback
   * is a DIFFERENT provider, so any session is dropped and it is not itself
   * retried. Every outcome - swap, no-candidate, failed attempt - is recorded
   * as a `provider.fallback` event so the seat change is never silent. The
   * turn's resolved allowWrite/permissions ride along unchanged from baseArgs
   * (write capability is per-turn, never per-profile).
   */
  private async tryProviderFallback(input: {
    baseArgs: Parameters<typeof runProvider>[1];
    fallbackProfile: string | null;
    cls: string;
    ctx: { eventLog: EventLog; runId: string; stateStore: RunStateStore };
    stageId: string;
    abortSignal: AbortSignal;
  }): Promise<RichProviderRunResult | null> {
    let fbId = input.fallbackProfile;
    let auto = false;
    const scope = this.config.resilience?.autoFallback ?? "crew";
    if (!fbId && scope !== "off") {
      // The run's trust set: profiles actually seated in this run's flow steps.
      let seated: string[] = [];
      try {
        const state = await input.ctx.stateStore.read();
        seated = (state?.flow?.steps ?? [])
          .map((s) => s.profileId)
          .filter((p): p is string => !!p);
      } catch {
        // best-effort; an unreadable state just narrows the candidate set
      }
      fbId = deriveAutoFallbackProfile({
        failingProviderId: input.baseArgs.providerId,
        seatedProfileIds: seated,
        profiles: this.config.profiles,
        configuredProviderIds: new Set(Object.keys(this.config.providers)),
        scope,
      });
      auto = fbId !== null;
    }
    if (!fbId) {
      await input.ctx.eventLog.append({
        type: "provider.fallback",
        message: `No fallback for ${input.stageId} (${input.cls}): none configured and no alternate-provider profile in scope "${scope}".`,
        data: { stepId: input.stageId, class: input.cls, fallbackProfile: null, ok: false },
      });
      return null;
    }
    const profile = this.config.profiles[fbId];
    if (!profile || !this.config.providers[profile.provider]) {
      await input.ctx.eventLog.append({
        type: "provider.fallback",
        message: `No usable fallback profile "${fbId}" for ${input.stageId} (${input.cls}); giving up.`,
        data: { stepId: input.stageId, class: input.cls, fallbackProfile: fbId, ok: false },
      });
      return null;
    }
    const fbArgs: Parameters<typeof runProvider>[1] = {
      ...input.baseArgs,
      providerId: profile.provider,
      model: profile.model ?? undefined,
      effort: profile.power ?? undefined,
      maxTokens: profile.maxTokens ?? undefined,
      timeoutMs: profile.timeoutMs ?? undefined,
      session: undefined,
    };
    await input.ctx.eventLog.append({
      type: "provider.fallback",
      message: `${auto ? `Auto-falling back (scope ${scope})` : "Falling back"} to profile "${fbId}" (provider ${profile.provider}) at ${input.stageId} after ${input.cls}.`,
      data: { stepId: input.stageId, class: input.cls, fallbackProfile: fbId, provider: profile.provider, ok: true, auto },
    });
    try {
      const result = await runProvider(this.config.providers, fbArgs);
      if (result.exitCode === 0) return result;
      await input.ctx.eventLog.append({
        type: "provider.fallback",
        message: `Fallback profile "${fbId}" also failed at ${input.stageId} (exited ${result.exitCode}); giving up with the original outcome.`,
        data: { stepId: input.stageId, class: input.cls, fallbackProfile: fbId, ok: false, failed: true },
      });
      return null;
    } catch (err) {
      if (err instanceof __RunAbortedSignal || input.abortSignal.aborted) throw err;
      await input.ctx.eventLog.append({
        type: "provider.fallback",
        message: `Fallback profile "${fbId}" errored at ${input.stageId} (${describeError(err)}); giving up with the original outcome.`,
        data: { stepId: input.stageId, class: input.cls, fallbackProfile: fbId, ok: false, failed: true },
      });
      return null;
    }
  }

  /** A timeout that rejects (with __RunAbortedSignal) the instant the signal
   *  aborts, so a backoff wait never delays a user abort. */
  private interruptibleSleep(ms: number, signal: AbortSignal): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        reject(new __RunAbortedSignal());
        return;
      }
      const onAbort = () => {
        clearTimeout(timer);
        reject(new __RunAbortedSignal());
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  private async enforceSpendCap(ctx: { eventLog: EventLog; runId: string }): Promise<void> {
    const budget = this.config.budget;
    const cap = budget?.spendCapDailyUsd;
    if (!budget || cap === null || cap === undefined || cap <= 0) return;

    const dailySpendUsd = await computeDailySpendUsd(this.projectRoot).catch(
      () => 0,
    );
    const evaluation = evaluateSpendCap(budget, dailySpendUsd);

    if (evaluation.state === "warn" && !this.spendWarned) {
      this.spendWarned = true;
      await ctx.eventLog.append({
        type: "spend.warning",
        message: `Daily spend ~$${dailySpendUsd.toFixed(2)} crossed ${Math.round(
          (budget.warnThresholdPct ?? 0.8) * 100,
        )}% of the $${cap}/day cap.`,
        data: { dailySpendUsd, cap },
      });
    }
    if (evaluation.state !== "exceeded") return;

    const at = `Daily spend ~$${dailySpendUsd.toFixed(2)} reached the $${cap}/day cap`;

    // Already applied a continue-action this run? Keep going - the hard
    // count/time ceilings (U1) are the ultimate stop, so we don't re-decide or
    // re-notify every turn once downgraded.
    if (this.budgetOverride) return;

    // downgrade-model: run the rest of the run on the cheaper fallback Profile.
    if (budget.capAction === "downgrade-model") {
      const fb = budget.fallbackProfile;
      const fbProfile = fb ? this.config.profiles[fb] : undefined;
      if (fb && fbProfile && this.config.providers[fbProfile.provider]) {
        this.budgetOverride = { kind: "downgrade", profileId: fb };
        await ctx.eventLog.append({
          type: "spend.action",
          message: `${at}. Downgrading the rest of the run to profile "${fb}" (provider ${fbProfile.provider}).`,
          data: { action: "downgrade-model", fallbackProfile: fb, dailySpendUsd, cap },
        });
        return;
      }
      await ctx.eventLog.append({
        type: "policy.warning",
        message: `${at}; capAction="downgrade-model" but budget.fallbackProfile is unset/invalid - stopping instead.`,
        data: { kind: "spend-cap-downgrade-no-fallback", fallbackProfile: fb ?? null },
      });
      // fall through to stop.
    }

    // reduce-effort: continue at the provider's minimum effort for the rest of
    // the run (best-effort - a no-op for providers with no effort control, but
    // the run still continues rather than stopping).
    if (budget.capAction === "reduce-effort") {
      this.budgetOverride = { kind: "reduce-effort" };
      await ctx.eventLog.append({
        type: "spend.action",
        message: `${at}. Reducing effort to the minimum for the rest of the run.`,
        data: { action: "reduce-effort", dailySpendUsd, cap },
      });
      return;
    }

    // stop (the default, or downgrade-model with no usable fallback).
    await ctx.eventLog.append({
      type: "spend.capped",
      message: `${at}. Stopping per budget policy (capAction=${budget.capAction}).`,
      data: { action: "stop", dailySpendUsd, cap },
    });
    // A6: notify on cap-hit so it reaches the user's local gateways (in-app/CLI).
    const notify = (this as unknown as { _notify?: (d: NotificationDraft) => void })._notify;
    notify?.(
      draftSpendCapHit({
        runId: ctx.runId,
        taskId: this.taskId,
        dailySpendUsd,
        capUsd: cap,
      }),
    );
    throw new __SpendCapStopSignal(
      `${at}. Run stopped by the daily spend cap (capAction=${budget.capAction}).`,
    );
  }

  /** The provider's lowest effort/power level (for reduce-effort), or undefined
   *  when the provider exposes no effort control. */
  private lowestEffort(providerId: string): string | undefined {
    const provCfg = this.config.providers[providerId];
    if (!provCfg || !this.resolvedCatalog) return undefined;
    const levels = capabilitiesForProvider(
      providerId,
      provCfg,
      this.resolvedCatalog,
    ).powerLevels;
    return levels.length > 0 ? levels[0] : undefined;
  }

  private async writeFinalReport(input: {
    artifactStore: ArtifactStore;
    state: RunState;
    validation: ValidationResults | null;
    policyWarnings: PolicyWarning[];
    reviewLoops: number;
    metrics: import("./runtime-metrics.js").RuntimeMetrics | null;
    approvals: import("./approval-types.js").ApprovalRequest[];
    artifacts: {
      plan?: string;
      architecture?: string;
      execution?: string;
      review?: string;
      verification?: string;
    };
  }): Promise<string> {
    let suggestions: import("../reviews/review-suggestion-types.js").ReviewSuggestion[] = [];
    try {
      suggestions = await new ReviewSuggestionService(
        this.projectRoot,
        input.state.runId,
      ).list();
    } catch {
      suggestions = [];
    }
    let bundles: import("../reviews/suggestion-bundle-types.js").SuggestionBundle[] = [];
    try {
      const { SuggestionBundleService } = await import(
        "../reviews/suggestion-bundle-service.js"
      );
      bundles = await new SuggestionBundleService(
        this.projectRoot,
        input.state.runId,
      ).list();
    } catch {
      bundles = [];
    }
    let arbitration: FlowArbitrationLedger | null = null;
    try {
      arbitration = await new FlowArbitrationStore(
        this.projectRoot,
        input.state.runId,
      ).read();
    } catch {
      arbitration = null;
    }
    const report = renderFinalReport({
      state: input.state,
      artifactPaths: input.artifacts,
      validation: input.validation,
      policyWarnings: input.policyWarnings,
      reviewLoops: input.reviewLoops,
      metrics: input.metrics,
      approvals: input.approvals,
      suggestions,
      bundles,
      arbitration,
    });
    return input.artifactStore.write("12-final-report.md", report);
  }
}

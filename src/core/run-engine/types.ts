import type { ProjectConfig, PermissionMode } from "../../project/config-schema.js";
import type { RunState, RunStateStore } from "../state-machine.js";
import type { PolicyWarning } from "../policy-engine.js";
import type { ArtifactStore } from "../artifact-store.js";
import type { EventLog } from "../event-log.js";
import type { RichProviderRunResult } from "../../providers/provider-runner.js";
import type { ProviderSessionRequest } from "../../providers/provider-types.js";
import type { ResolvedFlowSnapshot } from "../../flows/schemas/flow-schema.js";
import type { ContextSource } from "../context-source-schema.js";
import type { WorkflowSelection } from "../../supervisor/select-workflow.js";
import type { IsolationMode } from "../execution/execution-backend-schema.js";
import type { PreparedFlowParticipantTurn } from "../../flows/runtime/flow-participant-ledger.js";

/** Stages a run can be rewound to. The flow runner seeds the outputs of every
 *  step before the first step at this stage from the source run, then starts
 *  there. `planning` is the flow's first stage, so resuming there is just a
 *  normal from-scratch run; the executing stages regenerate the downstream code
 *  from a fresh worktree. The DOWNSTREAM stages (reviewing/fixing/verifying)
 *  operate on existing code, so they additionally restore the source run's
 *  per-phase worktree snapshot. */
export type ResumeStage =
  | "planning"
  | "architecting"
  | "executing"
  | "reviewing"
  | "fixing"
  | "verifying";

/** The subset that needs the source run's code restored before running. */
export const DOWNSTREAM_RESUME_STAGES = new Set<ResumeStage>([
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
  /** Raw flow parameter values, name -> string, from the caller (CLI
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
  /** Pick-up execution: when the linked task has a checklist and the
   *  flow declares a checklistSegment, iterate the segment once per item.
   *  "continuous" runs items back-to-back; "step" pauses between items. null /
   *  omitted = no checklist iteration (the instant-task N=1 case). */
  checklistMode?: "continuous" | "step" | null;
  /** Saga mode (Conductor): when the linked task is `kind:"saga"`, run
   *  the checklist band as a supervised saga - a step that exhausts self-heal
   *  halts the run cleanly instead of committing a green-but-broken item, and
   *  each step starts a fresh model context. Set by the saga launch path. */
  sagaMode?: boolean;
  /** Per-saga budget envelope (Conductor): bounds the saga's TOTAL
   *  cost/length, enforced BETWEEN steps (see src/core/saga/budget.ts). Null
   *  fields mean no limit on that axis. The launch path sets it from
   *  `task.sagaBudget`; defaults to no limits. */
  sagaBudget?: { maxSpendUsd: number | null; maxSteps: number | null };
  /** Saga supervisor (Conductor): the between-steps PROCEED/ESCALATE turn +
   *  invariants ledger. The launch path sets it from `config.saga.supervisor`;
   *  defaults to enabled on the `reviewer` role with the role's own profile. */
  sagaSupervisor?: { enabled: boolean; profile: string | null; roleId: string };
  /** Context sources: files/URLs materialized once at run start and
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
  /** Adaptive spec-up: the flow the chain should BUILD after spec-up. Set on a
   *  spec-up-phase run (intake/spec-up) so the chosen flow is carried across the
   *  detached chain; persisted as the `spec-up-target-flow.json` sidecar at run
   *  start and read by the `approve & build` handoff. null = no build target. */
  specUpTargetFlowId?: string | null;
  /** Deep-questioning loop: the round this intake run represents + the chain-root
   *  run id (where accumulated answers live). Persisted as `spec-up-round.json` /
   *  `spec-up-root-run.json` sidecars at run start, read by the spec-up-chain. */
  specUpRound?: number | null;
  specUpRootRunId?: string | null;
  /** Permission mode: read-only / ask / accept-edits / auto. The
   *  model-agnostic policy Vibestrate applies to this run's writes. Omitted ⇒
   *  config.policies.defaultPermissionMode (default "auto"). */
  permissionMode?: PermissionMode;
  /** Per-run isolation override (posture-applies): when set, it raises
   *  this run's OS-sandbox posture above `config.execution.isolation` for this run
   *  only (never lowers; never mutates config). Today only "sandboxed". Omitted ⇒
   *  use the config value. */
  isolationOverride?: IsolationMode | null;
  /** Human-facing notes about an auto-applied posture: what was applied
   *  or why it was suppressed. Surfaced once at run start; empty ⇒ nothing applied. */
  postureNotes?: string[];
  /** CLI/process lifecycle signal. Aborting it kills the active provider
   * invocation and records the run as aborted instead of leaving orphan CLIs. */
  abortSignal?: AbortSignal;
};

/** The per-run context threaded through the flow runners and role turns: the
 *  run's identity, worktree, stores, and progress reporter. Built once in
 *  Orchestrator.run() and passed unchanged to every stage. */
export type RunContext = {
  runId: string;
  worktreePath: string | null;
  branchName: string | null;
  artifactStore: ArtifactStore;
  eventLog: EventLog;
  stateStore: RunStateStore;
  onProgress: (message: string) => void;
};

export type OrchestratorOutput = {
  runId: string;
  state: RunState;
  worktreePath: string | null;
  branchName: string | null;
  finalReportPath: string;
  policyWarnings: PolicyWarning[];
};

export type RoleRunResult = {
  roleId: string;
  output: string;
  outputArtifactPath: string;
  promptArtifactPath: string;
  providerResult: RichProviderRunResult;
};

export type FlowRoleTurn = {
  seat: string;
  contextMode: PreparedFlowParticipantTurn["contextMode"];
  fallbackReason: string | null;
  sessionRequest?: ProviderSessionRequest;
};

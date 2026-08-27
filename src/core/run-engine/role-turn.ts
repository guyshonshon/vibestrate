// One provider turn: build the prompt, take the broker's decision, invoke the
// provider, gate what it wrote, and persist the artifacts and metrics.
//
// This is the only place a model is actually run on behalf of a flow step, and
// nearly a thousand lines of it are the care around that one call - the
// permission profile, the context packet, the abort observer, the diff gate,
// the redaction on every write.
//
// RoleTurnDeps is assembled fresh at each call site (Orchestrator.roleTurnDeps)
// rather than captured once, because several of these fields do not exist until
// run() has wired them: the broker, the notifier, the execution strategy, the
// active crew, and the prompt blocks built at run start. A snapshot taken in the
// constructor would hand this function nulls.
//
// `turnState` is the exception that must NOT be copied. It carries the abort
// latch and the catalog cache, and other call paths write them too - see
// run-turn-state.ts. It is passed by reference so all writers share one object.

import {
  getCrew,
  getCrewRole,
} from "../../agents/crew-registry.js";
import { loadSkills } from "../../agents/skill-loader.js";
import {
  NotificationDraft,
  draftProviderFailed,
} from "../../notifications/notification-router.js";
import { loadRolePrompt } from "../../project/config-loader.js";
import { ProjectConfig } from "../../project/config-schema.js";
import { selectOutputAdapter } from "../../providers/adapters/select.js";
import { writeMcpConfigFile } from "../../providers/mcp/mcp-config-writer.js";
import { resolveMcpServers } from "../../providers/mcp/mcp-resolve.js";
import { SandboxMode } from "../../providers/provider-apply.js";
import { resolveCatalog } from "../../providers/provider-catalog-overlay.js";
import { capabilitiesForProvider } from "../../providers/provider-catalog.js";
import { RichProviderRunResult } from "../../providers/provider-runner.js";
import {
  assertExecutableContext,
  resolveCwd,
} from "../../safety/access-policy.js";
import {
  type ActionBroker,
  type ActionRequest,
} from "../../safety/action-broker.js";
import { applyProposedPatchThroughGateway } from "../../safety/apply-gateway.js";
import {
  evaluateTurnDiff,
  restoreWorktree,
  snapshotWorktree,
} from "../../safety/diff-gate.js";
import { resolveProfile } from "../../safety/permission-profiles.js";
import {
  VibestrateError,
  describeError,
} from "../../utils/errors.js";
import { durationMs } from "../../utils/time.js";
import {
  listAnnotations,
  renderAnnotationsForPrompt,
} from "../codebase/annotations-service.js";
import {
  buildRolePrompt,
  type PriorArtifact,
} from "../context/prompt-builder.js";
import {
  getDiffSnapshot,
  redactSecretsInText,
} from "../diff-service.js";
import {
  ExecStrategy,
  IsolationMode,
} from "../execution/execution-backend-schema.js";
import { MetricsStore } from "../metrics/metrics-store.js";
import {
  estimateTokensFromText,
  resolveCost,
} from "../metrics/pricing.js";
import { type RoleMetrics } from "../metrics/runtime-metrics.js";
import {
  awaitApprovalRequest,
  type ApprovalGateDeps,
} from "./approval-gate.js";
import { BudgetGovernor } from "./budget-governor.js";
import { registerFlowRoleOutputs } from "./flow-outputs.js";
import {
  lowestEffort,
  runProviderResilient,
  type ResilientProviderDeps,
} from "./resilient-provider.js";
import { type RunTurnState } from "./run-turn-state.js";
import {
  __ActionDeniedSignal,
  __ApprovalRejectedSignal,
  __RunAbortedSignal,
} from "./signals.js";
import {
  type FlowRoleTurn,
  type RoleRunResult,
  type RunContext,
} from "./types.js";
import { ApprovalService } from "../run/approval-service.js";
import { extractTurnInternals } from "../run/turn-internals.js";
import { RunStateStore } from "../state-machine.js";
import {
  appendStreamLine,
  ensureStreamsDir,
} from "../stores/provider-stream-store.js";
import {
  listControls,
  markPendingConsumed,
  pendingControls,
  renderControlNotes,
} from "../stores/run-control.js";
import { ValidationResults } from "../validation/validation-runner.js";
import { resolveContinuityBlocks } from "./continuity-blocks.js";
import path from "node:path";

/** The orchestrator state a role turn borrows. Assembled fresh at each call
 *  site so live fields are current; see the header for why that matters. */
export type RoleTurnDeps = {
  projectRoot: string;
  config: ProjectConfig;
  rules: string;
  task: string;
  concise: boolean;
  readOnly: boolean;
  runtimeSkills: string[];
  isolationOverride: IsolationMode | null;
  abortSignal: AbortSignal | null;
  materializedContext: PriorArtifact[];
  /** Container/cloud execution strategy; null means host execution. */
  execStrategy: ExecStrategy | null;
  /** Crew the active flow snapshot resolved against; set in run(). */
  activeCrewId: string | null;
  /** Prompt blocks built once at run start. Empty string when not applicable. */
  codebaseMapBlock: string;
  ledgerPromptBlock: string;
  ledgerFlagsBlock: string;
  methodologyBlock: string;
  /** True when a run-level context source already carries the codebase map, so
   *  the per-role injection is suppressed rather than sent twice. */
  hasStagedCodebaseMapContext: boolean;
  /** Every real effect is decided and recorded through the broker. */
  broker: ActionBroker;
  budgetGovernor: BudgetGovernor;
  /** Fire-and-forget notification dispatcher. */
  notify: (draft: NotificationDraft) => void;
  onProgress: (message: string) => void;
  /** Shared BY REFERENCE - never copy this. */
  turnState: RunTurnState;
  approvalGateDeps: () => ApprovalGateDeps;
  resilienceDeps: () => ResilientProviderDeps;
  throwIfAbortRequested: (ctx: { stateStore: RunStateStore }) => Promise<void>;
  defaultPromptName: (index: number, roleId: string) => string;
};

export async function runRoleTurn(
  deps: RoleTurnDeps,
  input: {
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
     * Clean-room seat: drop the run-level grounding injected on top of this turn
     * (attached context sources, run brief, human annotations, ledger/continuity)
     * and keep only the flow's declared prior artifacts + task/rules/role. Opt-in
     * per flow step; default behaviour (undefined/false) is unchanged.
     */
    cleanRoom?: boolean;
    /**
     * Per-step skills ("flow owns skills"): skill ids declared on the flow
     * step, merged (deduped) with the agent's own skills + run-level
     * runtimeSkills for THIS turn only. Omitted/undefined = the step declares no
     * skills (unchanged behaviour).
     */
    skills?: string[];
    flowTurn?: FlowRoleTurn;
    metricsStore: MetricsStore;
    reviewDecisionForStage?: string | null;
    verificationDecisionForStage?: string | null;
    ctx: RunContext;
  },
): Promise<RoleRunResult> {
    const { roleId, ctx } = input;
    // Budget gates: before spending on this turn, check the count/time ceilings
    // (which bind without measured cost) and the daily USD cap. Both run before
    // provider resolution.
    await deps.budgetGovernor.enforceBudgetCeilings(ctx);
    await deps.budgetGovernor.enforceSpendCap(ctx);
    // Resolve the Role from the Crew the run's flow snapshot was built against.
    const { crew } = getCrew(deps.config, deps.activeCrewId);
    const agent = getCrewRole(crew, roleId);
    // A `codebaseMapRoles` or `methodologyRoles` entry naming a role this crew
    // does not have never matches, and the block simply never arrives. Left
    // silent, a typo reads exactly like the feature being switched off. Not
    // fatal - the crew is only known per-run, so this cannot be a load-time
    // error, and a prompt enrichment is not worth failing a run over. The knob
    // is named in the message because the two lists usually differ.
    if (!deps.turnState.warnedUnknownPromptRoles) {
      const problems: string[] = [];
      for (const [knob, roles] of [
        ["codebaseMapRoles", deps.config.codebaseMapRoles],
        ["methodologyRoles", deps.config.methodologyRoles],
      ] as const) {
        const unknown = [...new Set(roles)].filter((r) => !crew.roles[r]);
        if (unknown.length === 0) continue;
        problems.push(`${knob} names ${unknown.map((r) => `"${r}"`).join(", ")}`);
      }
      if (problems.length > 0) {
        deps.turnState.warnedUnknownPromptRoles = true;
        deps.onProgress(
          `${problems.join("; ")} - this crew defines no such role, so the block never reaches it.`,
        );
      }
    }
    // Read-only runs override every role's permission profile to the built-in
    // `read_only` (allowWrite/allowShell false), regardless of how the role is
    // configured. Using the builtin name guarantees resolution via
    // resolveProfile's builtin fallback even on a project that hasn't defined a
    // read-only profile of its own.
    // Strict apply-only: a write-capable role runs READ-ONLY (no direct
    // disk writes); it proposes a diff that Vibestrate applies through the
    // gateway after the turn. Detect write-capability from the role's own
    // profile, then force read_only execution.
    const applyOnly =
      deps.config.policies.strictApplyOnly &&
      !deps.readOnly &&
      resolveProfile(deps.config.permissions.profiles, agent.permissions)
        .allowWrite;
    const effectivePermissions =
      deps.readOnly || applyOnly ? "read_only" : agent.permissions;
    const profile = resolveProfile(
      deps.config.permissions.profiles,
      effectivePermissions,
    );
    // Effective provider id: the resolved snapshot already mapped this step's
    // Seat → Role → Profile → Provider, so input.providerId is authoritative.
    // Fall back to the role's Profile's provider if (defensively) absent.
    // Budget downgrade: when the daily $ cap forced a downgrade, this turn
    // runs on the cheaper fallback Profile instead of its resolved one.
    const downgradeProfileId =
      deps.budgetGovernor.budgetOverride?.kind === "downgrade"
        ? deps.budgetGovernor.budgetOverride.profileId
        : null;
    const effectiveProviderId = downgradeProfileId
      ? deps.config.profiles[downgradeProfileId]?.provider
      : input.providerId ?? deps.config.profiles[agent.profile]?.provider;
    if (!effectiveProviderId) {
      throw new VibestrateError(
        "provider-unresolved",
        `Role "${roleId}" has no resolvable provider (profile "${agent.profile}").`,
      );
    }

    assertExecutableContext({
      roleId,
      profile,
      projectRoot: deps.projectRoot,
      worktreePath: ctx.worktreePath,
    });

    const cwd = resolveCwd({
      roleId,
      profile,
      projectRoot: deps.projectRoot,
      worktreePath: ctx.worktreePath,
    });

    const promptTemplate = await loadRolePrompt(deps.projectRoot, agent.prompt);
    // Merge the agent's configured skills with the per-run runtimeSkills and the
    // per-STEP skills ("flow owns skills") into one deduped, order-preserving
    // list, scoped to THIS turn (the set is rebuilt per runRole call, so step
    // skills never leak into the next step). All-empty is a no-op, so existing
    // runs keep their exact behavior.
    const stepSkills = input.skills ?? [];
    const effectiveSkillIds =
      deps.runtimeSkills.length === 0 && stepSkills.length === 0
        ? agent.skills
        : Array.from(
            new Set([...agent.skills, ...deps.runtimeSkills, ...stepSkills]),
          );
    const skills = await loadSkills(deps.projectRoot, effectiveSkillIds);

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
        broker: deps.broker ?? undefined,
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
    const allControls = await listControls(deps.projectRoot, ctx.runId);
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
      await listAnnotations(deps.projectRoot, { status: "open" }),
    );
    // Clean-room seat: drop the producer's run-derived NARRATIVE - the run brief
    // (the "story so far") and the ledger/continuity - so a judge reasons
    // without being anchored to how the producer framed things. It deliberately
    // KEEPS ground truth: attached context sources (the spec), user annotations,
    // and the step's declared inputs. A controlled eval showed that dropping the
    // attached spec from a reviewer measurably weakened spec-compliance review,
    // while dropping only the brief cost nothing - so ground truth stays,
    // chatter goes.
    //
    // Resolved BEFORE the blocks, not after: a clean-room turn must not spend a
    // one-shot guard on a block it is about to discard, or the role loses that
    // block for the whole run.
    const cleanRoom = input.cleanRoom === true;
    // Ledger, continuity flags, methodology and the codebase map: which of the
    // four this turn gets, and which guards it consumes. The rules, and why the
    // map is gated apart from the other three, live with the function.
    const { projectLedger, continuityFlags, methodologyGuidance, projectMemory } =
      resolveContinuityBlocks({
        roleId,
        cleanRoom,
        turnState: deps.turnState,
        codebaseMapRoles: deps.config.codebaseMapRoles,
        methodologyRoles: deps.config.methodologyRoles,
        codebaseMapBlock: deps.codebaseMapBlock,
        hasStagedCodebaseMapContext: deps.hasStagedCodebaseMapContext,
        ledgerPromptBlock: deps.ledgerPromptBlock,
        ledgerFlagsBlock: deps.ledgerFlagsBlock,
        methodologyBlock: deps.methodologyBlock,
      });
    const prompt = buildRolePrompt({
      roleId,
      task: deps.task,
      rules: deps.rules,
      rolePromptTemplate: promptTemplate,
      skills,
      // Run-level context sources (ground truth) are visible to every role,
      // ahead of the flow's per-step handoff artifacts - clean-room included.
      priorArtifacts: [...deps.materializedContext, ...input.priorArtifacts],
      permission: profile,
      permissionName: agent.permissions,
      worktreePath: ctx.worktreePath,
      branchName: ctx.branchName,
      projectName: deps.config.project.name,
      validationResults: input.validationResults,
      concise: deps.concise,
      ...(additionalNotes ? { additionalNotes } : {}),
      ...(humanAnnotations ? { humanAnnotations } : {}),
      ...(!cleanRoom && input.runBrief ? { runBrief: input.runBrief } : {}),
      ...(!cleanRoom && projectLedger ? { projectLedger } : {}),
      ...(!cleanRoom && projectMemory ? { projectMemory } : {}),
      ...(!cleanRoom && continuityFlags ? { continuityFlags } : {}),
      ...(!cleanRoom && methodologyGuidance ? { methodologyGuidance } : {}),
    });
    if (pending.length > 0) {
      const consumed = await markPendingConsumed(
        deps.projectRoot,
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

    const promptName = input.promptName ?? deps.defaultPromptName(input.promptIndex, roleId);
    // The artifact is the RECORD copy (and feeds later steps' context + the
    // control center) - scrub high-precision token shapes before persisting.
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
        skillsFromRuntime: deps.runtimeSkills.slice(),
        flowSeat: input.flowTurn?.seat ?? null,
        flowContextMode: input.flowTurn?.contextMode ?? null,
      },
    });
    await ctx.eventLog.append({
      type: "provider.started",
      message: `Provider ${effectiveProviderId} invoked for ${roleId}.`,
      data: { roleId, provider: effectiveProviderId, cwd },
    });

    // ── Action Broker boundary ──────────────────────────────────────
    // Every provider spawn is decided and recorded as evidence before the
    // child process is started. Fail-closed: a non-allow decision blocks the
    // run (default policy is allow, so behavior is unchanged until evaluators
    // are wired). The post-execution evidence is appended after runProvider.
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
    const actionDecision = await deps.broker!.decide(actionRequest);
    if (actionDecision.effect !== "allow") {
      await deps.broker!.record(actionRequest, actionDecision, null);
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

    // ── Post-turn diff gate: pre-turn snapshot ──────────────────────
    // For write-capable turns, snapshot the worktree so the diff this turn
    // produces can be evaluated (and rolled back) after the provider returns.
    // Best-effort: a snapshot failure disables the gate for this turn, never
    // blocks the run.
    let preTurnTree: string | null = null;
    if (profile.allowWrite && ctx.worktreePath) {
      preTurnTree = await snapshotWorktree(ctx.worktreePath).catch(() => null);
      if (preTurnTree === null) {
        // Fail-CLOSED: a write-capable turn with no pre-turn baseline
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
    await ensureStreamsDir(deps.projectRoot, ctx.runId).catch(() => undefined);
    const streamName = promptName;

    // Structured providers (e.g. claude stream-json) emit JSON events, not
    // readable text. The adapter's live filter turns those into the assistant's
    // text for the live panel (display only). Plain providers have no filter →
    // chunks stream verbatim. `liveEmitted` lets us skip the end-of-turn flush
    // when the stream already showed the text incrementally.
    const outputAdapter = selectOutputAdapter(
      deps.config.providers[effectiveProviderId]!,
    );
    // Prefer the typed transcript filter (text/thinking/tool/subagent)
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
    if (deps.abortSignal?.aborted) {
      providerAbort.abort();
    }
    const abortFromSignal = (): void => {
      if (!providerAbort.signal.aborted) providerAbort.abort();
    };
    deps.abortSignal?.addEventListener("abort", abortFromSignal, {
      once: true,
    });
    const observer = setInterval(() => {
      void (async () => {
        try {
          const cur = await ctx.stateStore.read();
          // `status === "aborted"` keeps a run aborted by an older CLI, or one
          // started before abortRequested existed, stoppable.
          if (cur && (cur.abortRequested === true || cur.status === "aborted")) {
            // Latch it on the orchestrator, not just on this turn's controller.
            // The interval is cleared in the finally below, before the post-turn
            // diff gate, artifact writes and approval gate run - and that gap is
            // exactly where an abort used to be observed by nobody and then
            // overwritten by the turn's own state write.
            deps.turnState.abortRequestedSeen = true;
            if (!providerAbort.signal.aborted) providerAbort.abort();
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
        deps.config.profiles[downgradeProfileId ?? input.profileId ?? agent.profile];
      // Resolve the capability catalog (built-in + project overlay) once; the
      // provider applies model/effort from it so a user's custom catalog entry
      // actually reaches the spawn.
      if (!deps.turnState.resolvedCatalog) {
        deps.turnState.resolvedCatalog = await resolveCatalog(deps.projectRoot);
      }
      // Fail-loud (not silent): if the profile sets an effort the provider won't
      // honor (no effort knob, or not one of its real levels), the provider would
      // just ignore it - an advisory dial. Surface it once per provider+effort.
      const profileEffort = runtimeProfile?.power;
      if (profileEffort) {
        const provCfg = deps.config.providers[effectiveProviderId];
        const levels = provCfg
          ? capabilitiesForProvider(effectiveProviderId, provCfg, deps.turnState.resolvedCatalog).powerLevels
          : [];
        if (!levels.includes(profileEffort)) {
          const key = `${effectiveProviderId}:${profileEffort}`;
          if (!deps.turnState.warnedEffort.has(key)) {
            deps.turnState.warnedEffort.add(key);
            const why =
              levels.length === 0
                ? `${effectiveProviderId} exposes no effort control`
                : `valid: ${levels.join("/")}`;
            const msg = `Effort "${profileEffort}" won't take effect on ${effectiveProviderId} (${why}) - the provider ignores it.`;
            deps.onProgress(msg);
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
      // ── Provider-native OS sandbox ────────────────────────
      // Only when execution.isolation = "sandboxed". A write-capable seat asks
      // for "workspace-write" (writes confined to the worktree); a read-only
      // seat for "read-only". This is only the REQUEST passed to the provider;
      // whether a real OS sandbox actually applied is read off the result AFTER
      // the turn (a turn can fall back to a provider that can't sandbox), so the
      // honest record is emitted post-run, never from this requested value.
      const effectiveIsolation =
        deps.isolationOverride ?? deps.config.execution?.isolation;
      const requestedSandbox: SandboxMode | null =
        effectiveIsolation === "sandboxed"
          ? profile.allowWrite
            ? "workspace-write"
            : "read-only"
          : null;
      providerResult = await runProviderResilient(deps.resilienceDeps(), {
        args: {
          providerId: effectiveProviderId,
          prompt,
          cwd,
          // Not `cwd`: that is the run's worktree, which lives outside the
          // project, so the policies would not be found from it.
          projectRoot: deps.projectRoot,
          sandbox: requestedSandbox ?? undefined,
          // The resolved, POST-OVERRIDE write capability for this turn. read-only
          // runs, strict-apply-only, and read-only seats already collapsed
          // `effectivePermissions` to read_only above, so `profile.allowWrite` is
          // false there and the provider grants no write. A write-capable seat on
          // a claude provider gets `--permission-mode acceptEdits` (see
          // claude-code-settings.ts) so it can actually write in the worktree.
          allowWrite: profile.allowWrite,
          // Shell-without-write (review_exec): the provider grants command
          // execution and cuts the edit tools at the invocation. Read-only
          // clamps (deps.readOnly / strictApplyOnly) already collapsed the
          // profile above, so a clamped turn never reaches here shell-capable.
          allowShell: profile.allowShell,
          // Opt-in read-only hardening (policies.hardenReadOnlySeats): the
          // provider applies it only on a non-write-capable turn (claude-code ->
          // `--permission-mode plan`). A no-op when off or on a write turn.
          hardenReadOnly: deps.config.policies?.hardenReadOnlySeats === true,
          model: runtimeProfile?.model ?? undefined,
          // reduce-effort: drop to the provider's minimum effort if it has one.
          effort:
            deps.budgetGovernor.budgetOverride?.kind === "reduce-effort"
              ? lowestEffort(deps.config.providers, deps.turnState.resolvedCatalog, effectiveProviderId) ??
                runtimeProfile?.power ??
                undefined
              : runtimeProfile?.power ?? undefined,
          maxTokens: runtimeProfile?.maxTokens ?? undefined,
          // Tool denylist (profile `disallowedTools`) - e.g. ["Task"] on a strict
          // flow's write seat so nested sub-agents can't schedule outside the DAG.
          disallowedTools: runtimeProfile?.disallowedTools ?? undefined,
          // Real wall-clock cap (no longer advisory): the provider tree-kills the
          // whole turn if it overruns - matters most for fanned-out review turns.
          timeoutMs: runtimeProfile?.timeoutMs ?? undefined,
          catalog: deps.turnState.resolvedCatalog,
          mcpConfigPath: mcpConfigAbsPath ?? undefined,
          // Container/cloud execution: run this turn off-host.
          execStrategy: deps.execStrategy ?? undefined,
          onChunk: (c) => {
            if (transcriptFilter && c.stream === "stdout") {
              for (const t of transcriptFilter(c.chunk)) {
                // Only visible text counts as "the stream showed the answer" -
                // tool/thinking activity alone still gets the final flush.
                if (t.kind === "text") liveEmitted = true;
                void appendStreamLine(deps.projectRoot, ctx.runId, streamName, {
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
                void appendStreamLine(deps.projectRoot, ctx.runId, streamName, {
                  ...c,
                  chunk: text,
                });
              }
              return;
            }
            if (c.stream === "stdout" && rawStdout.length < RAW_DEDUP_CAP) {
              rawStdout += c.chunk;
            }
            void appendStreamLine(deps.projectRoot, ctx.runId, streamName, c);
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
        } else if (!deps.turnState.warnedSandbox.has(ranProvider)) {
          // Sandbox was asked for but this provider has no OS sandbox - warn once
          // (per provider that actually ran) and be explicit it ran unconfined.
          deps.turnState.warnedSandbox.add(ranProvider);
          const msg = `Isolation is "sandboxed" but provider ${ranProvider} has no OS-level sandbox - this turn ran unsandboxed (worktree + diff gate still apply). codex provides provider-native OS confinement.`;
          deps.onProgress(msg);
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
        await appendStreamLine(deps.projectRoot, ctx.runId, streamName, {
          stream: "stdout",
          chunk: providerResult.normalized.responseText,
          at: new Date().toISOString(),
        }).catch(() => undefined);
      }
      if (
        providerResult.stderr &&
        providerResult.stderr.length > 0
      ) {
        await appendStreamLine(deps.projectRoot, ctx.runId, streamName, {
          stream: "stderr",
          chunk: providerResult.stderr,
          at: new Date().toISOString(),
        }).catch(() => undefined);
      }
      // Post-execution evidence for the allowed action (audit trail).
      await deps.broker!.record(actionRequest, actionDecision, {
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
        deps.notify?.(
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
      deps.notify?.(
        draftProviderFailed({
          runId: ctx.runId,
          providerId: effectiveProviderId,
          error: `${roleId} at "${input.stageId}": ${describeError(err)}`,
        }),
      );
      // Record a partial metric so the dashboard reflects the failure.
      const providerCfg = deps.config.providers[effectiveProviderId];
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
      deps.abortSignal?.removeEventListener("abort", abortFromSignal);
    }

    // The window the latch exists for. Everything below - the diff gate, the
    // artifact writes, registerFlowRoleOutputs' git diff, the approval gate -
    // runs with no observer, and ends in a whole-object state write that would
    // put `executing` back over an abort that landed in the meantime. Throwing
    // here takes the run down the same path a mid-turn abort does, which the
    // catch in run() already finalizes properly (terminal transition, final
    // report, assurance, ledger).
    await deps.throwIfAbortRequested(ctx);

    // ── Post-turn diff gate ──────────────────────────────────────────
    // The turn ran with write access; evaluate what it wrote. `accept` →
    // continue; `rollback` (deny/unsafe) → restore the worktree to the pre-turn
    // snapshot and block; `approve` (require_approval) → pause for a human via
    // the standard approval flow - on approval keep the changes, on rejection
    // roll back and block. Default-allow (no policies) → no behavior change.
    if (preTurnTree && ctx.worktreePath) {
      const verdict = await evaluateTurnDiff({
        broker: deps.broker!,
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
        // Run Assurance artifact keys on to render the verdict `unsafe`.
        await deps.broker!.record(
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
        const res = await awaitApprovalRequest(deps.approvalGateDeps(), {
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
          files: verdict.files,
          progressMessage: `Pausing: ${roleId}'s changes need approval...`,
          requestedMessage: `Approval required for ${roleId}'s changes (${verdict.files.length} file(s)): ${verdict.reason}`,
          resumedMessage: `Approved ${roleId}'s changes; continuing.`,
          approvalService: new ApprovalService(deps.projectRoot, ctx.runId),
          stateStore: ctx.stateStore,
          eventLog: ctx.eventLog,
        });
        // The post-turn diff gate restores + aborts on reject; a human "request
        // changes" here has no re-run seam, so it fails CLOSED the same way.
        if (res.rejected || res.changesGuidance != null) {
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

    // ── Apply-only gateway ───────────────────────────────────────────
    // The role ran read-only; apply its proposed diff through the broker. A
    // refusal (unsafe patch / denied policy / failed apply) blocks the run.
    if (applyOnly && ctx.worktreePath) {
      const result = await applyProposedPatchThroughGateway({
        broker: deps.broker!,
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
    const providerCfg = deps.config.providers[effectiveProviderId];

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
    // Turn internals: what the provider did inside this turn,
    // from its raw stream-json stdout (opaque for plain-text providers).
    const internals = extractTurnInternals(providerResult.stdout ?? "");
    const metric: RoleMetrics = {
      roleId,
      stageId: input.stageId,
      providerId: effectiveProviderId,
      providerType: providerCfg?.type ?? "cli",
      command: providerResult.command,
      // For an `input: "arg"` provider the prompt IS an argv element, and six
      // shipped presets are that shape. The prompt artifact three thousand lines
      // up is deliberately scrubbed before it is persisted; this copy of the
      // same string was not, so runtime-metrics.json and agent-metrics/*.json
      // held it in the clear. Same treatment for the same value.
      args: providerResult.args.map((a) => redactSecretsInText(a).redacted),
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

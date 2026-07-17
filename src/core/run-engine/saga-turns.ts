import { RoadmapService } from "../../roadmap/roadmap-service.js";
import { getCrew, getCrewRole } from "../../agents/crew-registry.js";
import { getCurrentBranch } from "../../git/git.js";
import { getWorktreeDiffText, redactSecretsInText } from "../diff-service.js";
import { readFreshFileReads } from "../saga/packet.js";
import {
  buildSupervisorPrompt,
  parseSupervisorDecision,
  parseNewInvariants,
} from "../saga/saga-supervisor.js";
import {
  buildEnhancePrompt,
  parseStepDiff,
  classifyAuthority,
  applyStepDiff,
  type EnhanceStep,
} from "../saga/enhance.js";
import { runProvider } from "../../providers/provider-runner.js";
import { estimateTokensFromText, resolveCost } from "../metrics/pricing.js";
import { roleMetricsSchema } from "../metrics/runtime-metrics.js";
import type { MetricsStore } from "../metrics/metrics-store.js";
import type { EventLog } from "../stores/event-log.js";
import type { ProjectConfig } from "../../project/config-schema.js";
import type { ResolvedCatalog } from "../../providers/provider-apply.js";

/** The orchestrator state a saga supervisor/enhance turn reads. Assembled
 *  fresh at each call site so live fields (the task text, the active crew) are
 *  current; the catalog cache and the budget governor stay orchestrator-owned
 *  and are reached through the two callbacks. */
export interface SagaTurnDeps {
  projectRoot: string;
  config: ProjectConfig;
  /** The run's task text (the saga's goal). */
  goal: string;
  /** The bound task card id; call sites gate on its presence. */
  taskId: string;
  /** Crew the active flow snapshot was resolved against. */
  activeCrewId: string | null;
  sagaSupervisor: { profile: string | null; roleId: string };
  /** Bound to the run's budget governor: a blown daily cap throws
   *  __SpendCapStopSignal here exactly like a real role turn. */
  enforceSpendCap: (ctx: { eventLog: EventLog; runId: string }) => Promise<void>;
  /** Resolves (and caches on the orchestrator) the capability catalog so the
   *  project's custom model/effort overlay reaches these turns like a real
   *  turn. Resolution failure yields null (the turn runs without the overlay). */
  ensureResolvedCatalog: () => Promise<ResolvedCatalog | null>;
}

type SagaTurnInput = {
  worktreePath: string | null;
  eventLog: EventLog;
  runId: string;
  metricsStore: MetricsStore;
};

/**
 * The between-steps SUPERVISOR turn. Runs a cheap, READ-ONLY
 * model turn (no write grant - all context is in the prompt) that judges
 * whether the saga should PROCEED to the next step or ESCALATE (halt), and
 * records any new cross-cutting INVARIANT into the durable ledger. Pure logic
 * lives in src/core/saga/saga-supervisor.ts; this function only wires the provider call
 * + persistence. It NEVER assigns the run-scoped `reviewDecision` (the caller
 * owns the ESCALATE halt). Every failure mode - unresolved provider/role,
 * provider error, unparseable output - folds to PROCEED + a logged event: the
 * supervisor is advisory ON TOP of the per-item review, which already
 * fail-closes correctness, so a supervisor hiccup must not halt a good saga.
 */
export async function runSagaSupervisorTurn(
  deps: SagaTurnDeps,
  args: {
    completedItem: { id: string; text: string };
    itemIndex: number;
    checklistItems: { id: string; text: string }[];
    input: SagaTurnInput;
  },
): Promise<"PROCEED" | "ENHANCE" | "ESCALATE"> {
  const { completedItem, itemIndex, checklistItems, input } = args;
  const taskId = deps.taskId;
  const roadmap = new RoadmapService(deps.projectRoot);

  // Gate on the daily spend cap BEFORE spending on this turn, exactly like a
  // real role turn (runRole). A blown cap throws __SpendCapStopSignal; the
  // call-site re-throws THAT (so the run halts stopped-by-cap, not a silent
  // supervisor skip) while folding ordinary supervisor failures to PROCEED.
  // warn/downgrade/reduce-effort side-effects mirror runRole.
  await deps.enforceSpendCap({ eventLog: input.eventLog, runId: input.runId });

  // Resolve the supervisor's provider + cheap-profile knobs: the configured
  // `profile` wins, else the supervisor role's own profile.
  let profileName = deps.sagaSupervisor.profile;
  if (!profileName) {
    try {
      const { crew } = getCrew(deps.config, deps.activeCrewId);
      profileName = getCrewRole(crew, deps.sagaSupervisor.roleId).profile;
    } catch {
      profileName = null;
    }
  }
  const profileCfg = profileName ? deps.config.profiles[profileName] : undefined;
  const providerId =
    profileCfg?.provider ?? Object.values(deps.config.profiles)[0]?.provider;
  if (!providerId || !deps.config.providers[providerId]) {
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
    const baseBranch = await getCurrentBranch(deps.projectRoot).catch(() => null);
    diffSoFar = await getWorktreeDiffText({
      worktreePath: input.worktreePath,
      baseBranch,
    }).catch(() => "");
  }

  const prompt = buildSupervisorPrompt({
    goal: deps.goal,
    lastStep: { text: completedItem.text, outcomeSummary },
    diffSoFar,
    remainingSteps: checklistItems.slice(itemIndex + 1).map((c) => c.text),
    invariants,
  });

  // Apply the project's catalog overlay (custom model/effort) like a real turn.
  const catalog = await deps.ensureResolvedCatalog();
  let text = "";
  try {
    const result = await runProvider(deps.config.providers, {
      providerId,
      prompt,
      cwd: input.worktreePath ?? deps.projectRoot,
      model: profileCfg?.model ?? null,
      effort: profileCfg?.power ?? null,
      maxTokens: profileCfg?.maxTokens ?? null,
      catalog: catalog ?? undefined,
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
          providerType: deps.config.providers[providerId]?.type ?? "cli",
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
  // The 3-way decision drives control flow (ENHANCE no longer folds).
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

// The conductor's ENHANCE pass. A plan-only model turn: it re-grounds
// the PENDING steps against the code as-built and emits a step-diff. On `auto`
// (refine/reorder/remove of existing ids) it mutates `checklistItems` in place
// (tail only, `> itemIndex`, so the band's absolute-index addressing survives)
// and persists the revised pending plan to the saga-scoped overlay atomically.
// On `escalate` (a structural change it may not make autonomously) it returns
// "escalate" and the band halts cleanly. Spend-accounted as a `saga-enhance`
// role; any failure/empty diff is a "noop" (advisory, never corrupts the plan).
export async function runSagaEnhanceTurn(
  deps: SagaTurnDeps,
  args: {
    completedItem: { id: string; text: string };
    itemIndex: number;
    checklistItems: EnhanceStep[];
    input: SagaTurnInput;
  },
): Promise<"applied" | "escalate" | "noop"> {
  const { completedItem, itemIndex, checklistItems, input } = args;
  const taskId = deps.taskId;
  const roadmap = new RoadmapService(deps.projectRoot);

  await deps.enforceSpendCap({ eventLog: input.eventLog, runId: input.runId });

  // Reuse the supervisor's cheap provider/profile resolution.
  let profileName = deps.sagaSupervisor.profile;
  if (!profileName) {
    try {
      const { crew } = getCrew(deps.config, deps.activeCrewId);
      profileName = getCrewRole(crew, deps.sagaSupervisor.roleId).profile;
    } catch {
      profileName = null;
    }
  }
  const profileCfg = profileName ? deps.config.profiles[profileName] : undefined;
  const providerId =
    profileCfg?.provider ?? Object.values(deps.config.profiles)[0]?.provider;
  if (!providerId || !deps.config.providers[providerId]) {
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
    const baseBranch = await getCurrentBranch(deps.projectRoot).catch(() => null);
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
    goal: deps.goal,
    doneOutcomes,
    pending,
    diff: diffSoFar,
    freshRead,
    invariants,
    mode: "conductor",
  });

  const catalog = await deps.ensureResolvedCatalog();
  let text = "";
  try {
    const result = await runProvider(deps.config.providers, {
      providerId,
      prompt,
      cwd: input.worktreePath ?? deps.projectRoot,
      model: profileCfg?.model ?? null,
      effort: profileCfg?.power ?? null,
      maxTokens: profileCfg?.maxTokens ?? null,
      catalog: catalog ?? undefined,
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
          providerType: deps.config.providers[providerId]?.type ?? "cli",
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

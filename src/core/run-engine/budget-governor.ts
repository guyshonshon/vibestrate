import type { EventLog } from "../stores/event-log.js";
import type { RunStateStore } from "../state-machine.js";
import type { ProjectConfig } from "../../project/config-schema.js";
import {
  computeDailySpendUsd,
  computeDailyUsage,
  evaluateSpendCap,
} from "../metrics/spend-cap-service.js";
import {
  draftBudgetLimit,
  draftSpendCapHit,
  type NotificationDraft,
} from "../../notifications/notification-router.js";
import { pauseForApproval, type ApprovalGateDeps } from "./approval-gate.js";
import { __BudgetLimitSignal, __SpendCapStopSignal } from "./signals.js";

/** Spend-cap continue-action: set once when the daily $ cap is hit, then
 *  applied to every subsequent turn (downgrade -> switch to the cheaper
 *  fallback Profile; reduce-effort -> minimum effort). */
export type BudgetOverride =
  | { kind: "downgrade"; profileId: string }
  | { kind: "reduce-effort" };

/** The orchestrator state the budget governor reads. `config` is the live
 *  config object (never replaced mid-run); `approvalGateDeps`/`notify` are
 *  closures because the notification dispatcher only exists once run() wires
 *  it. The governor never mutates orchestrator state. */
export interface BudgetGovernorDeps {
  projectRoot: string;
  config: Pick<ProjectConfig, "budget" | "profiles" | "providers">;
  taskId: string | null;
  unattended: boolean;
  approvalGateDeps: () => ApprovalGateDeps;
  /** Fire-and-forget notification dispatch; a no-op before run() wires it. */
  notify: (draft: NotificationDraft) => void;
}

/**
 * Per-run budget enforcement: the count/time ceilings and the daily USD spend
 * cap, plus the mutable counters they own. One instance per Orchestrator (built
 * in its constructor), so the counters live exactly as long as the run and
 * never reset mid-run.
 */
export class BudgetGovernor {
  /** One-time guard so the spend warning fires once per run, not every turn. */
  private spendWarned = false;
  // Count/time budget ceilings: agent turns started in this run, and the
  // run's wall-clock anchor (set lazily on the first turn).
  private turnsStarted = 0;
  private runStartMs: number | null = null;
  // Spend-cap action override: set once when the daily $ cap is hit with a
  // continue-action, then applied to every subsequent turn. The hard
  // count/time ceilings remain the ultimate stop.
  private override: BudgetOverride | null = null;
  // onLimit: pause - once a human approves continuing past a ceiling, don't
  // re-pause every turn for the rest of the run.
  private ceilingAcknowledged = false;

  constructor(private readonly deps: BudgetGovernorDeps) {}

  /** The active spend-cap continue-action, read by the role runner to
   *  downgrade the profile or reduce effort on subsequent turns. */
  get budgetOverride(): BudgetOverride | null {
    return this.override;
  }

  /**
   * Count/time budget ceilings (unattended-resilience). Checked before every
   * agent turn. Unlike the dollar cap, these bind WITHOUT measured cost - the
   * reliable backstop for unattended runs where CLI token cost is unmeasured.
   * `onLimit: stop` blocks the run honestly (a __BudgetLimitSignal → "blocked").
   * All ceilings null ⇒ no-op. Under a parallel fan-out the per-run turn count
   * can overshoot by up to (wave width - 1); it still binds (stops at/just past
   * the limit), which is the point.
   */
  async enforceBudgetCeilings(ctx: {
    eventLog: EventLog;
    runId: string;
    stateStore: RunStateStore;
  }): Promise<void> {
    const budget = this.deps.config.budget;
    if (!budget) return;
    // A human already approved continuing past a ceiling this run - don't re-check.
    if (this.ceilingAcknowledged) {
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
      daily = await computeDailyUsage(this.deps.projectRoot, ctx.runId, now).catch(
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
    if (budget.onLimit === "pause" && !this.deps.unattended) {
      const approved = await pauseForApproval(this.deps.approvalGateDeps(), {
        ctx,
        stageId: "budget-limit",
        reason: `Budget ceiling reached: ${detail}`,
        requestedAction: "budget.limit",
        requestedMessage: `Budget ceiling reached (${detail}). Approve to continue this run past its budget, or reject to stop.`,
        resumedMessage: `Approved continuing past the budget ceiling (${detail}).`,
      });
      if (approved) {
        this.ceilingAcknowledged = true;
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
    this.deps.notify(
      draftBudgetLimit({ runId: ctx.runId, taskId: this.deps.taskId, detail }),
    );
    throw new __BudgetLimitSignal(msg);
  }

  async enforceSpendCap(ctx: { eventLog: EventLog; runId: string }): Promise<void> {
    const budget = this.deps.config.budget;
    const cap = budget?.spendCapDailyUsd;
    if (!budget || cap === null || cap === undefined || cap <= 0) return;

    const dailySpendUsd = await computeDailySpendUsd(this.deps.projectRoot).catch(
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
    // count/time ceilings are the ultimate stop, so we don't re-decide or
    // re-notify every turn once downgraded.
    if (this.override) return;

    // downgrade-model: run the rest of the run on the cheaper fallback Profile.
    if (budget.capAction === "downgrade-model") {
      const fb = budget.fallbackProfile;
      const fbProfile = fb ? this.deps.config.profiles[fb] : undefined;
      if (fb && fbProfile && this.deps.config.providers[fbProfile.provider]) {
        this.override = { kind: "downgrade", profileId: fb };
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
      this.override = { kind: "reduce-effort" };
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
    // Notify on cap-hit so it reaches the user's local gateways (in-app/CLI).
    this.deps.notify(
      draftSpendCapHit({
        runId: ctx.runId,
        taskId: this.deps.taskId,
        dailySpendUsd,
        capUsd: cap,
      }),
    );
    throw new __SpendCapStopSignal(
      `${at}. Run stopped by the daily spend cap (capAction=${budget.capAction}).`,
    );
  }
}

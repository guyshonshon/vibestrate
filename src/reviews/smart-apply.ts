// The smart-apply state machine, extracted from SuggestionBundleService as
// free functions. The service passes its live collaborators and narrow
// callbacks via SmartApplyContext; all bundle/suggestion state mutation still
// goes through the service's own store methods so semantics are unchanged.

import path from "node:path";
import { execa } from "execa";
import { nowIso } from "../utils/time.js";
import { ensureDir, pathExists, readText, writeText } from "../utils/fs.js";
import { loadConfig } from "../project/config-loader.js";
import { runSuggestionValidation } from "./suggestion-validation-service.js";
import {
  gateAction,
  type ActionBroker,
  type ActionRequest,
} from "../safety/action-broker.js";
import {
  resolveValidationProfile,
  ValidationProfileError,
  type ValidationProfileSource,
} from "../core/validation/validation-profile-service.js";
import { recordValidationProfileUsage } from "../core/validation/validation-profile-usage-service.js";
import {
  bundlePatchesDir,
  suggestionPatchesDir,
  relToRun,
  unique,
  FORWARD_TIMEOUT_MS,
  CHECK_TIMEOUT_MS,
} from "./patch-apply.js";
import {
  SuggestionBundleError,
  type BundleStatus,
  type SuggestionBundle,
} from "./suggestion-bundle-types.js";
import type { ReviewSuggestion } from "./review-suggestion-types.js";
import type { ReviewSuggestionService } from "./review-suggestion-service.js";
import type { SuggestionBundleStore } from "./suggestion-bundle-store.js";
import type { EventLog } from "../core/stores/event-log.js";
import type { BundlePreflightResult } from "./suggestion-bundle-service.js";
import type { draftBundleEvent } from "../notifications/notification-router.js";

export type SmartApplyStep = {
  suggestionId: string;
  /** "applied" if git apply succeeded; "skipped" when smart apply stopped. */
  applyStatus: "applied" | "failed" | "skipped";
  applyError: string | null;
  /** Only set when validateEachStep was true. */
  validation:
    | {
        status: "passed" | "failed" | "no_commands_configured";
        passed: number;
        failed: number;
        /** Which profile drove this step's validation. */
        profileName: string;
        profileSource: ValidationProfileSource;
      }
    | null;
  /** Set when autoRevertFailing was true and we attempted to revert this step. */
  revertStatus: "reverted" | "revert_failed" | null;
  revertError: string | null;
};

export type SmartApplyResult = {
  bundleId: string;
  runId: string;
  startedAt: string;
  endedAt: string;
  mode: {
    validateEachStep: boolean;
    autoRevertFailing: boolean;
    /** When set, every step was forced to this profile name. */
    profileOverride: string | null;
    /** When true, each step preferred its own validationProfile. */
    useSuggestionProfiles: boolean;
  };
  steps: SmartApplyStep[];
  finalStatus: BundleStatus;
  /** Index of the failing step in `steps`, or null on full success. */
  failedAt: number | null;
  /** Path of the persisted JSON inside .vibestrate/runs/<runId>/. */
  resultPath: string;
};

export type SmartApplyOptions = {
  validateEachStep?: boolean;
  autoRevertFailing?: boolean;
  /**
   * Profile to use for the per-step validation. Resolution order:
   *   1. options.profileName (explicit override; "override" source)
   *   2. options.useSuggestionProfiles=true → each step's own
   *      validationProfile, falling back to the bundle's own
   *      validationProfile, falling back to default
   *   3. bundle.validationProfile (when set; "bundle" source)
   *   4. default commands.validate
   * Has no effect unless validateEachStep is true.
   */
  profileName?: string | null;
  useSuggestionProfiles?: boolean;
};

/**
 * Everything runSmartApply needs from SuggestionBundleService. Live objects
 * are passed directly; private service methods are exposed as narrow
 * callbacks so the service's mutable state stays on the service.
 */
export type SmartApplyContext = {
  projectRoot: string;
  runId: string;
  broker: ActionBroker;
  events: EventLog;
  bundleStore: SuggestionBundleStore;
  suggestionService: ReviewSuggestionService;
  requireBundle(bundleId: string): Promise<SuggestionBundle>;
  requireWorktree(): Promise<string>;
  preflight(bundleId: string): Promise<BundlePreflightResult>;
  markFailed(
    bundle: SuggestionBundle,
    errorMessage: string,
    sameFileWarnings: { file: string; suggestionIds: string[] }[],
    status?: BundleStatus,
  ): Promise<SuggestionBundle>;
  markSuggestionApplied(suggestionId: string, bundleId: string): Promise<void>;
  notify(input: {
    bundleId: string;
    kind: Parameters<typeof draftBundleEvent>[0]["kind"];
    message: string;
  }): void;
};

/**
 * Smart apply: walk the bundle suggestion-by-suggestion, optionally
 * validating after each one, optionally reverting only the failing
 * suggestion. This is **NOT atomic**. Earlier suggestions that already
 * applied stay applied even when a later step fails - that is the entire
 * point of the mode and what the user opted into.
 *
 * Final bundle status:
 *   - smart_applied              every step applied (and validated, if
 *                                validateEachStep was on);
 *   - smart_stopped              a step's validation failed, the failing
 *                                step was NOT auto-reverted, prior steps
 *                                stay applied;
 *   - smart_reverted_failing     a step failed validation, the failing
 *                                step was reverted via autoRevertFailing,
 *                                prior steps stay applied;
 *   - smart_failed               git apply --check or git apply outright
 *                                rejected a step (very rare, since the
 *                                up-front preflight catches static issues).
 *
 * The full step-by-step result is persisted to
 * .vibestrate/runs/<runId>/suggestion-bundles/<bundleId>-smart-apply.json so a
 * later UI/CLI can render it without re-running the chain.
 */
export async function runSmartApply(
  ctx: SmartApplyContext,
  bundleId: string,
  options: SmartApplyOptions = {},
): Promise<{ bundle: SuggestionBundle; result: SmartApplyResult }> {
  const bundle = await ctx.requireBundle(bundleId);
  if (bundle.status !== "approved") {
    throw new SuggestionBundleError(
      409,
      `Bundle ${bundleId} must be approved before smart apply (current: ${bundle.status}).`,
    );
  }
  const worktreePath = await ctx.requireWorktree();

  // Validate the explicit override up-front so a missing profile fails
  // BEFORE we touch the worktree. The per-step path will resolve again
  // (since useSuggestionProfiles can vary per step), but pre-validating
  // a single override saves the user from a partial state caused by a typo.
  if (options.validateEachStep && options.profileName?.trim()) {
    try {
      const cfg = await loadConfig(ctx.projectRoot);
      resolveValidationProfile(
        cfg.config,
        options.profileName.trim(),
        "override",
      );
    } catch (err) {
      if (err instanceof ValidationProfileError) {
        throw new SuggestionBundleError(err.statusCode, err.message);
      }
      throw err;
    }
  }

  const preflight = await ctx.preflight(bundleId);

  const steps: SmartApplyStep[] = bundle.suggestionIds.map((sid) => ({
    suggestionId: sid,
    applyStatus: "skipped",
    applyError: null,
    validation: null,
    revertStatus: null,
    revertError: null,
  }));

  const startedAt = nowIso();
  await ctx.events.append({
    type: "bundle.smart_apply_started",
    message: `bundle ${bundleId} smart apply started (${bundle.suggestionIds.length} step${bundle.suggestionIds.length === 1 ? "" : "s"})`,
    data: {
      bundleId,
      validateEachStep: !!options.validateEachStep,
      autoRevertFailing: !!options.autoRevertFailing,
    },
  });

  if (!preflight.ok) {
    const offenders = preflight.findings.filter((f) => f.reason !== null);
    const summary = offenders
      .map((f) => `${f.suggestionId}: ${f.reason}`)
      .join("; ")
      .slice(0, 1_000);
    const result: SmartApplyResult = {
      bundleId,
      runId: ctx.runId,
      startedAt,
      endedAt: nowIso(),
      mode: {
        validateEachStep: !!options.validateEachStep,
        autoRevertFailing: !!options.autoRevertFailing,
        profileOverride: options.profileName?.trim() || null,
        useSuggestionProfiles: !!options.useSuggestionProfiles,
      },
      steps,
      finalStatus: "smart_failed",
      failedAt: -1,
      resultPath: "",
    };
    const finalBundle = await ctx.markFailed(
      bundle,
      `Smart-apply preflight rejected ${offenders.length} suggestion(s): ${summary}`,
      preflight.sameFileWarnings,
      "smart_failed",
    );
    result.resultPath = await persistSmartApplyResult(
      ctx.projectRoot,
      ctx.runId,
      bundle.id,
      result,
    );
    return { bundle: finalBundle, result };
  }

  // ── Action Broker boundary: file.patch (bundle smartApply) ───────────
  // One decision for the whole step-by-step pass, after preflight cleared.
  // (Per-step reverts delegate to the gated ReviewSuggestionService.revert.)
  const action: ActionRequest = {
    runId: ctx.runId,
    kind: "file.patch",
    subject: {
      op: "bundle.smartApply",
      bundleId,
      suggestionIds: bundle.suggestionIds.slice(),
      files: unique(preflight.findings.flatMap((f) => f.touchedFiles)),
    },
    proposedBy: "system",
  };
  const gate = await gateAction(ctx.broker, action);
  if (!gate.allowed) {
    const result: SmartApplyResult = {
      bundleId,
      runId: ctx.runId,
      startedAt,
      endedAt: nowIso(),
      mode: {
        validateEachStep: !!options.validateEachStep,
        autoRevertFailing: !!options.autoRevertFailing,
        profileOverride: options.profileName?.trim() || null,
        useSuggestionProfiles: !!options.useSuggestionProfiles,
      },
      steps,
      finalStatus: "smart_failed",
      failedAt: -1,
      resultPath: "",
    };
    const finalBundle = await ctx.markFailed(
      bundle,
      `action broker ${gate.effect} the smart apply: ${gate.reason}`,
      preflight.sameFileWarnings,
      "smart_failed",
    );
    result.resultPath = await persistSmartApplyResult(
      ctx.projectRoot,
      ctx.runId,
      bundle.id,
      result,
    );
    return { bundle: finalBundle, result };
  }

  // Mark applying so the UI can show progress.
  const applyingBundle: SuggestionBundle = {
    ...bundle,
    status: "smart_applying",
    sameFileWarnings: preflight.sameFileWarnings,
    updatedAt: nowIso(),
  };
  await ctx.bundleStore.upsert(applyingBundle);

  let finalStatus: BundleStatus = "smart_applied";
  let failedAt: number | null = null;
  let stopReason: string | null = null;

  for (let i = 0; i < bundle.suggestionIds.length; i++) {
    const sid = bundle.suggestionIds[i]!;
    const step = steps[i]!;
    const s = await ctx.suggestionService.get(sid);
    if (!s || !s.proposedPatch) {
      step.applyStatus = "failed";
      step.applyError = "Suggestion vanished or has no proposedPatch.";
      finalStatus = "smart_failed";
      failedAt = i;
      stopReason = step.applyError;
      break;
    }

    // git apply --check then git apply, single suggestion.
    const check = await execa(
      "git",
      ["apply", "--check", "--whitespace=nowarn"],
      {
        cwd: worktreePath,
        input: s.proposedPatch,
        reject: false,
        timeout: CHECK_TIMEOUT_MS,
        stdin: "pipe",
      },
    );
    if (check.exitCode !== 0) {
      const reason = (check.stderr || check.stdout || "git apply --check failed")
        .toString()
        .slice(0, 500);
      step.applyStatus = "failed";
      step.applyError = reason;
      finalStatus = "smart_failed";
      failedAt = i;
      stopReason = `git apply --check rejected ${sid}: ${reason}`;
      break;
    }
    const applied = await execa(
      "git",
      ["apply", "--whitespace=nowarn"],
      {
        cwd: worktreePath,
        input: s.proposedPatch,
        reject: false,
        timeout: FORWARD_TIMEOUT_MS,
        stdin: "pipe",
      },
    );
    if (applied.exitCode !== 0) {
      const reason = (applied.stderr || applied.stdout || "git apply failed")
        .toString()
        .slice(0, 500);
      step.applyStatus = "failed";
      step.applyError = reason;
      finalStatus = "smart_failed";
      failedAt = i;
      stopReason = `git apply rejected ${sid}: ${reason}`;
      break;
    }
    step.applyStatus = "applied";
    // Stamp the suggestion as applied + capture its patches.
    await ctx.markSuggestionApplied(sid, bundle.id);

    // Per-step validation, if requested.
    if (options.validateEachStep) {
      let profile;
      try {
        const cfg = await loadConfig(ctx.projectRoot);
        const explicit = options.profileName?.trim();
        if (explicit) {
          profile = resolveValidationProfile(
            cfg.config,
            explicit,
            "override",
          );
        } else if (options.useSuggestionProfiles && s.validationProfile) {
          profile = resolveValidationProfile(
            cfg.config,
            s.validationProfile,
            "suggestion",
          );
        } else if (bundle.validationProfile) {
          profile = resolveValidationProfile(
            cfg.config,
            bundle.validationProfile,
            "bundle",
          );
        } else {
          profile = resolveValidationProfile(cfg.config, null, "default");
        }
      } catch (err) {
        if (err instanceof ValidationProfileError) {
          throw new SuggestionBundleError(err.statusCode, err.message);
        }
        throw err;
      }
      const v = await runSuggestionValidation({
        projectRoot: ctx.projectRoot,
        runId: ctx.runId,
        worktreePath,
        commands: profile.commands,
        // Validate at suggestion-scope so the artifacts file naming stays
        // honest - this is a per-step probe, not a bundle-level pass.
        scope: { kind: "suggestion", suggestionId: sid },
        profileName: profile.profileName,
        profileSource: profile.source,
      });
      step.validation = {
        status: v.status,
        passed: v.summary.passed,
        failed: v.summary.failed,
        profileName: profile.profileName,
        profileSource: profile.source,
      };
      // Count this step's profile usage only when validation actually ran.
      if (v.status === "passed" || v.status === "failed") {
        await recordValidationProfileUsage({
          projectRoot: ctx.projectRoot,
          profileName: v.profileName,
          source: v.profileSource === "default" ? "default" : "named",
          runId: ctx.runId,
          bundleId,
          suggestionId: sid,
        });
      }
      if (v.status === "passed") {
        await ctx.events.append({
          type: "bundle.smart_apply_step_passed",
          message: `smart apply: ${sid} validation passed`,
          data: { bundleId, suggestionId: sid },
        });
      } else if (v.status === "failed") {
        await ctx.events.append({
          type: "bundle.smart_apply_step_failed",
          message: `smart apply: ${sid} validation failed`,
          data: { bundleId, suggestionId: sid, failed: v.summary.failed },
        });
        // Stop; optionally revert THIS step only.
        if (options.autoRevertFailing) {
          const rev = await ctx.suggestionService
            .revert(sid)
            .catch((err) => ({ status: "revert_failed", errorMessage: err instanceof Error ? err.message : String(err) }) as ReviewSuggestion);
          if (rev.status === "reverted") {
            step.revertStatus = "reverted";
            await ctx.events.append({
              type: "bundle.smart_apply_step_reverted",
              message: `smart apply: ${sid} reverted after validation failure`,
              data: { bundleId, suggestionId: sid },
            });
            finalStatus = "smart_reverted_failing";
          } else {
            step.revertStatus = "revert_failed";
            step.revertError = rev.errorMessage ?? null;
            finalStatus = "smart_stopped";
          }
        } else {
          finalStatus = "smart_stopped";
        }
        failedAt = i;
        stopReason = `validation failed at step ${i + 1}`;
        break;
      } else {
        // no_commands_configured - we still consider the step passed
        // (the user opted into validateEachStep but nothing is wired up).
        // We do NOT pretend validation passed; we record it as the
        // honest no_commands_configured value and continue.
      }
    }
  }

  const endedAt = nowIso();
  const result: SmartApplyResult = {
    bundleId,
    runId: ctx.runId,
    startedAt,
    endedAt,
    mode: {
      validateEachStep: !!options.validateEachStep,
      autoRevertFailing: !!options.autoRevertFailing,
      profileOverride: options.profileName?.trim() || null,
      useSuggestionProfiles: !!options.useSuggestionProfiles,
    },
    steps,
    finalStatus,
    failedAt,
    resultPath: "",
  };
  result.resultPath = await persistSmartApplyResult(
    ctx.projectRoot,
    ctx.runId,
    bundle.id,
    result,
  );

  const appliedSteps = steps.filter((s) => s.applyStatus === "applied");
  const touched = unique(
    preflight.findings
      .filter((f) =>
        appliedSteps.some((step) => step.suggestionId === f.suggestionId),
      )
      .flatMap((f) => f.touchedFiles),
  );

  let finalBundle: SuggestionBundle;
  if (finalStatus === "smart_applied") {
    // Persist combined applied + reverse patches across the steps that
    // actually applied so a single bundle revert still works.
    const combinedPatch = await collectCombinedPatch(
      ctx.projectRoot,
      ctx.runId,
      appliedSteps,
    );
    const dir = bundlePatchesDir(ctx.projectRoot, ctx.runId);
    await ensureDir(dir);
    const appliedPath = path.join(dir, `${bundle.id}-applied.patch`);
    const reversePath = path.join(dir, `${bundle.id}-reverse.patch`);
    await writeText(appliedPath, combinedPatch);
    await writeText(reversePath, combinedPatch);
    finalBundle = {
      ...applyingBundle,
      status: "smart_applied",
      appliedAt: endedAt,
      appliedPatchPath: relToRun(ctx.projectRoot, ctx.runId, appliedPath),
      reversePatchPath: relToRun(ctx.projectRoot, ctx.runId, reversePath),
      touchedFiles: touched,
      errorMessage: null,
      updatedAt: endedAt,
    };
    await ctx.bundleStore.upsert(finalBundle);
    await ctx.events.append({
      type: "bundle.smart_apply_completed",
      message: `bundle ${bundleId} smart apply completed`,
      data: { bundleId, steps: appliedSteps.length },
    });
    ctx.notify({
      bundleId,
      kind: "applied",
      message: `Smart apply completed: ${appliedSteps.length}/${steps.length} step${steps.length === 1 ? "" : "s"}.`,
    });
  } else {
    // Stopped or failed mid-pass: leave the previously applied steps
    // applied. Persist what was actually applied so a later bundle revert
    // can clean it up safely.
    const combinedPatch =
      appliedSteps.length > 0
        ? await collectCombinedPatch(ctx.projectRoot, ctx.runId, appliedSteps)
        : "";
    const dir = bundlePatchesDir(ctx.projectRoot, ctx.runId);
    await ensureDir(dir);
    const appliedPath = path.join(dir, `${bundle.id}-applied.patch`);
    const reversePath = path.join(dir, `${bundle.id}-reverse.patch`);
    if (combinedPatch) {
      await writeText(appliedPath, combinedPatch);
      await writeText(reversePath, combinedPatch);
    }
    finalBundle = {
      ...applyingBundle,
      status: finalStatus,
      appliedAt: appliedSteps.length > 0 ? endedAt : null,
      appliedPatchPath: combinedPatch
        ? relToRun(ctx.projectRoot, ctx.runId, appliedPath)
        : null,
      reversePatchPath: combinedPatch
        ? relToRun(ctx.projectRoot, ctx.runId, reversePath)
        : null,
      touchedFiles: touched,
      errorMessage: stopReason ?? null,
      updatedAt: endedAt,
    };
    await ctx.bundleStore.upsert(finalBundle);
    await ctx.events.append({
      type: "bundle.smart_apply_stopped",
      message: `bundle ${bundleId} smart apply ${finalStatus} after ${appliedSteps.length} step(s)`,
      data: {
        bundleId,
        finalStatus,
        failedAt,
        appliedSteps: appliedSteps.length,
      },
    });
    ctx.notify({
      bundleId,
      kind:
        finalStatus === "smart_reverted_failing"
          ? "reverted"
          : "apply_failed",
      message:
        finalStatus === "smart_reverted_failing"
          ? `Smart apply reverted the failing suggestion; ${appliedSteps.length - 1} prior step(s) remain applied.`
          : `Smart apply stopped at step ${(failedAt ?? 0) + 1}: ${stopReason ?? "no detail"}.`,
    });
  }

  await ctx.broker.record(action, gate.decision, {
    ok: finalStatus === "smart_applied",
    summary: `smart apply ${finalStatus}: ${appliedSteps.length}/${steps.length} step(s) applied`,
    data: { finalStatus, failedAt, files: touched },
  });
  return { bundle: finalBundle, result };
}

export async function persistSmartApplyResult(
  projectRoot: string,
  runId: string,
  bundleId: string,
  result: SmartApplyResult,
): Promise<string> {
  const dir = bundlePatchesDir(projectRoot, runId);
  await ensureDir(dir);
  const target = path.join(dir, `${bundleId}-smart-apply.json`);
  await writeText(target, `${JSON.stringify(result, null, 2)}\n`);
  return relToRun(projectRoot, runId, target);
}

/**
 * Concatenate the captured forward patch text for a list of applied
 * steps. Each suggestion-scoped patch already lives under
 * suggestion-patches/<id>-applied.patch (markSuggestionApplied wrote it).
 */
export async function collectCombinedPatch(
  projectRoot: string,
  runId: string,
  steps: SmartApplyStep[],
): Promise<string> {
  const out: string[] = [];
  for (const s of steps) {
    const file = path.join(
      suggestionPatchesDir(projectRoot, runId),
      `${s.suggestionId}-applied.patch`,
    );
    if (!(await pathExists(file))) continue;
    out.push(await readText(file));
  }
  return out.join("\n");
}

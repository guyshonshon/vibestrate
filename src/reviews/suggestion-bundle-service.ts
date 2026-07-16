import path from "node:path";
import { randomUUID } from "node:crypto";
import { execa } from "execa";
import { resolveApplicablePatch } from "../git/patch-eol.js";
import { nowIso } from "../utils/time.js";
import { ApprovalService } from "../core/approval-service.js";
import { EventLog } from "../core/event-log.js";
import { ReviewSuggestionStore } from "./review-suggestion-store.js";
import {
  ReviewSuggestionService,
  SuggestionServiceError,
} from "./review-suggestion-service.js";
import { checkPatchSafety } from "../safety/patch-safety.js";
import {
  bundlePatchesDir,
  suggestionPatchesDir,
  relToRun,
  unique,
  FORWARD_TIMEOUT_MS,
  CHECK_TIMEOUT_MS,
} from "./patch-apply.js";
import {
  runSmartApply,
  type SmartApplyOptions,
  type SmartApplyResult,
} from "./smart-apply.js";
import { SuggestionBundleStore } from "./suggestion-bundle-store.js";
import {
  SuggestionBundleError,
  type BundleStatus,
  type SuggestionBundle,
} from "./suggestion-bundle-types.js";
import type { ReviewSuggestion } from "./review-suggestion-types.js";
import { ensureDir, pathExists, readText, writeText } from "../utils/fs.js";
import { runStateSchema } from "../core/state-machine.js";
import { runStatePath, runDir } from "../utils/paths.js";
import { loadConfig } from "../project/config-loader.js";
import {
  runSuggestionValidation,
  type SuggestionValidationResult,
} from "./suggestion-validation-service.js";
import { NotificationService } from "../notifications/notification-service.js";
import { draftBundleEvent } from "../notifications/notification-router.js";
import {
  createActionBroker,
  gateAction,
  type ActionBroker,
  type ActionRequest,
} from "../safety/action-broker.js";
import {
  resolveValidationProfile,
  ValidationProfileError,
  type ValidationProfileSource,
} from "../core/validation-profile-service.js";
import { recordValidationProfileUsage } from "../core/validation-profile-usage-service.js";
import { applyPolicyGate } from "../policies/policy-service.js";

// The typed bundle error lives in suggestion-bundle-types.ts (so smart-apply.ts
// can throw it without importing this module); re-exported here because HTTP
// routes, the CLI, and tests import it alongside the service.
export { SuggestionBundleError } from "./suggestion-bundle-types.js";
export type { SmartApplyStep, SmartApplyResult } from "./smart-apply.js";

export type BundlePreflightFinding = {
  suggestionId: string;
  /** When set, the suggestion is unsafe to apply for the given reason. */
  reason: string | null;
  touchedFiles: string[];
};

export type BundlePreflightResult = {
  ok: boolean;
  findings: BundlePreflightFinding[];
  /** files: [suggestionIds] when the same file appears in more than one patch. */
  sameFileWarnings: { file: string; suggestionIds: string[] }[];
};

export class SuggestionBundleService {
  readonly bundleStore: SuggestionBundleStore;
  readonly suggestionStore: ReviewSuggestionStore;
  private readonly suggestionService: ReviewSuggestionService;
  private readonly approvals: ApprovalService;
  private readonly events: EventLog;
  /** Action Broker boundary - every bundle patch apply/revert is decided and
   *  recorded as evidence in `runs/<id>/actions.ndjson`. Shared with the inner
   *  ReviewSuggestionService so injected (test) brokers propagate. */
  private readonly broker: ActionBroker;

  constructor(
    private readonly projectRoot: string,
    private readonly runId: string,
    opts: { broker?: ActionBroker } = {},
  ) {
    this.broker = opts.broker ?? createActionBroker(projectRoot, runId);
    this.bundleStore = new SuggestionBundleStore(projectRoot, runId);
    this.suggestionStore = new ReviewSuggestionStore(projectRoot, runId);
    this.suggestionService = new ReviewSuggestionService(projectRoot, runId, {
      broker: this.broker,
    });
    this.approvals = new ApprovalService(projectRoot, runId);
    this.events = new EventLog(projectRoot, runId);
  }

  async list(): Promise<SuggestionBundle[]> {
    const all = await this.bundleStore.readAll();
    return [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async get(bundleId: string): Promise<SuggestionBundle | null> {
    const all = await this.bundleStore.readAll();
    return all.find((b) => b.id === bundleId) ?? null;
  }

  async create(input: {
    title: string;
    description?: string;
    suggestionIds?: string[];
  }): Promise<SuggestionBundle> {
    const ts = nowIso();
    const id = `b-${ts.replace(/[:.]/g, "-").replace(/Z$/, "")}-${randomUUID().slice(0, 4)}`;
    const ids = await this.validateSuggestionIds(input.suggestionIds ?? []);
    const bundle: SuggestionBundle = {
      id,
      runId: this.runId,
      title: input.title,
      description: input.description ?? "",
      createdAt: ts,
      updatedAt: ts,
      status: "draft",
      suggestionIds: ids,
      approvalId: null,
      validationResultPath: null,
      validationProfile: null,
      createdBy: "local-user",
      decisionNote: null,
      appliedAt: null,
      revertedAt: null,
      errorMessage: null,
      appliedPatchPath: null,
      reversePatchPath: null,
      touchedFiles: [],
      sameFileWarnings: [],
    };
    await this.bundleStore.upsert(bundle);
    await this.linkSuggestions(ids, id);
    await this.events.append({
      type: "bundle.created",
      message: `bundle ${id} created with ${ids.length} suggestion${ids.length === 1 ? "" : "s"}`,
      data: { bundleId: id, suggestionIds: ids },
    });
    this.notify({
      bundleId: id,
      kind: "created",
      message: `Review pass "${bundle.title}" created with ${ids.length} suggestion${ids.length === 1 ? "" : "s"}.`,
    });
    return bundle;
  }

  async addSuggestion(
    bundleId: string,
    suggestionId: string,
  ): Promise<SuggestionBundle> {
    const bundle = await this.requireDraft(bundleId);
    if (bundle.suggestionIds.includes(suggestionId)) {
      throw new SuggestionBundleError(
        409,
        `Suggestion ${suggestionId} is already in bundle ${bundleId}.`,
      );
    }
    const checked = await this.validateSuggestionIds([
      ...bundle.suggestionIds,
      suggestionId,
    ]);
    const updated: SuggestionBundle = {
      ...bundle,
      suggestionIds: checked,
      updatedAt: nowIso(),
    };
    await this.bundleStore.upsert(updated);
    await this.linkSuggestions([suggestionId], bundleId);
    await this.events.append({
      type: "bundle.updated",
      message: `bundle ${bundleId} added suggestion ${suggestionId}`,
      data: { bundleId, suggestionId, action: "add" },
    });
    return updated;
  }

  async removeSuggestion(
    bundleId: string,
    suggestionId: string,
  ): Promise<SuggestionBundle> {
    const bundle = await this.requireDraft(bundleId);
    if (!bundle.suggestionIds.includes(suggestionId)) {
      throw new SuggestionBundleError(
        404,
        `Suggestion ${suggestionId} is not in bundle ${bundleId}.`,
      );
    }
    const next = bundle.suggestionIds.filter((s) => s !== suggestionId);
    const updated: SuggestionBundle = {
      ...bundle,
      suggestionIds: next,
      updatedAt: nowIso(),
    };
    await this.bundleStore.upsert(updated);
    await this.unlinkSuggestion(suggestionId, bundleId);
    await this.events.append({
      type: "bundle.updated",
      message: `bundle ${bundleId} removed suggestion ${suggestionId}`,
      data: { bundleId, suggestionId, action: "remove" },
    });
    return updated;
  }

  async approve(
    bundleId: string,
    note?: string | null,
  ): Promise<SuggestionBundle> {
    const bundle = await this.requireBundle(bundleId);
    if (bundle.status !== "draft") {
      throw new SuggestionBundleError(
        409,
        `Bundle ${bundleId} is ${bundle.status}; refusing to approve.`,
      );
    }
    if (bundle.suggestionIds.length === 0) {
      throw new SuggestionBundleError(
        409,
        "Bundle has no suggestions; nothing to approve.",
      );
    }
    const approval = await this.approvals.create({
      stageId: "bundle",
      roleId: "supervisor",
      reason: `Apply review pass: ${bundle.title}`,
      prompt: bundle.description || null,
      sourceArtifactPath: null,
      requestedAction: "apply_bundle_patch",
      riskLevel: "medium",
      source: "agent",
    });
    const resolved = await this.approvals.approve({
      approvalId: approval.id,
      decidedBy: "local-user",
      note: note ?? null,
    });
    const updated: SuggestionBundle = {
      ...bundle,
      status: "approved",
      approvalId: resolved.id,
      decisionNote: note ?? null,
      updatedAt: nowIso(),
    };
    await this.bundleStore.upsert(updated);
    await this.events.append({
      type: "bundle.approved",
      message: `bundle ${bundleId} approved`,
      data: { bundleId, approvalId: resolved.id },
    });
    this.notify({
      bundleId,
      kind: "approved",
      message: `Review pass "${bundle.title}" approved. Apply when ready.`,
    });
    return updated;
  }

  async reject(
    bundleId: string,
    note?: string | null,
  ): Promise<SuggestionBundle> {
    const bundle = await this.requireBundle(bundleId);
    if (bundle.status !== "draft") {
      throw new SuggestionBundleError(
        409,
        `Bundle ${bundleId} is ${bundle.status}; refusing to reject.`,
      );
    }
    let approvalId = bundle.approvalId;
    if (!approvalId) {
      const approval = await this.approvals.create({
        stageId: "bundle",
        roleId: "supervisor",
        reason: `Reject review pass: ${bundle.title}`,
        prompt: bundle.description || null,
        sourceArtifactPath: null,
        requestedAction: "review_only",
        riskLevel: "low",
        source: "agent",
      });
      approvalId = approval.id;
    }
    await this.approvals.reject({
      approvalId,
      decidedBy: "local-user",
      note: note ?? null,
    });
    const updated: SuggestionBundle = {
      ...bundle,
      status: "rejected",
      approvalId,
      decisionNote: note ?? null,
      updatedAt: nowIso(),
    };
    await this.bundleStore.upsert(updated);
    await this.events.append({
      type: "bundle.rejected",
      message: `bundle ${bundleId} rejected`,
      data: { bundleId, approvalId },
    });
    return updated;
  }

  /**
   * Static-analysis preflight on every suggestion in the bundle. Reports
   * patch-safety failures, missing patches, and same-file overlaps. Does NOT
   * touch the worktree on its own - call `apply()` for the full check + apply.
   */
  async preflight(bundleId: string): Promise<BundlePreflightResult> {
    const bundle = await this.requireBundle(bundleId);
    const worktreePath = await this.requireWorktree();
    const findings: BundlePreflightFinding[] = [];
    const fileToSuggestions = new Map<string, string[]>();

    for (const sid of bundle.suggestionIds) {
      const s = await this.suggestionService.get(sid);
      if (!s) {
        findings.push({
          suggestionId: sid,
          reason: "Suggestion not found.",
          touchedFiles: [],
        });
        continue;
      }
      if (!s.proposedPatch || !s.proposedPatch.trim()) {
        findings.push({
          suggestionId: sid,
          reason: "Suggestion has no proposedPatch.",
          touchedFiles: [],
        });
        continue;
      }
      const safety = checkPatchSafety(s.proposedPatch, worktreePath);
      if (!safety.ok) {
        findings.push({
          suggestionId: sid,
          reason: safety.reason ?? "Patch failed safety check.",
          touchedFiles: safety.touchedFiles,
        });
      } else {
        // User policy rules run after built-in safety checks pass, with
        // the surface set to bundle-apply (a rule with appliesTo:
        // [suggestion-apply] only would not fire here).
        const policy = await applyPolicyGate({
          projectRoot: this.projectRoot,
          patch: s.proposedPatch,
          touchedFiles: safety.touchedFiles,
          surface: "bundle-apply",
        });
        findings.push({
          suggestionId: sid,
          reason: policy.ok ? null : policy.reason,
          touchedFiles: safety.touchedFiles,
        });
      }
      for (const f of safety.touchedFiles) {
        const arr = fileToSuggestions.get(f) ?? [];
        arr.push(sid);
        fileToSuggestions.set(f, arr);
      }
    }

    const sameFileWarnings: { file: string; suggestionIds: string[] }[] = [];
    for (const [file, ids] of fileToSuggestions) {
      if (ids.length > 1) {
        sameFileWarnings.push({ file, suggestionIds: ids });
      }
    }

    const ok = findings.every((f) => f.reason === null);
    return { ok, findings, sameFileWarnings };
  }

  /**
   * Apply every suggestion in the bundle, all-or-nothing. Strategy:
   *   1. Static preflight (patch safety, secret-file refusal, same-file warn).
   *   2. `git apply --check` for every patch in declared order. If ANY fails,
   *      apply nothing and return.
   *   3. `git apply` each patch in order. On failure of patch N (rare -
   *      --check passed), reverse-apply patches 1..N-1 to roll back, mark the
   *      bundle failed, and leave the worktree as it was when we started.
   *   4. Persist a combined applied + reverse patch under suggestion-bundles/
   *      so revert can use a single `git apply -R` against the whole bundle.
   *
   * Notifications are fire-and-forget through the event log.
   */
  async apply(
    bundleId: string,
    options: {
      validateAfterApply?: boolean;
      autoRevertOnValidationFail?: boolean;
      /** Override profile for the post-apply validation. */
      profileName?: string | null;
    } = {},
  ): Promise<{
    bundle: SuggestionBundle;
    preflight: BundlePreflightResult;
  }> {
    const bundle = await this.requireBundle(bundleId);
    if (bundle.status !== "approved") {
      throw new SuggestionBundleError(
        409,
        `Bundle ${bundleId} must be approved before apply (current: ${bundle.status}).`,
      );
    }
    const worktreePath = await this.requireWorktree();
    const preflight = await this.preflight(bundleId);

    if (!preflight.ok) {
      const offenders = preflight.findings.filter((f) => f.reason !== null);
      const summary = offenders
        .map((f) => `${f.suggestionId}: ${f.reason}`)
        .join("; ")
        .slice(0, 1_000);
      const updated = await this.markFailed(
        bundle,
        `Preflight rejected ${offenders.length} suggestion(s): ${summary}`,
        preflight.sameFileWarnings,
      );
      return { bundle: updated, preflight };
    }

    // ── Action Broker boundary: file.patch (bundle apply) ────────────────
    // One decision for the whole transactional apply, after preflight cleared.
    // Fail-closed: a non-allow verdict refuses the bundle (worktree untouched).
    const action: ActionRequest = {
      runId: this.runId,
      kind: "file.patch",
      subject: {
        op: "bundle.apply",
        bundleId,
        suggestionIds: bundle.suggestionIds.slice(),
        files: unique(preflight.findings.flatMap((f) => f.touchedFiles)),
      },
      proposedBy: "system",
    };
    const gate = await gateAction(this.broker, action);
    if (!gate.allowed) {
      const updated = await this.markFailed(
        bundle,
        `action broker ${gate.effect} the bundle apply: ${gate.reason}`,
        preflight.sameFileWarnings,
      );
      return { bundle: updated, preflight };
    }

    // Live patch list, in declared order.
    const patches: { id: string; patch: string }[] = [];
    for (const sid of bundle.suggestionIds) {
      const s = await this.suggestionService.get(sid);
      // requireBundle + preflight already validated existence + patch.
      patches.push({ id: sid, patch: s!.proposedPatch! });
    }

    // git apply --check every patch up-front. We don't actually apply yet,
    // so a downstream conflict between patches is still possible - we catch
    // that in the apply phase via rollback.
    for (const p of patches) {
      const r = await resolveApplicablePatch(p.patch, worktreePath);
      if ("ok" in r) {
        await this.broker.record(action, gate.decision, {
          ok: false,
          summary: `git apply --check rejected ${p.id}`,
        });
        const updated = await this.markFailed(
          bundle,
          `git apply --check rejected ${p.id}: ${r.reason}`,
          preflight.sameFileWarnings,
        );
        return { bundle: updated, preflight };
      }
      // Apply (and later roll back) the EOL-normalized text that checked clean.
      p.patch = r.patch;
    }

    // Mark applying, then walk the list. On any failure, roll back.
    const applyingTs = nowIso();
    const applyingBundle: SuggestionBundle = {
      ...bundle,
      status: "applying",
      sameFileWarnings: preflight.sameFileWarnings,
      updatedAt: applyingTs,
    };
    await this.bundleStore.upsert(applyingBundle);

    const applied: { id: string; patch: string }[] = [];
    let failureReason: string | null = null;
    let failureSuggestionId: string | null = null;
    for (const p of patches) {
      const r = await execa(
        "git",
        ["apply", "--whitespace=nowarn"],
        {
          cwd: worktreePath,
          input: p.patch,
          reject: false,
          timeout: FORWARD_TIMEOUT_MS,
          stdin: "pipe",
        },
      );
      if (r.exitCode !== 0) {
        failureReason = (r.stderr || r.stdout || "git apply failed")
          .toString()
          .slice(0, 500);
        failureSuggestionId = p.id;
        break;
      }
      applied.push(p);
    }

    if (failureReason !== null) {
      // Roll back already-applied patches in reverse order.
      let rollbackOk = true;
      const rollbackPatches = [...applied].reverse();
      for (const rp of rollbackPatches) {
        const rr = await execa(
          "git",
          ["apply", "-R", "--whitespace=nowarn"],
          {
            cwd: worktreePath,
            input: rp.patch,
            reject: false,
            timeout: FORWARD_TIMEOUT_MS,
            stdin: "pipe",
          },
        );
        if (rr.exitCode !== 0) {
          rollbackOk = false;
          break;
        }
      }
      await this.broker.record(action, gate.decision, {
        ok: false,
        summary: `bundle apply failed at ${failureSuggestionId}${rollbackOk ? "; rolled back" : "; rollback failed"}`,
      });
      const reason = rollbackOk
        ? `Apply failed at ${failureSuggestionId}; rolled back. Reason: ${failureReason}`
        : `Apply failed at ${failureSuggestionId} AND rollback failed. The worktree may be partially modified.`;
      const updated = await this.markFailed(
        applyingBundle,
        reason,
        preflight.sameFileWarnings,
        rollbackOk ? "failed" : "partially_applied",
      );
      // If rollback failed, also stamp the partially-applied suggestion(s).
      if (!rollbackOk) {
        for (const a of applied) {
          await this.markSuggestionApplied(a.id, applyingBundle.id);
        }
      }
      return { bundle: updated, preflight };
    }

    // Success path. Persist applied + reverse patches.
    const dir = bundlePatchesDir(this.projectRoot, this.runId);
    await ensureDir(dir);
    const appliedPath = path.join(dir, `${bundle.id}-applied.patch`);
    const reversePath = path.join(dir, `${bundle.id}-reverse.patch`);
    const combined = patches.map((p) => p.patch).join("\n");
    await writeText(appliedPath, combined);
    await writeText(reversePath, combined);

    const touched = unique(preflight.findings.flatMap((f) => f.touchedFiles));
    const finalBundle: SuggestionBundle = {
      ...applyingBundle,
      status: "applied",
      appliedAt: nowIso(),
      appliedPatchPath: relToRun(this.projectRoot, this.runId, appliedPath),
      reversePatchPath: relToRun(this.projectRoot, this.runId, reversePath),
      touchedFiles: touched,
      errorMessage: null,
      updatedAt: nowIso(),
    };
    await this.bundleStore.upsert(finalBundle);

    // Stamp every member suggestion as applied (with patch-capture pointing
    // back at the bundle's combined patches so per-suggestion revert remains
    // structurally honest - but we recommend bundle revert for the whole pass).
    for (const a of applied) {
      await this.markSuggestionApplied(a.id, bundle.id);
    }

    await this.broker.record(action, gate.decision, {
      ok: true,
      summary: `applied bundle ${bundleId} (${applied.length} suggestion${applied.length === 1 ? "" : "s"})`,
      data: { suggestionIds: applied.map((p) => p.id), files: touched },
    });
    await this.events.append({
      type: "bundle.applied",
      message: `bundle ${bundleId} applied (${applied.length} suggestion${applied.length === 1 ? "" : "s"})`,
      data: { bundleId, suggestionIds: applied.map((p) => p.id) },
    });
    this.notify({
      bundleId,
      kind: "applied",
      message: `Review pass "${bundle.title}" applied to the worktree (${applied.length} patch${applied.length === 1 ? "" : "es"}).`,
    });

    // Optional follow-on: validate-after-apply, auto-revert-on-validation-fail.
    // Auto-revert is ignored unless validation actually ran AND failed.
    if (!options.validateAfterApply) {
      return { bundle: finalBundle, preflight };
    }
    const validated = await this.validate(bundleId, {
      profileName: options.profileName,
    });
    if (
      !options.autoRevertOnValidationFail ||
      validated.result.status !== "failed"
    ) {
      return { bundle: validated.bundle, preflight };
    }
    const reverted = await this.autoRevertAfterValidationFailure(
      validated.bundle,
    );
    return { bundle: reverted, preflight };
  }

  /**
   * Internal: triggered only by apply() when validateAfterApply ran AND
   * returned status=failed. Calls revert(); translates the resulting bundle
   * status into one of the combined codes so the UI reads a single clear
   * story (and so callers can distinguish a validation-failure-driven
   * revert from a manual one).
   */
  private async autoRevertAfterValidationFailure(
    bundle: SuggestionBundle,
  ): Promise<SuggestionBundle> {
    let reverted: SuggestionBundle;
    try {
      reverted = await this.revert(bundle.id);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message.slice(0, 500) : String(err);
      const updated: SuggestionBundle = {
        ...bundle,
        status: "validation_failed_revert_failed",
        errorMessage,
        updatedAt: nowIso(),
      };
      await this.bundleStore.upsert(updated);
      await this.events.append({
        type: "bundle.auto_revert_failed",
        message: `bundle ${bundle.id} auto-revert failed after validation failure`,
        data: { bundleId: bundle.id, errorMessage },
      });
      this.notify({
        bundleId: bundle.id,
        kind: "revert_failed",
        message: `Validation failed and the auto-revert for "${bundle.title}" did not complete.`,
      });
      return updated;
    }
    const combinedStatus: SuggestionBundle["status"] =
      reverted.status === "reverted"
        ? "reverted_after_validation_failed"
        : "validation_failed_revert_failed";
    const updated: SuggestionBundle = {
      ...reverted,
      status: combinedStatus,
      updatedAt: nowIso(),
    };
    await this.bundleStore.upsert(updated);
    await this.events.append({
      type:
        combinedStatus === "reverted_after_validation_failed"
          ? "bundle.auto_revert_succeeded"
          : "bundle.auto_revert_failed",
      message: `bundle ${bundle.id} auto-revert ${combinedStatus === "reverted_after_validation_failed" ? "succeeded" : "failed"}`,
      data: {
        bundleId: bundle.id,
        finalStatus: combinedStatus,
        errorMessage: reverted.errorMessage,
      },
    });
    this.notify({
      bundleId: bundle.id,
      kind:
        combinedStatus === "reverted_after_validation_failed"
          ? "reverted"
          : "revert_failed",
      message:
        combinedStatus === "reverted_after_validation_failed"
          ? `Validation failed and "${bundle.title}" was reverted in the run worktree.`
          : `Validation failed and the auto-revert did not complete.`,
    });
    return updated;
  }

  /**
   * Step-by-step, non-atomic apply of the bundle. Thin delegator: the whole
   * state machine lives in smart-apply.ts (runSmartApply), which documents
   * the mode flags, profile resolution order, and final bundle statuses.
   */
  async smartApply(
    bundleId: string,
    options: SmartApplyOptions = {},
  ): Promise<{ bundle: SuggestionBundle; result: SmartApplyResult }> {
    return runSmartApply(
      {
        projectRoot: this.projectRoot,
        runId: this.runId,
        broker: this.broker,
        events: this.events,
        bundleStore: this.bundleStore,
        suggestionService: this.suggestionService,
        requireBundle: (id) => this.requireBundle(id),
        requireWorktree: () => this.requireWorktree(),
        preflight: (id) => this.preflight(id),
        markFailed: (bundle, errorMessage, sameFileWarnings, status) =>
          this.markFailed(bundle, errorMessage, sameFileWarnings, status),
        markSuggestionApplied: (suggestionId, linkedBundleId) =>
          this.markSuggestionApplied(suggestionId, linkedBundleId),
        notify: (input) => this.notify(input),
      },
      bundleId,
      options,
    );
  }

  /**
   * Validate the worktree the same way single-suggestion validation does, but
   * stamp the bundle so the dashboard can show a per-pass result.
   */
  async validate(
    bundleId: string,
    options: {
      /** Override; takes precedence over the bundle's own validationProfile. */
      profileName?: string | null;
    } = {},
  ): Promise<{
    bundle: SuggestionBundle;
    result: SuggestionValidationResult;
  }> {
    const bundle = await this.requireBundle(bundleId);
    if (
      bundle.status !== "applied" &&
      bundle.status !== "validation_passed" &&
      bundle.status !== "validation_failed" &&
      bundle.status !== "smart_applied" &&
      bundle.status !== "smart_stopped" &&
      bundle.status !== "smart_reverted_failing"
    ) {
      throw new SuggestionBundleError(
        409,
        `Bundle ${bundleId} must be applied before validation (current: ${bundle.status}).`,
      );
    }
    const worktreePath = await this.requireWorktree();

    const explicit = options.profileName?.trim();
    let profile;
    try {
      const cfg = await loadConfig(this.projectRoot);
      const useExplicit = explicit !== undefined && explicit !== "";
      const sourceHint: ValidationProfileSource = useExplicit
        ? "override"
        : bundle.validationProfile
          ? "bundle"
          : "default";
      profile = resolveValidationProfile(
        cfg.config,
        useExplicit ? explicit : (bundle.validationProfile ?? null),
        sourceHint,
      );
    } catch (err) {
      if (err instanceof ValidationProfileError) {
        throw new SuggestionBundleError(err.statusCode, err.message);
      }
      throw err;
    }
    const result = await runSuggestionValidation({
      projectRoot: this.projectRoot,
      runId: this.runId,
      worktreePath,
      commands: profile.commands,
      scope: { kind: "bundle", bundleId: bundle.id },
      profileName: profile.profileName,
      profileSource: profile.source,
    });

    let nextStatus: BundleStatus = bundle.status;
    if (result.status === "passed") nextStatus = "validation_passed";
    else if (result.status === "failed") nextStatus = "validation_failed";

    if (result.status === "passed" || result.status === "failed") {
      await recordValidationProfileUsage({
        projectRoot: this.projectRoot,
        profileName: result.profileName,
        source: result.profileSource === "default" ? "default" : "named",
        runId: this.runId,
        bundleId: bundle.id,
      });
    }

    const updated: SuggestionBundle = {
      ...bundle,
      status: nextStatus,
      validationResultPath: relToRun(
        this.projectRoot,
        this.runId,
        result.resultPath,
      ),
      errorMessage:
        result.status === "no_commands_configured"
          ? "No validation commands configured. Run `vibe config set commands.validate '[\"<cmd>\"]'`."
          : null,
      updatedAt: nowIso(),
    };
    await this.bundleStore.upsert(updated);
    await this.events.append({
      type:
        result.status === "passed"
          ? "bundle.validation_passed"
          : result.status === "failed"
            ? "bundle.validation_failed"
            : "bundle.applied",
      message:
        result.status === "no_commands_configured"
          ? `bundle ${bundleId} validate skipped: no commands configured`
          : `bundle ${bundleId} validation ${result.status}`,
      data: {
        bundleId,
        passed: result.summary.passed,
        failed: result.summary.failed,
      },
    });
    if (result.status !== "no_commands_configured") {
      this.notify({
        bundleId,
        kind:
          result.status === "passed"
            ? "validation_passed"
            : "validation_failed",
        message:
          result.status === "passed"
            ? `${result.summary.passed}/${result.summary.total} commands passed.`
            : `${result.summary.failed} of ${result.summary.total} commands failed.`,
      });
    }
    return { bundle: updated, result };
  }

  /**
   * Revert the bundle's combined patch via `git apply -R --check` then
   * `git apply -R`. Refuses if the bundle was never applied, the captured
   * reverse patch is missing, or `--check` fails. Failure leaves the
   * worktree untouched.
   */
  async revert(bundleId: string): Promise<SuggestionBundle> {
    const bundle = await this.requireBundle(bundleId);
    if (
      bundle.status !== "applied" &&
      bundle.status !== "validation_passed" &&
      bundle.status !== "validation_failed" &&
      bundle.status !== "validation_failed_revert_failed" &&
      bundle.status !== "smart_applied" &&
      bundle.status !== "smart_stopped" &&
      bundle.status !== "smart_reverted_failing"
    ) {
      throw new SuggestionBundleError(
        409,
        `Bundle ${bundleId} cannot be reverted from status "${bundle.status}".`,
      );
    }
    const worktreePath = await this.requireWorktree();
    if (!bundle.reversePatchPath) {
      throw new SuggestionBundleError(
        409,
        "No captured reverse patch is available for this bundle.",
      );
    }
    const reverseAbs = path.resolve(
      runDir(this.projectRoot, this.runId),
      bundle.reversePatchPath,
    );
    if (!(await pathExists(reverseAbs))) {
      throw new SuggestionBundleError(
        409,
        "Captured reverse patch file is missing.",
      );
    }
    const patchText = await readText(reverseAbs);
    const safety = checkPatchSafety(patchText, worktreePath);
    if (!safety.ok) {
      const updated = await this.markRevertFailed(bundle, safety.reason!);
      return updated;
    }

    // ── Action Broker boundary: file.patch (bundle revert) ───────────────
    const action: ActionRequest = {
      runId: this.runId,
      kind: "file.patch",
      subject: {
        op: "bundle.revert",
        bundleId,
        suggestionIds: bundle.suggestionIds.slice(),
        files: safety.touchedFiles,
      },
      proposedBy: "system",
    };
    const gate = await gateAction(this.broker, action);
    if (!gate.allowed) {
      return this.markRevertFailed(
        bundle,
        `action broker ${gate.effect} the bundle revert: ${gate.reason}`,
      );
    }

    const check = await execa(
      "git",
      ["apply", "-R", "--check", "--whitespace=nowarn"],
      {
        cwd: worktreePath,
        input: patchText,
        reject: false,
        timeout: CHECK_TIMEOUT_MS,
        stdin: "pipe",
      },
    );
    if (check.exitCode !== 0) {
      const reason = (check.stderr || check.stdout || "git apply -R --check failed")
        .toString()
        .slice(0, 500);
      await this.broker.record(action, gate.decision, {
        ok: false,
        summary: `git apply -R --check rejected revert of bundle ${bundleId}`,
      });
      return this.markRevertFailed(
        bundle,
        `git apply -R --check rejected the reverse patch: ${reason}`,
      );
    }

    const reverted = await execa(
      "git",
      ["apply", "-R", "--whitespace=nowarn"],
      {
        cwd: worktreePath,
        input: patchText,
        reject: false,
        timeout: FORWARD_TIMEOUT_MS,
        stdin: "pipe",
      },
    );
    if (reverted.exitCode !== 0) {
      const reason = (reverted.stderr || reverted.stdout || "git apply -R failed")
        .toString()
        .slice(0, 500);
      await this.broker.record(action, gate.decision, {
        ok: false,
        summary: `git apply -R failed for bundle ${bundleId}`,
      });
      return this.markRevertFailed(bundle, `git apply -R failed: ${reason}`);
    }
    await this.broker.record(action, gate.decision, {
      ok: true,
      summary: `reverted bundle ${bundleId}`,
      data: { files: safety.touchedFiles },
    });

    const updated: SuggestionBundle = {
      ...bundle,
      status: "reverted",
      revertedAt: nowIso(),
      errorMessage: null,
      updatedAt: nowIso(),
    };
    await this.bundleStore.upsert(updated);
    // Stamp every member suggestion as reverted.
    for (const sid of bundle.suggestionIds) {
      const s = await this.suggestionService.get(sid);
      if (!s) continue;
      const next: ReviewSuggestion = {
        ...s,
        status: "reverted",
        updatedAt: nowIso(),
      };
      await this.suggestionStore.upsert(next);
    }
    await this.events.append({
      type: "bundle.reverted",
      message: `bundle ${bundleId} reverted`,
      data: { bundleId },
    });
    this.notify({
      bundleId,
      kind: "reverted",
      message: `Review pass "${bundle.title}" reverted.`,
    });
    return updated;
  }

  /**
   * Edit the bundle's validationProfile metadata. null / "" / "default" all
   * clear back to default; a non-null name must exist in
   * commands.validationProfiles. Never runs validation; never changes the
   * apply/revert lifecycle.
   */
  async updateValidationProfile(
    bundleId: string,
    profileName: string | null,
  ): Promise<SuggestionBundle> {
    const bundle = await this.requireBundle(bundleId);
    const trimmed = (profileName ?? "").trim();
    const next = trimmed === "" || trimmed === "default" ? null : trimmed;

    if (next !== null) {
      try {
        const cfg = await loadConfig(this.projectRoot);
        resolveValidationProfile(cfg.config, next, "override");
      } catch (err) {
        if (err instanceof ValidationProfileError) {
          throw new SuggestionBundleError(err.statusCode, err.message);
        }
        throw err;
      }
    }

    if ((bundle.validationProfile ?? null) === next) {
      return bundle;
    }

    const updated: SuggestionBundle = {
      ...bundle,
      validationProfile: next,
      updatedAt: nowIso(),
    };
    await this.bundleStore.upsert(updated);
    await this.events.append({
      type: "bundle.validation_profile_updated",
      message: `bundle ${bundleId} validation profile set to "${next ?? "default"}"`,
      data: {
        bundleId,
        previous: bundle.validationProfile,
        next,
      },
    });
    return updated;
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  private notify(input: {
    bundleId: string;
    kind: Parameters<typeof draftBundleEvent>[0]["kind"];
    message: string;
  }): void {
    void new NotificationService(this.projectRoot)
      .notify(
        draftBundleEvent({
          runId: this.runId,
          bundleId: input.bundleId,
          kind: input.kind,
          message: input.message,
        }),
      )
      .catch(() => {
        // best-effort notification
      });
  }

  private async requireBundle(bundleId: string): Promise<SuggestionBundle> {
    const b = await this.get(bundleId);
    if (!b) {
      throw new SuggestionBundleError(404, `Bundle ${bundleId} not found.`);
    }
    return b;
  }

  private async requireDraft(bundleId: string): Promise<SuggestionBundle> {
    const b = await this.requireBundle(bundleId);
    if (b.status !== "draft") {
      throw new SuggestionBundleError(
        409,
        `Bundle ${bundleId} is ${b.status}; cannot edit membership after status leaves draft.`,
      );
    }
    return b;
  }

  private async requireWorktree(): Promise<string> {
    const file = runStatePath(this.projectRoot, this.runId);
    if (!(await pathExists(file))) {
      throw new SuggestionBundleError(404, `Run ${this.runId} not found.`);
    }
    const text = await readText(file);
    const parsed = runStateSchema.safeParse(JSON.parse(text));
    const wt = parsed.success ? parsed.data.worktreePath : null;
    if (!wt) {
      throw new SuggestionBundleError(
        409,
        "This run has no worktree; bundle apply/revert refused.",
      );
    }
    return wt;
  }

  private async validateSuggestionIds(ids: string[]): Promise<string[]> {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of ids) {
      if (seen.has(id)) {
        throw new SuggestionBundleError(
          400,
          `Duplicate suggestion id in bundle: ${id}.`,
        );
      }
      seen.add(id);
      const s = await this.suggestionService.get(id);
      if (!s) {
        throw new SuggestionBundleError(
          404,
          `Suggestion ${id} not found in run ${this.runId}.`,
        );
      }
      if (s.runId !== this.runId) {
        throw new SuggestionBundleError(
          400,
          `Suggestion ${id} belongs to run ${s.runId}, not ${this.runId}.`,
        );
      }
      out.push(id);
    }
    return out;
  }

  private async linkSuggestions(
    suggestionIds: string[],
    bundleId: string,
  ): Promise<void> {
    for (const sid of suggestionIds) {
      const s = await this.suggestionService.get(sid);
      if (!s) continue;
      if (s.bundleId === bundleId) continue;
      const next: ReviewSuggestion = {
        ...s,
        bundleId,
        updatedAt: nowIso(),
      };
      await this.suggestionStore.upsert(next);
    }
  }

  private async unlinkSuggestion(
    suggestionId: string,
    bundleId: string,
  ): Promise<void> {
    const s = await this.suggestionService.get(suggestionId);
    if (!s) return;
    if (s.bundleId !== bundleId) return;
    const next: ReviewSuggestion = {
      ...s,
      bundleId: null,
      updatedAt: nowIso(),
    };
    await this.suggestionStore.upsert(next);
  }

  private async markSuggestionApplied(
    suggestionId: string,
    bundleId: string,
  ): Promise<void> {
    const s = await this.suggestionService.get(suggestionId);
    if (!s) return;
    const dir = suggestionPatchesDir(this.projectRoot, this.runId);
    await ensureDir(dir);
    const appliedPath = path.join(dir, `${suggestionId}-applied.patch`);
    const reversePath = path.join(dir, `${suggestionId}-reverse.patch`);
    if (s.proposedPatch && !(await pathExists(appliedPath))) {
      await writeText(appliedPath, s.proposedPatch);
      await writeText(reversePath, s.proposedPatch);
    }
    const next: ReviewSuggestion = {
      ...s,
      status: "applied",
      bundleId,
      appliedPatchPath: relToRun(
        this.projectRoot,
        this.runId,
        appliedPath,
      ),
      reversePatchPath: relToRun(
        this.projectRoot,
        this.runId,
        reversePath,
      ),
      errorMessage: null,
      updatedAt: nowIso(),
    };
    await this.suggestionStore.upsert(next);
  }

  private async markFailed(
    bundle: SuggestionBundle,
    errorMessage: string,
    sameFileWarnings: { file: string; suggestionIds: string[] }[],
    status: BundleStatus = "failed",
  ): Promise<SuggestionBundle> {
    const updated: SuggestionBundle = {
      ...bundle,
      status,
      errorMessage,
      sameFileWarnings,
      updatedAt: nowIso(),
    };
    await this.bundleStore.upsert(updated);
    await this.events.append({
      type:
        status === "partially_applied"
          ? "bundle.partially_applied"
          : "bundle.apply_failed",
      message: `bundle ${bundle.id} ${status}`,
      data: { bundleId: bundle.id, errorMessage, status },
    });
    this.notify({
      bundleId: bundle.id,
      kind: "apply_failed",
      message: errorMessage.slice(0, 200),
    });
    return updated;
  }

  private async markRevertFailed(
    bundle: SuggestionBundle,
    errorMessage: string,
  ): Promise<SuggestionBundle> {
    const updated: SuggestionBundle = {
      ...bundle,
      status: "revert_failed",
      errorMessage,
      updatedAt: nowIso(),
    };
    await this.bundleStore.upsert(updated);
    await this.events.append({
      type: "bundle.revert_failed",
      message: `bundle ${bundle.id} revert failed`,
      data: { bundleId: bundle.id, errorMessage },
    });
    this.notify({
      bundleId: bundle.id,
      kind: "revert_failed",
      message: errorMessage.slice(0, 200),
    });
    return updated;
  }
}

void SuggestionServiceError;

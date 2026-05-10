import path from "node:path";
import { randomUUID } from "node:crypto";
import { execa } from "execa";
import { nowIso } from "../utils/time.js";
import { ApprovalService } from "../core/approval-service.js";
import { EventLog } from "../core/event-log.js";
import { ReviewSuggestionStore } from "./review-suggestion-store.js";
import {
  makeSuggestionRecord,
  parseSuggestionBlocks,
} from "./review-suggestion-parser.js";
import type {
  ReviewSuggestion,
  SuggestionSource,
  SuggestionStatus,
} from "./review-suggestion-types.js";
import { isSecretLikePath } from "../core/diff-service.js";
import { isPathInside } from "../utils/paths.js";
import { runStateSchema } from "../core/state-machine.js";
import { runStatePath, runDir } from "../utils/paths.js";
import { ensureDir, pathExists, readText, writeText } from "../utils/fs.js";
import { loadConfig } from "../project/config-loader.js";
import {
  runSuggestionValidation,
  SuggestionValidationError,
  type SuggestionValidationResult,
} from "./suggestion-validation-service.js";
import { NotificationService } from "../notifications/notification-service.js";
import { draftSuggestionValidation } from "../notifications/notification-router.js";

export type SuggestionApplyOutcome = {
  ok: boolean;
  status: SuggestionStatus;
  errorMessage: string | null;
  changedFiles: string[];
};

export class SuggestionServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "SuggestionServiceError";
  }
}

export class ReviewSuggestionService {
  readonly store: ReviewSuggestionStore;
  private readonly approvals: ApprovalService;
  private readonly events: EventLog;

  constructor(
    private readonly projectRoot: string,
    private readonly runId: string,
  ) {
    this.store = new ReviewSuggestionStore(projectRoot, runId);
    this.approvals = new ApprovalService(projectRoot, runId);
    this.events = new EventLog(projectRoot, runId);
  }

  async list(): Promise<ReviewSuggestion[]> {
    const all = await this.store.readAll();
    return [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async get(id: string): Promise<ReviewSuggestion | null> {
    const all = await this.store.readAll();
    return all.find((s) => s.id === id) ?? null;
  }

  async addManual(input: {
    title: string;
    body?: string;
    file?: string | null;
    lineStart?: number | null;
    lineEnd?: number | null;
    proposedPatch?: string | null;
    sourceArtifactPath?: string | null;
  }): Promise<ReviewSuggestion> {
    const ts = nowIso();
    const rec: ReviewSuggestion = {
      id: `s-${ts.replace(/[:.]/g, "-").replace(/Z$/, "")}-${randomUUID().slice(
        0,
        4,
      )}`,
      runId: this.runId,
      createdAt: ts,
      updatedAt: ts,
      source: "user",
      sourceArtifactPath: input.sourceArtifactPath ?? null,
      file: input.file ?? null,
      lineStart: input.lineStart ?? null,
      lineEnd: input.lineEnd ?? null,
      title: input.title,
      body: input.body ?? "",
      status: "open",
      proposedPatch: input.proposedPatch ?? null,
      requiresApproval: true,
      approvalId: null,
      decisionNote: null,
      errorMessage: null,
      bundleId: null,
      appliedPatchPath: null,
      reversePatchPath: null,
      validationResultPath: null,
    };
    await this.store.upsert(rec);
    await this.events.append({
      type: "suggestion.created",
      message: `suggestion ${rec.id}: ${rec.title}`,
      data: { id: rec.id, source: rec.source, file: rec.file },
    });
    return rec;
  }

  /**
   * Scan a reviewer/verifier artifact for AMACO_SUGGESTION blocks and persist
   * any new suggestions. Returns the records actually inserted (de-duped by
   * source + sourceArtifactPath + title).
   */
  async ingestArtifact(input: {
    artifactRelPath: string;
    artifactBody: string;
    source: SuggestionSource;
  }): Promise<ReviewSuggestion[]> {
    const blocks = parseSuggestionBlocks(input.artifactBody);
    if (blocks.length === 0) return [];
    const existing = await this.store.readAll();
    const out: ReviewSuggestion[] = [];
    for (const b of blocks) {
      const dup = existing.find(
        (s) =>
          s.sourceArtifactPath === input.artifactRelPath &&
          s.source === input.source &&
          s.title === b.title,
      );
      if (dup) continue;
      const ts = nowIso();
      const rec = makeSuggestionRecord({
        id: `s-${ts.replace(/[:.]/g, "-").replace(/Z$/, "")}-${randomUUID().slice(
          0,
          4,
        )}`,
        runId: this.runId,
        createdAt: ts,
        source: input.source,
        sourceArtifactPath: input.artifactRelPath,
        parsed: b,
      });
      await this.store.upsert(rec);
      await this.events.append({
        type: "suggestion.created",
        message: `suggestion ${rec.id} extracted from ${input.artifactRelPath}`,
        data: {
          id: rec.id,
          source: rec.source,
          file: rec.file,
          sourceArtifactPath: input.artifactRelPath,
        },
      });
      out.push(rec);
    }
    return out;
  }

  async approve(id: string, note?: string | null): Promise<ReviewSuggestion> {
    const current = await this.requireSuggestion(id);
    if (current.status !== "open") {
      throw new SuggestionServiceError(
        409,
        `Suggestion ${id} is already ${current.status}; refusing to approve.`,
      );
    }
    const approval = await this.approvals.create({
      stageId: "suggestion",
      agentId: "supervisor",
      reason: `Apply suggestion: ${current.title}`,
      prompt: current.body || null,
      sourceArtifactPath: current.sourceArtifactPath ?? null,
      requestedAction:
        current.proposedPatch != null
          ? "apply_proposed_patch"
          : "review_only",
      riskLevel: "medium",
      source: "agent",
    });
    const resolved = await this.approvals.approve({
      approvalId: approval.id,
      decidedBy: "local-user",
      note: note ?? null,
    });
    const updated: ReviewSuggestion = {
      ...current,
      status: "approved",
      approvalId: resolved.id,
      decisionNote: note ?? null,
      updatedAt: nowIso(),
    };
    await this.store.upsert(updated);
    await this.events.append({
      type: "suggestion.approved",
      message: `suggestion ${id} approved`,
      data: { id, approvalId: resolved.id },
    });
    return updated;
  }

  async reject(id: string, note?: string | null): Promise<ReviewSuggestion> {
    const current = await this.requireSuggestion(id);
    if (current.status !== "open") {
      throw new SuggestionServiceError(
        409,
        `Suggestion ${id} is already ${current.status}; refusing to reject.`,
      );
    }
    let approvalId = current.approvalId ?? null;
    if (!approvalId) {
      const approval = await this.approvals.create({
        stageId: "suggestion",
        agentId: "supervisor",
        reason: `Reject suggestion: ${current.title}`,
        prompt: current.body || null,
        sourceArtifactPath: current.sourceArtifactPath ?? null,
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
    const updated: ReviewSuggestion = {
      ...current,
      status: "rejected",
      approvalId,
      decisionNote: note ?? null,
      updatedAt: nowIso(),
    };
    await this.store.upsert(updated);
    await this.events.append({
      type: "suggestion.rejected",
      message: `suggestion ${id} rejected`,
      data: { id, approvalId },
    });
    return updated;
  }

  /**
   * Apply the suggestion's proposedPatch inside the run's worktree using
   * `git apply --check` then `git apply`. Refuses if:
   *   - the run has no worktree
   *   - the suggestion has no proposed patch
   *   - the suggestion is not approved (we never apply un-gated patches)
   *   - the patch touches files outside the worktree
   *   - the patch touches secret-like paths
   *   - `git apply --check` fails
   * Updates suggestion status accordingly and emits events. Never throws on
   * apply failure: the failure is recorded as `status: "failed"`.
   */
  async apply(id: string): Promise<ReviewSuggestion> {
    const current = await this.requireSuggestion(id);
    if (current.status !== "approved") {
      throw new SuggestionServiceError(
        409,
        `Suggestion ${id} must be approved before apply (current: ${current.status}).`,
      );
    }
    if (!current.proposedPatch || !current.proposedPatch.trim()) {
      throw new SuggestionServiceError(
        409,
        `Suggestion ${id} has no proposedPatch; nothing to apply.`,
      );
    }
    const worktreePath = await loadWorktreePath(this.projectRoot, this.runId);
    if (!worktreePath) {
      throw new SuggestionServiceError(
        409,
        "This run has no worktree; refusing to apply a patch.",
      );
    }
    const safety = checkPatchSafety(current.proposedPatch, worktreePath);
    if (!safety.ok) {
      const updated = await this.markFailed(current, safety.reason!);
      return updated;
    }

    const check = await execa(
      "git",
      ["apply", "--check", "--whitespace=nowarn"],
      {
        cwd: worktreePath,
        input: current.proposedPatch,
        reject: false,
        timeout: 10_000,
        stdin: "pipe",
      },
    );
    if (check.exitCode !== 0) {
      const reason =
        (check.stderr || check.stdout || "git apply --check failed")
          .toString()
          .slice(0, 500);
      return this.markFailed(current, `git apply --check rejected the patch: ${reason}`);
    }

    const applied = await execa(
      "git",
      ["apply", "--whitespace=nowarn"],
      {
        cwd: worktreePath,
        input: current.proposedPatch,
        reject: false,
        timeout: 15_000,
        stdin: "pipe",
      },
    );
    if (applied.exitCode !== 0) {
      const reason =
        (applied.stderr || applied.stdout || "git apply failed")
          .toString()
          .slice(0, 500);
      return this.markFailed(current, `git apply failed: ${reason}`);
    }

    // Capture forward + reverse patch text for safe revert later.
    const dir = suggestionPatchesDir(this.projectRoot, this.runId);
    await ensureDir(dir);
    const appliedPatchPath = path.join(dir, `${id}-applied.patch`);
    const reversePatchPath = path.join(dir, `${id}-reverse.patch`);
    await writeText(appliedPatchPath, current.proposedPatch);
    // The "reverse" patch is the forward patch text — `git apply -R` reverses it
    // at apply time. Storing it as a separate file makes the revert flow
    // self-describing in the run dir.
    await writeText(reversePatchPath, current.proposedPatch);

    const updated: ReviewSuggestion = {
      ...current,
      status: "applied",
      errorMessage: null,
      updatedAt: nowIso(),
      appliedPatchPath: relToRun(this.projectRoot, this.runId, appliedPatchPath),
      reversePatchPath: relToRun(this.projectRoot, this.runId, reversePatchPath),
    };
    await this.store.upsert(updated);
    await this.events.append({
      type: "suggestion.applied",
      message: `suggestion ${id} applied to worktree`,
      data: { id, files: safety.touchedFiles },
    });
    return updated;
  }

  /**
   * Run the project's configured `commands.validate` against the run worktree
   * after an apply. Validation is **explicit**: callers (CLI/UI) opt in. The
   * suggestion's status flips to validation_passed / validation_failed; we
   * never silently overwrite the applied state if commands.validate is empty.
   */
  async validate(id: string): Promise<{
    suggestion: ReviewSuggestion;
    result: SuggestionValidationResult;
  }> {
    const current = await this.requireSuggestion(id);
    if (
      current.status !== "applied" &&
      current.status !== "validation_passed" &&
      current.status !== "validation_failed"
    ) {
      throw new SuggestionServiceError(
        409,
        `Suggestion ${id} must be applied before validation (current: ${current.status}).`,
      );
    }
    const worktreePath = await loadWorktreePath(this.projectRoot, this.runId);
    if (!worktreePath) {
      throw new SuggestionServiceError(
        409,
        "This run has no worktree; cannot validate.",
      );
    }
    let commands: readonly string[] = [];
    try {
      const cfg = await loadConfig(this.projectRoot);
      commands = cfg.config.commands.validate;
    } catch {
      commands = [];
    }
    let result: SuggestionValidationResult;
    try {
      result = await runSuggestionValidation({
        projectRoot: this.projectRoot,
        runId: this.runId,
        worktreePath,
        commands,
        scope: { kind: "suggestion", suggestionId: id },
      });
    } catch (err) {
      if (err instanceof SuggestionValidationError) {
        throw new SuggestionServiceError(err.statusCode, err.message);
      }
      throw err;
    }

    let nextStatus: SuggestionStatus = current.status;
    if (result.status === "passed") nextStatus = "validation_passed";
    else if (result.status === "failed") nextStatus = "validation_failed";
    // "no_commands_configured" leaves the status as `applied` so the user
    // can still see the message and configure validation later.

    const updated: ReviewSuggestion = {
      ...current,
      status: nextStatus,
      validationResultPath: relToRun(
        this.projectRoot,
        this.runId,
        result.resultPath,
      ),
      errorMessage:
        result.status === "no_commands_configured"
          ? "No validation commands configured. Run `amaco config set commands.validate '[\"<cmd>\"]'`."
          : null,
      updatedAt: nowIso(),
    };
    await this.store.upsert(updated);
    await this.events.append({
      type:
        result.status === "passed"
          ? "suggestion.validation_passed"
          : result.status === "failed"
            ? "suggestion.validation_failed"
            : "suggestion.applied",
      message:
        result.status === "no_commands_configured"
          ? `suggestion ${id} validate skipped: no commands configured`
          : `suggestion ${id} validation ${result.status}`,
      data: {
        id,
        resultPath: updated.validationResultPath,
        passed: result.summary.passed,
        failed: result.summary.failed,
      },
    });
    if (result.status !== "no_commands_configured") {
      void new NotificationService(this.projectRoot)
        .notify(
          draftSuggestionValidation({
            runId: this.runId,
            suggestionId: id,
            passed: result.status === "passed",
            failedCount: result.summary.failed,
          }),
        )
        .catch(() => {
          // Notifications are best-effort — never block the validation flow.
        });
    }
    return { suggestion: updated, result };
  }

  /**
   * Revert a previously-applied suggestion using the captured patch and
   * `git apply -R --check` followed by `git apply -R`. Refuses when the
   * suggestion was never applied, the captured patch file is missing, or the
   * worktree no longer matches the patch (later edits, validation that didn't
   * preserve hunks, etc.). Failure leaves the worktree untouched.
   */
  async revert(id: string): Promise<ReviewSuggestion> {
    const current = await this.requireSuggestion(id);
    if (
      current.status !== "applied" &&
      current.status !== "validation_passed" &&
      current.status !== "validation_failed"
    ) {
      throw new SuggestionServiceError(
        409,
        `Suggestion ${id} cannot be reverted from status "${current.status}".`,
      );
    }
    const worktreePath = await loadWorktreePath(this.projectRoot, this.runId);
    if (!worktreePath) {
      throw new SuggestionServiceError(
        409,
        "This run has no worktree; cannot revert.",
      );
    }
    if (!current.reversePatchPath) {
      throw new SuggestionServiceError(
        409,
        "No captured patch is available for revert. (Suggestion was applied before patch capture was added.)",
      );
    }
    const reverseAbs = path.resolve(
      runDir(this.projectRoot, this.runId),
      current.reversePatchPath,
    );
    if (!(await pathExists(reverseAbs))) {
      throw new SuggestionServiceError(
        409,
        "Captured reverse patch file is missing.",
      );
    }
    const patchText = await readText(reverseAbs);
    const safety = checkPatchSafety(patchText, worktreePath);
    if (!safety.ok) {
      const updated = await this.markRevertFailed(current, safety.reason!);
      return updated;
    }

    const check = await execa(
      "git",
      ["apply", "-R", "--check", "--whitespace=nowarn"],
      {
        cwd: worktreePath,
        input: patchText,
        reject: false,
        timeout: 10_000,
        stdin: "pipe",
      },
    );
    if (check.exitCode !== 0) {
      const reason = (check.stderr || check.stdout || "git apply -R --check failed")
        .toString()
        .slice(0, 500);
      return this.markRevertFailed(
        current,
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
        timeout: 15_000,
        stdin: "pipe",
      },
    );
    if (reverted.exitCode !== 0) {
      const reason = (reverted.stderr || reverted.stdout || "git apply -R failed")
        .toString()
        .slice(0, 500);
      return this.markRevertFailed(current, `git apply -R failed: ${reason}`);
    }

    const updated: ReviewSuggestion = {
      ...current,
      status: "reverted",
      errorMessage: null,
      updatedAt: nowIso(),
    };
    await this.store.upsert(updated);
    await this.events.append({
      type: "suggestion.reverted",
      message: `suggestion ${id} reverted in worktree`,
      data: { id, files: safety.touchedFiles },
    });
    return updated;
  }

  private async markRevertFailed(
    current: ReviewSuggestion,
    errorMessage: string,
  ): Promise<ReviewSuggestion> {
    const updated: ReviewSuggestion = {
      ...current,
      status: "revert_failed",
      errorMessage,
      updatedAt: nowIso(),
    };
    await this.store.upsert(updated);
    await this.events.append({
      type: "suggestion.revert_failed",
      message: `suggestion ${current.id} revert failed`,
      data: { id: current.id, errorMessage },
    });
    return updated;
  }

  async resolve(id: string, note?: string | null): Promise<ReviewSuggestion> {
    const current = await this.requireSuggestion(id);
    const updated: ReviewSuggestion = {
      ...current,
      status: "resolved",
      decisionNote: note ?? current.decisionNote,
      updatedAt: nowIso(),
    };
    await this.store.upsert(updated);
    return updated;
  }

  private async markFailed(
    current: ReviewSuggestion,
    errorMessage: string,
  ): Promise<ReviewSuggestion> {
    const updated: ReviewSuggestion = {
      ...current,
      status: "failed",
      errorMessage,
      updatedAt: nowIso(),
    };
    await this.store.upsert(updated);
    await this.events.append({
      type: "suggestion.apply_failed",
      message: `suggestion ${current.id} apply failed`,
      data: { id: current.id, errorMessage },
    });
    return updated;
  }

  private async requireSuggestion(id: string): Promise<ReviewSuggestion> {
    const s = await this.get(id);
    if (!s) {
      throw new SuggestionServiceError(404, `Suggestion ${id} not found.`);
    }
    return s;
  }
}

export function suggestionPatchesDir(
  projectRoot: string,
  runId: string,
): string {
  return path.join(runDir(projectRoot, runId), "suggestion-patches");
}

function relToRun(projectRoot: string, runId: string, abs: string): string {
  const root = runDir(projectRoot, runId);
  if (path.isAbsolute(abs)) {
    const rel = path.relative(root, abs);
    return rel.split(path.sep).join("/");
  }
  return abs.replace(/\\/g, "/");
}

async function loadWorktreePath(
  projectRoot: string,
  runId: string,
): Promise<string | null> {
  const file = runStatePath(projectRoot, runId);
  if (!(await pathExists(file))) return null;
  try {
    const text = await readText(file);
    const parsed = runStateSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data.worktreePath : null;
  } catch {
    return null;
  }
}

/**
 * Inspect a unified diff. Returns ok=false with a reason if any file path
 * leaves the worktree, references a secret-like path, or is otherwise unsafe.
 * The check is purely textual; the real authority is `git apply --check`.
 */
export function checkPatchSafety(
  patch: string,
  worktreeAbsPath: string,
): { ok: boolean; reason?: string; touchedFiles: string[] } {
  const touched = new Set<string>();
  const lines = patch.split(/\r?\n/);
  for (const line of lines) {
    let m = /^diff --git a\/(.*?) b\/(.+)$/.exec(line);
    if (m) {
      touched.add(m[1]!);
      touched.add(m[2]!);
      continue;
    }
    m = /^\+\+\+ (b\/)?(.+)$/.exec(line);
    if (m) {
      const target = m[2]!.trim();
      if (target !== "/dev/null") touched.add(target);
      continue;
    }
    m = /^--- (a\/)?(.+)$/.exec(line);
    if (m) {
      const target = m[2]!.trim();
      if (target !== "/dev/null") touched.add(target);
    }
  }
  if (touched.size === 0) {
    return {
      ok: false,
      reason: "Patch did not declare any target files.",
      touchedFiles: [],
    };
  }
  for (const t of touched) {
    if (t.includes("..") || t.startsWith("/") || t.startsWith("~")) {
      return {
        ok: false,
        reason: `Patch touches an unsafe path: ${t}`,
        touchedFiles: [...touched],
      };
    }
    const abs = path.resolve(worktreeAbsPath, t);
    if (!isPathInside(worktreeAbsPath, abs)) {
      return {
        ok: false,
        reason: `Patch path "${t}" escapes the worktree.`,
        touchedFiles: [...touched],
      };
    }
    if (isSecretLikePath(t)) {
      return {
        ok: false,
        reason: `Patch touches a secret-like file: ${t}`,
        touchedFiles: [...touched],
      };
    }
  }
  return { ok: true, touchedFiles: [...touched] };
}

// ── Integration / merge-preview ───────────────────────────────────
//
// Parallel runs already land on separate branches; this is the missing half -
// a *gated* surface to preview real git merges and then sequentially integrate
// selected branches into a dedicated integration branch. NEVER touches main,
// never pushes, never auto-merges. Conflicts are surfaced from real
// `git merge --no-ff --no-commit` dry-runs (a superset of the pre-run
// file-overlap detector), cumulatively, so branch-vs-branch conflicts show too.

import { randomUUID } from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import { execa } from "execa";
import { readDirSafe, pathExists } from "../utils/fs.js";
import { readJson } from "../utils/json.js";
import { projectRunsDir, runStatePath } from "../utils/paths.js";
import { runStateSchema } from "../core/state-machine.js";
import { loadConfig } from "../project/config-loader.js";
import {
  createWorktree,
  mergeNoCommit,
  abortMerge,
  commitMerge,
  removeWorktree,
  deleteBranch,
  refExists,
  hasChanges,
} from "../git/git.js";
import { resolveWorktreePath } from "../utils/paths.js";
import { creditTrailers } from "../git/commit-credit.js";
import {
  createActionBroker,
  type ActionRequest,
} from "../safety/action-broker.js";

export class IntegrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntegrationError";
  }
}

export type MergeReadyRun = {
  runId: string;
  task: string;
  branchName: string;
  taskId: string | null;
};

export type BranchTarget = { branch: string; runId?: string };

export type BranchPreview = {
  branch: string;
  runId?: string;
  clean: boolean;
  conflictedFiles: string[];
  note: string;
};

export type MergePreviewResult = {
  baseBranch: string;
  results: BranchPreview[];
  allClean: boolean;
};

export type IntegrateResult = {
  integrationBranch: string;
  baseBranch: string;
  worktreePath: string;
  integrated: BranchPreview[];
  /** Branch where integration stopped on a conflict (null = all merged). */
  stoppedAt: string | null;
};

const SAFE_BRANCH_RE = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,99}$/;

/** Runs in `merge_ready` with a branch - the candidates for integration. */
export async function listMergeReadyRuns(
  projectRoot: string,
): Promise<MergeReadyRun[]> {
  const ids = await readDirSafe(projectRunsDir(projectRoot));
  const out: MergeReadyRun[] = [];
  for (const id of ids.sort()) {
    const file = runStatePath(projectRoot, id);
    if (!(await pathExists(file))) continue;
    try {
      const parsed = runStateSchema.safeParse(await readJson(file));
      if (!parsed.success) continue;
      const s = parsed.data;
      // A read-only run (e.g. spec-up-intake) lands merge_ready with a branch but
      // has nothing to merge - exclude it from the integration candidate list.
      if (s.status === "merge_ready" && s.branchName && !s.readOnly) {
        out.push({
          runId: s.runId,
          task: s.task,
          branchName: s.branchName,
          taskId: s.taskId,
        });
      }
    } catch {
      // skip unreadable state
    }
  }
  return out;
}

/**
 * Cumulative merge preview into a throwaway scratch branch off `baseBranch`.
 * Clean branches are committed onto the scratch so later previews see them;
 * a conflicting branch is aborted, recorded, and skipped. The scratch worktree
 * + branch are always cleaned up. Nothing the user keeps is mutated.
 */
export async function mergePreview(input: {
  projectRoot: string;
  branches: BranchTarget[];
  baseBranch?: string;
}): Promise<MergePreviewResult> {
  const loaded = await loadConfig(input.projectRoot);
  const baseBranch = input.baseBranch ?? loaded.config.git.mainBranch;
  if (!(await refExists(input.projectRoot, baseBranch))) {
    throw new IntegrationError(`Base branch "${baseBranch}" does not exist.`);
  }
  const scratchBranch = `vibe-preview-${randomUUID().slice(0, 8)}`;
  const scratchPath = resolveWorktreePath(
    input.projectRoot,
    loaded.config.git.worktreeDir,
    scratchBranch,
  );
  const results: BranchPreview[] = [];

  await createWorktree({
    cwd: input.projectRoot,
    worktreePath: scratchPath,
    branchName: scratchBranch,
    startPoint: baseBranch,
  });
  try {
    for (const b of input.branches) {
      if (!(await refExists(scratchPath, b.branch))) {
        results.push({ ...b, clean: false, conflictedFiles: [], note: "branch not found" });
        continue;
      }
      const attempt = await mergeNoCommit(scratchPath, b.branch);
      if (attempt.clean) {
        await commitMerge(scratchPath, `preview: merge ${b.branch}`);
        results.push({ ...b, clean: true, conflictedFiles: [], note: attempt.message || "clean" });
      } else {
        await abortMerge(scratchPath);
        results.push({
          ...b,
          clean: false,
          conflictedFiles: attempt.conflictedFiles,
          note: attempt.conflictedFiles.length ? "conflicts" : "merge failed",
        });
      }
    }
  } finally {
    await removeWorktree(input.projectRoot, scratchPath);
    await deleteBranch(input.projectRoot, scratchBranch);
  }
  return { baseBranch, results, allClean: results.every((r) => r.clean) };
}

/**
 * Sequentially integrate `branches` into a NEW `integrationBranch` (off
 * `baseBranch`), committing each clean merge. Stops at the first conflict,
 * leaving the integration worktree at the last clean state for the human to
 * resolve. Refuses to use the main branch; never pushes.
 */
export async function integrate(input: {
  projectRoot: string;
  branches: BranchTarget[];
  integrationBranch: string;
  baseBranch?: string;
}): Promise<IntegrateResult> {
  const loaded = await loadConfig(input.projectRoot);
  const baseBranch = input.baseBranch ?? loaded.config.git.mainBranch;
  const target = input.integrationBranch.trim();

  if (!SAFE_BRANCH_RE.test(target)) {
    throw new IntegrationError(
      `Invalid integration branch name "${target}".`,
    );
  }
  if (target === loaded.config.git.mainBranch || target === baseBranch) {
    throw new IntegrationError(
      "Refusing to integrate into the main/base branch - use a dedicated integration branch.",
    );
  }
  if (!(await refExists(input.projectRoot, baseBranch))) {
    throw new IntegrationError(`Base branch "${baseBranch}" does not exist.`);
  }
  if (await refExists(input.projectRoot, target)) {
    throw new IntegrationError(
      `Integration branch "${target}" already exists. Delete it or choose another name.`,
    );
  }

  const worktreePath = resolveWorktreePath(
    input.projectRoot,
    loaded.config.git.worktreeDir,
    `integration-${target.replace(/[/]/g, "-")}`,
  );
  // Clean a stale worktree dir left from a prior integration whose branch was
  // since deleted (the branch-exists check above already covers the live case).
  await removeWorktree(input.projectRoot, worktreePath);
  await createWorktree({
    cwd: input.projectRoot,
    worktreePath,
    branchName: target,
    startPoint: baseBranch,
  });

  const integrated: BranchPreview[] = [];
  let stoppedAt: string | null = null;
  for (const b of input.branches) {
    if (!(await refExists(worktreePath, b.branch))) {
      integrated.push({ ...b, clean: false, conflictedFiles: [], note: "branch not found" });
      stoppedAt = b.branch;
      break;
    }
    const attempt = await mergeNoCommit(worktreePath, b.branch);
    if (attempt.clean) {
      await commitMerge(
        worktreePath,
        `integrate: merge ${b.branch}`,
        creditTrailers(loaded.config.commits),
      );
      integrated.push({ ...b, clean: true, conflictedFiles: [], note: "merged" });
    } else {
      await abortMerge(worktreePath);
      integrated.push({
        ...b,
        clean: false,
        conflictedFiles: attempt.conflictedFiles,
        note: "stopped - conflicts (resolve in the integration worktree)",
      });
      stoppedAt = b.branch;
      break;
    }
  }

  // Record what this integration contains (P7b completeness check): finish
  // refuses to merge a PARTIAL integration branch - one whose apply stopped at
  // a conflict - because the human reviewed a set of runs, not a prefix of it.
  const tip = await execa("git", ["rev-parse", target], {
    cwd: input.projectRoot,
    reject: false,
  });
  await writeIntegrationRecord(input.projectRoot, {
    integrationBranch: target,
    baseBranch,
    branches: input.branches.map((b) => b.branch),
    integrated: integrated.filter((b) => b.clean).map((b) => b.branch),
    stoppedAt,
    tipSha: tip.exitCode === 0 ? tip.stdout.trim() : null,
    createdAt: new Date().toISOString(),
  });

  return { integrationBranch: target, baseBranch, worktreePath, integrated, stoppedAt };
}

// ── P7b: guided merge-to-main ────────────────────────────────────────────────

export type IntegrationRecord = {
  integrationBranch: string;
  baseBranch: string;
  branches: string[];
  integrated: string[];
  stoppedAt: string | null;
  /** The integration branch tip at apply time - finish refuses on drift so
   *  the human merges exactly what they reviewed. */
  tipSha: string | null;
  createdAt: string;
};

function integrationDir(projectRoot: string): string {
  return path.join(projectRoot, ".vibestrate", "integration");
}

function integrationRecordPath(projectRoot: string, branch: string): string {
  return path.join(
    integrationDir(projectRoot),
    `${branch.replace(/[/]/g, "-")}.json`,
  );
}

async function writeIntegrationRecord(
  projectRoot: string,
  record: IntegrationRecord,
): Promise<void> {
  await fs.mkdir(integrationDir(projectRoot), { recursive: true });
  await fs.writeFile(
    integrationRecordPath(projectRoot, record.integrationBranch),
    JSON.stringify(record, null, 2),
    "utf8",
  );
}

export async function readIntegrationRecord(
  projectRoot: string,
  branch: string,
): Promise<IntegrationRecord | null> {
  try {
    return JSON.parse(
      await fs.readFile(integrationRecordPath(projectRoot, branch), "utf8"),
    ) as IntegrationRecord;
  } catch {
    return null;
  }
}

export type FinishIntegrationResult = {
  mergedSha: string;
  intoBranch: string;
  integrationBranch: string;
};

/**
 * Complete an integration: merge the (complete, clean) integration branch into
 * main, locally. HUMAN-TRIGGERED ONLY - the `humanConfirmed` literal must come
 * from an interactive surface (the CLI's typed confirmation or the dashboard's
 * confirm modal); no scheduler or run-completion path calls this (tested
 * invariant). The merge is gated by the Action Broker (`git.merge` - policies
 * can deny / require_approval), preconditions are re-checked INSIDE a lock
 * (TOCTOU), and nothing is ever pushed.
 */
export async function finishIntegration(input: {
  projectRoot: string;
  integrationBranch: string;
  humanConfirmed: true;
}): Promise<FinishIntegrationResult> {
  if (input.humanConfirmed !== true) {
    throw new IntegrationError(
      "finishIntegration requires explicit human confirmation.",
    );
  }
  const loaded = await loadConfig(input.projectRoot);
  const mainBranch = loaded.config.git.mainBranch;
  const target = input.integrationBranch.trim();
  if (!SAFE_BRANCH_RE.test(target) || target === mainBranch) {
    throw new IntegrationError(`Invalid integration branch "${target}".`);
  }

  // Serialize finishes + re-check everything inside the lock: a run checking
  // out main between check and merge is exactly the race to close.
  const lockDir = path.join(integrationDir(input.projectRoot), ".finish-lock");
  const lockPidFile = path.join(lockDir, "pid");
  await fs.mkdir(integrationDir(input.projectRoot), { recursive: true });
  const acquire = async (): Promise<boolean> => {
    try {
      await fs.mkdir(lockDir);
      await fs.writeFile(lockPidFile, String(process.pid), "utf8");
      return true;
    } catch {
      return false;
    }
  };
  if (!(await acquire())) {
    // Stale-lock recovery: a SIGKILLed finish leaves
    // the dir behind forever. If the recorded holder is dead, reclaim once.
    let holderAlive = false;
    try {
      const pid = Number(await fs.readFile(lockPidFile, "utf8"));
      if (Number.isFinite(pid) && pid > 0) {
        process.kill(pid, 0); // throws when the process is gone
        holderAlive = true;
      }
    } catch {
      holderAlive = false;
    }
    if (holderAlive) {
      throw new IntegrationError(
        "Another merge-to-main is in progress (lock held by a live process). Retry when it finishes.",
      );
    }
    await fs.rm(lockDir, { recursive: true, force: true });
    if (!(await acquire())) {
      throw new IntegrationError(
        `Could not acquire the merge lock. If no merge is running, remove ${lockDir} and retry.`,
      );
    }
  }
  try {
    const record = await readIntegrationRecord(input.projectRoot, target);
    if (!record) {
      throw new IntegrationError(
        `No integration record for "${target}" - re-run \`vibe integrate apply\` so finish can verify the branch is complete.`,
      );
    }
    if (record.stoppedAt) {
      throw new IntegrationError(
        `Integration "${target}" is PARTIAL - apply stopped at "${record.stoppedAt}". Resolve and re-apply before merging to ${mainBranch}.`,
      );
    }
    if (!(await refExists(input.projectRoot, target))) {
      throw new IntegrationError(`Integration branch "${target}" does not exist.`);
    }
    if (record.tipSha) {
      const tip = await execa("git", ["rev-parse", target], {
        cwd: input.projectRoot,
        reject: false,
      });
      const current = tip.exitCode === 0 ? tip.stdout.trim() : null;
      if (current !== record.tipSha) {
        throw new IntegrationError(
          `Integration branch "${target}" changed since apply (reviewed ${record.tipSha.slice(0, 10)}, now ${current?.slice(0, 10) ?? "missing"}) - re-run 'vibe integrate apply' to re-record what you reviewed.`,
        );
      }
    }
    if (!(await refExists(input.projectRoot, mainBranch))) {
      throw new IntegrationError(`Main branch "${mainBranch}" does not exist.`);
    }
    // Dirty-tree check, excluding .vibestrate/integration: the lock + record
    // this feature itself writes are operational metadata, not user work -
    // without the exclusion the lock would make every finish self-refusing.
    const dirty = await execa(
      "git",
      ["status", "--porcelain", "--", ":(exclude).vibestrate/integration"],
      { cwd: input.projectRoot, reject: false },
    );
    if (dirty.stdout.trim().length > 0) {
      throw new IntegrationError(
        "The project working tree has uncommitted changes - commit or stash them first.",
      );
    }

    // Broker gate: policies may deny or demand approval; either refuses here
    // (this surface IS the human ack - a policy hold means 'not even with one').
    const broker = createActionBroker(input.projectRoot, "integration");
    const req: ActionRequest = {
      runId: "integration",
      kind: "git.merge",
      subject: { from: target, into: mainBranch, branches: record.integrated },
      proposedBy: "cli",
    };
    const decision = await broker.decide(req);
    if (decision.effect !== "allow") {
      await broker.record(req, decision, {
        ok: false,
        summary: `merge ${target} -> ${mainBranch} refused (${decision.effect})`,
      });
      throw new IntegrationError(
        `Policy ${decision.effect === "deny" ? "denied" : "requires approval for"} this merge: ${
          "reason" in decision ? decision.reason : "policy"
        }`,
      );
    }

    // Never relocate the user's HEAD: a silent
    // checkout - especially on a FAILED merge - mutates state beyond the
    // contract. The human checks out main themselves; we refuse otherwise.
    const head = await execa("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: input.projectRoot,
      reject: false,
    });
    if (head.stdout.trim() !== mainBranch) {
      throw new IntegrationError(
        `The project is on "${head.stdout.trim()}", not ${mainBranch}. Check out ${mainBranch} first - finish never moves your HEAD.`,
      );
    }
    const merge = await execa("git", ["merge", "--no-edit", target], {
      cwd: input.projectRoot,
      reject: false,
    });
    if (merge.exitCode !== 0) {
      await execa("git", ["merge", "--abort"], {
        cwd: input.projectRoot,
        reject: false,
      });
      await broker.record(req, decision, {
        ok: false,
        summary: `merge ${target} -> ${mainBranch} conflicted; aborted`,
      });
      throw new IntegrationError(
        `Merge of "${target}" into ${mainBranch} did not apply cleanly (aborted): ${
          merge.stderr || merge.stdout
        }`,
      );
    }
    const sha = await execa("git", ["rev-parse", "HEAD"], {
      cwd: input.projectRoot,
      reject: false,
    });
    await broker.record(req, decision, {
      ok: true,
      summary: `merged ${target} -> ${mainBranch} @ ${sha.stdout.trim().slice(0, 10)} (local only, not pushed)`,
    });
    return {
      mergedSha: sha.stdout.trim(),
      intoBranch: mainBranch,
      integrationBranch: target,
    };
  } finally {
    await fs.rmdir(lockDir).catch(() => {});
  }
}

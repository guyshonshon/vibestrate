// ── Post-turn diff gate (Epic S / S3) ───────────────────────────────────────
//
// Around every write-capable agent turn, snapshot the worktree, let the agent
// run, then diff what changed and evaluate it before the run continues:
//
//   accept   → keep the changes, record evidence, continue.
//   rollback → a built-in safety check or a `deny` policy fired: restore the
//              worktree to the pre-turn snapshot and block the run.
//   approve  → a `require_approval` policy fired: block fail-closed (the changes
//              are left in place for a human to inspect — not silently kept).
//
// The snapshot/restore uses git plumbing on the run's dedicated worktree:
//   snapshot = `git add -A` + `git write-tree` (a tree object; non-destructive)
//   restore  = `git read-tree` + `git checkout-index -fa` + `git clean -fd`
// which returns tracked AND previously-untracked files to the exact snapshot
// and removes anything introduced after it. Proven by round-trip tests.

import { execa } from "execa";
import { checkPatchSafety } from "../reviews/review-suggestion-service.js";
import {
  gateAction,
  type ActionBroker,
  type ActionRequest,
} from "./action-broker.js";

async function git(cwd: string, args: string[]): Promise<string> {
  const r = await execa("git", args, { cwd, reject: false });
  return r.stdout ?? "";
}

/** Capture the current worktree as a tree object. Stages everything first so
 *  untracked files are part of the snapshot; non-destructive to the files. */
export async function snapshotWorktree(worktree: string): Promise<string> {
  await git(worktree, ["add", "-A"]);
  const tree = (await git(worktree, ["write-tree"])).trim();
  return tree;
}

/** The unified diff + changed file list of the worktree vs a snapshot tree. */
export async function captureWorktreePatch(
  worktree: string,
  baseTree: string,
): Promise<{ patch: string; files: string[] }> {
  await git(worktree, ["add", "-A"]);
  const patch = await git(worktree, [
    "diff",
    "--no-color",
    "--no-ext-diff",
    baseTree,
  ]);
  const names = await git(worktree, [
    "diff",
    "--name-only",
    "--no-ext-diff",
    baseTree,
  ]);
  const files = names
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return { patch, files };
}

/** Restore the worktree to an earlier snapshot tree (destructive — used only on
 *  a deny/unsafe verdict). Tracked files revert; files added after the snapshot
 *  are removed; the index is left matching the snapshot. */
export async function restoreWorktree(
  worktree: string,
  baseTree: string,
): Promise<void> {
  await git(worktree, ["read-tree", baseTree]);
  await git(worktree, ["checkout-index", "-f", "-a"]);
  await git(worktree, ["clean", "-fd"]);
}

export type TurnDiffVerdict =
  | { verdict: "accept"; files: string[] }
  | { verdict: "rollback"; reason: string; files: string[] }
  | { verdict: "approve"; reason: string; files: string[] };

/**
 * Evaluate a completed write-capable turn's diff. Pure of side effects beyond
 * recording the broker decision; the caller performs the rollback/block.
 */
export async function evaluateTurnDiff(input: {
  broker: ActionBroker;
  runId: string;
  roleId: string;
  worktree: string;
  baseTree: string;
}): Promise<TurnDiffVerdict> {
  const { broker, runId, roleId, worktree, baseTree } = input;
  const { patch, files } = await captureWorktreePatch(worktree, baseTree);
  if (!patch.trim()) return { verdict: "accept", files: [] };

  // Built-in safety: secret-bearing or forbidden-path changes are refused
  // before any policy runs (same guard the apply flows use).
  const safety = checkPatchSafety(patch, worktree);
  if (!safety.ok) {
    return { verdict: "rollback", reason: safety.reason ?? "unsafe diff", files };
  }

  // Policy: route the turn diff through the broker as a file.patch effect so
  // action policies (path globs) apply. Default-allow until policies are set.
  const action: ActionRequest = {
    runId,
    roleId,
    kind: "file.patch",
    subject: { op: "agent.turn.diff", roleId, files, worktree },
    proposedBy: "provider",
  };
  const gate = await gateAction(broker, action);
  if (!gate.allowed) {
    return {
      verdict: gate.effect === "deny" ? "rollback" : "approve",
      reason: gate.reason,
      files,
    };
  }
  await broker.record(action, gate.decision, {
    ok: true,
    summary: `agent.turn.diff ${roleId} (${files.length} file(s))`,
    data: { files },
  });
  return { verdict: "accept", files };
}

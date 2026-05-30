// ── Apply-only gateway (Epic S / S4) ────────────────────────────────────────
//
// In strict apply-only mode, write-capable roles run READ-ONLY — they cannot
// touch the disk. Instead they propose a unified diff, and Vibestrate applies
// it on their behalf through this gateway: built-in secret/forbidden-path
// safety → `file.patch` policy decision → audited `git apply` in the worktree →
// recorded evidence. Every change therefore crosses the same boundary an
// agent's direct write would have bypassed.

import { execa } from "execa";
import { checkPatchSafety } from "../reviews/review-suggestion-service.js";
import {
  gateAction,
  type ActionBroker,
  type ActionRequest,
} from "./action-broker.js";

/**
 * Pull a unified diff out of an agent's response. Accepts a ```diff (or
 * ```patch / ```udiff) fenced block, falling back to a raw `diff --git …` body.
 * Returns null when no patch-shaped content is present.
 */
export function extractProposedPatch(output: string): string | null {
  if (!output) return null;
  const fence = output.match(/```(?:diff|patch|udiff)\n([\s\S]*?)```/i);
  if (fence && fence[1] && fence[1].trim()) {
    return fence[1].replace(/\s*$/, "") + "\n";
  }
  // Fallback: a bare unified diff starting at a `diff --git` header.
  const bare = output.match(/(^|\n)(diff --git [\s\S]*)$/);
  if (bare && bare[2] && bare[2].includes("@@")) {
    return bare[2].replace(/\s*$/, "") + "\n";
  }
  return null;
}

export type GatewayApplyResult =
  | { status: "applied"; files: string[] }
  | { status: "no_patch" }
  | { status: "refused"; reason: string };

/**
 * Apply an agent-proposed patch through the broker. Read-only on failure: an
 * unsafe patch, a non-allow policy decision, or a `git apply` failure leaves the
 * worktree untouched (we `--check` before applying).
 */
export async function applyProposedPatchThroughGateway(input: {
  broker: ActionBroker;
  runId: string;
  roleId: string;
  worktree: string;
  output: string;
}): Promise<GatewayApplyResult> {
  const patch = extractProposedPatch(input.output);
  if (!patch) return { status: "no_patch" };

  // Built-in safety first (secret content / forbidden paths).
  const safety = checkPatchSafety(patch, input.worktree);
  if (!safety.ok) {
    return { status: "refused", reason: safety.reason ?? "unsafe patch" };
  }

  // Policy gate (file.patch, op apply-only).
  const action: ActionRequest = {
    runId: input.runId,
    roleId: input.roleId,
    kind: "file.patch",
    subject: {
      op: "apply-only",
      roleId: input.roleId,
      files: safety.touchedFiles,
      worktree: input.worktree,
    },
    proposedBy: "system",
  };
  const gate = await gateAction(input.broker, action);
  if (!gate.allowed) {
    return { status: "refused", reason: `${gate.effect}: ${gate.reason}` };
  }

  // Validate then apply.
  const check = await execa("git", ["apply", "--check", "--whitespace=nowarn"], {
    cwd: input.worktree,
    input: patch,
    reject: false,
    timeout: 10_000,
    stdin: "pipe",
  });
  if (check.exitCode !== 0) {
    const reason = (check.stderr || check.stdout || "git apply --check failed")
      .toString()
      .slice(0, 500);
    await input.broker.record(action, gate.decision, {
      ok: false,
      summary: `apply-only git apply --check rejected ${input.roleId}'s patch`,
    });
    return { status: "refused", reason };
  }
  const applied = await execa("git", ["apply", "--whitespace=nowarn"], {
    cwd: input.worktree,
    input: patch,
    reject: false,
    timeout: 15_000,
    stdin: "pipe",
  });
  if (applied.exitCode !== 0) {
    const reason = (applied.stderr || applied.stdout || "git apply failed")
      .toString()
      .slice(0, 500);
    await input.broker.record(action, gate.decision, {
      ok: false,
      summary: `apply-only git apply failed for ${input.roleId}`,
    });
    return { status: "refused", reason };
  }
  await input.broker.record(action, gate.decision, {
    ok: true,
    summary: `apply-only applied ${input.roleId}'s patch (${safety.touchedFiles.length} file(s))`,
    data: { files: safety.touchedFiles },
  });
  return { status: "applied", files: safety.touchedFiles };
}

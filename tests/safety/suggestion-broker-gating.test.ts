import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { ReviewSuggestionService } from "../../src/reviews/review-suggestion-service.js";
import {
  DefaultActionBroker,
  readActionLog,
  type ActionEvaluator,
} from "../../src/safety/action-broker.js";
import { runStateSchema } from "../../src/core/state-machine.js";
import { ensureDir } from "../../src/utils/fs.js";
import { runStatePath, runDir } from "../../src/utils/paths.js";
import { writeJson } from "../../src/utils/json.js";

/**
 * S0 — Action Broker file.patch gating for single-suggestion apply/revert.
 *
 * Asserts the broker is the boundary every patch crosses:
 *   - a successful apply/revert appends `file.patch` evidence (allow + ok), and
 *   - a deny evaluator fails the apply CLOSED (worktree untouched, denial logged).
 */

async function tempProjectWithWorktree(): Promise<{
  project: string;
  worktree: string;
  runId: string;
}> {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-brk-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: project });
  await execa("git", ["config", "user.email", "x@x"], { cwd: project });
  await execa("git", ["config", "user.name", "x"], { cwd: project });
  await fs.mkdir(path.join(project, "src"), { recursive: true });
  await fs.writeFile(path.join(project, "src/a.ts"), "export const a = 1\n");
  await execa("git", ["add", "."], { cwd: project });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: project });

  await fs.mkdir(path.join(project, ".vibestrate"), { recursive: true });
  await fs.writeFile(
    path.join(project, ".vibestrate/project.yml"),
    [
      "project: { name: demo, type: generic }",
      "providers:",
      "  fake: { type: cli, command: /bin/true, inputMode: stdin }",
      "profiles:",
      "  fake-balanced: { provider: fake }",
      "crews:",
      "  default: { roles: { reviewer: { seats: [reviewer], profile: fake-balanced, prompt: reviewer, permissions: read } } }",
      "defaultCrew: default",
      "commands: { validate: [] }",
      "",
    ].join("\n"),
  );

  const worktree = path.join(
    await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-brk-wt-")),
    "wt",
  );
  await execa(
    "git",
    ["worktree", "add", "-b", "vibestrate/test", worktree, "main"],
    { cwd: project },
  );
  const runId = "brk-1";
  await ensureDir(runDir(project, runId));
  const ts = new Date().toISOString();
  await writeJson(
    runStatePath(project, runId),
    runStateSchema.parse({
      runId,
      task: "broker-gate",
      status: "merge_ready",
      projectRoot: project,
      worktreePath: worktree,
      branchName: "vibestrate/test",
      reviewLoopCount: 0,
      maxReviewLoops: 2,
      startedAt: ts,
      updatedAt: ts,
      finalDecision: null,
      verification: null,
      error: null,
    }),
  );
  return { project, worktree, runId };
}

const PATCH_A = [
  "diff --git a/src/a.ts b/src/a.ts",
  "index 0000000..1111111 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1 +1,2 @@",
  " export const a = 1",
  "+// touched-by-A",
  "",
].join("\n");

describe("S0 file.patch gating — suggestion apply/revert", () => {
  it("records file.patch evidence for a successful apply and revert", async () => {
    const t = await tempProjectWithWorktree();
    try {
      const svc = new ReviewSuggestionService(t.project, t.runId);
      const s = await svc.addManual({ title: "A", proposedPatch: PATCH_A });
      await svc.approve(s.id);

      const applied = await svc.apply(s.id);
      expect(applied.status).toBe("applied");

      let log = await readActionLog(t.project, t.runId);
      const applyRec = log.find(
        (r) =>
          r.request.kind === "file.patch" &&
          r.request.subject.op === "apply" &&
          r.request.subject.suggestionId === s.id,
      );
      expect(applyRec).toBeDefined();
      expect(applyRec!.decision.effect).toBe("allow");
      expect(applyRec!.evidence?.ok).toBe(true);

      const reverted = await svc.revert(s.id);
      expect(reverted.status).toBe("reverted");

      log = await readActionLog(t.project, t.runId);
      const revertRec = log.find(
        (r) =>
          r.request.kind === "file.patch" && r.request.subject.op === "revert",
      );
      expect(revertRec).toBeDefined();
      expect(revertRec!.evidence?.ok).toBe(true);
    } finally {
      await fs.rm(t.project, { recursive: true, force: true });
      await fs.rm(path.dirname(t.worktree), { recursive: true, force: true });
    }
  });

  it("fails closed when an evaluator denies the patch — worktree untouched, denial logged", async () => {
    const t = await tempProjectWithWorktree();
    try {
      const denyPatches: ActionEvaluator = (req) =>
        req.kind === "file.patch"
          ? { effect: "deny", ruleIds: ["test-deny"], reason: "blocked by test" }
          : null;
      const broker = new DefaultActionBroker(t.project, t.runId, {
        evaluators: [denyPatches],
      });
      const svc = new ReviewSuggestionService(t.project, t.runId, { broker });
      const s = await svc.addManual({ title: "A", proposedPatch: PATCH_A });
      await svc.approve(s.id);

      const applied = await svc.apply(s.id);
      // Fail-closed: the patch is refused, not applied.
      expect(applied.status).toBe("failed");
      expect(applied.errorMessage).toContain("blocked by test");

      // The worktree never changed.
      expect(await fs.readFile(path.join(t.worktree, "src/a.ts"), "utf8")).toBe(
        "export const a = 1\n",
      );

      // The denial is on the evidence log, and no allow/ok apply was recorded.
      const log = await readActionLog(t.project, t.runId);
      const patchRecs = log.filter((r) => r.request.kind === "file.patch");
      expect(patchRecs).toHaveLength(1);
      expect(patchRecs[0]!.decision.effect).toBe("deny");
      expect(patchRecs[0]!.evidence).toBeNull();
    } finally {
      await fs.rm(t.project, { recursive: true, force: true });
      await fs.rm(path.dirname(t.worktree), { recursive: true, force: true });
    }
  });
});

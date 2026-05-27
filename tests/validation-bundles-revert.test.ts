import { afterEach, beforeEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { ReviewSuggestionService } from "../src/reviews/review-suggestion-service.js";
import {
  SuggestionBundleError,
  SuggestionBundleService,
} from "../src/reviews/suggestion-bundle-service.js";
import { runStateSchema } from "../src/core/state-machine.js";
import { writeJson } from "../src/utils/json.js";
import { runStatePath, runDir } from "../src/utils/paths.js";
import { ensureDir } from "../src/utils/fs.js";
import { renderFinalReport } from "../src/core/final-report.js";

async function tempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function tempProjectWithWorktree(): Promise<{
  project: string;
  worktree: string;
  runId: string;
}> {
  const project = await tempDir("amaco-vbr-");
  await execa("git", ["init", "-q", "-b", "main"], { cwd: project });
  await execa("git", ["config", "user.email", "x@x"], { cwd: project });
  await execa("git", ["config", "user.name", "x"], { cwd: project });
  await fs.mkdir(path.join(project, "src"), { recursive: true });
  await fs.writeFile(
    path.join(project, "src", "a.ts"),
    "export const a = 1\n",
  );
  await fs.writeFile(
    path.join(project, "src", "b.ts"),
    "export const b = 2\n",
  );
  await execa("git", ["add", "."], { cwd: project });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: project });
  const worktree = path.join(await tempDir("amaco-vbr-wt-"), "wt");
  await execa(
    "git",
    ["worktree", "add", "-b", "amaco/test", worktree, "main"],
    { cwd: project },
  );
  // Set up a minimal .amaco/project.yml with no validation commands by default.
  await fs.mkdir(path.join(project, ".amaco"), { recursive: true });
  await fs.writeFile(
    path.join(project, ".amaco", "project.yml"),
    [
      "project:",
      "  name: demo",
      "  type: generic",
      "providers:",
      "  fake:",
      "    type: cli",
      "    command: /bin/true",
      "    inputMode: stdin",
      "roles:",
      "  planner:",
      "    provider: fake",
      "    prompt: planner",
      "    permissions: read",
      "commands:",
      "  validate: []",
      "",
    ].join("\n"),
  );
  const runId = "run-1";
  await ensureDir(runDir(project, runId));
  const ts = new Date().toISOString();
  await writeJson(
    runStatePath(project, runId),
    runStateSchema.parse({
      runId,
      task: "fixture",
      status: "merge_ready",
      projectRoot: project,
      worktreePath: worktree,
      branchName: "amaco/test",
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

const PATCH_B = [
  "diff --git a/src/b.ts b/src/b.ts",
  "index 0000000..2222222 100644",
  "--- a/src/b.ts",
  "+++ b/src/b.ts",
  "@@ -1 +1,2 @@",
  " export const b = 2",
  "+// touched-by-B",
  "",
].join("\n");

const PATCH_BAD = [
  "diff --git a/src/a.ts b/src/a.ts",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -99 +99,1 @@",
  "-not present",
  "+nope",
  "",
].join("\n");

describe("suggestion validate", () => {
  let project: string;
  let worktree: string;
  let runId: string;
  beforeEach(async () => {
    const t = await tempProjectWithWorktree();
    project = t.project;
    worktree = t.worktree;
    runId = t.runId;
  });

  it("returns no_commands_configured when commands.validate is empty", async () => {
    const svc = new ReviewSuggestionService(project, runId);
    const created = await svc.addManual({
      title: "Touch a",
      proposedPatch: PATCH_A,
    });
    await svc.approve(created.id);
    const after = await svc.apply(created.id);
    expect(after.status).toBe("applied");
    const r = await svc.validate(created.id);
    expect(r.result.status).toBe("no_commands_configured");
    // Persistence:
    const persisted = JSON.parse(
      await fs.readFile(
        path.join(
          project,
          ".amaco",
          "runs",
          runId,
          "suggestion-validations",
          `${created.id}.json`,
        ),
        "utf8",
      ),
    );
    expect(persisted.scopeKind).toBe("suggestion");
    expect(persisted.scopeId).toBe(created.id);
  });

  it("runs the configured command in the worktree and reports passed", async () => {
    await fs.writeFile(
      path.join(project, ".amaco", "project.yml"),
      [
        "project:",
        "  name: demo",
        "  type: generic",
        "providers:",
        "  fake:",
        "    type: cli",
        "    command: /bin/true",
        "    inputMode: stdin",
        "roles:",
        "  planner:",
        "    provider: fake",
        "    prompt: planner",
        "    permissions: read",
        "commands:",
        '  validate: ["true"]',
        "",
      ].join("\n"),
    );
    const svc = new ReviewSuggestionService(project, runId);
    const created = await svc.addManual({
      title: "Touch a",
      proposedPatch: PATCH_A,
    });
    await svc.approve(created.id);
    await svc.apply(created.id);
    const r = await svc.validate(created.id);
    expect(r.result.status).toBe("passed");
    expect(r.suggestion.status).toBe("validation_passed");
    expect(r.result.commands[0]!.exitCode).toBe(0);
    void worktree;
  });

  it("reports failed when a configured command exits non-zero", async () => {
    await fs.writeFile(
      path.join(project, ".amaco", "project.yml"),
      [
        "project:",
        "  name: demo",
        "  type: generic",
        "providers:",
        "  fake:",
        "    type: cli",
        "    command: /bin/true",
        "    inputMode: stdin",
        "roles:",
        "  planner:",
        "    provider: fake",
        "    prompt: planner",
        "    permissions: read",
        "commands:",
        '  validate: ["false"]',
        "",
      ].join("\n"),
    );
    const svc = new ReviewSuggestionService(project, runId);
    const created = await svc.addManual({
      title: "Touch a",
      proposedPatch: PATCH_A,
    });
    await svc.approve(created.id);
    await svc.apply(created.id);
    const r = await svc.validate(created.id);
    expect(r.result.status).toBe("failed");
    expect(r.suggestion.status).toBe("validation_failed");
  });
});

describe("suggestion revert", () => {
  let project: string;
  let worktree: string;
  let runId: string;
  beforeEach(async () => {
    const t = await tempProjectWithWorktree();
    project = t.project;
    worktree = t.worktree;
    runId = t.runId;
  });

  it("reverts a successfully applied patch and restores file contents", async () => {
    const svc = new ReviewSuggestionService(project, runId);
    const created = await svc.addManual({
      title: "Touch a",
      proposedPatch: PATCH_A,
    });
    await svc.approve(created.id);
    await svc.apply(created.id);
    const wtBody = await fs.readFile(path.join(worktree, "src/a.ts"), "utf8");
    expect(wtBody).toContain("touched-by-A");
    const r = await svc.revert(created.id);
    expect(r.status).toBe("reverted");
    const after = await fs.readFile(path.join(worktree, "src/a.ts"), "utf8");
    expect(after).toBe("export const a = 1\n");
  });

  it("records revert_failed and leaves files unchanged when the worktree drifted", async () => {
    const svc = new ReviewSuggestionService(project, runId);
    const created = await svc.addManual({
      title: "Touch a",
      proposedPatch: PATCH_A,
    });
    await svc.approve(created.id);
    await svc.apply(created.id);
    // Drift: the user made an unrelated edit on the same lines.
    await fs.writeFile(
      path.join(worktree, "src/a.ts"),
      "export const a = 999\n",
    );
    const before = await fs.readFile(
      path.join(worktree, "src/a.ts"),
      "utf8",
    );
    const r = await svc.revert(created.id);
    expect(r.status).toBe("revert_failed");
    expect(r.errorMessage ?? "").toMatch(/git apply -R/i);
    const after = await fs.readFile(path.join(worktree, "src/a.ts"), "utf8");
    expect(after).toBe(before);
  });

  it("refuses to revert a suggestion that was never applied", async () => {
    const svc = new ReviewSuggestionService(project, runId);
    const created = await svc.addManual({
      title: "Touch a",
      proposedPatch: PATCH_A,
    });
    await expect(svc.revert(created.id)).rejects.toThrow(/cannot be reverted/i);
  });
});

describe("bundle preflight + apply", () => {
  let project: string;
  let worktree: string;
  let runId: string;
  let svc: ReviewSuggestionService;
  let bsvc: SuggestionBundleService;
  beforeEach(async () => {
    const t = await tempProjectWithWorktree();
    project = t.project;
    worktree = t.worktree;
    runId = t.runId;
    svc = new ReviewSuggestionService(project, runId);
    bsvc = new SuggestionBundleService(project, runId);
  });

  it("rejects duplicate suggestion ids at create time", async () => {
    const a = await svc.addManual({ title: "A", proposedPatch: PATCH_A });
    await expect(
      bsvc.create({ title: "Dup", suggestionIds: [a.id, a.id] }),
    ).rejects.toBeInstanceOf(SuggestionBundleError);
  });

  it("rejects suggestions from a different run", async () => {
    const a = await svc.addManual({ title: "A", proposedPatch: PATCH_A });
    const otherRun = "run-other";
    await ensureDir(runDir(project, otherRun));
    await writeJson(
      runStatePath(project, otherRun),
      runStateSchema.parse({
        runId: otherRun,
        task: "x",
        status: "merge_ready",
        projectRoot: project,
        worktreePath: null,
        branchName: null,
        reviewLoopCount: 0,
        maxReviewLoops: 2,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        finalDecision: null,
        verification: null,
        error: null,
      }),
    );
    const otherBundleSvc = new SuggestionBundleService(project, otherRun);
    await expect(
      otherBundleSvc.create({ title: "X", suggestionIds: [a.id] }),
    ).rejects.toBeInstanceOf(SuggestionBundleError);
  });

  it("preflight rejects a suggestion without a proposed patch", async () => {
    const a = await svc.addManual({ title: "No patch" });
    const b = await bsvc.create({ title: "Pass", suggestionIds: [a.id] });
    await bsvc.approve(b.id);
    const r = await bsvc.preflight(b.id);
    expect(r.ok).toBe(false);
    expect(r.findings[0]!.reason).toMatch(/no proposedPatch/i);
  });

  it("apply runs git apply --check first; bad patch leaves worktree unchanged", async () => {
    const ok = await svc.addManual({ title: "ok", proposedPatch: PATCH_A });
    const bad = await svc.addManual({
      title: "bad",
      proposedPatch: PATCH_BAD,
    });
    const b = await bsvc.create({
      title: "Mixed",
      suggestionIds: [ok.id, bad.id],
    });
    await bsvc.approve(b.id);
    const r = await bsvc.apply(b.id);
    expect(r.bundle.status).toBe("failed");
    const beforeOk = await fs.readFile(
      path.join(worktree, "src/a.ts"),
      "utf8",
    );
    expect(beforeOk).toBe("export const a = 1\n");
  });

  it("applies multiple safe patches in order, all-or-nothing, and stamps suggestions applied", async () => {
    const a = await svc.addManual({ title: "A", proposedPatch: PATCH_A });
    const c = await svc.addManual({ title: "B", proposedPatch: PATCH_B });
    const b = await bsvc.create({
      title: "All good",
      suggestionIds: [a.id, c.id],
    });
    await bsvc.approve(b.id);
    const r = await bsvc.apply(b.id);
    expect(r.bundle.status).toBe("applied");
    const aBody = await fs.readFile(path.join(worktree, "src/a.ts"), "utf8");
    const bBody = await fs.readFile(path.join(worktree, "src/b.ts"), "utf8");
    expect(aBody).toContain("touched-by-A");
    expect(bBody).toContain("touched-by-B");
    // Project root unchanged.
    const projA = await fs.readFile(path.join(project, "src/a.ts"), "utf8");
    expect(projA).not.toContain("touched-by-A");
    // Each member suggestion got stamped applied + linked to bundle.
    const sa = await svc.get(a.id);
    expect(sa?.status).toBe("applied");
    expect(sa?.bundleId).toBe(b.id);
  });

  it("flags same-file warning when two patches touch the same file", async () => {
    // Two different patches against src/a.ts
    const PATCH_A2 = [
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1 +1,2 @@",
      " export const a = 1",
      "+// alt",
      "",
    ].join("\n");
    const a = await svc.addManual({ title: "A1", proposedPatch: PATCH_A });
    const a2 = await svc.addManual({ title: "A2", proposedPatch: PATCH_A2 });
    const b = await bsvc.create({
      title: "Same file",
      suggestionIds: [a.id, a2.id],
    });
    const pre = await bsvc.preflight(b.id);
    expect(pre.sameFileWarnings.length).toBeGreaterThan(0);
    expect(pre.sameFileWarnings[0]!.file).toBe("src/a.ts");
  });
});

describe("bundle revert", () => {
  let project: string;
  let worktree: string;
  let runId: string;
  beforeEach(async () => {
    const t = await tempProjectWithWorktree();
    project = t.project;
    worktree = t.worktree;
    runId = t.runId;
  });

  it("reverts the whole bundle and stamps suggestions reverted", async () => {
    const svc = new ReviewSuggestionService(project, runId);
    const bsvc = new SuggestionBundleService(project, runId);
    const a = await svc.addManual({ title: "A", proposedPatch: PATCH_A });
    const c = await svc.addManual({ title: "B", proposedPatch: PATCH_B });
    const b = await bsvc.create({
      title: "Pass",
      suggestionIds: [a.id, c.id],
    });
    await bsvc.approve(b.id);
    await bsvc.apply(b.id);
    const r = await bsvc.revert(b.id);
    expect(r.status).toBe("reverted");
    const aBody = await fs.readFile(path.join(worktree, "src/a.ts"), "utf8");
    const bBody = await fs.readFile(path.join(worktree, "src/b.ts"), "utf8");
    expect(aBody).toBe("export const a = 1\n");
    expect(bBody).toBe("export const b = 2\n");
    const sa = await svc.get(a.id);
    expect(sa?.status).toBe("reverted");
  });

  it("revert failure leaves the worktree untouched", async () => {
    const svc = new ReviewSuggestionService(project, runId);
    const bsvc = new SuggestionBundleService(project, runId);
    const a = await svc.addManual({ title: "A", proposedPatch: PATCH_A });
    const b = await bsvc.create({ title: "Pass", suggestionIds: [a.id] });
    await bsvc.approve(b.id);
    await bsvc.apply(b.id);
    // Drift: user clobbered the file.
    await fs.writeFile(
      path.join(worktree, "src/a.ts"),
      "export const a = 999\n",
    );
    const beforeBody = await fs.readFile(
      path.join(worktree, "src/a.ts"),
      "utf8",
    );
    const r = await bsvc.revert(b.id);
    expect(r.status).toBe("revert_failed");
    const afterBody = await fs.readFile(
      path.join(worktree, "src/a.ts"),
      "utf8",
    );
    expect(afterBody).toBe(beforeBody);
  });
});

describe("final report — bundles section", () => {
  it("renders an empty notice when no bundles exist", () => {
    const ts = "2026-05-10T00:00:00.000Z";
    const md = renderFinalReport({
      state: runStateSchema.parse({
        runId: "r1",
        task: "t",
        status: "merge_ready",
        projectRoot: "/p",
        worktreePath: null,
        branchName: null,
        reviewLoopCount: 0,
        maxReviewLoops: 2,
        startedAt: ts,
        updatedAt: ts,
        finalDecision: "APPROVED",
        verification: "PASSED",
        error: null,
      }),
      artifactPaths: {},
      validation: null,
      policyWarnings: [],
      reviewLoops: 0,
      metrics: null,
      approvals: [],
    });
    expect(md).toContain("## Review Passes");
    expect(md).toContain("_No review passes were created for this run._");
  });

  it("renders bundle rows with status counts", () => {
    const ts = "2026-05-10T00:00:00.000Z";
    const md = renderFinalReport({
      state: runStateSchema.parse({
        runId: "r1",
        task: "t",
        status: "merge_ready",
        projectRoot: "/p",
        worktreePath: null,
        branchName: null,
        reviewLoopCount: 0,
        maxReviewLoops: 2,
        startedAt: ts,
        updatedAt: ts,
        finalDecision: "APPROVED",
        verification: "PASSED",
        error: null,
      }),
      artifactPaths: {},
      validation: null,
      policyWarnings: [],
      reviewLoops: 0,
      metrics: null,
      approvals: [],
      bundles: [
        {
          id: "b-1",
          runId: "r1",
          title: "Reviewer fixes",
          description: "",
          createdAt: ts,
          updatedAt: ts,
          status: "applied",
          suggestionIds: ["s-1", "s-2"],
          approvalId: "ap-1",
          validationResultPath:
            "suggestion-bundle-validations/b-1.json",
          createdBy: "local-user",
          decisionNote: null,
          appliedAt: ts,
          revertedAt: null,
          errorMessage: null,
          appliedPatchPath: "suggestion-bundles/b-1-applied.patch",
          reversePatchPath: "suggestion-bundles/b-1-reverse.patch",
          touchedFiles: ["src/a.ts", "src/b.ts"],
          sameFileWarnings: [],
          validationProfile: null,
        },
      ],
    });
    expect(md).toContain("Reviewer fixes");
    expect(md).toContain("**applied:** 1");
  });
});

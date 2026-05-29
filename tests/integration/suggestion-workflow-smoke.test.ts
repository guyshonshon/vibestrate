import { afterEach, beforeEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { ReviewSuggestionService } from "../../src/reviews/review-suggestion-service.js";
import { SuggestionBundleService } from "../../src/reviews/suggestion-bundle-service.js";
import { runStateSchema } from "../../src/core/state-machine.js";
import { ensureDir } from "../../src/utils/fs.js";
import { runStatePath, runDir } from "../../src/utils/paths.js";
import { writeJson } from "../../src/utils/json.js";

/**
 * End-to-end smoke for the full reviewer-suggestion workflow:
 *   ingest from marker artifact → approve → apply → validate → revert,
 *   plus bundle smart-apply success / stop / revert-failing variants.
 *
 * Drives the real services without spinning up a real Claude provider.
 * Asserts that:
 *   - the project root is NEVER modified
 *   - patches that flow through the parser apply cleanly
 *   - validation only runs when commands.validate is configured
 *   - revert restores the worktree byte-for-byte
 *   - smart apply leaves prior passing steps applied when a later step fails
 */

async function tempProjectWithWorktree(opts: {
  validateCommands?: string[];
} = {}): Promise<{ project: string; worktree: string; runId: string }> {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-int-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: project });
  await execa("git", ["config", "user.email", "x@x"], { cwd: project });
  await execa("git", ["config", "user.name", "x"], { cwd: project });
  await fs.mkdir(path.join(project, "src"), { recursive: true });
  await fs.writeFile(
    path.join(project, "src/a.ts"),
    "export const a = 1\n",
  );
  await fs.writeFile(
    path.join(project, "src/b.ts"),
    "export const b = 2\n",
  );
  await execa("git", ["add", "."], { cwd: project });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: project });

  const validateLine = `commands: { validate: ${JSON.stringify(opts.validateCommands ?? [])} }`;
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
      validateLine,
      "",
    ].join("\n"),
  );

  const worktree = path.join(
    await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-int-wt-")),
    "wt",
  );
  await execa(
    "git",
    ["worktree", "add", "-b", "vibestrate/test", worktree, "main"],
    { cwd: project },
  );
  const runId = "smoke-1";
  await ensureDir(runDir(project, runId));
  const ts = new Date().toISOString();
  await writeJson(
    runStatePath(project, runId),
    runStateSchema.parse({
      runId,
      task: "smoke",
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

function reviewerArtifact(opts: {
  title: string;
  file: string;
  patch: string;
}): string {
  return [
    "# Reviewer",
    "",
    "Looks fine, but:",
    "",
    "VIBESTRATE_SUGGESTION:",
    `TITLE: ${opts.title}`,
    `FILE: ${opts.file}`,
    "BODY:",
    "Capture this in the worktree.",
    "PROPOSED_PATCH:",
    opts.patch,
    "VIBESTRATE_SUGGESTION_END",
    "",
  ].join("\n");
}

describe("integration: full suggestion workflow from marker artifact", () => {
  let project: string;
  let worktree: string;
  let runId: string;

  beforeEach(async () => {
    const t = await tempProjectWithWorktree({ validateCommands: ["true"] });
    project = t.project;
    worktree = t.worktree;
    runId = t.runId;
    await ensureDir(path.join(runDir(project, runId), "artifacts"));
    await fs.writeFile(
      path.join(runDir(project, runId), "artifacts/09-review.md"),
      reviewerArtifact({
        title: "Add note to a.ts",
        file: "src/a.ts",
        patch: PATCH_A,
      }),
    );
  });

  it("ingests the marker, approves, applies, validates, and reverts cleanly", async () => {
    const svc = new ReviewSuggestionService(project, runId);
    const ingested = await svc.ingestArtifact({
      artifactRelPath: "artifacts/09-review.md",
      artifactBody: await fs.readFile(
        path.join(runDir(project, runId), "artifacts/09-review.md"),
        "utf8",
      ),
      source: "reviewer",
    });
    expect(ingested).toHaveLength(1);
    const sid = ingested[0]!.id;

    await svc.approve(sid);
    const applied = await svc.apply(sid);
    expect(applied.status).toBe("applied");
    expect(
      await fs.readFile(path.join(worktree, "src/a.ts"), "utf8"),
    ).toContain("touched-by-A");
    // Project root must remain untouched.
    expect(
      await fs.readFile(path.join(project, "src/a.ts"), "utf8"),
    ).not.toContain("touched-by-A");

    const v = await svc.validate(sid);
    expect(v.result.status).toBe("passed");
    expect(v.suggestion.status).toBe("validation_passed");

    const reverted = await svc.revert(sid);
    expect(reverted.status).toBe("reverted");
    expect(await fs.readFile(path.join(worktree, "src/a.ts"), "utf8")).toBe(
      "export const a = 1\n",
    );
  });
});

describe("integration: apply --validate --auto-revert-on-fail", () => {
  it("auto-reverts when validation fails, leaves worktree clean", async () => {
    const t = await tempProjectWithWorktree({ validateCommands: ["false"] });
    const svc = new ReviewSuggestionService(t.project, t.runId);
    const s = await svc.addManual({ title: "A", proposedPatch: PATCH_A });
    await svc.approve(s.id);
    const r = await svc.apply(s.id, {
      validateAfterApply: true,
      autoRevertOnValidationFail: true,
    });
    expect(r.status).toBe("reverted_after_validation_failed");
    expect(
      await fs.readFile(path.join(t.worktree, "src/a.ts"), "utf8"),
    ).toBe("export const a = 1\n");
  });

  it("does NOT auto-revert when commands.validate is empty", async () => {
    const t = await tempProjectWithWorktree({ validateCommands: [] });
    const svc = new ReviewSuggestionService(t.project, t.runId);
    const s = await svc.addManual({ title: "A", proposedPatch: PATCH_A });
    await svc.approve(s.id);
    const r = await svc.apply(s.id, {
      validateAfterApply: true,
      autoRevertOnValidationFail: true,
    });
    expect(r.status).toBe("applied"); // validation skipped → no auto-revert
    expect(
      await fs.readFile(path.join(t.worktree, "src/a.ts"), "utf8"),
    ).toContain("touched-by-A");
  });

  it("flips to validation_passed when validation succeeds (no revert)", async () => {
    const t = await tempProjectWithWorktree({ validateCommands: ["true"] });
    const svc = new ReviewSuggestionService(t.project, t.runId);
    const s = await svc.addManual({ title: "A", proposedPatch: PATCH_A });
    await svc.approve(s.id);
    const r = await svc.apply(s.id, {
      validateAfterApply: true,
      autoRevertOnValidationFail: true,
    });
    expect(r.status).toBe("validation_passed");
    expect(
      await fs.readFile(path.join(t.worktree, "src/a.ts"), "utf8"),
    ).toContain("touched-by-A");
  });
});

describe("integration: bundle apply --validate --auto-revert-on-fail", () => {
  it("validates, fails, and auto-reverts the whole bundle", async () => {
    const t = await tempProjectWithWorktree({ validateCommands: ["false"] });
    const svc = new ReviewSuggestionService(t.project, t.runId);
    const bsvc = new SuggestionBundleService(t.project, t.runId);
    const a = await svc.addManual({ title: "A", proposedPatch: PATCH_A });
    const b = await svc.addManual({ title: "B", proposedPatch: PATCH_B });
    const bundle = await bsvc.create({
      title: "Pass",
      suggestionIds: [a.id, b.id],
    });
    await bsvc.approve(bundle.id);
    const r = await bsvc.apply(bundle.id, {
      validateAfterApply: true,
      autoRevertOnValidationFail: true,
    });
    expect(r.bundle.status).toBe("reverted_after_validation_failed");
    expect(
      await fs.readFile(path.join(t.worktree, "src/a.ts"), "utf8"),
    ).toBe("export const a = 1\n");
    expect(
      await fs.readFile(path.join(t.worktree, "src/b.ts"), "utf8"),
    ).toBe("export const b = 2\n");
  });
});

describe("integration: bundle smartApply", () => {
  it("applies every step when validation passes throughout", async () => {
    const t = await tempProjectWithWorktree({ validateCommands: ["true"] });
    const svc = new ReviewSuggestionService(t.project, t.runId);
    const bsvc = new SuggestionBundleService(t.project, t.runId);
    const a = await svc.addManual({ title: "A", proposedPatch: PATCH_A });
    const b = await svc.addManual({ title: "B", proposedPatch: PATCH_B });
    const bundle = await bsvc.create({
      title: "Pass",
      suggestionIds: [a.id, b.id],
    });
    await bsvc.approve(bundle.id);
    const r = await bsvc.smartApply(bundle.id, {
      validateEachStep: true,
      autoRevertFailing: true,
    });
    expect(r.bundle.status).toBe("smart_applied");
    expect(r.result.steps).toHaveLength(2);
    expect(r.result.steps[0]!.applyStatus).toBe("applied");
    expect(r.result.steps[1]!.applyStatus).toBe("applied");
    expect(r.result.failedAt).toBeNull();
    // Persisted result file is reachable.
    const resultAbs = path.join(
      runDir(t.project, t.runId),
      r.result.resultPath,
    );
    const persisted = JSON.parse(await fs.readFile(resultAbs, "utf8"));
    expect(persisted.finalStatus).toBe("smart_applied");
  });

  it("stops at first failing validation; prior step stays applied", async () => {
    // Use a script that passes the first time, fails the second.
    const t = await tempProjectWithWorktree({ validateCommands: [] });
    const flagFile = path.join(t.project, "validate-counter");
    const validateScript = path.join(t.project, "validate.sh");
    await fs.writeFile(
      validateScript,
      [
        "#!/usr/bin/env bash",
        `if [ -f "${flagFile}" ]; then exit 1; fi`,
        `touch "${flagFile}"`,
        "exit 0",
      ].join("\n"),
    );
    await fs.chmod(validateScript, 0o755);
    await fs.writeFile(
      path.join(t.project, ".vibestrate/project.yml"),
      [
        "project: { name: demo, type: generic }",
        "providers:",
        "  fake: { type: cli, command: /bin/true, inputMode: stdin }",
        "profiles:",
        "  fake-balanced: { provider: fake }",
        "crews:",
        "  default: { roles: { reviewer: { seats: [reviewer], profile: fake-balanced, prompt: reviewer, permissions: read } } }",
        "defaultCrew: default",
        `commands: { validate: ["${validateScript}"] }`,
        "",
      ].join("\n"),
    );

    const svc = new ReviewSuggestionService(t.project, t.runId);
    const bsvc = new SuggestionBundleService(t.project, t.runId);
    const a = await svc.addManual({ title: "A", proposedPatch: PATCH_A });
    const b = await svc.addManual({ title: "B", proposedPatch: PATCH_B });
    const bundle = await bsvc.create({
      title: "Pass",
      suggestionIds: [a.id, b.id],
    });
    await bsvc.approve(bundle.id);
    const r = await bsvc.smartApply(bundle.id, {
      validateEachStep: true,
      autoRevertFailing: false,
    });
    expect(r.bundle.status).toBe("smart_stopped");
    expect(r.result.failedAt).toBe(1);
    expect(r.result.steps[0]!.applyStatus).toBe("applied");
    expect(r.result.steps[0]!.validation?.status).toBe("passed");
    expect(r.result.steps[1]!.applyStatus).toBe("applied");
    expect(r.result.steps[1]!.validation?.status).toBe("failed");
    expect(r.result.steps[1]!.revertStatus).toBeNull();
    // Worktree retains BOTH patches because we did not auto-revert.
    expect(
      await fs.readFile(path.join(t.worktree, "src/a.ts"), "utf8"),
    ).toContain("touched-by-A");
    expect(
      await fs.readFile(path.join(t.worktree, "src/b.ts"), "utf8"),
    ).toContain("touched-by-B");
  });

  it("autoRevertFailing reverts the failing step only; earlier step stays applied", async () => {
    const t = await tempProjectWithWorktree({ validateCommands: [] });
    const flagFile = path.join(t.project, "validate-counter2");
    const validateScript = path.join(t.project, "validate.sh");
    await fs.writeFile(
      validateScript,
      [
        "#!/usr/bin/env bash",
        `if [ -f "${flagFile}" ]; then exit 1; fi`,
        `touch "${flagFile}"`,
        "exit 0",
      ].join("\n"),
    );
    await fs.chmod(validateScript, 0o755);
    await fs.writeFile(
      path.join(t.project, ".vibestrate/project.yml"),
      [
        "project: { name: demo, type: generic }",
        "providers:",
        "  fake: { type: cli, command: /bin/true, inputMode: stdin }",
        "profiles:",
        "  fake-balanced: { provider: fake }",
        "crews:",
        "  default: { roles: { reviewer: { seats: [reviewer], profile: fake-balanced, prompt: reviewer, permissions: read } } }",
        "defaultCrew: default",
        `commands: { validate: ["${validateScript}"] }`,
        "",
      ].join("\n"),
    );

    const svc = new ReviewSuggestionService(t.project, t.runId);
    const bsvc = new SuggestionBundleService(t.project, t.runId);
    const a = await svc.addManual({ title: "A", proposedPatch: PATCH_A });
    const b = await svc.addManual({ title: "B", proposedPatch: PATCH_B });
    const bundle = await bsvc.create({
      title: "Pass",
      suggestionIds: [a.id, b.id],
    });
    await bsvc.approve(bundle.id);
    const r = await bsvc.smartApply(bundle.id, {
      validateEachStep: true,
      autoRevertFailing: true,
    });
    expect(r.bundle.status).toBe("smart_reverted_failing");
    expect(r.result.failedAt).toBe(1);
    expect(r.result.steps[0]!.applyStatus).toBe("applied");
    expect(r.result.steps[1]!.revertStatus).toBe("reverted");
    // Worktree: A still applied, B reverted to original.
    expect(
      await fs.readFile(path.join(t.worktree, "src/a.ts"), "utf8"),
    ).toContain("touched-by-A");
    expect(
      await fs.readFile(path.join(t.worktree, "src/b.ts"), "utf8"),
    ).toBe("export const b = 2\n");
  });
});

describe("integration: smart apply rejects unsafe preflight", () => {
  it("never modifies the worktree when preflight finds a bad patch", async () => {
    const t = await tempProjectWithWorktree({ validateCommands: ["true"] });
    const svc = new ReviewSuggestionService(t.project, t.runId);
    const bsvc = new SuggestionBundleService(t.project, t.runId);
    const ok = await svc.addManual({ title: "ok", proposedPatch: PATCH_A });
    const bad = await svc.addManual({
      title: "bad",
      // Targets .env — secret-file rejection.
      proposedPatch:
        "diff --git a/.env b/.env\n--- a/.env\n+++ b/.env\n@@\n-A=1\n+A=2\n",
    });
    const bundle = await bsvc.create({
      title: "Mixed",
      suggestionIds: [ok.id, bad.id],
    });
    await bsvc.approve(bundle.id);
    const r = await bsvc.smartApply(bundle.id);
    expect(r.bundle.status).toBe("smart_failed");
    // Worktree must be untouched.
    expect(
      await fs.readFile(path.join(t.worktree, "src/a.ts"), "utf8"),
    ).toBe("export const a = 1\n");
  });
});

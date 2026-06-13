import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { RunStateStore, createInitialState } from "../src/core/state-machine.js";
import {
  analyzeMergeDeeper,
  MergeAnalyzeError,
} from "../src/integration/merge-analyze.js";
import type { AssistProviderRunner } from "../src/assist/assist-runner.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

/** A fake assist runner returning a fixed JSON analysis. Captures the prompt
 *  so tests can assert what content reached the provider. */
function fakeRunner(
  json: unknown,
  capture?: { prompt?: string },
): AssistProviderRunner {
  return async (_providers, input) => {
    if (capture) capture.prompt = input.prompt;
    return {
      exitCode: 0,
      normalized: { responseText: JSON.stringify(json), metrics: null },
    };
  };
}

const GOOD: unknown = {
  summary: "Adds a small endpoint; low risk.",
  findings: [
    { area: "error-handling", severity: "caution", detail: "No timeout on the fetch." },
  ],
  confidence: "medium",
  caveats: ["Did not see the test suite."],
};

async function git(cwd: string, ...args: string[]) {
  await execa("git", args, { cwd });
}

async function makeRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-analyze-"));
  await git(dir, "init", "-q", "-b", "main");
  await git(dir, "config", "user.email", "x@x");
  await git(dir, "config", "user.name", "x");
  await fs.writeFile(path.join(dir, "base.txt"), "one\n");
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await git(dir, "add", ".");
  await git(dir, "commit", "-q", "-m", "base");
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  await setConfigValue(dir, "git.worktreeDir", path.join(dir, "worktrees"));
  await git(dir, "add", ".");
  await git(dir, "commit", "-q", "-m", "setup");
  return dir;
}

async function branch(dir: string, name: string, fn: () => Promise<void>) {
  await git(dir, "checkout", "-q", "-b", name, "main");
  await fn();
  await git(dir, "add", ".");
  await git(dir, "commit", "-q", "-m", name);
  await git(dir, "checkout", "-q", "main");
}

async function mergeReadyRun(dir: string, runId: string, branchName: string, task = "task") {
  const store = new RunStateStore(dir, runId);
  let s = createInitialState({
    runId,
    task,
    projectRoot: dir,
    worktreePath: null,
    branchName,
    maxReviewLoops: 2,
  });
  s = { ...s, status: "merge_ready" as const, branchName };
  await store.write(s);
}

describe("analyzeMergeDeeper", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeRepo();
  });

  it("analyzes a merge-ready run and caches the markdown artifact", async () => {
    await branch(dir, "feat-a", async () =>
      fs.writeFile(path.join(dir, "a.txt"), "hello A\n"),
    );
    await mergeReadyRun(dir, "r1", "feat-a", "add a.txt");

    const cap: { prompt?: string } = {};
    const res = await analyzeMergeDeeper({
      projectRoot: dir,
      runId: "r1",
      runner: fakeRunner(GOOD, cap),
    });

    expect(res.analysis.summary).toMatch(/low risk/i);
    expect(res.analysis.findings[0]!.area).toBe("error-handling");
    expect(res.context.filesInDiff).toBe(1);
    // The actual diff content reached the provider.
    expect(cap.prompt).toContain("a.txt");
    expect(cap.prompt).toContain("hello A");
    // Instruction forbids a merge verdict.
    expect(cap.prompt).toMatch(/never say 'safe to merge'/i);

    // Cached artifact exists on disk.
    const md = await fs.readFile(
      path.join(dir, ".vibestrate", "runs", "r1", "artifacts", "merge-analysis.md"),
      "utf8",
    );
    expect(md).toMatch(/Merge analysis/);
    expect(md).toMatch(/Advisory only/);
  });

  it("suppresses secret-like file bodies and redacts secret-shaped tokens", async () => {
    await branch(dir, "feat-sec", async () => {
      await fs.writeFile(path.join(dir, ".env"), "API_KEY=AKIAIOSFODNN7EXAMPLE\n");
      await fs.writeFile(
        path.join(dir, "config.ts"),
        'export const k = "AKIAIOSFODNN7EXAMPLE";\n',
      );
    });
    await mergeReadyRun(dir, "r2", "feat-sec");

    const cap: { prompt?: string } = {};
    const res = await analyzeMergeDeeper({
      projectRoot: dir,
      runId: "r2",
      runner: fakeRunner(GOOD, cap),
    });

    // .env is listed as suppressed, its body never sent.
    expect(res.context.suppressedSecretFiles).toContain(".env");
    expect(cap.prompt).not.toContain("API_KEY=AKIAIOSFODNN7EXAMPLE");
    // The AWS-key-shaped literal in config.ts is redacted, not passed through.
    expect(res.context.redactedTokenCount).toBeGreaterThan(0);
    expect(cap.prompt).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(cap.prompt).toContain("[REDACTED:");
  });

  it("reports files other merge-ready runs also touch (overlap)", async () => {
    await branch(dir, "feat-x", async () =>
      fs.writeFile(path.join(dir, "shared.txt"), "x\n"),
    );
    await branch(dir, "feat-y", async () =>
      fs.writeFile(path.join(dir, "shared.txt"), "y\n"),
    );
    await mergeReadyRun(dir, "rx", "feat-x");
    await mergeReadyRun(dir, "ry", "feat-y");

    const res = await analyzeMergeDeeper({
      projectRoot: dir,
      runId: "rx",
      runner: fakeRunner(GOOD),
    });
    const overlap = res.context.overlaps.find((o) => o.file === "shared.txt");
    expect(overlap).toBeTruthy();
    expect(overlap!.otherRunIds).toContain("ry");
  });

  it("redacts a secret-shaped token in the task string and a file path header", async () => {
    await branch(dir, "feat-tok", async () =>
      // File path itself carries an AWS-key-shaped token.
      fs.writeFile(path.join(dir, "AKIAIOSFODNN7EXAMPLE.txt"), "ordinary content\n"),
    );
    await mergeReadyRun(
      dir,
      "rtok",
      "feat-tok",
      "leak AKIAIOSFODNN7EXAMPLE into the task",
    );
    const cap: { prompt?: string } = {};
    await analyzeMergeDeeper({
      projectRoot: dir,
      runId: "rtok",
      runner: fakeRunner(GOOD, cap),
    });
    // Neither the task string nor the file-path header leaks the raw token.
    expect(cap.prompt).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(cap.prompt).toContain("[REDACTED:");
  });

  it("rejects a path-traversal run id before touching the filesystem", async () => {
    await expect(
      analyzeMergeDeeper({
        projectRoot: dir,
        runId: "../../etc/passwd",
        runner: fakeRunner(GOOD),
      }),
    ).rejects.toThrow(/Invalid run id/);
  });

  it("refuses a run that is not merge-ready", async () => {
    await branch(dir, "feat-a", async () =>
      fs.writeFile(path.join(dir, "a.txt"), "A\n"),
    );
    const store = new RunStateStore(dir, "r3");
    await store.write(
      createInitialState({
        runId: "r3",
        task: "t",
        projectRoot: dir,
        worktreePath: null,
        branchName: "feat-a",
        maxReviewLoops: 2,
      }),
    );
    await expect(
      analyzeMergeDeeper({ projectRoot: dir, runId: "r3", runner: fakeRunner(GOOD) }),
    ).rejects.toThrow(MergeAnalyzeError);
  });

  it("surfaces a provider failure as a clear error, not a silent pass", async () => {
    await branch(dir, "feat-a", async () =>
      fs.writeFile(path.join(dir, "a.txt"), "A\n"),
    );
    await mergeReadyRun(dir, "r4", "feat-a");
    const failing: AssistProviderRunner = async () => ({
      exitCode: 1,
      normalized: { responseText: "", metrics: null },
    });
    await expect(
      analyzeMergeDeeper({ projectRoot: dir, runId: "r4", runner: failing }),
    ).rejects.toThrow(MergeAnalyzeError);
  });
});

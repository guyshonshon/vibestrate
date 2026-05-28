import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import {
  buildProjectRoots,
  PathGuardError,
  resolveSafePath,
} from "../src/core/path-guard.js";
import { buildFileTree } from "../src/core/file-tree-service.js";
import {
  FileViewError,
  viewFile,
} from "../src/core/file-view-service.js";
import {
  annotateExistence,
  parseCodeReferences,
} from "../src/core/code-reference-service.js";
import {
  getGitHistory,
  getGitStatus,
} from "../src/core/git-history-service.js";
import { getRoleWork } from "../src/core/agent-work-attribution-service.js";
import { MetricsStore } from "../src/core/metrics-store.js";
import { runStateSchema } from "../src/core/state-machine.js";
import { writeJson } from "../src/utils/json.js";
import { runStatePath, runDir } from "../src/utils/paths.js";
import { ensureDir } from "../src/utils/fs.js";

async function tempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-codeaware-"));
}

describe("path-guard", () => {
  let project: string;
  beforeEach(async () => {
    project = await tempProject();
    await fs.mkdir(path.join(project, "src"), { recursive: true });
    await fs.writeFile(path.join(project, "src", "ok.ts"), "export const x=1\n");
    await fs.writeFile(path.join(project, ".env"), "SECRET=abc\n");
  });

  it("resolves a relative path inside the project root", async () => {
    const r = await resolveSafePath(
      "src/ok.ts",
      buildProjectRoots({ projectRoot: project }),
    );
    expect(r.relativePath).toBe("src/ok.ts");
    expect(r.root.kind).toBe("project");
  });

  it("rejects ..", async () => {
    await expect(
      resolveSafePath("../etc/passwd", buildProjectRoots({ projectRoot: project })),
    ).rejects.toBeInstanceOf(PathGuardError);
  });

  it("rejects an absolute path that escapes the root", async () => {
    await expect(
      resolveSafePath("/etc/hosts", buildProjectRoots({ projectRoot: project })),
    ).rejects.toBeInstanceOf(PathGuardError);
  });

  it("flags secret-like files", async () => {
    const r = await resolveSafePath(
      ".env",
      buildProjectRoots({ projectRoot: project }),
    );
    expect(r.isSecretLike).toBe(true);
  });

  it("rejects symlinks that escape the root", async () => {
    const outside = await tempProject();
    await fs.writeFile(path.join(outside, "leak"), "leak");
    await fs.symlink(path.join(outside, "leak"), path.join(project, "leak"));
    await expect(
      resolveSafePath("leak", buildProjectRoots({ projectRoot: project })),
    ).rejects.toBeInstanceOf(PathGuardError);
  });
});

describe("file-tree", () => {
  let project: string;
  beforeEach(async () => {
    project = await tempProject();
    await fs.mkdir(path.join(project, "src", "lib"), { recursive: true });
    await fs.writeFile(path.join(project, "src", "ok.ts"), "x\n");
    await fs.writeFile(path.join(project, "src", "lib", "util.ts"), "y\n");
    await fs.writeFile(path.join(project, ".env"), "S=1\n");
    await fs.mkdir(path.join(project, "node_modules", "a"), { recursive: true });
    await fs.writeFile(
      path.join(project, "node_modules", "a", "x.ts"),
      "noise",
    );
    await fs.mkdir(path.join(project, "dist"), { recursive: true });
    await fs.writeFile(path.join(project, "dist", "out.js"), "noise");
    await fs.mkdir(path.join(project, ".git"), { recursive: true });
    await fs.writeFile(path.join(project, ".git", "config"), "noise");
    await fs.mkdir(path.join(project, ".vibestrate"), { recursive: true });
    await fs.writeFile(path.join(project, ".vibestrate", "project.yml"), "noise");
  });

  it("excludes node_modules / dist / .git and hides .env when includeHidden is false", async () => {
    const r = await buildFileTree({
      rootPath: project,
      rootKind: "project",
      rootLabel: "p",
    });
    const names = (r.tree.children ?? []).map((c) => c.name);
    expect(names).not.toContain("node_modules");
    expect(names).not.toContain("dist");
    expect(names).not.toContain(".git");
    expect(names).not.toContain(".vibestrate");
    expect(names).not.toContain(".env");
  });

  it("includes .vibestrate when includeVibestrate=true and .env when includeHidden=true with secret-like flag", async () => {
    const r = await buildFileTree({
      rootPath: project,
      rootKind: "project",
      rootLabel: "p",
      includeHidden: true,
      includeVibestrate: true,
    });
    const names = (r.tree.children ?? []).map((c) => c.name);
    expect(names).toContain(".vibestrate");
    const env = (r.tree.children ?? []).find((c) => c.name === ".env");
    expect(env).toBeDefined();
    expect(env!.isSecretLike).toBe(true);
  });

  it("sorts folders before files at every level", async () => {
    const r = await buildFileTree({
      rootPath: project,
      rootKind: "project",
      rootLabel: "p",
    });
    const top = r.tree.children ?? [];
    const dirIdx = top.findIndex((c) => c.kind === "directory");
    const fileIdx = top.findIndex((c) => c.kind === "file");
    if (dirIdx !== -1 && fileIdx !== -1) {
      expect(dirIdx).toBeLessThan(fileIdx);
    }
  });

  it("respects depth limit", async () => {
    const r = await buildFileTree({
      rootPath: project,
      rootKind: "project",
      rootLabel: "p",
      depth: 1,
    });
    const src = (r.tree.children ?? []).find((c) => c.name === "src");
    expect(src).toBeDefined();
    expect(src!.truncated).toBe(true);
  });
});

describe("file-view", () => {
  let project: string;
  beforeEach(async () => {
    project = await tempProject();
    await fs.mkdir(path.join(project, "src"), { recursive: true });
    await fs.writeFile(
      path.join(project, "src", "long.ts"),
      Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join("\n") + "\n",
    );
    await fs.writeFile(path.join(project, ".env"), "SUPER=secret\n");
    await fs.writeFile(path.join(project, "tiny.png"), Buffer.from([0, 1, 2, 0, 4]));
  });

  it("returns numbered lines and totalLines", async () => {
    const r = await viewFile({
      resolved: await resolveSafePath(
        "src/long.ts",
        buildProjectRoots({ projectRoot: project }),
      ),
    });
    expect(r.totalLines).toBeGreaterThanOrEqual(100);
    expect(r.lines[0]!.number).toBe(1);
    expect(r.lines[0]!.text).toBe("line 1");
  });

  it("supports line ranges", async () => {
    const r = await viewFile({
      resolved: await resolveSafePath(
        "src/long.ts",
        buildProjectRoots({ projectRoot: project }),
      ),
      lineStart: 10,
      lineEnd: 12,
    });
    expect(r.lines.length).toBe(3);
    expect(r.lines[0]!.number).toBe(10);
    expect(r.lines[2]!.text).toBe("line 12");
    expect(r.isTruncated).toBe(true);
  });

  it("never returns lines for a .env file", async () => {
    const r = await viewFile({
      resolved: await resolveSafePath(
        ".env",
        buildProjectRoots({ projectRoot: project }),
      ),
    });
    expect(r.lines).toHaveLength(0);
    expect(r.isSecretLike).toBe(true);
    expect(r.notice).toMatch(/secret/i);
  });

  it("flags binary files", async () => {
    const r = await viewFile({
      resolved: await resolveSafePath(
        "tiny.png",
        buildProjectRoots({ projectRoot: project }),
      ),
    });
    expect(r.isBinary).toBe(true);
    expect(r.lines).toHaveLength(0);
  });

  it("404s on missing file", async () => {
    await expect(
      viewFile({
        resolved: await resolveSafePath(
          "nope.txt",
          buildProjectRoots({ projectRoot: project }),
        ),
      }),
    ).rejects.toBeInstanceOf(FileViewError);
  });
});

describe("code-reference parser", () => {
  it("parses path:line, ranges, #L, #L-L, line-N suffix, and bare paths", () => {
    const text = [
      "see src/foo.ts",
      "fix src/foo.ts:42",
      "rewrite src/foo.ts:5-10 quickly",
      "check src/bar.ts#L7 thanks",
      "scan src/bar.ts#L10-L15",
      "look at apps/api/foo.ts line 12",
    ].join("\n");
    const refs = parseCodeReferences({ text });
    const byRaw = (s: string) => refs.find((r) => r.raw.includes(s));
    expect(refs.length).toBeGreaterThanOrEqual(6);
    expect(byRaw("foo.ts:42")?.lineStart).toBe(42);
    expect(byRaw("foo.ts:5-10")?.lineStart).toBe(5);
    expect(byRaw("foo.ts:5-10")?.lineEnd).toBe(10);
    expect(byRaw("bar.ts#L7")?.lineStart).toBe(7);
    expect(byRaw("bar.ts#L10-L15")?.lineEnd).toBe(15);
    expect(byRaw("apps/api/foo.ts line 12")?.lineStart).toBe(12);
  });

  it("annotates existence under a real project", async () => {
    const project = await tempProject();
    await fs.mkdir(path.join(project, "src"), { recursive: true });
    await fs.writeFile(path.join(project, "src", "real.ts"), "x\n");
    const refs = parseCodeReferences({
      text: "see src/real.ts:1 and src/missing.ts:2",
    });
    const annotated = await annotateExistence(refs, { projectRoot: project });
    const real = annotated.find((r) => r.file === "src/real.ts");
    const missing = annotated.find((r) => r.file === "src/missing.ts");
    expect(real?.existsInProject).toBe(true);
    expect(missing?.existsInProject).toBe(false);
  });

  it("doesn't double-claim characters in path:line + bare-path patterns", () => {
    const refs = parseCodeReferences({ text: "src/foo.ts:42" });
    expect(refs).toHaveLength(1);
    expect(refs[0]!.lineStart).toBe(42);
  });
});

describe("git status / history", () => {
  let project: string;
  beforeEach(async () => {
    project = await tempProject();
    await execa("git", ["init", "-q", "-b", "main"], { cwd: project });
    await execa("git", ["config", "user.email", "x@x"], { cwd: project });
    await execa("git", ["config", "user.name", "x"], { cwd: project });
    await fs.writeFile(path.join(project, "a.txt"), "a\n");
    await execa("git", ["add", "."], { cwd: project });
    await execa("git", ["commit", "-q", "-m", "first"], { cwd: project });
    await fs.writeFile(path.join(project, "b.txt"), "b\n");
  });

  it("getGitStatus reports branch, head, and dirty files", async () => {
    const s = await getGitStatus(project);
    expect(s.available).toBe(true);
    expect(s.branch).toBe("main");
    expect(s.isDirty).toBe(true);
    expect(s.changedFiles.find((f) => f.path === "b.txt")).toBeDefined();
    expect(s.headHash).toBeTruthy();
    expect(s.headSubject).toBe("first");
  });

  it("getGitHistory bounds output", async () => {
    for (let i = 0; i < 5; i++) {
      await fs.writeFile(path.join(project, `c${i}.txt`), `${i}\n`);
      await execa("git", ["add", "."], { cwd: project });
      await execa("git", ["commit", "-q", "-m", `c${i}`], { cwd: project });
    }
    const h = await getGitHistory({ worktreePath: project, limit: 3 });
    expect(h.commits).toHaveLength(3);
    expect(h.truncated).toBe(true);
  });

  it("getGitHistory can scope commits to HEAD not reachable from a base ref", async () => {
    await execa("git", ["checkout", "-q", "-b", "task"], { cwd: project });
    await fs.writeFile(path.join(project, "task.txt"), "task\n");
    await execa("git", ["add", "."], { cwd: project });
    await execa("git", ["commit", "-q", "-m", "task work"], { cwd: project });

    const h = await getGitHistory({
      worktreePath: project,
      limit: 10,
      baseRef: "main",
    });
    expect(h.baseRef).toBe("main");
    expect(h.commits.map((c) => c.subject)).toEqual(["task work"]);
  });

  it("getGitStatus is graceful when not a git repo", async () => {
    const dir = await tempProject();
    const s = await getGitStatus(dir);
    expect(s.available).toBe(false);
  });
});

describe("agent-work attribution", () => {
  it("returns rows derived from runtime metrics fixture", async () => {
    const project = await tempProject();
    const runId = "fix-1";
    await ensureDir(runDir(project, runId));
    const state = runStateSchema.parse({
      runId,
      task: "fixture",
      status: "merge_ready",
      projectRoot: project,
      worktreePath: null,
      branchName: null,
      reviewLoopCount: 0,
      maxReviewLoops: 2,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      finalDecision: "APPROVED",
      verification: "PASSED",
      error: null,
    });
    await writeJson(runStatePath(project, runId), state);
    const store = new MetricsStore(project, runId);
    const ts = new Date().toISOString();
    await store.write({
      runId,
      task: "fixture",
      startedAt: ts,
      updatedAt: ts,
      finalStatus: "merge_ready",
      totalDurationMs: 1500,
      totalProviderCalls: 1,
      totalCostUsd: 0.01,
      reviewLoopCount: 0,
      filesChanged: 2,
      diffInsertions: 5,
      diffDeletions: 3,
      validationSummary: { total: 2, passed: 2, failed: 0 },
      approvalsSummary: {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        expired: 0,
        totalWaitMs: 0,
      },
      notesProvided: [],
      roles: [
        {
          roleId: "executor",
          stageId: "executing",
          providerId: "claude",
          providerType: "claude-code",
          command: "claude",
          args: [],
          cwd: project,
          startedAt: ts,
          endedAt: ts,
          durationMs: 1500,
          exitCode: 0,
          promptArtifactPath: "artifacts/2_implement.md",
          outputArtifactPath: "artifacts/2_implement_output.md",
          sessionId: null,
          flowSlotId: null,
          flowContextMode: null,
          flowContextFallbackReason: null,
          model: null,
          totalCostUsd: 0.01,
          perModelCost: [],
          tokenUsage: null,
          toolCallCount: 1,
          filesChangedBefore: 0,
          filesChangedAfter: 2,
          diffInsertionsAfter: 5,
          diffDeletionsAfter: 3,
          validationSummary: { total: 2, passed: 2, failed: 0 },
          reviewDecision: null,
          verificationDecision: null,
          skillsAttached: ["vibestrate/code-review"],
          skillsRequested: [],
          notes: ["touched 2 files"],
        },
      ],
    });
    const r = await getRoleWork({ projectRoot: project, runId });
    expect(r.available).toBe(true);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.roleId).toBe("executor");
    expect(r.rows[0]!.filesChangedAfter).toBe(2);
    expect(r.rows[0]!.bestEffort).toBe(true);
    expect(r.rows[0]!.artifacts.length).toBe(2);
    expect(r.bestEffort).toBe(true);
    expect(r.notice).toMatch(/best-effort/i);
  });
});

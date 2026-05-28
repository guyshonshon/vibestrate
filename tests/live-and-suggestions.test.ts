import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import {
  isSafeCommandName,
  openInEditor,
  substitute,
  validateEditorConfig,
} from "../src/core/editor-service.js";
import {
  buildProjectRoots,
  resolveSafePath,
} from "../src/core/path-guard.js";
import {
  parseSuggestionBlocks,
  makeSuggestionRecord,
} from "../src/reviews/review-suggestion-parser.js";
import { ReviewSuggestionStore } from "../src/reviews/review-suggestion-store.js";
import {
  ReviewSuggestionService,
  checkPatchSafety,
  SuggestionServiceError,
} from "../src/reviews/review-suggestion-service.js";
import { renderFinalReport } from "../src/core/final-report.js";
import { runStateSchema } from "../src/core/state-machine.js";
import { writeJson } from "../src/utils/json.js";
import { runStatePath, runDir } from "../src/utils/paths.js";
import { ensureDir } from "../src/utils/fs.js";

async function tempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function tempGitWorktree(): Promise<{ project: string; worktree: string }> {
  const project = await tempDir("vibestrate-live-proj-");
  await execa("git", ["init", "-q", "-b", "main"], { cwd: project });
  await execa("git", ["config", "user.email", "x@x"], { cwd: project });
  await execa("git", ["config", "user.name", "x"], { cwd: project });
  await fs.mkdir(path.join(project, "src"), { recursive: true });
  await fs.writeFile(path.join(project, "src", "example.ts"), "export const x = 1\n");
  await execa("git", ["add", "."], { cwd: project });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: project });
  // Create a separate worktree for the run.
  const worktree = path.join(await tempDir("vibestrate-live-wt-"), "wt");
  await execa(
    "git",
    ["worktree", "add", "-b", "vibestrate/test", worktree, "main"],
    { cwd: project },
  );
  return { project, worktree };
}

describe("editor-service", () => {
  it("rejects shell metacharacters in the command name", () => {
    expect(isSafeCommandName("code")).toBe(true);
    expect(isSafeCommandName("code-insiders")).toBe(true);
    expect(isSafeCommandName("foo bar")).toBe(false);
    expect(isSafeCommandName("rm; rm")).toBe(false);
    expect(isSafeCommandName("/usr/bin/code")).toBe(false);
  });

  it("validateEditorConfig requires {file}", () => {
    expect(
      validateEditorConfig({
        enabled: true,
        command: "code",
        args: ["--goto", "{file}:{line}:{column}"],
      }).ok,
    ).toBe(true);
    expect(
      validateEditorConfig({
        enabled: false,
        command: "code",
        args: ["--goto", "{file}"],
      }).ok,
    ).toBe(false);
    expect(
      validateEditorConfig({
        enabled: true,
        command: "code",
        args: ["--no-file"],
      }).ok,
    ).toBe(false);
  });

  it("substitute injects file/line/column without modifying other text", () => {
    expect(
      substitute("--goto {file}:{line}:{column}", {
        file: "/abs/foo.ts",
        line: 12,
        column: null,
      }),
    ).toBe("--goto /abs/foo.ts:12:1");
  });

  it("openInEditor uses fixed argv (no shell), receives substituted path:line", async () => {
    const project = await tempDir("vibestrate-live-edit-");
    await fs.writeFile(path.join(project, "x.ts"), "console.log(1)\n");
    const captureFile = path.join(project, "captured.json");
    // Build a tiny shell script that records argv to JSON, then exits ok.
    const fakeBinDir = path.join(project, "bin");
    await fs.mkdir(fakeBinDir, { recursive: true });
    const fakeScript = path.join(fakeBinDir, "fake-editor.js");
    await fs.writeFile(
      fakeScript,
      `#!/usr/bin/env node
const fs = require("node:fs");
fs.writeFileSync(${JSON.stringify(captureFile)}, JSON.stringify(process.argv.slice(2)));
process.exit(0);
`,
    );
    await fs.chmod(fakeScript, 0o755);
    // Wrap our fake binary in a name that matches the safe-command regex.
    const fakeBin = path.join(fakeBinDir, "fake-editor");
    await fs.writeFile(
      fakeBin,
      `#!/usr/bin/env bash\nexec "${process.execPath}" "${fakeScript}" "$@"\n`,
    );
    await fs.chmod(fakeBin, 0o755);

    // Path guard resolution against the project root.
    const resolved = await resolveSafePath(
      "x.ts",
      buildProjectRoots({ projectRoot: project }),
    );
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fakeBinDir}${path.delimiter}${oldPath}`;
    try {
      const r = await openInEditor({
        config: {
          enabled: true,
          command: "fake-editor",
          args: ["--goto", "{file}:{line}:{column}"],
        },
        resolved,
        line: 7,
        column: 3,
      });
      expect(r.ok).toBe(true);
      const captured = JSON.parse(await fs.readFile(captureFile, "utf8")) as string[];
      expect(captured[0]).toBe("--goto");
      expect(captured[1]).toBe(`${resolved.absolutePath}:7:3`);
    } finally {
      process.env.PATH = oldPath;
    }
  });

  it("openInEditor refuses to open a secret-like file", async () => {
    const project = await tempDir("vibestrate-live-secret-");
    await fs.writeFile(path.join(project, ".env"), "SECRET=v\n");
    const resolved = await resolveSafePath(
      ".env",
      buildProjectRoots({ projectRoot: project }),
    );
    await expect(
      openInEditor({
        config: { enabled: true, command: "code", args: ["{file}"] },
        resolved,
        line: null,
        column: null,
      }),
    ).rejects.toThrow(/secret/i);
  });
});

describe("suggestion parser", () => {
  it("ignores prose without VIBESTRATE_SUGGESTION markers", () => {
    expect(
      parseSuggestionBlocks(
        "We should rename `foo` and add a test. The reviewer is happy otherwise.",
      ),
    ).toEqual([]);
  });

  it("parses a complete marker block with patch", () => {
    const text = `
prelude
VIBESTRATE_SUGGESTION:
TITLE: Replace foo with bar
FILE: src/example.ts
LINES: 3-5
BODY:
The current implementation is racy. Replace it.
PROPOSED_PATCH:
diff --git a/src/example.ts b/src/example.ts
--- a/src/example.ts
+++ b/src/example.ts
@@
-const x = 1
+const x = 2
VIBESTRATE_SUGGESTION_END
`;
    const blocks = parseSuggestionBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.title).toBe("Replace foo with bar");
    expect(blocks[0]!.file).toBe("src/example.ts");
    expect(blocks[0]!.lineStart).toBe(3);
    expect(blocks[0]!.lineEnd).toBe(5);
    expect(blocks[0]!.body).toContain("racy");
    expect(blocks[0]!.proposedPatch).toContain("diff --git a/src/example.ts");
  });

  it("parses multiple back-to-back blocks", () => {
    const text = `VIBESTRATE_SUGGESTION:
TITLE: One
BODY: short
VIBESTRATE_SUGGESTION:
TITLE: Two
BODY: also short
`;
    const blocks = parseSuggestionBlocks(text);
    expect(blocks.map((b) => b.title)).toEqual(["One", "Two"]);
  });

  it("makeSuggestionRecord defaults to open + requiresApproval=true", () => {
    const rec = makeSuggestionRecord({
      id: "s-1",
      runId: "r-1",
      createdAt: "2026-05-10T00:00:00.000Z",
      source: "reviewer",
      parsed: {
        title: "Add test",
        body: "needed",
        file: "src/example.ts",
        lineStart: 1,
        lineEnd: null,
        proposedPatch: null,
        validationProfile: null,
      },
    });
    expect(rec.status).toBe("open");
    expect(rec.requiresApproval).toBe(true);
  });
});

describe("ReviewSuggestionStore", () => {
  it("upserts and reads suggestions", async () => {
    const project = await tempDir("vibestrate-live-store-");
    await ensureDir(runDir(project, "run-1"));
    const store = new ReviewSuggestionStore(project, "run-1");
    await store.upsert({
      id: "s-1",
      runId: "run-1",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
      source: "user",
      sourceArtifactPath: null,
      file: "src/x.ts",
      lineStart: 1,
      lineEnd: null,
      title: "T",
      body: "",
      status: "open",
      proposedPatch: null,
      requiresApproval: true,
      approvalId: null,
      decisionNote: null,
      errorMessage: null,
      bundleId: null,
      appliedPatchPath: null,
      reversePatchPath: null,
      validationResultPath: null,
      validationProfile: null,
    });
    const back = await store.readAll();
    expect(back).toHaveLength(1);
    expect(back[0]!.id).toBe("s-1");
  });
});

describe("checkPatchSafety", () => {
  const wt = "/tmp/wt";
  it("rejects patches that escape the worktree", () => {
    const r = checkPatchSafety(
      `diff --git a/../etc/passwd b/../etc/passwd\n--- a/../etc/passwd\n+++ b/../etc/passwd\n`,
      wt,
    );
    expect(r.ok).toBe(false);
  });

  it("rejects patches that touch secret-like files", () => {
    const r = checkPatchSafety(
      `diff --git a/.env b/.env\n--- a/.env\n+++ b/.env\n`,
      wt,
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/secret/i);
  });

  it("accepts a normal in-worktree patch", () => {
    const r = checkPatchSafety(
      `diff --git a/src/example.ts b/src/example.ts\n--- a/src/example.ts\n+++ b/src/example.ts\n`,
      wt,
    );
    expect(r.ok).toBe(true);
  });

  it("rejects a patch that adds an AWS-shaped access key in a normal file", () => {
    const fakeKey = `AKIA${"A".repeat(16)}`;
    const r = checkPatchSafety(
      [
        "diff --git a/src/config.ts b/src/config.ts",
        "--- a/src/config.ts",
        "+++ b/src/config.ts",
        "@@ -1 +1,2 @@",
        " export const x = 1",
        `+export const aws = "${fakeKey}"`,
        "",
      ].join("\n"),
      wt,
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/AWS access key id/);
    // Reason must redact — never leak the full token back at the caller.
    expect(r.reason).not.toContain(fakeKey);
  });

  it("rejects a patch that adds a GitHub PAT", () => {
    const fakeToken = `ghp_${"a".repeat(40)}`;
    const r = checkPatchSafety(
      [
        "diff --git a/src/x.ts b/src/x.ts",
        "--- a/src/x.ts",
        "+++ b/src/x.ts",
        "@@ -1 +1,2 @@",
        " ok",
        `+const t = "${fakeToken}"`,
        "",
      ].join("\n"),
      wt,
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/GitHub/);
  });

  it("does not flag secrets that appear only in removed (-) lines", () => {
    const fakeKey = `AKIA${"B".repeat(16)}`;
    const r = checkPatchSafety(
      [
        "diff --git a/src/x.ts b/src/x.ts",
        "--- a/src/x.ts",
        "+++ b/src/x.ts",
        "@@ -1,2 +1 @@",
        ` const old = "${fakeKey}"`,
        `-const removed = "${fakeKey}"`,
        " const kept = 1",
        "",
      ].join("\n"),
      wt,
    );
    // The added line ("const kept = 1") is clean. The removed line carrying
    // the key is fine — removing a secret is what we want, not what we
    // block.
    expect(r.ok).toBe(true);
  });
});

describe("scanPatchContentForSecrets", () => {
  // Import path differs from the top-of-file imports because the scanner
  // lives in diff-service.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  it("returns no matches for a clean patch", async () => {
    const { scanPatchContentForSecrets } = await import(
      "../src/core/diff-service.js"
    );
    const r = scanPatchContentForSecrets(
      "diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1,2 @@\n a\n+b\n",
    );
    expect(r).toEqual([]);
  });

  it("matches multiple distinct patterns and never leaks the full token", async () => {
    const { scanPatchContentForSecrets } = await import(
      "../src/core/diff-service.js"
    );
    const aws = `AKIA${"C".repeat(16)}`;
    const stripe = `sk_live_${"d".repeat(24)}`;
    const r = scanPatchContentForSecrets(
      [
        "diff --git a/a.ts b/a.ts",
        "--- a/a.ts",
        "+++ b/a.ts",
        "@@ -1 +1,3 @@",
        " keep",
        `+const a = "${aws}"`,
        `+const s = "${stripe}"`,
        "",
      ].join("\n"),
    );
    expect(r).toHaveLength(2);
    const patterns = r.map((m) => m.pattern).sort();
    expect(patterns).toEqual(["AWS access key id", "Stripe live secret key"]);
    for (const m of r) {
      expect(m.redactedSnippet).not.toContain(aws);
      expect(m.redactedSnippet).not.toContain(stripe);
      // Snippet must use the ellipsis-redact format, not the raw token.
      expect(m.redactedSnippet).toContain("…");
      expect(m.redactedSnippet.length).toBeLessThan(aws.length);
    }
  });

  it("matches a PEM private key header", async () => {
    const { scanPatchContentForSecrets } = await import(
      "../src/core/diff-service.js"
    );
    const r = scanPatchContentForSecrets(
      [
        "diff --git a/k.ts b/k.ts",
        "--- a/k.ts",
        "+++ b/k.ts",
        "@@ -1 +1,2 @@",
        " ok",
        "+const pem = `-----BEGIN RSA PRIVATE KEY-----`",
        "",
      ].join("\n"),
    );
    expect(r).toHaveLength(1);
    expect(r[0]!.pattern).toMatch(/PEM/);
  });

  it("attributes matches to the right file when the patch touches multiple", async () => {
    const { scanPatchContentForSecrets } = await import(
      "../src/core/diff-service.js"
    );
    const aws = `AKIA${"E".repeat(16)}`;
    const r = scanPatchContentForSecrets(
      [
        "diff --git a/clean.ts b/clean.ts",
        "--- a/clean.ts",
        "+++ b/clean.ts",
        "@@ -1 +1,2 @@",
        " a",
        "+b",
        "diff --git a/dirty.ts b/dirty.ts",
        "--- a/dirty.ts",
        "+++ b/dirty.ts",
        "@@ -1 +1,2 @@",
        " a",
        `+const k = "${aws}"`,
        "",
      ].join("\n"),
    );
    expect(r).toHaveLength(1);
    expect(r[0]!.filePath).toBe("dirty.ts");
  });
});

describe("ReviewSuggestionService apply (gated)", () => {
  let project: string;
  let worktree: string;
  let runId: string;

  beforeEach(async () => {
    const built = await tempGitWorktree();
    project = built.project;
    worktree = built.worktree;
    runId = "run-1";
    await ensureDir(runDir(project, runId));
    const state = runStateSchema.parse({
      runId,
      task: "fixture",
      status: "merge_ready",
      projectRoot: project,
      worktreePath: worktree,
      branchName: "vibestrate/test",
      reviewLoopCount: 0,
      maxReviewLoops: 2,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      finalDecision: null,
      verification: null,
      error: null,
    });
    await writeJson(runStatePath(project, runId), state);
  });

  it("rejects apply when the suggestion is not approved", async () => {
    const svc = new ReviewSuggestionService(project, runId);
    const created = await svc.addManual({
      title: "Add comment",
      proposedPatch:
        "diff --git a/src/example.ts b/src/example.ts\nindex 0000000..1111111 100644\n--- a/src/example.ts\n+++ b/src/example.ts\n@@ -1 +1,2 @@\n export const x = 1\n+// noted\n",
    });
    await expect(svc.apply(created.id)).rejects.toBeInstanceOf(
      SuggestionServiceError,
    );
  });

  it("applies a valid patch inside the worktree only", async () => {
    const svc = new ReviewSuggestionService(project, runId);
    const created = await svc.addManual({
      title: "Add comment",
      proposedPatch:
        "diff --git a/src/example.ts b/src/example.ts\nindex 0000000..1111111 100644\n--- a/src/example.ts\n+++ b/src/example.ts\n@@ -1 +1,2 @@\n export const x = 1\n+// noted\n",
    });
    await svc.approve(created.id, "ok");
    const applied = await svc.apply(created.id);
    expect(applied.status).toBe("applied");

    // Worktree got the patch.
    const wtBody = await fs.readFile(
      path.join(worktree, "src", "example.ts"),
      "utf8",
    );
    expect(wtBody).toContain("// noted");
    // Project root unchanged.
    const projBody = await fs.readFile(
      path.join(project, "src", "example.ts"),
      "utf8",
    );
    expect(projBody).not.toContain("// noted");
  });

  it("records status=failed on a malformed patch and leaves the worktree clean", async () => {
    const svc = new ReviewSuggestionService(project, runId);
    const created = await svc.addManual({
      title: "Bad",
      proposedPatch:
        "diff --git a/src/example.ts b/src/example.ts\n--- a/src/example.ts\n+++ b/src/example.ts\n@@ -99 +99,1 @@\n-not present\n+nope\n",
    });
    await svc.approve(created.id);
    const after = await svc.apply(created.id);
    expect(after.status).toBe("failed");
    expect(after.errorMessage ?? "").toMatch(/git apply/i);
    const wtBody = await fs.readFile(
      path.join(worktree, "src", "example.ts"),
      "utf8",
    );
    expect(wtBody).toBe("export const x = 1\n");
  });

  it("refuses to apply a patch that touches a secret-like file", async () => {
    const svc = new ReviewSuggestionService(project, runId);
    const created = await svc.addManual({
      title: "Edit secrets",
      proposedPatch:
        "diff --git a/.env b/.env\n--- a/.env\n+++ b/.env\n@@\n-A=1\n+A=2\n",
    });
    await svc.approve(created.id);
    const after = await svc.apply(created.id);
    expect(after.status).toBe("failed");
    expect(after.errorMessage ?? "").toMatch(/secret/i);
  });
});

describe("renderFinalReport — suggestions section", () => {
  it("renders an empty notice when no suggestions", () => {
    const report = renderFinalReport({
      state: runStateSchema.parse({
        runId: "r1",
        task: "t",
        status: "merge_ready",
        projectRoot: "/p",
        worktreePath: null,
        branchName: null,
        reviewLoopCount: 0,
        maxReviewLoops: 2,
        startedAt: "2026-05-10T00:00:00.000Z",
        updatedAt: "2026-05-10T00:00:00.000Z",
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
    expect(report).toContain("## Review Suggestions");
    expect(report).toContain("_No suggestions were captured for this run._");
  });

  it("renders a row per suggestion with its status", () => {
    const ts = "2026-05-10T00:00:00.000Z";
    const report = renderFinalReport({
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
      suggestions: [
        {
          id: "s-1",
          runId: "r1",
          createdAt: ts,
          updatedAt: ts,
          source: "reviewer",
          sourceArtifactPath: "artifacts/09-review.md",
          file: "src/example.ts",
          lineStart: 3,
          lineEnd: 5,
          title: "Replace foo with bar",
          body: "x",
          status: "applied",
          proposedPatch: "diff --git a/src/example.ts b/src/example.ts\n",
          requiresApproval: true,
          approvalId: "ap-1",
          decisionNote: null,
          errorMessage: null,
          bundleId: null,
          appliedPatchPath: null,
          reversePatchPath: null,
          validationResultPath: null,
          validationProfile: null,
        },
      ],
    });
    expect(report).toContain("## Review Suggestions");
    expect(report).toContain("Replace foo with bar");
    expect(report).toContain("**applied:** 1");
    expect(report).toContain("`src/example.ts:3-5`");
  });
});

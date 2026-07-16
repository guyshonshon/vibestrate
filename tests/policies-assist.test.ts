import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { startServer, type StartedServer } from "../src/server/server.js";
import {
  draftPolicyFromDescription,
  suggestPoliciesFromRuns,
  testPolicyRule,
  sanitizeSuggestedMatcher,
} from "../src/policies/policy-assist.js";
import { listPolicies } from "../src/project/project-policy-service.js";
import { projectConfigPath, runDir } from "../src/utils/paths.js";
import type { AssistProviderRunner } from "../src/core/assist/assist-runner.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

// Security-focused tests for the supervisor-assisted Policies surface. The
// invariants under test:
//  - /draft and /suggest NEVER write a policy (config file byte-identical after).
//  - /test evaluates a snippet THROUGH the engine and returns REDACTED matches.
//  - /test performs no write.
//  - a regex exceeding POLICY_LIMITS is rejected (400 / thrown).
//  - a secret-shaped token in a /test match is redacted in the response.
// A FAKE provider runner replays canned JSON - no real model is called.

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-polassist-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  return dir;
}

/** Fake assist runner: replays one canned JSON response. */
function fakeRunner(response: string): AssistProviderRunner {
  return async () => ({
    exitCode: 0,
    normalized: { responseText: response, metrics: null },
  });
}

async function readConfig(projectRoot: string): Promise<string> {
  return fs.readFile(projectConfigPath(projectRoot), "utf8");
}

// A synthetic recent run with a worktree containing an unstaged, secret-shaped
// diff, so /suggest and /test --recent have something to scan.
async function seedRunWithSecret(projectRoot: string): Promise<string> {
  const worktree = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-wt-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: worktree });
  await execa("git", ["config", "user.email", "x@x"], { cwd: worktree });
  await execa("git", ["config", "user.name", "x"], { cwd: worktree });
  await fs.writeFile(path.join(worktree, "seed.txt"), "base\n");
  await execa("git", ["add", "."], { cwd: worktree });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: worktree });
  // An added line carrying an AWS-key-shaped token + an em-dash character.
  await fs.writeFile(
    path.join(worktree, "app.ts"),
    'const key = "AKIAIOSFODNN7EXAMPLE"; // uses an em—dash\n',
  );

  const runId = "run-fixture";
  const dir = runDir(projectRoot, runId);
  await fs.mkdir(dir, { recursive: true });
  const now = new Date().toISOString();
  const state = {
    runId,
    task: "seed task",
    status: "reviewing",
    projectRoot,
    worktreePath: worktree,
    branchName: "run/fixture",
    startedAt: now,
    updatedAt: now,
  };
  await fs.writeFile(path.join(dir, "state.json"), JSON.stringify(state));
  return worktree;
}

describe("policy-assist: draft / suggest never write", () => {
  it("/draft returns an editable draft and writes NO policy", async () => {
    const project = await makeProject();
    const before = await readConfig(project);

    const runner = fakeRunner(
      JSON.stringify({
        statement: "do not use em-dash characters",
        message: "use a hyphen",
        suggestedTier: "block",
        matcher: { regex: "\\u2014", flags: "" },
        glob: null,
        appliesTo: ["suggestion-apply", "bundle-apply"],
      }),
    );
    const { draft } = await draftPolicyFromDescription({
      projectRoot: project,
      description: "ban em dashes",
      runner,
    });
    expect(draft.statement).toContain("em-dash");
    expect(draft.suggestedTier).toBe("block");
    expect(draft.matcher).not.toBeNull();

    // No write: the config is byte-identical and no policy exists.
    expect(await readConfig(project)).toBe(before);
    expect(await listPolicies(project)).toEqual([]);
  });

  it("/draft drops a matcher that exceeds POLICY_LIMITS (statement-only)", async () => {
    const project = await makeProject();
    const tooLong = "a".repeat(300); // > maxRegexLength (256)
    const runner = fakeRunner(
      JSON.stringify({
        statement: "some rule",
        message: "msg",
        suggestedTier: "block",
        matcher: { regex: tooLong, flags: "" },
        glob: null,
        appliesTo: ["suggestion-apply"],
      }),
    );
    const { draft } = await draftPolicyFromDescription({
      projectRoot: project,
      description: "x",
      runner,
    });
    // Over-long matcher dropped; a block with no matcher decays to advise.
    expect(draft.matcher).toBeNull();
    expect(draft.suggestedTier).toBe("advise");
  });

  it("/suggest returns drafts from recent runs and writes NO policy", async () => {
    const project = await makeProject();
    await seedRunWithSecret(project);
    const before = await readConfig(project);

    const runner = fakeRunner(
      JSON.stringify({
        drafts: [
          {
            statement: "no em-dash characters",
            message: "use a hyphen",
            suggestedTier: "advise",
            matcher: null,
            glob: null,
            appliesTo: ["suggestion-apply"],
          },
        ],
      }),
    );
    const { drafts } = await suggestPoliciesFromRuns({
      projectRoot: project,
      limit: 5,
      runner,
    });
    expect(drafts.length).toBe(1);
    expect(await readConfig(project)).toBe(before);
    expect(await listPolicies(project)).toEqual([]);
  });
});

describe("policy-assist: test (deterministic, read-only, redacted)", () => {
  it("evaluates a snippet through the engine and returns a REDACTED match", async () => {
    const project = await makeProject();
    const before = await readConfig(project);

    const patch = [
      "diff --git a/app.ts b/app.ts",
      "--- a/app.ts",
      "+++ b/app.ts",
      '+const key = "AKIAIOSFODNN7EXAMPLE";',
    ].join("\n");

    const result = await testPolicyRule({
      projectRoot: project,
      rule: { regex: "AKIA[0-9A-Z]{16}", appliesTo: ["suggestion-apply"] },
      source: { kind: "snippet", patch },
    });
    expect(result.evaluatedCount).toBe(1);
    expect(result.matches.length).toBe(1);
    expect(result.matches[0]!.file).toBe("app.ts");
    // The matched line is redacted: no raw AWS key survives.
    expect(result.matches[0]!.line).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(result.matches[0]!.line).toContain("[REDACTED");

    // No write.
    expect(await readConfig(project)).toBe(before);
  });

  it("rejects a regex exceeding POLICY_LIMITS", async () => {
    const project = await makeProject();
    await expect(
      testPolicyRule({
        projectRoot: project,
        rule: { regex: "a".repeat(300), appliesTo: ["suggestion-apply"] },
        source: { kind: "snippet", patch: "+x" },
      }),
    ).rejects.toThrow(/Invalid regex/i);
  });

  it("returns no matches when the rule matches nothing", async () => {
    const project = await makeProject();
    const result = await testPolicyRule({
      projectRoot: project,
      rule: { regex: "NEVER_MATCHES_XYZ", appliesTo: ["suggestion-apply"] },
      source: { kind: "snippet", patch: "+hello world" },
    });
    expect(result.matches).toEqual([]);
  });
});

describe("sanitizeSuggestedMatcher", () => {
  it("keeps a valid matcher, drops an over-long / bad-flag / uncompilable one", () => {
    expect(sanitizeSuggestedMatcher({ regex: "foo", flags: "i" })).toEqual({
      regex: "foo",
      flags: "i",
    });
    expect(sanitizeSuggestedMatcher({ regex: "a".repeat(300) })).toBeNull();
    expect(sanitizeSuggestedMatcher({ regex: "foo", flags: "x" })).toBeNull();
    expect(sanitizeSuggestedMatcher({ regex: "(" })).toBeNull();
    expect(sanitizeSuggestedMatcher(null)).toBeNull();
  });
});

describe("policy-assist routes (read-only)", () => {
  let server: StartedServer | null = null;

  it("POST /api/policies/test returns redacted matches and rejects a bad regex", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    try {
      const patch = [
        "diff --git a/app.ts b/app.ts",
        "+++ b/app.ts",
        '+const t = "AKIAIOSFODNN7EXAMPLE";',
      ].join("\n");
      const ok = await fetch(`${server.url}/api/policies/test`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rule: { regex: "AKIA[0-9A-Z]{16}", appliesTo: ["suggestion-apply"] },
          source: { kind: "snippet", patch },
        }),
      });
      expect(ok.status).toBe(200);
      const body = (await ok.json()) as {
        matches: { line: string | null }[];
      };
      expect(body.matches.length).toBe(1);
      expect(body.matches[0]!.line).not.toContain("AKIAIOSFODNN7EXAMPLE");

      // Over-long regex -> 400, no crash.
      const bad = await fetch(`${server.url}/api/policies/test`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rule: { regex: "a".repeat(300), appliesTo: ["suggestion-apply"] },
          source: { kind: "snippet", patch: "+x" },
        }),
      });
      expect(bad.status).toBe(400);
    } finally {
      if (server) await server.close();
      server = null;
    }
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { loadPolicySnapshot } from "../src/policies/policy-store.js";
import { evaluatePatchAgainstPolicies } from "../src/policies/policy-engine.js";
import { applyPolicyGate } from "../src/policies/policy-service.js";
import { ReviewSuggestionService } from "../src/reviews/review-suggestion-service.js";
import { SuggestionBundleService } from "../src/reviews/suggestion-bundle-service.js";
import { runStateSchema } from "../src/core/state-machine.js";
import { ensureDir } from "../src/utils/fs.js";
import { runDir, runStatePath } from "../src/utils/paths.js";
import { writeJson } from "../src/utils/json.js";

async function tempProject(): Promise<{
  project: string;
  worktree: string;
  runId: string;
}> {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-policy-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: project });
  await execa("git", ["config", "user.email", "x@x"], { cwd: project });
  await execa("git", ["config", "user.name", "x"], { cwd: project });
  await fs.mkdir(path.join(project, "src"), { recursive: true });
  await fs.writeFile(
    path.join(project, "src/example.ts"),
    "export const x = 1\n",
  );
  await execa("git", ["add", "."], { cwd: project });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: project });

  await fs.mkdir(path.join(project, ".vibestrate"), { recursive: true });
  await fs.writeFile(
    path.join(project, ".vibestrate/project.yml"),
    [
      "project: { name: demo, type: generic }",
      "providers:",
      "  fake: { type: cli, command: /bin/true, inputMode: stdin }",
      "roles:",
      "  reviewer: { provider: fake, prompt: reviewer, permissions: read }",
      "commands:",
      "  validate: []",
      "",
    ].join("\n"),
  );

  const worktree = path.join(
    await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-policy-wt-")),
    "wt",
  );
  await execa("git", ["worktree", "add", "-b", "vibestrate/test", worktree, "main"], {
    cwd: project,
  });
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

const SAMPLE_PATCH = [
  "diff --git a/src/example.ts b/src/example.ts",
  "--- a/src/example.ts",
  "+++ b/src/example.ts",
  "@@ -1 +1,2 @@",
  " export const x = 1",
  '+console.log("hello world")',
  "",
].join("\n");

async function writeRuleFile(
  project: string,
  filename: string,
  contents: string,
): Promise<void> {
  await fs.mkdir(path.join(project, ".vibestrate/policies"), { recursive: true });
  await fs.writeFile(path.join(project, ".vibestrate/policies", filename), contents);
}

describe("policy-store loading", () => {
  it("returns an empty snapshot when .vibestrate/policies/ does not exist", async () => {
    const { project } = await tempProject();
    const snap = await loadPolicySnapshot(project);
    expect(snap.rules).toEqual([]);
    expect(snap.ruleFiles).toEqual([]);
    expect(snap.malformedFiles).toEqual([]);
    expect(snap.duplicateIds).toEqual([]);
  });

  it("loads a well-formed rule file", async () => {
    const { project } = await tempProject();
    await writeRuleFile(
      project,
      "ok.yml",
      [
        "rules:",
        "  - id: no-console-log",
        "    description: Block console.log in shipped code.",
        "    appliesTo: [suggestion-apply]",
        "    matchAddedContent:",
        "      regex: 'console\\.log'",
        "    message: 'Use the logger instead of console.log.'",
        "",
      ].join("\n"),
    );
    const snap = await loadPolicySnapshot(project);
    expect(snap.malformedFiles).toEqual([]);
    expect(snap.rules).toHaveLength(1);
    expect(snap.rules[0]!.id).toBe("no-console-log");
    expect(snap.ruleFiles).toHaveLength(1);
    expect(snap.ruleFiles[0]!.ruleIds).toEqual(["no-console-log"]);
  });

  it("reports malformed YAML without throwing", async () => {
    const { project } = await tempProject();
    await writeRuleFile(project, "bad.yml", "rules: [this: isn't valid: yaml");
    const snap = await loadPolicySnapshot(project);
    expect(snap.malformedFiles).toHaveLength(1);
    expect(snap.malformedFiles[0]!.reason).toMatch(/YAML/i);
    expect(snap.rules).toEqual([]);
  });

  it("reports schema rejection without throwing", async () => {
    const { project } = await tempProject();
    await writeRuleFile(
      project,
      "bad-schema.yml",
      [
        "rules:",
        "  - id: bad-rule",
        "    description: missing appliesTo and message",
        "    matchAddedContent: { regex: 'foo' }",
        "",
      ].join("\n"),
    );
    const snap = await loadPolicySnapshot(project);
    expect(snap.malformedFiles).toHaveLength(1);
    expect(snap.malformedFiles[0]!.reason).toMatch(/appliesTo|message|Schema/i);
  });

  it("reports rules with neither matcher as malformed", async () => {
    const { project } = await tempProject();
    await writeRuleFile(
      project,
      "neither.yml",
      [
        "rules:",
        "  - id: refuses-everything",
        "    description: would refuse every patch",
        "    appliesTo: [suggestion-apply]",
        "    message: 'no'",
        "",
      ].join("\n"),
    );
    const snap = await loadPolicySnapshot(project);
    expect(snap.malformedFiles).toHaveLength(1);
    expect(snap.malformedFiles[0]!.reason).toMatch(/matchAddedContent|matchTouchedFiles/);
  });

  it("reports duplicate rule ids across files; first occurrence wins", async () => {
    const { project } = await tempProject();
    await writeRuleFile(
      project,
      "a.yml",
      [
        "rules:",
        "  - id: dup",
        "    description: first",
        "    appliesTo: [suggestion-apply]",
        "    matchAddedContent: { regex: 'foo' }",
        "    message: 'from a'",
        "",
      ].join("\n"),
    );
    await writeRuleFile(
      project,
      "b.yml",
      [
        "rules:",
        "  - id: dup",
        "    description: second",
        "    appliesTo: [suggestion-apply]",
        "    matchAddedContent: { regex: 'bar' }",
        "    message: 'from b'",
        "",
      ].join("\n"),
    );
    const snap = await loadPolicySnapshot(project);
    expect(snap.rules).toHaveLength(1);
    expect(snap.rules[0]!.message).toBe("from a");
    expect(snap.duplicateIds).toEqual(["dup"]);
  });

  it("rejects an uncompilable regex as malformed", async () => {
    const { project } = await tempProject();
    await writeRuleFile(
      project,
      "bad-regex.yml",
      [
        "rules:",
        "  - id: bad-regex",
        "    description: invalid",
        "    appliesTo: [suggestion-apply]",
        "    matchAddedContent: { regex: '[unterminated' }",
        "    message: 'no'",
        "",
      ].join("\n"),
    );
    const snap = await loadPolicySnapshot(project);
    expect(snap.malformedFiles).toHaveLength(1);
    expect(snap.malformedFiles[0]!.reason).toMatch(/regex/i);
  });

  it("rejects regex flags outside [gimsuy]", async () => {
    const { project } = await tempProject();
    await writeRuleFile(
      project,
      "bad-flags.yml",
      [
        "rules:",
        "  - id: bad-flags",
        "    description: invalid",
        "    appliesTo: [suggestion-apply]",
        '    matchAddedContent: { regex: "foo", flags: "x" }',
        "    message: 'no'",
        "",
      ].join("\n"),
    );
    const snap = await loadPolicySnapshot(project);
    expect(snap.malformedFiles).toHaveLength(1);
    expect(snap.malformedFiles[0]!.reason).toMatch(/flags/i);
  });

  it("ignores files without .yml or .yaml extension (README.md is fine to keep here)", async () => {
    const { project } = await tempProject();
    await writeRuleFile(project, "README.md", "# Policies\nDocs only.");
    const snap = await loadPolicySnapshot(project);
    expect(snap.ruleFiles).toEqual([]);
    expect(snap.malformedFiles).toEqual([]);
  });
});

describe("policy-engine evaluation", () => {
  it("no rules → no violations", () => {
    const r = evaluatePatchAgainstPolicies([], {
      patch: SAMPLE_PATCH,
      surface: "suggestion-apply",
    });
    expect(r.violations).toEqual([]);
  });

  it("regex hit on added content fires a violation", () => {
    const rules = [
      {
        id: "no-console-log",
        description: "x",
        appliesTo: ["suggestion-apply" as const],
        matchAddedContent: { regex: "console\\.log" },
        message: "Use the logger.",
      },
    ];
    const r = evaluatePatchAgainstPolicies(rules, {
      patch: SAMPLE_PATCH,
      surface: "suggestion-apply",
    });
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0]!.ruleId).toBe("no-console-log");
    expect(r.violations[0]!.matchedFile).toBe("src/example.ts");
  });

  it("regex on REMOVED line does NOT fire (only + lines scanned)", () => {
    const patch = [
      "diff --git a/src/example.ts b/src/example.ts",
      "--- a/src/example.ts",
      "+++ b/src/example.ts",
      "@@ -1,2 +1 @@",
      "-console.log('removed')",
      " export const x = 1",
      "",
    ].join("\n");
    const rules = [
      {
        id: "no-console-log",
        description: "x",
        appliesTo: ["suggestion-apply" as const],
        matchAddedContent: { regex: "console\\.log" },
        message: "Use the logger.",
      },
    ];
    const r = evaluatePatchAgainstPolicies(rules, {
      patch,
      surface: "suggestion-apply",
    });
    expect(r.violations).toEqual([]);
  });

  it("glob hit on touched file fires a glob-only rule", () => {
    const rules = [
      {
        id: "no-payments-edits",
        description: "x",
        appliesTo: ["bundle-apply" as const],
        matchTouchedFiles: { glob: "src/payments/**" },
        message: "src/payments/** is read-only here.",
      },
    ];
    const patch = [
      "diff --git a/src/payments/charge.ts b/src/payments/charge.ts",
      "--- a/src/payments/charge.ts",
      "+++ b/src/payments/charge.ts",
      "@@ -1 +1,2 @@",
      " ok",
      "+changed",
      "",
    ].join("\n");
    const r = evaluatePatchAgainstPolicies(rules, {
      patch,
      surface: "bundle-apply",
    });
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0]!.ruleId).toBe("no-payments-edits");
  });

  it("combined regex + glob: both must hit", () => {
    const rules = [
      {
        id: "no-todo-in-payments",
        description: "x",
        appliesTo: ["suggestion-apply" as const],
        matchTouchedFiles: { glob: "src/payments/**" },
        matchAddedContent: { regex: "TODO" },
        message: "no",
      },
    ];
    // Hit on the right file but no TODO → no violation.
    const noHit = evaluatePatchAgainstPolicies(rules, {
      patch: [
        "diff --git a/src/payments/charge.ts b/src/payments/charge.ts",
        "--- a/src/payments/charge.ts",
        "+++ b/src/payments/charge.ts",
        "@@ -1 +1,2 @@",
        " ok",
        "+changed",
        "",
      ].join("\n"),
      surface: "suggestion-apply",
    });
    expect(noHit.violations).toEqual([]);
    // TODO but wrong file → no violation.
    const wrongFile = evaluatePatchAgainstPolicies(rules, {
      patch: [
        "diff --git a/src/other/file.ts b/src/other/file.ts",
        "--- a/src/other/file.ts",
        "+++ b/src/other/file.ts",
        "@@ -1 +1,2 @@",
        " ok",
        "+TODO comment",
        "",
      ].join("\n"),
      surface: "suggestion-apply",
    });
    expect(wrongFile.violations).toEqual([]);
    // Right file AND TODO → violation.
    const hit = evaluatePatchAgainstPolicies(rules, {
      patch: [
        "diff --git a/src/payments/charge.ts b/src/payments/charge.ts",
        "--- a/src/payments/charge.ts",
        "+++ b/src/payments/charge.ts",
        "@@ -1 +1,2 @@",
        " ok",
        "+// TODO: revisit",
        "",
      ].join("\n"),
      surface: "suggestion-apply",
    });
    expect(hit.violations).toHaveLength(1);
  });

  it("appliesTo filters out the wrong surface", () => {
    const rules = [
      {
        id: "only-on-bundle",
        description: "x",
        appliesTo: ["bundle-apply" as const],
        matchAddedContent: { regex: "console" },
        message: "no",
      },
    ];
    const r = evaluatePatchAgainstPolicies(rules, {
      patch: SAMPLE_PATCH,
      surface: "suggestion-apply",
    });
    expect(r.evaluatedRuleIds).toEqual([]);
    expect(r.violations).toEqual([]);
  });
});

describe("applyPolicyGate", () => {
  it("ok when there are no rules", async () => {
    const { project } = await tempProject();
    const r = await applyPolicyGate({
      projectRoot: project,
      patch: SAMPLE_PATCH,
      surface: "suggestion-apply",
    });
    expect(r.ok).toBe(true);
  });

  it("returns the formatted refusal reason on first violation", async () => {
    const { project } = await tempProject();
    await writeRuleFile(
      project,
      "rule.yml",
      [
        "rules:",
        "  - id: no-console-log",
        "    description: x",
        "    appliesTo: [suggestion-apply]",
        '    matchAddedContent: { regex: "console\\\\.log" }',
        "    message: 'Use the logger.'",
        "",
      ].join("\n"),
    );
    const r = await applyPolicyGate({
      projectRoot: project,
      patch: SAMPLE_PATCH,
      surface: "suggestion-apply",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("Use the logger. (policy rule: no-console-log)");
    }
  });

  it("ignores malformed files and still applies well-formed rules", async () => {
    const { project } = await tempProject();
    await writeRuleFile(project, "bad.yml", "this is not yaml: [");
    await writeRuleFile(
      project,
      "ok.yml",
      [
        "rules:",
        "  - id: r1",
        "    description: x",
        "    appliesTo: [suggestion-apply]",
        '    matchAddedContent: { regex: "console\\\\.log" }',
        "    message: 'no'",
        "",
      ].join("\n"),
    );
    const r = await applyPolicyGate({
      projectRoot: project,
      patch: SAMPLE_PATCH,
      surface: "suggestion-apply",
    });
    expect(r.ok).toBe(false);
  });
});

const PATCH_TOUCHED_BY = [
  "diff --git a/src/example.ts b/src/example.ts",
  "--- a/src/example.ts",
  "+++ b/src/example.ts",
  "@@ -1 +1,2 @@",
  " export const x = 1",
  "+// touched-by-A",
  "",
].join("\n");

describe("integration with apply flows", () => {
  let project: string;
  let runId: string;

  beforeEach(async () => {
    const t = await tempProject();
    project = t.project;
    runId = t.runId;
  });

  it("built-in safety still refuses BEFORE user policy rules consider the patch", async () => {
    // A patch touching a secret-like file. Even with NO user policy rules,
    // checkPatchSafety must refuse. Then add a user rule too: refusal
    // reason should still come from the built-in path-secret check, not
    // the policy rule.
    await writeRuleFile(
      project,
      "rule.yml",
      [
        "rules:",
        "  - id: r1",
        "    description: x",
        "    appliesTo: [suggestion-apply]",
        '    matchAddedContent: { regex: "." }',
        "    message: 'this would also match'",
        "",
      ].join("\n"),
    );
    const svc = new ReviewSuggestionService(project, runId);
    const secretPatch = [
      "diff --git a/.env b/.env",
      "--- a/.env",
      "+++ b/.env",
      "@@ -1 +1 @@",
      "-A=1",
      "+A=2",
      "",
    ].join("\n");
    const s = await svc.addManual({ title: "S", proposedPatch: secretPatch });
    await svc.approve(s.id);
    const result = await svc.apply(s.id);
    expect(result.status).toBe("failed");
    // Refusal reason must mention "secret-like" from checkPatchSafety,
    // NOT "policy rule:".
    expect(result.errorMessage).toMatch(/secret/i);
    expect(result.errorMessage ?? "").not.toMatch(/policy rule/);
  });

  it("user policy refuses suggestion apply when built-in safety would allow it", async () => {
    await writeRuleFile(
      project,
      "rule.yml",
      [
        "rules:",
        "  - id: no-touched-by-A",
        "    description: x",
        "    appliesTo: [suggestion-apply]",
        '    matchAddedContent: { regex: "touched-by-A" }',
        "    message: 'reject magic strings'",
        "",
      ].join("\n"),
    );
    const svc = new ReviewSuggestionService(project, runId);
    const s = await svc.addManual({ title: "S", proposedPatch: PATCH_TOUCHED_BY });
    await svc.approve(s.id);
    const result = await svc.apply(s.id);
    expect(result.status).toBe("failed");
    expect(result.errorMessage).toBe(
      "reject magic strings (policy rule: no-touched-by-A)",
    );
  });

  it("user policy refuses bundle apply via preflight finding", async () => {
    await writeRuleFile(
      project,
      "rule.yml",
      [
        "rules:",
        "  - id: bundle-only-rule",
        "    description: x",
        "    appliesTo: [bundle-apply]",
        '    matchAddedContent: { regex: "touched-by-A" }',
        "    message: 'reject magic strings'",
        "",
      ].join("\n"),
    );
    const ssvc = new ReviewSuggestionService(project, runId);
    const s = await ssvc.addManual({ title: "S", proposedPatch: PATCH_TOUCHED_BY });
    const bsvc = new SuggestionBundleService(project, runId);
    const b = await bsvc.create({ title: "P", suggestionIds: [s.id] });
    const pre = await bsvc.preflight(b.id);
    const finding = pre.findings.find((f) => f.suggestionId === s.id);
    expect(finding).toBeDefined();
    expect(finding!.reason).toBe(
      "reject magic strings (policy rule: bundle-only-rule)",
    );
  });

  it("appliesTo:[suggestion-apply] rule does NOT fire on bundle apply", async () => {
    await writeRuleFile(
      project,
      "rule.yml",
      [
        "rules:",
        "  - id: suggestion-only-rule",
        "    description: x",
        "    appliesTo: [suggestion-apply]",
        '    matchAddedContent: { regex: "touched-by-A" }',
        "    message: 'only-suggestion'",
        "",
      ].join("\n"),
    );
    const ssvc = new ReviewSuggestionService(project, runId);
    const s = await ssvc.addManual({ title: "S", proposedPatch: PATCH_TOUCHED_BY });
    const bsvc = new SuggestionBundleService(project, runId);
    const b = await bsvc.create({ title: "P", suggestionIds: [s.id] });
    const pre = await bsvc.preflight(b.id);
    const finding = pre.findings.find((f) => f.suggestionId === s.id);
    expect(finding!.reason).toBeNull();
  });
});

describe("no code-loading invariant", () => {
  // The policy system reads YAML only. There is no import(), no require(),
  // no eval(). We assert that by grepping the source files in src/policies.
  it("src/policies/*.ts contains no eval / new Function / dynamic require", async () => {
    const dir = path.resolve(__dirname, "../src/policies");
    const files = await fs.readdir(dir);
    const forbidden: { file: string; pattern: string }[] = [];
    for (const name of files) {
      if (!/\.ts$/.test(name)) continue;
      const text = await fs.readFile(path.join(dir, name), "utf8");
      for (const pattern of ["eval(", "new Function", "vm.runIn", "require("]) {
        if (text.includes(pattern)) {
          forbidden.push({ file: name, pattern });
        }
      }
    }
    expect(forbidden).toEqual([]);
  });
});

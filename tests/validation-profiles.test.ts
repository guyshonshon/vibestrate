import { afterEach, beforeEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import {
  projectConfigSchema,
  type ProjectConfig,
} from "../src/project/config-schema.js";
import {
  listValidationProfiles,
  resolveValidationProfile,
  ValidationProfileError,
} from "../src/core/validation-profile-service.js";
import {
  parseSuggestionBlocks,
  makeSuggestionRecord,
} from "../src/reviews/review-suggestion-parser.js";
import { ReviewSuggestionService } from "../src/reviews/review-suggestion-service.js";
import { SuggestionBundleService } from "../src/reviews/suggestion-bundle-service.js";
import { runStateSchema } from "../src/core/state-machine.js";
import { ensureDir } from "../src/utils/fs.js";
import { runStatePath, runDir } from "../src/utils/paths.js";
import { writeJson } from "../src/utils/json.js";

const BASE_CONFIG = {
  project: { name: "demo", type: "generic" },
  providers: { fake: { type: "cli", command: "/bin/true", inputMode: "stdin" } },
  agents: { reviewer: { provider: "fake", prompt: "reviewer", permissions: "read" } },
};

function configFromYaml(input: {
  validate?: string[];
  profiles?: Record<string, { description?: string; commands: string[] }>;
}): ProjectConfig {
  return projectConfigSchema.parse({
    ...BASE_CONFIG,
    commands: {
      validate: input.validate ?? [],
      validationProfiles: input.profiles ?? {},
    },
  });
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

describe("config schema: validationProfiles", () => {
  it("accepts a well-formed profile map", () => {
    const cfg = configFromYaml({
      validate: ["true"],
      profiles: {
        quick: { commands: ["pnpm typecheck"] },
        full: {
          description: "Full",
          commands: ["pnpm typecheck", "pnpm test"],
        },
      },
    });
    expect(Object.keys(cfg.commands.validationProfiles)).toEqual([
      "quick",
      "full",
    ]);
  });

  it("rejects empty profile commands array", () => {
    expect(() =>
      projectConfigSchema.parse({
        ...BASE_CONFIG,
        commands: {
          validate: [],
          validationProfiles: { bad: { commands: [] } },
        },
      }),
    ).toThrow(/at least one command/i);
  });

  it("rejects reserved profile name 'default'", () => {
    expect(() =>
      projectConfigSchema.parse({
        ...BASE_CONFIG,
        commands: {
          validate: [],
          validationProfiles: { default: { commands: ["true"] } },
        },
      }),
    ).toThrow(/cannot be/i);
  });

  it("rejects profile name with invalid characters", () => {
    expect(() =>
      projectConfigSchema.parse({
        ...BASE_CONFIG,
        commands: {
          validate: [],
          validationProfiles: { "bad name": { commands: ["true"] } },
        },
      }),
    ).toThrow();
  });
});

describe("resolveValidationProfile", () => {
  const cfg = configFromYaml({
    validate: ["pnpm test"],
    profiles: {
      quick: { commands: ["pnpm typecheck"] },
      empty: { commands: ["one"] },
    },
  });

  it("returns the implicit default with source=default when no name is given", () => {
    const r = resolveValidationProfile(cfg, null);
    expect(r.profileName).toBe("default");
    expect(r.source).toBe("default");
    expect(r.commands).toEqual(["pnpm test"]);
  });

  it("treats 'default' as the implicit default", () => {
    const r = resolveValidationProfile(cfg, "default");
    expect(r.commands).toEqual(["pnpm test"]);
  });

  it("returns a named profile with source=named", () => {
    const r = resolveValidationProfile(cfg, "quick");
    expect(r.profileName).toBe("quick");
    expect(r.source).toBe("named");
    expect(r.commands).toEqual(["pnpm typecheck"]);
  });

  it("respects sourceHint (suggestion / bundle / override)", () => {
    expect(resolveValidationProfile(cfg, "quick", "suggestion").source).toBe(
      "suggestion",
    );
    expect(resolveValidationProfile(cfg, "quick", "override").source).toBe(
      "override",
    );
  });

  it("404s on a missing profile", () => {
    expect(() => resolveValidationProfile(cfg, "missing")).toThrow(
      ValidationProfileError,
    );
  });

  it("returns commands=[] for an empty default — no_commands_configured semantics preserved", () => {
    const empty = configFromYaml({ validate: [] });
    const r = resolveValidationProfile(empty, null);
    expect(r.commands).toEqual([]);
    expect(r.source).toBe("default");
  });
});

describe("listValidationProfiles", () => {
  it("returns default + named profiles, flagged hasCommands when populated", () => {
    const cfg = configFromYaml({
      validate: ["true"],
      profiles: { quick: { commands: ["pnpm typecheck"] } },
    });
    const list = listValidationProfiles(cfg);
    expect(list.map((p) => p.profileName)).toEqual(["default", "quick"]);
    expect(list[0]!.hasCommands).toBe(true);
    expect(list[1]!.hasCommands).toBe(true);
  });
});

describe("suggestion parser: VALIDATION_PROFILE marker", () => {
  it("captures the trimmed profile name when present", () => {
    const text = `AMACO_SUGGESTION:
TITLE: Touch a
VALIDATION_PROFILE:   quick
BODY:
short
PROPOSED_PATCH:
${PATCH_A.trimEnd()}
AMACO_SUGGESTION_END
`;
    const blocks = parseSuggestionBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.validationProfile).toBe("quick");
  });

  it("leaves validationProfile null when not present", () => {
    const text = `AMACO_SUGGESTION:
TITLE: T
BODY: short
AMACO_SUGGESTION_END
`;
    const b = parseSuggestionBlocks(text);
    expect(b[0]!.validationProfile).toBeNull();
  });

  it("threads through makeSuggestionRecord", () => {
    const rec = makeSuggestionRecord({
      id: "s-1",
      runId: "r-1",
      createdAt: "2026-05-10T00:00:00.000Z",
      source: "reviewer",
      parsed: {
        title: "T",
        body: "",
        file: null,
        lineStart: null,
        lineEnd: null,
        proposedPatch: null,
        validationProfile: "quick",
      },
    });
    expect(rec.validationProfile).toBe("quick");
  });
});

// ─── integration: end-to-end profile flow ───────────────────────────────────

async function tempProjectWithWorktree(opts: {
  validate?: string[];
  profiles?: Record<string, { description?: string; commands: string[] }>;
} = {}): Promise<{ project: string; worktree: string; runId: string }> {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), "amaco-vp-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: project });
  await execa("git", ["config", "user.email", "x@x"], { cwd: project });
  await execa("git", ["config", "user.name", "x"], { cwd: project });
  await fs.mkdir(path.join(project, "src"), { recursive: true });
  await fs.writeFile(path.join(project, "src/a.ts"), "export const a = 1\n");
  await execa("git", ["add", "."], { cwd: project });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: project });

  const validate = opts.validate ?? [];
  const profilesYaml = Object.entries(opts.profiles ?? {})
    .map(([name, p]) => {
      const desc = p.description
        ? `\n      description: ${JSON.stringify(p.description)}`
        : "";
      const cmds = p.commands
        .map((c) => `        - ${JSON.stringify(c)}`)
        .join("\n");
      return `    ${name}:${desc}\n      commands:\n${cmds}`;
    })
    .join("\n");

  await fs.mkdir(path.join(project, ".amaco"), { recursive: true });
  await fs.writeFile(
    path.join(project, ".amaco/project.yml"),
    [
      "project: { name: demo, type: generic }",
      "providers:",
      "  fake: { type: cli, command: /bin/true, inputMode: stdin }",
      "agents:",
      "  reviewer: { provider: fake, prompt: reviewer, permissions: read }",
      "commands:",
      `  validate: ${JSON.stringify(validate)}`,
      profilesYaml ? "  validationProfiles:" : "",
      profilesYaml,
      "",
    ]
      .filter((l) => l !== "")
      .join("\n"),
  );

  const worktree = path.join(
    await fs.mkdtemp(path.join(os.tmpdir(), "amaco-vp-wt-")),
    "wt",
  );
  await execa(
    "git",
    ["worktree", "add", "-b", "amaco/test", worktree, "main"],
    { cwd: project },
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

describe("integration: suggestion validate / apply with profiles", () => {
  it("uses the suggestion's own VALIDATION_PROFILE by default", async () => {
    const t = await tempProjectWithWorktree({
      validate: ["false"], // default would fail
      profiles: { quick: { commands: ["true"] } },
    });
    const svc = new ReviewSuggestionService(t.project, t.runId);
    const s = await svc.addManual({
      title: "Tagged",
      proposedPatch: PATCH_A,
    });
    // Manually stamp validationProfile (simulating the marker-driven path).
    await svc.store.upsert({ ...s, validationProfile: "quick" });
    await svc.approve(s.id);
    await svc.apply(s.id);
    const r = await svc.validate(s.id);
    expect(r.result.status).toBe("passed");
    expect(r.result.profileName).toBe("quick");
    expect(r.result.profileSource).toBe("suggestion");
    expect(r.result.profileCommands).toEqual(["true"]);
  });

  it("explicit profile override beats the suggestion's own profile", async () => {
    const t = await tempProjectWithWorktree({
      validate: ["true"], // default passes
      profiles: { strict: { commands: ["false"] } },
    });
    const svc = new ReviewSuggestionService(t.project, t.runId);
    const s = await svc.addManual({
      title: "Strict",
      proposedPatch: PATCH_A,
    });
    await svc.store.upsert({ ...s, validationProfile: "default" });
    await svc.approve(s.id);
    await svc.apply(s.id);
    const r = await svc.validate(s.id, { profileName: "strict" });
    expect(r.result.status).toBe("failed");
    expect(r.result.profileName).toBe("strict");
    expect(r.result.profileSource).toBe("override");
  });

  it("404s on a missing profile and never marks the suggestion validated", async () => {
    const t = await tempProjectWithWorktree({
      validate: ["true"],
      profiles: { quick: { commands: ["true"] } },
    });
    const svc = new ReviewSuggestionService(t.project, t.runId);
    const s = await svc.addManual({ title: "M", proposedPatch: PATCH_A });
    await svc.approve(s.id);
    await svc.apply(s.id);
    await expect(
      svc.validate(s.id, { profileName: "missing" }),
    ).rejects.toThrow(/not defined/i);
    const after = await svc.get(s.id);
    expect(after?.status).toBe("applied"); // unchanged
  });

  it("apply --validate --auto-revert-on-fail honors the profile choice", async () => {
    const t = await tempProjectWithWorktree({
      validate: ["true"],
      profiles: { strict: { commands: ["false"] } },
    });
    const svc = new ReviewSuggestionService(t.project, t.runId);
    const s = await svc.addManual({ title: "S", proposedPatch: PATCH_A });
    await svc.approve(s.id);
    const after = await svc.apply(s.id, {
      validateAfterApply: true,
      autoRevertOnValidationFail: true,
      profileName: "strict",
    });
    expect(after.status).toBe("reverted_after_validation_failed");
    expect(
      await fs.readFile(path.join(t.worktree, "src/a.ts"), "utf8"),
    ).toBe("export const a = 1\n");
  });

  it("preserves no_commands_configured semantics for the empty default", async () => {
    const t = await tempProjectWithWorktree({ validate: [] });
    const svc = new ReviewSuggestionService(t.project, t.runId);
    const s = await svc.addManual({ title: "E", proposedPatch: PATCH_A });
    await svc.approve(s.id);
    await svc.apply(s.id);
    const r = await svc.validate(s.id);
    expect(r.result.status).toBe("no_commands_configured");
    expect(r.result.profileName).toBe("default");
    expect(r.result.profileSource).toBe("default");
  });
});

describe("integration: bundle smart apply with profiles", () => {
  const PATCH_B = [
    "diff --git a/src/a.ts b/src/a.ts",
    "index 1111111..2222222 100644",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -1,2 +1,3 @@",
    " export const a = 1",
    " // touched-by-A",
    "+// touched-by-B",
    "",
  ].join("\n");

  it("useSuggestionProfiles makes each step pick its own profile", async () => {
    const t = await tempProjectWithWorktree({
      validate: ["false"], // default would fail; the per-suggestion profile flips this.
      profiles: { quick: { commands: ["true"] } },
    });
    const svc = new ReviewSuggestionService(t.project, t.runId);
    const a = await svc.addManual({ title: "A", proposedPatch: PATCH_A });
    await svc.store.upsert({ ...a, validationProfile: "quick" });
    const b = await svc.addManual({ title: "B", proposedPatch: PATCH_B });
    await svc.store.upsert({ ...b, validationProfile: "quick" });
    const bsvc = new SuggestionBundleService(t.project, t.runId);
    const bundle = await bsvc.create({
      title: "Pass",
      suggestionIds: [a.id, b.id],
    });
    await bsvc.approve(bundle.id);
    const r = await bsvc.smartApply(bundle.id, {
      validateEachStep: true,
      useSuggestionProfiles: true,
    });
    expect(r.bundle.status).toBe("smart_applied");
    expect(r.result.steps[0]!.validation?.profileName).toBe("quick");
    expect(r.result.steps[0]!.validation?.profileSource).toBe("suggestion");
    expect(r.result.steps[1]!.validation?.profileName).toBe("quick");
  });

  it("explicit profileName forces every step to that profile (override source)", async () => {
    const t = await tempProjectWithWorktree({
      validate: ["true"],
      profiles: { strict: { commands: ["false"] } },
    });
    const svc = new ReviewSuggestionService(t.project, t.runId);
    const a = await svc.addManual({ title: "A", proposedPatch: PATCH_A });
    const bsvc = new SuggestionBundleService(t.project, t.runId);
    const bundle = await bsvc.create({
      title: "Pass",
      suggestionIds: [a.id],
    });
    await bsvc.approve(bundle.id);
    const r = await bsvc.smartApply(bundle.id, {
      validateEachStep: true,
      profileName: "strict",
    });
    expect(r.result.steps[0]!.validation?.status).toBe("failed");
    expect(r.result.steps[0]!.validation?.profileName).toBe("strict");
    expect(r.result.steps[0]!.validation?.profileSource).toBe("override");
    expect(r.result.mode.profileOverride).toBe("strict");
  });

  it("smart apply 404s on a missing profile name and does not modify the worktree", async () => {
    const t = await tempProjectWithWorktree({ validate: ["true"] });
    const svc = new ReviewSuggestionService(t.project, t.runId);
    const a = await svc.addManual({ title: "A", proposedPatch: PATCH_A });
    const bsvc = new SuggestionBundleService(t.project, t.runId);
    const bundle = await bsvc.create({
      title: "Pass",
      suggestionIds: [a.id],
    });
    await bsvc.approve(bundle.id);
    await expect(
      bsvc.smartApply(bundle.id, {
        validateEachStep: true,
        profileName: "missing",
      }),
    ).rejects.toThrow(/not defined/i);
    expect(
      await fs.readFile(path.join(t.worktree, "src/a.ts"), "utf8"),
    ).toBe("export const a = 1\n");
  });
});

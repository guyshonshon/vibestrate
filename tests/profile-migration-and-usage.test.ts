import { afterEach, beforeEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import {
  applyMigration,
  listMigrations,
  previewMigration,
  profileEditDistance,
  suggestProfileName,
  ValidationProfileMigrationError,
} from "../src/core/validation-profile-migration-service.js";
import {
  readUsageReport,
  recordValidationProfileUsage,
} from "../src/core/validation-profile-usage-service.js";
import { ReviewSuggestionService } from "../src/reviews/review-suggestion-service.js";
import { SuggestionBundleService } from "../src/reviews/suggestion-bundle-service.js";
import { runDoctor } from "../src/setup/doctor-service.js";
import { runStateSchema } from "../src/core/state-machine.js";
import { ensureDir } from "../src/utils/fs.js";
import { runStatePath, runDir, vibestrateRoot } from "../src/utils/paths.js";
import { writeJson } from "../src/utils/json.js";
import { loadConfig } from "../src/project/config-loader.js";

async function tempProjectWithProfiles(opts: {
  validate?: string[];
  profiles?: Record<string, { description?: string; commands: string[] }>;
} = {}): Promise<{ project: string; worktree: string; runId: string }> {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-mig-"));
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

  await fs.mkdir(path.join(project, ".vibestrate"), { recursive: true });
  await fs.writeFile(
    path.join(project, ".vibestrate/project.yml"),
    [
      "project: { name: demo, type: generic }",
      "providers:",
      "  fake: { type: cli, command: /bin/true, inputMode: stdin }",
      "profiles: { fake-balanced: { provider: fake } }",
      "crews: { default: { roles: { reviewer: { seats: [reviewer], profile: fake-balanced, prompt: reviewer, permissions: read } } } }",
      "defaultCrew: default",
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
    await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-mig-wt-")),
    "wt",
  );
  await execa(
    "git",
    ["worktree", "add", "-b", "vibestrate/test", worktree, "main"],
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

// ─── edit distance + suggestion ────────────────────────────────────────────

describe("profileEditDistance + suggestProfileName", () => {
  it("computes a small distance for adjacent transpositions", () => {
    expect(profileEditDistance("quikc", "quick")).toBeLessThanOrEqual(1);
    expect(profileEditDistance("flul", "full")).toBeLessThanOrEqual(2);
  });

  it("returns infinity when lengths differ by more than 2", () => {
    expect(profileEditDistance("x", "extremely-long-name")).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it("suggests the closest known name within distance 2", () => {
    expect(suggestProfileName("quikc", ["quick", "full", "lint"])).toBe(
      "quick",
    );
    expect(suggestProfileName("unrelated", ["quick", "full"])).toBeNull();
    expect(suggestProfileName("only", [])).toBeNull();
  });
});

// ─── migration: preview / apply ────────────────────────────────────────────

describe("validation-profile-migration: preview", () => {
  let project: string;
  let runId: string;

  beforeEach(async () => {
    const t = await tempProjectWithProfiles({
      profiles: { quick: { commands: ["true"] } },
    });
    project = t.project;
    runId = t.runId;
  });

  it("finds suggestion + bundle references and writes nothing", async () => {
    const svc = new ReviewSuggestionService(project, runId);
    const s = await svc.addManual({ title: "S", proposedPatch: PATCH_A });
    await svc.store.upsert({ ...s, validationProfile: "quikc" });
    const bsvc = new SuggestionBundleService(project, runId);
    const b = await bsvc.create({ title: "P", suggestionIds: [s.id] });
    await bsvc.bundleStore.upsert({ ...b, validationProfile: "quikc" });

    const before = await fs.readFile(
      path.join(runDir(project, runId), "suggestions.json"),
      "utf8",
    );
    const cfg = await loadConfig(project);
    const preview = await previewMigration({
      projectRoot: project,
      config: cfg.config,
      fromProfile: "quikc",
      toProfile: "quick",
    });
    expect(preview.affectedSuggestions).toHaveLength(1);
    expect(preview.affectedBundles).toHaveLength(1);
    const after = await fs.readFile(
      path.join(runDir(project, runId), "suggestions.json"),
      "utf8",
    );
    expect(after).toBe(before);
    // Migrations dir was not created either.
    const auditsDir = path.join(
      vibestrateRoot(project),
      "validation-profile-migrations",
    );
    expect(
      await fs.access(auditsDir).then(
        () => true,
        () => false,
      ),
    ).toBe(false);
  });

  it("rejects fromProfile=default", async () => {
    const cfg = await loadConfig(project);
    await expect(
      previewMigration({
        projectRoot: project,
        config: cfg.config,
        fromProfile: "default",
        toProfile: "quick",
      }),
    ).rejects.toBeInstanceOf(ValidationProfileMigrationError);
  });

  it("rejects toProfile that doesn't exist", async () => {
    const cfg = await loadConfig(project);
    await expect(
      previewMigration({
        projectRoot: project,
        config: cfg.config,
        fromProfile: "quikc",
        toProfile: "missing",
      }),
    ).rejects.toBeInstanceOf(ValidationProfileMigrationError);
  });

  it("tolerates a malformed suggestions.json", async () => {
    await fs.writeFile(
      path.join(runDir(project, runId), "suggestions.json"),
      "{ not json",
    );
    const cfg = await loadConfig(project);
    const preview = await previewMigration({
      projectRoot: project,
      config: cfg.config,
      fromProfile: "quikc",
      toProfile: "quick",
    });
    expect(preview.malformedFiles.length).toBe(1);
    expect(preview.affectedSuggestions).toEqual([]);
  });

  it("scope=run only scans the specified run", async () => {
    // Add a second run with a stale reference.
    const runB = "run-2";
    await ensureDir(runDir(project, runB));
    const ts = new Date().toISOString();
    await writeJson(
      runStatePath(project, runB),
      runStateSchema.parse({
        runId: runB,
        task: "fixture-2",
        status: "merge_ready",
        projectRoot: project,
        worktreePath: null,
        branchName: null,
        reviewLoopCount: 0,
        maxReviewLoops: 2,
        startedAt: ts,
        updatedAt: ts,
        finalDecision: null,
        verification: null,
        error: null,
      }),
    );
    const svcB = new ReviewSuggestionService(project, runB);
    const s = await svcB.addManual({ title: "S", proposedPatch: PATCH_A });
    await svcB.store.upsert({ ...s, validationProfile: "quikc" });

    const cfg = await loadConfig(project);
    const preview = await previewMigration({
      projectRoot: project,
      config: cfg.config,
      fromProfile: "quikc",
      toProfile: "quick",
      scope: { kind: "run", runId: runB },
    });
    expect(preview.scannedRuns).toBe(1);
    expect(preview.affectedSuggestions).toHaveLength(1);
    expect(preview.affectedSuggestions[0]!.runId).toBe(runB);
  });
});

describe("validation-profile-migration: apply", () => {
  let project: string;
  let runId: string;

  beforeEach(async () => {
    const t = await tempProjectWithProfiles({
      profiles: { quick: { commands: ["true"] } },
    });
    project = t.project;
    runId = t.runId;
  });

  it("rewrites suggestion + bundle references and writes an audit file", async () => {
    const svc = new ReviewSuggestionService(project, runId);
    const s = await svc.addManual({ title: "S", proposedPatch: PATCH_A });
    await svc.store.upsert({ ...s, validationProfile: "quikc" });
    const bsvc = new SuggestionBundleService(project, runId);
    const b = await bsvc.create({ title: "P", suggestionIds: [s.id] });
    await bsvc.bundleStore.upsert({ ...b, validationProfile: "quikc" });

    const cfg = await loadConfig(project);
    const audit = await applyMigration({
      projectRoot: project,
      config: cfg.config,
      fromProfile: "quikc",
      toProfile: "quick",
    });
    expect(audit.appliedAt).not.toBeNull();
    expect(audit.affectedSuggestions).toHaveLength(1);
    expect(audit.affectedBundles).toHaveLength(1);

    const sNow = await svc.get(s.id);
    expect(sNow?.validationProfile).toBe("quick");
    const bNow = await bsvc.get(b.id);
    expect(bNow?.validationProfile).toBe("quick");

    const all = await listMigrations(project);
    expect(all.map((m) => m.id)).toContain(audit.id);
  });

  it("clears to default when toProfile is null", async () => {
    const svc = new ReviewSuggestionService(project, runId);
    const s = await svc.addManual({ title: "S", proposedPatch: PATCH_A });
    await svc.store.upsert({ ...s, validationProfile: "quikc" });
    const cfg = await loadConfig(project);
    await applyMigration({
      projectRoot: project,
      config: cfg.config,
      fromProfile: "quikc",
      toProfile: null,
    });
    const sNow = await svc.get(s.id);
    expect(sNow?.validationProfile).toBeNull();
  });

  it("does not modify unrelated fields", async () => {
    const svc = new ReviewSuggestionService(project, runId);
    const s = await svc.addManual({
      title: "S",
      body: "untouched",
      proposedPatch: PATCH_A,
    });
    await svc.store.upsert({ ...s, validationProfile: "quikc" });
    const cfg = await loadConfig(project);
    await applyMigration({
      projectRoot: project,
      config: cfg.config,
      fromProfile: "quikc",
      toProfile: "quick",
    });
    const after = await svc.get(s.id);
    expect(after?.body).toBe("untouched");
    expect(after?.proposedPatch).toBe(PATCH_A);
    expect(after?.status).toBe(s.status);
  });
});

// ─── usage counters ────────────────────────────────────────────────────────

describe("validation-profile-usage", () => {
  let project: string;
  let runId: string;
  beforeEach(async () => {
    const t = await tempProjectWithProfiles({
      validate: ["true"],
      profiles: { quick: { commands: ["true"] } },
    });
    project = t.project;
    runId = t.runId;
  });

  it("increments on actual suggestion validation, skips no_commands_configured", async () => {
    const svc = new ReviewSuggestionService(project, runId);
    const s = await svc.addManual({ title: "S", proposedPatch: PATCH_A });
    await svc.approve(s.id);
    await svc.apply(s.id);
    await svc.validate(s.id, { profileName: "quick" });
    const r1 = await readUsageReport(project);
    expect(r1.entries.find((e) => e.profileName === "quick")?.totalUses).toBe(
      1,
    );

    // Now configure an empty default profile (commands.validate=[]) and validate
    // again — should NOT increment.
    const ymlPath = path.join(project, ".vibestrate/project.yml");
    const yml = await fs.readFile(ymlPath, "utf8");
    await fs.writeFile(ymlPath, yml.replace('"true"', "")); // breaks validate to []
    // Easier: write a fresh yml.
    await fs.writeFile(
      ymlPath,
      [
        "project: { name: demo, type: generic }",
        "providers:",
        "  fake: { type: cli, command: /bin/true, inputMode: stdin }",
        "profiles: { fake-balanced: { provider: fake } }",
        "crews: { default: { roles: { reviewer: { seats: [reviewer], profile: fake-balanced, prompt: reviewer, permissions: read } } } }",
        "defaultCrew: default",
        "commands:",
        '  validate: []',
        "",
      ].join("\n"),
    );
    const before = await readUsageReport(project);
    const r = await svc.validate(s.id);
    expect(r.result.status).toBe("no_commands_configured");
    const after = await readUsageReport(project);
    expect(after.entries).toEqual(before.entries);
  });

  it("never mutates project.yml", async () => {
    const ymlPath = path.join(project, ".vibestrate/project.yml");
    const before = await fs.readFile(ymlPath, "utf8");
    await recordValidationProfileUsage({
      projectRoot: project,
      profileName: "quick",
      source: "named",
      runId,
    });
    const after = await fs.readFile(ymlPath, "utf8");
    expect(after).toBe(before);
  });

  it("tolerates a corrupt usage file", async () => {
    await ensureDir(vibestrateRoot(project));
    await fs.writeFile(
      path.join(vibestrateRoot(project), "validation-profile-usage.json"),
      "{ not json",
    );
    // Recording should succeed (overwrites the corrupt file with a clean
    // entries list) and the read should return at least the entry we wrote.
    await recordValidationProfileUsage({
      projectRoot: project,
      profileName: "quick",
      source: "named",
      runId,
    });
    const r = await readUsageReport(project);
    expect(r.entries.find((e) => e.profileName === "quick")?.totalUses).toBe(
      1,
    );
  });
});

// ─── doctor did-you-mean ───────────────────────────────────────────────────

describe("doctor: did-you-mean hint", () => {
  it("includes did-you-mean + migrate dry-run when a close match exists", async () => {
    const t = await tempProjectWithProfiles({
      validate: ["true"],
      profiles: { quick: { commands: ["true"] } },
    });
    const svc = new ReviewSuggestionService(t.project, t.runId);
    const s = await svc.addManual({ title: "S", proposedPatch: PATCH_A });
    await svc.store.upsert({ ...s, validationProfile: "quikc" });
    const r = await runDoctor({ cwd: t.project });
    const finding = r.findings.find(
      (f) => f.id === "validation-profiles-stale-suggestions",
    );
    expect(finding?.detail ?? "").toMatch(/did you mean "quick"/i);
    expect(finding?.detail ?? "").toMatch(/migrate quikc quick --dry-run/);
  });

  it("omits did-you-mean when no profile is close", async () => {
    const t = await tempProjectWithProfiles({
      validate: ["true"],
      profiles: { full: { commands: ["true"] } },
    });
    const svc = new ReviewSuggestionService(t.project, t.runId);
    const s = await svc.addManual({ title: "S", proposedPatch: PATCH_A });
    await svc.store.upsert({ ...s, validationProfile: "completely-unrelated" });
    const r = await runDoctor({ cwd: t.project });
    const finding = r.findings.find(
      (f) => f.id === "validation-profiles-stale-suggestions",
    );
    expect(finding?.detail ?? "").not.toMatch(/did you mean/i);
  });
});

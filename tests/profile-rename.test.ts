import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import {
  applyRename,
  previewRename,
  ValidationProfileRenameError,
} from "../src/core/validation-profile-rename-service.js";
import * as migrationService from "../src/core/validation-profile-migration-service.js";
import { listMigrations } from "../src/core/validation-profile-migration-service.js";
import { ReviewSuggestionService } from "../src/reviews/review-suggestion-service.js";
import { SuggestionBundleService } from "../src/reviews/suggestion-bundle-service.js";
import { runStateSchema } from "../src/core/state-machine.js";
import { ensureDir } from "../src/utils/fs.js";
import { runStatePath, runDir, amacoRoot } from "../src/utils/paths.js";
import { writeJson } from "../src/utils/json.js";
import { loadConfig } from "../src/project/config-loader.js";

type ProfileSpec = { description?: string; commands: string[] };

async function tempProjectWithProfiles(opts: {
  validate?: string[];
  profiles?: Record<string, ProfileSpec>;
}): Promise<{ project: string; runId: string }> {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), "amaco-rename-"));
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
      "roles:",
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
  return { project, runId };
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

describe("validation-profile-rename: previewRename validation", () => {
  let project: string;

  beforeEach(async () => {
    const t = await tempProjectWithProfiles({
      profiles: {
        quikc: { description: "fast smoke", commands: ["true"] },
        full: { commands: ["true", "true"] },
      },
    });
    project = t.project;
  });

  it("returns preserved description + command count and lists no-op refs when none exist", async () => {
    const cfg = await loadConfig(project);
    const r = await previewRename({
      projectRoot: project,
      config: cfg.config,
      fromProfile: "quikc",
      toProfile: "quick",
    });
    expect(r.fromProfile).toBe("quikc");
    expect(r.toProfile).toBe("quick");
    expect(r.preservedDescription).toBe("fast smoke");
    expect(r.preservedCommandCount).toBe(1);
    expect(r.affectedSuggestions).toEqual([]);
    expect(r.affectedBundles).toEqual([]);
  });

  it("rejects renaming a profile that does not exist", async () => {
    const cfg = await loadConfig(project);
    await expect(
      previewRename({
        projectRoot: project,
        config: cfg.config,
        fromProfile: "ghost",
        toProfile: "newname",
      }),
    ).rejects.toBeInstanceOf(ValidationProfileRenameError);
  });

  it("rejects renaming onto an existing profile (must use migrate instead)", async () => {
    const cfg = await loadConfig(project);
    await expect(
      previewRename({
        projectRoot: project,
        config: cfg.config,
        fromProfile: "quikc",
        toProfile: "full",
      }),
    ).rejects.toThrow(/already exists/);
  });

  it("rejects reserved target names (default, all, none)", async () => {
    const cfg = await loadConfig(project);
    for (const reserved of ["default", "all", "none"]) {
      await expect(
        previewRename({
          projectRoot: project,
          config: cfg.config,
          fromProfile: "quikc",
          toProfile: reserved,
        }),
      ).rejects.toThrow(/reserved/);
    }
  });

  it("rejects reserved source names", async () => {
    const cfg = await loadConfig(project);
    await expect(
      previewRename({
        projectRoot: project,
        config: cfg.config,
        fromProfile: "default",
        toProfile: "anything",
      }),
    ).rejects.toThrow(/default/);
  });

  it("rejects identical from and to", async () => {
    const cfg = await loadConfig(project);
    await expect(
      previewRename({
        projectRoot: project,
        config: cfg.config,
        fromProfile: "quikc",
        toProfile: "quikc",
      }),
    ).rejects.toThrow(/same/);
  });

  it("rejects toProfile that fails the name regex", async () => {
    const cfg = await loadConfig(project);
    await expect(
      previewRename({
        projectRoot: project,
        config: cfg.config,
        fromProfile: "quikc",
        toProfile: "has space",
      }),
    ).rejects.toThrow(/valid profile id/);
  });
});

describe("validation-profile-rename: applyRename", () => {
  let project: string;
  let runId: string;

  beforeEach(async () => {
    const t = await tempProjectWithProfiles({
      profiles: {
        quikc: { description: "fast smoke", commands: ["true", "echo hi"] },
      },
    });
    project = t.project;
    runId = t.runId;
  });

  afterEach(async () => {
    await fs.rm(project, { recursive: true, force: true });
  });

  it("rewrites project.yml, migrates references, and writes one rename_profile audit", async () => {
    // Seed a suggestion + bundle that reference the old name.
    const svc = new ReviewSuggestionService(project, runId);
    const s = await svc.addManual({ title: "S", proposedPatch: PATCH_A });
    await svc.store.upsert({ ...s, validationProfile: "quikc" });
    const bsvc = new SuggestionBundleService(project, runId);
    const b = await bsvc.create({ title: "P", suggestionIds: [s.id] });
    await bsvc.bundleStore.upsert({ ...b, validationProfile: "quikc" });

    const cfg = await loadConfig(project);
    const audit = await applyRename({
      projectRoot: project,
      config: cfg.config,
      fromProfile: "quikc",
      toProfile: "quick",
    });

    // 1. project.yml has been rewritten.
    const yml = await fs.readFile(
      path.join(project, ".amaco/project.yml"),
      "utf8",
    );
    expect(yml).toMatch(/\bquick:/);
    expect(yml).not.toMatch(/\bquikc:/);
    // description + commands preserved
    expect(yml).toMatch(/description:\s+["']?fast smoke["']?/);
    expect(yml).toMatch(/echo hi/);

    // 2. references migrated.
    const after = await svc.get(s.id);
    expect(after?.validationProfile).toBe("quick");
    const afterBundle = await bsvc.get(b.id);
    expect(afterBundle?.validationProfile).toBe("quick");

    // 3. audit record has rename-specific metadata.
    expect(audit.kind).toBe("rename_profile");
    expect(audit.renamedProfile).toBe(true);
    expect(audit.preservedDescription).toBe("fast smoke");
    expect(audit.preservedCommandCount).toBe(2);
    expect(audit.fromProfile).toBe("quikc");
    expect(audit.toProfile).toBe("quick");
    expect(audit.affectedSuggestions).toHaveLength(1);
    expect(audit.affectedBundles).toHaveLength(1);

    // 4. exactly one audit file exists.
    const auditDir = path.join(
      amacoRoot(project),
      "validation-profile-migrations",
    );
    const entries = (await fs.readdir(auditDir)).filter((n) =>
      n.endsWith(".json"),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toBe(`${audit.id}.json`);

    // 5. listMigrations sees it as rename_profile.
    const all = await listMigrations(project);
    expect(all).toHaveLength(1);
    expect(all[0]?.kind).toBe("rename_profile");
  });

  it("rolls back project.yml when applyMigration throws after the yml has been written", async () => {
    // Force applyMigration to throw mid-flight. Because applyRename writes
    // project.yml BEFORE calling applyMigration, this exercises the
    // rollback path that restores the original YAML.
    const spy = vi
      .spyOn(migrationService, "applyMigration")
      .mockRejectedValueOnce(new Error("forced migration failure"));

    const cfg = await loadConfig(project);
    const ymlBefore = await fs.readFile(
      path.join(project, ".amaco/project.yml"),
      "utf8",
    );

    try {
      await expect(
        applyRename({
          projectRoot: project,
          config: cfg.config,
          fromProfile: "quikc",
          toProfile: "quick",
        }),
      ).rejects.toThrow(/forced migration failure/);

      // project.yml has been restored to its pre-rename state.
      const ymlAfter = await fs.readFile(
        path.join(project, ".amaco/project.yml"),
        "utf8",
      );
      expect(ymlAfter).toBe(ymlBefore);
      expect(ymlAfter).toMatch(/\bquikc:/);
      expect(ymlAfter).not.toMatch(/\bquick:/);

      // No audit was written either.
      const auditDir = path.join(
        amacoRoot(project),
        "validation-profile-migrations",
      );
      const exists = await fs
        .access(auditDir)
        .then(() => true)
        .catch(() => false);
      if (exists) {
        const entries = await fs.readdir(auditDir);
        expect(entries.filter((n) => n.endsWith(".json"))).toEqual([]);
      }
    } finally {
      spy.mockRestore();
    }
  });

  it("does not touch validation-results.json (historical results preserved)", async () => {
    // Seed a historical validation-results file that contains the old
    // profile name. Rename should leave it alone — runs should keep the
    // profile metadata they ran with.
    const histPath = path.join(
      runDir(project, runId),
      "validation-results.json",
    );
    const original = {
      results: [
        {
          suggestionId: "x",
          status: "passed",
          profile: { profileName: "quikc", source: "named" },
        },
      ],
    };
    await fs.writeFile(histPath, JSON.stringify(original, null, 2));

    const cfg = await loadConfig(project);
    await applyRename({
      projectRoot: project,
      config: cfg.config,
      fromProfile: "quikc",
      toProfile: "quick",
    });

    const after = JSON.parse(await fs.readFile(histPath, "utf8"));
    expect(after).toEqual(original);
  });
});

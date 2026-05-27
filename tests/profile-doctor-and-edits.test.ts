import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import {
  auditValidationProfileReferences,
  ValidationProfileAuditError,
} from "../src/core/validation-profile-audit-service.js";
import { runDoctor } from "../src/setup/doctor-service.js";
import { applyDoctorFixes } from "../src/setup/doctor-service.js";
import { ReviewSuggestionService } from "../src/reviews/review-suggestion-service.js";
import { SuggestionBundleService } from "../src/reviews/suggestion-bundle-service.js";
import { runStateSchema } from "../src/core/state-machine.js";
import { ensureDir } from "../src/utils/fs.js";
import { runStatePath, runDir } from "../src/utils/paths.js";
import { writeJson } from "../src/utils/json.js";
import { loadConfig } from "../src/project/config-loader.js";

async function tempProjectWithProfiles(opts: {
  validate?: string[];
  profiles?: Record<string, { description?: string; commands: string[] }>;
} = {}): Promise<{ project: string; worktree: string; runId: string }> {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), "amaco-pde-"));
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

  const worktree = path.join(
    await fs.mkdtemp(path.join(os.tmpdir(), "amaco-pde-wt-")),
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

describe("validation-profile-audit-service", () => {
  it("returns empty when no runs exist", async () => {
    const t = await tempProjectWithProfiles({ profiles: { quick: { commands: ["true"] } } });
    // Wipe the run dir so the audit sees zero runs.
    await fs.rm(runDir(t.project, t.runId), { recursive: true });
    const cfg = await loadConfig(t.project);
    const r = await auditValidationProfileReferences(t.project, cfg.config);
    expect(r.scannedRuns).toBe(0);
    expect(r.staleSuggestionReferences).toEqual([]);
  });

  it("flags suggestions referencing a missing profile", async () => {
    const t = await tempProjectWithProfiles({
      validate: ["true"],
      profiles: { quick: { commands: ["true"] } },
    });
    const svc = new ReviewSuggestionService(t.project, t.runId);
    const s = await svc.addManual({ title: "S", proposedPatch: PATCH_A });
    await svc.store.upsert({ ...s, validationProfile: "missing" });
    const cfg = await loadConfig(t.project);
    const r = await auditValidationProfileReferences(t.project, cfg.config);
    expect(r.staleSuggestionReferences).toHaveLength(1);
    expect(r.staleSuggestionReferences[0]!.profileName).toBe("missing");
    expect(r.staleSuggestionReferences[0]!.kind).toBe("suggestion");
  });

  it("flags bundles referencing a missing profile", async () => {
    const t = await tempProjectWithProfiles({
      validate: ["true"],
      profiles: { quick: { commands: ["true"] } },
    });
    const svc = new ReviewSuggestionService(t.project, t.runId);
    const a = await svc.addManual({ title: "A", proposedPatch: PATCH_A });
    const bsvc = new SuggestionBundleService(t.project, t.runId);
    const b = await bsvc.create({ title: "P", suggestionIds: [a.id] });
    // Stamp a missing profile directly via the store (we never expose this
    // path through the public API).
    await bsvc.bundleStore.upsert({ ...b, validationProfile: "ghost" });
    const cfg = await loadConfig(t.project);
    const r = await auditValidationProfileReferences(t.project, cfg.config);
    expect(r.staleBundleReferences).toHaveLength(1);
    expect(r.staleBundleReferences[0]!.profileName).toBe("ghost");
  });

  it("tolerates a malformed suggestions.json without crashing", async () => {
    const t = await tempProjectWithProfiles();
    await fs.writeFile(
      path.join(runDir(t.project, t.runId), "suggestions.json"),
      "{ this isn't json",
    );
    const cfg = await loadConfig(t.project);
    const r = await auditValidationProfileReferences(t.project, cfg.config);
    expect(r.malformedFiles.length).toBe(1);
    expect(r.staleSuggestionReferences).toEqual([]);
  });

  it("ignores 'default' as a valid profile reference", async () => {
    const t = await tempProjectWithProfiles({ validate: ["true"] });
    const svc = new ReviewSuggestionService(t.project, t.runId);
    const s = await svc.addManual({ title: "S", proposedPatch: PATCH_A });
    await svc.store.upsert({ ...s, validationProfile: "default" });
    const cfg = await loadConfig(t.project);
    const r = await auditValidationProfileReferences(t.project, cfg.config);
    expect(r.staleSuggestionReferences).toEqual([]);
  });

  it("recent scope (default) caps the scan at 50 runs", async () => {
    const t = await tempProjectWithProfiles({ validate: ["true"] });
    // Create 60 extra run dirs, each with a single stale suggestion. Lex
    // sort puts the oldest first — so the most recent 50 should win.
    for (let i = 1; i <= 60; i++) {
      const id = `run-${String(i + 100).padStart(4, "0")}`;
      await fs.mkdir(path.join(t.project, ".amaco/runs", id), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(t.project, ".amaco/runs", id, "suggestions.json"),
        JSON.stringify({
          suggestions: [{ id: "s-1", validationProfile: "missing" }],
        }),
      );
    }
    const cfg = await loadConfig(t.project);
    const r = await auditValidationProfileReferences(t.project, cfg.config);
    expect(r.scope).toEqual({ kind: "recent" });
    expect(r.scannedRuns).toBe(50);
    // The recent-50 window includes the harness-created run-1 (no
    // suggestions.json), so 49 of the 50 contribute stale refs. The point
    // of the test is that the cap is observed — not the exact stale count.
    expect(r.staleSuggestionReferences.length).toBeLessThan(60);
    expect(r.staleSuggestionReferences.length).toBeGreaterThanOrEqual(49);
  });

  it("all scope lifts the 50-run cap", async () => {
    const t = await tempProjectWithProfiles({ validate: ["true"] });
    for (let i = 1; i <= 60; i++) {
      const id = `run-${String(i + 100).padStart(4, "0")}`;
      await fs.mkdir(path.join(t.project, ".amaco/runs", id), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(t.project, ".amaco/runs", id, "suggestions.json"),
        JSON.stringify({
          suggestions: [{ id: "s-1", validationProfile: "missing" }],
        }),
      );
    }
    const cfg = await loadConfig(t.project);
    const r = await auditValidationProfileReferences(t.project, cfg.config, {
      scope: { kind: "all" },
    });
    expect(r.scope).toEqual({ kind: "all" });
    // 60 extras + the run-1 from tempProjectWithProfiles (which has no
    // suggestions.json by default).
    expect(r.scannedRuns).toBe(61);
    expect(r.staleSuggestionReferences.length).toBe(60);
  });

  it("run scope only scans the given runId", async () => {
    const t = await tempProjectWithProfiles({ validate: ["true"] });
    for (const id of ["run-aaa", "run-bbb"]) {
      await fs.mkdir(path.join(t.project, ".amaco/runs", id), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(t.project, ".amaco/runs", id, "suggestions.json"),
        JSON.stringify({
          suggestions: [{ id: `${id}-s`, validationProfile: "missing" }],
        }),
      );
    }
    const cfg = await loadConfig(t.project);
    const r = await auditValidationProfileReferences(t.project, cfg.config, {
      scope: { kind: "run", runId: "run-bbb" },
    });
    expect(r.scope).toEqual({ kind: "run", runId: "run-bbb" });
    expect(r.scannedRuns).toBe(1);
    expect(r.staleSuggestionReferences.map((s) => s.id)).toEqual(["run-bbb-s"]);
  });

  it("run scope returns scannedRuns:0 for a missing runId without throwing", async () => {
    const t = await tempProjectWithProfiles({ validate: ["true"] });
    const cfg = await loadConfig(t.project);
    const r = await auditValidationProfileReferences(t.project, cfg.config, {
      scope: { kind: "run", runId: "run-ghost" },
    });
    expect(r.scannedRuns).toBe(0);
    expect(r.staleSuggestionReferences).toEqual([]);
  });

  it("run scope rejects an unsafe runId", async () => {
    const t = await tempProjectWithProfiles({ validate: ["true"] });
    const cfg = await loadConfig(t.project);
    await expect(
      auditValidationProfileReferences(t.project, cfg.config, {
        scope: { kind: "run", runId: "../escape" },
      }),
    ).rejects.toBeInstanceOf(ValidationProfileAuditError);
  });
});

describe("doctor: validation profiles section", () => {
  it("reports each named profile and the default count", async () => {
    const t = await tempProjectWithProfiles({
      validate: ["true", "false"],
      profiles: {
        quick: { commands: ["true"] },
        full: { commands: ["true", "false", "true"] },
      },
    });
    const r = await runDoctor({ cwd: t.project });
    const named = r.findings.find(
      (f) => f.id === "validation-profiles-named",
    );
    expect(named?.title).toMatch(/quick \(1\)/);
    expect(named?.title).toMatch(/full \(3\)/);
    const def = r.findings.find((f) => f.id === "validation-empty");
    expect(def?.severity).toBe("ok");
    expect(def?.title).toMatch(/2 validation command/);
  });

  it("flags stale suggestion profile references via doctor", async () => {
    const t = await tempProjectWithProfiles({
      validate: ["true"],
      profiles: { quick: { commands: ["true"] } },
    });
    const svc = new ReviewSuggestionService(t.project, t.runId);
    const s = await svc.addManual({ title: "S", proposedPatch: PATCH_A });
    await svc.store.upsert({ ...s, validationProfile: "missing" });
    const r = await runDoctor({ cwd: t.project });
    const finding = r.findings.find(
      (f) => f.id === "validation-profiles-stale-suggestions",
    );
    expect(finding?.severity).toBe("warn");
    expect(finding?.title).toMatch(/1 suggestion/);
    expect(finding?.detail ?? "").toMatch(/"missing"/);
  });

  it("doctor --fix does not modify validation profiles or references", async () => {
    const t = await tempProjectWithProfiles({
      validate: ["true"],
      profiles: { quick: { commands: ["true"] } },
    });
    const svc = new ReviewSuggestionService(t.project, t.runId);
    const s = await svc.addManual({ title: "S", proposedPatch: PATCH_A });
    await svc.store.upsert({ ...s, validationProfile: "missing" });
    const ymlBefore = await fs.readFile(
      path.join(t.project, ".amaco/project.yml"),
      "utf8",
    );
    const sjBefore = await fs.readFile(
      path.join(runDir(t.project, t.runId), "suggestions.json"),
      "utf8",
    );
    const fix = await applyDoctorFixes({ projectRoot: t.project });
    void fix;
    const ymlAfter = await fs.readFile(
      path.join(t.project, ".amaco/project.yml"),
      "utf8",
    );
    const sjAfter = await fs.readFile(
      path.join(runDir(t.project, t.runId), "suggestions.json"),
      "utf8",
    );
    expect(ymlAfter).toBe(ymlBefore);
    expect(sjAfter).toBe(sjBefore);
  });
});

describe("ReviewSuggestionService.updateValidationProfile", () => {
  let project: string;
  let runId: string;

  beforeEach(async () => {
    const t = await tempProjectWithProfiles({
      validate: ["true"],
      profiles: { quick: { commands: ["true"] }, strict: { commands: ["false"] } },
    });
    project = t.project;
    runId = t.runId;
  });

  it("sets a profile and persists", async () => {
    const svc = new ReviewSuggestionService(project, runId);
    const s = await svc.addManual({ title: "S", proposedPatch: PATCH_A });
    const updated = await svc.updateValidationProfile(s.id, "quick");
    expect(updated.validationProfile).toBe("quick");
    const reread = await svc.get(s.id);
    expect(reread?.validationProfile).toBe("quick");
  });

  it("rejects a missing profile name", async () => {
    const svc = new ReviewSuggestionService(project, runId);
    const s = await svc.addManual({ title: "S", proposedPatch: PATCH_A });
    await expect(svc.updateValidationProfile(s.id, "ghost")).rejects.toThrow(
      /not defined/i,
    );
    // status / patch unchanged
    const after = await svc.get(s.id);
    expect(after?.validationProfile).toBeNull();
    expect(after?.status).toBe("open");
  });

  it("clears with null, '', and 'default'", async () => {
    const svc = new ReviewSuggestionService(project, runId);
    const s = await svc.addManual({ title: "S", proposedPatch: PATCH_A });
    await svc.updateValidationProfile(s.id, "quick");
    expect((await svc.get(s.id))?.validationProfile).toBe("quick");
    await svc.updateValidationProfile(s.id, null);
    expect((await svc.get(s.id))?.validationProfile).toBeNull();
    await svc.updateValidationProfile(s.id, "quick");
    await svc.updateValidationProfile(s.id, "");
    expect((await svc.get(s.id))?.validationProfile).toBeNull();
    await svc.updateValidationProfile(s.id, "quick");
    await svc.updateValidationProfile(s.id, "default");
    expect((await svc.get(s.id))?.validationProfile).toBeNull();
  });

  it("does not change apply/revert lifecycle status", async () => {
    const svc = new ReviewSuggestionService(project, runId);
    const s = await svc.addManual({ title: "S", proposedPatch: PATCH_A });
    await svc.approve(s.id);
    await svc.apply(s.id);
    const before = await svc.get(s.id);
    await svc.updateValidationProfile(s.id, "strict");
    const after = await svc.get(s.id);
    expect(after?.status).toBe(before?.status);
  });
});

describe("SuggestionBundleService.updateValidationProfile", () => {
  let project: string;
  let runId: string;

  beforeEach(async () => {
    const t = await tempProjectWithProfiles({
      validate: ["true"],
      profiles: { full: { commands: ["true"] } },
    });
    project = t.project;
    runId = t.runId;
  });

  it("sets, clears, and rejects missing", async () => {
    const svc = new ReviewSuggestionService(project, runId);
    const a = await svc.addManual({ title: "A", proposedPatch: PATCH_A });
    const bsvc = new SuggestionBundleService(project, runId);
    const b = await bsvc.create({ title: "P", suggestionIds: [a.id] });
    expect(b.validationProfile).toBeNull();
    const set = await bsvc.updateValidationProfile(b.id, "full");
    expect(set.validationProfile).toBe("full");
    await expect(
      bsvc.updateValidationProfile(b.id, "ghost"),
    ).rejects.toThrow(/not defined/i);
    const cleared = await bsvc.updateValidationProfile(b.id, null);
    expect(cleared.validationProfile).toBeNull();
  });
});

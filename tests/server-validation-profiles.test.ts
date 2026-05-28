import { afterEach, beforeEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { startServer, type StartedServer } from "../src/server/server.js";
import { applySetup } from "../src/setup/setup-service.js";
import { writeJson } from "../src/utils/json.js";
import { runStatePath, runDir } from "../src/utils/paths.js";
import { ensureDir } from "../src/utils/fs.js";
import { runStateSchema } from "../src/core/state-machine.js";
import { ReviewSuggestionService } from "../src/reviews/review-suggestion-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeProject(opts: { profiles?: boolean } = {}): Promise<{
  project: string;
  worktree: string;
  runId: string;
}> {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-vp-srv-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: project });
  await execa("git", ["config", "user.email", "x@x"], { cwd: project });
  await execa("git", ["config", "user.name", "x"], { cwd: project });
  await fs.writeFile(path.join(project, "package.json"), '{"name":"demo"}');
  await fs.mkdir(path.join(project, "src"), { recursive: true });
  await fs.writeFile(path.join(project, "src", "a.ts"), "export const a = 1\n");
  await execa("git", ["add", "."], { cwd: project });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: project });
  await applySetup({
    options: { projectRoot: project },
    detectionRunner: noProvider,
  });
  if (opts.profiles) {
    // Append validation profiles to the generated project.yml so the
    // validation/profiles endpoint has something to list. The schema's full
    // shape is already satisfied by the generator; we only need to add the
    // commands.* keys.
    const yml = await fs.readFile(
      path.join(project, ".vibestrate/project.yml"),
      "utf8",
    );
    const replaced = yml.replace(
      /^commands:\n  validate: \[\]\n/m,
      [
        "commands:",
        '  validate: ["true"]',
        "  validationProfiles:",
        "    quick:",
        "      description: Fast",
        "      commands:",
        '        - "true"',
        "    strict:",
        "      commands:",
        '        - "false"',
        "",
      ].join("\n"),
    );
    await fs.writeFile(path.join(project, ".vibestrate/project.yml"), replaced);
  }
  const worktree = path.join(
    await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-vp-srv-wt-")),
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

let server: StartedServer | null = null;
afterEach(async () => {
  if (server) await server.close();
  server = null;
});

const PATCH_A = [
  "diff --git a/src/a.ts b/src/a.ts",
  "index 0000000..1111111 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1 +1,2 @@",
  " export const a = 1",
  "+// noted",
  "",
].join("\n");

describe("server: GET /api/validation/profiles", () => {
  it("lists default + named profiles", async () => {
    const t = await makeProject({ profiles: true });
    server = await startServer({
      projectRoot: t.project,
      port: 0,
      host: "127.0.0.1",
    });
    const r = (await fetch(`${server.url}/api/validation/profiles`).then(
      (res) => res.json(),
    )) as { profiles: { profileName: string; hasCommands: boolean }[] };
    const names = r.profiles.map((p) => p.profileName);
    expect(names).toEqual(["default", "quick", "strict"]);
    expect(r.profiles[0]!.hasCommands).toBe(true);
  });

  it("returns just the implicit default when no project.yml profiles are set", async () => {
    const t = await makeProject({ profiles: false });
    server = await startServer({
      projectRoot: t.project,
      port: 0,
      host: "127.0.0.1",
    });
    const r = (await fetch(`${server.url}/api/validation/profiles`).then(
      (res) => res.json(),
    )) as { profiles: { profileName: string }[] };
    expect(r.profiles.map((p) => p.profileName)).toEqual(["default"]);
  });
});

describe("server: validationProfile body flag", () => {
  it("rejects validationProfile on apply when validateAfterApply is false", async () => {
    const t = await makeProject({ profiles: true });
    server = await startServer({
      projectRoot: t.project,
      port: 0,
      host: "127.0.0.1",
    });
    const svc = new ReviewSuggestionService(t.project, t.runId);
    const s = await svc.addManual({ title: "T", proposedPatch: PATCH_A });
    await svc.approve(s.id);
    const res = await fetch(
      `${server.url}/api/runs/${t.runId}/suggestions/${s.id}/apply`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ validationProfile: "quick" }),
      },
    );
    expect(res.status).toBe(400);
  });

  it("404s on a missing profile name when validating", async () => {
    const t = await makeProject({ profiles: true });
    server = await startServer({
      projectRoot: t.project,
      port: 0,
      host: "127.0.0.1",
    });
    const svc = new ReviewSuggestionService(t.project, t.runId);
    const s = await svc.addManual({ title: "T", proposedPatch: PATCH_A });
    await svc.approve(s.id);
    await svc.apply(s.id);
    const res = await fetch(
      `${server.url}/api/runs/${t.runId}/suggestions/${s.id}/validate`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ validationProfile: "missing" }),
      },
    );
    expect(res.status).toBe(404);
  });
});

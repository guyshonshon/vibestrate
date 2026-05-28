import { afterEach, describe, expect, it } from "vitest";
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
import { SuggestionBundleService } from "../src/reviews/suggestion-bundle-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeProject(): Promise<{
  project: string;
  worktree: string;
  runId: string;
}> {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-pe-srv-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: project });
  await execa("git", ["config", "user.email", "x@x"], { cwd: project });
  await execa("git", ["config", "user.name", "x"], { cwd: project });
  await fs.writeFile(path.join(project, "package.json"), '{"name":"demo"}');
  await fs.mkdir(path.join(project, "src"), { recursive: true });
  await fs.writeFile(
    path.join(project, "src", "a.ts"),
    "export const a = 1\n",
  );
  await execa("git", ["add", "."], { cwd: project });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: project });
  await applySetup({
    options: { projectRoot: project },
    detectionRunner: noProvider,
  });
  const yml = await fs.readFile(
    path.join(project, ".vibestrate/project.yml"),
    "utf8",
  );
  await fs.writeFile(
    path.join(project, ".vibestrate/project.yml"),
    yml.replace(
      /^commands:\n  validate: \[\]\n/m,
      [
        "commands:",
        '  validate: ["true"]',
        "  validationProfiles:",
        "    quick:",
        "      commands:",
        '        - "true"',
        "",
      ].join("\n"),
    ),
  );
  const worktree = path.join(
    await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-pe-srv-wt-")),
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
  "+// noted",
  "",
].join("\n");

let server: StartedServer | null = null;
afterEach(async () => {
  if (server) await server.close();
  server = null;
});

describe("server: PATCH suggestion / bundle profile", () => {
  it("PATCH /api/runs/:runId/suggestions/:id/profile sets and clears the profile", async () => {
    const t = await makeProject();
    server = await startServer({
      projectRoot: t.project,
      port: 0,
      host: "127.0.0.1",
    });
    const svc = new ReviewSuggestionService(t.project, t.runId);
    const s = await svc.addManual({ title: "T", proposedPatch: PATCH_A });

    const setRes = await fetch(
      `${server.url}/api/runs/${t.runId}/suggestions/${s.id}/profile`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ validationProfile: "quick" }),
      },
    );
    expect(setRes.status).toBe(200);
    const setBody = (await setRes.json()) as {
      suggestion: { validationProfile: string | null };
    };
    expect(setBody.suggestion.validationProfile).toBe("quick");

    const clrRes = await fetch(
      `${server.url}/api/runs/${t.runId}/suggestions/${s.id}/profile`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ validationProfile: null }),
      },
    );
    expect(clrRes.status).toBe(200);
    const clrBody = (await clrRes.json()) as {
      suggestion: { validationProfile: string | null };
    };
    expect(clrBody.suggestion.validationProfile).toBeNull();
  });

  it("404s on a missing profile name", async () => {
    const t = await makeProject();
    server = await startServer({
      projectRoot: t.project,
      port: 0,
      host: "127.0.0.1",
    });
    const svc = new ReviewSuggestionService(t.project, t.runId);
    const s = await svc.addManual({ title: "T", proposedPatch: PATCH_A });
    const res = await fetch(
      `${server.url}/api/runs/${t.runId}/suggestions/${s.id}/profile`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ validationProfile: "ghost" }),
      },
    );
    expect(res.status).toBe(404);
  });

  it("PATCH /api/runs/:runId/suggestion-bundles/:id/profile round-trips", async () => {
    const t = await makeProject();
    server = await startServer({
      projectRoot: t.project,
      port: 0,
      host: "127.0.0.1",
    });
    const svc = new ReviewSuggestionService(t.project, t.runId);
    const a = await svc.addManual({ title: "A", proposedPatch: PATCH_A });
    const bsvc = new SuggestionBundleService(t.project, t.runId);
    const b = await bsvc.create({ title: "P", suggestionIds: [a.id] });

    const setRes = await fetch(
      `${server.url}/api/runs/${t.runId}/suggestion-bundles/${b.id}/profile`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ validationProfile: "quick" }),
      },
    );
    expect(setRes.status).toBe(200);
    const setBody = (await setRes.json()) as {
      bundle: { validationProfile: string | null };
    };
    expect(setBody.bundle.validationProfile).toBe("quick");
  });
});

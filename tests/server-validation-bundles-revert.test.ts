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

async function makeProject(): Promise<{
  project: string;
  worktree: string;
  runId: string;
}> {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), "amaco-vbr-srv-"));
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
  const worktree = path.join(
    await fs.mkdtemp(path.join(os.tmpdir(), "amaco-vbr-wt-")),
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
  "+// noted",
  "",
].join("\n");

let server: StartedServer | null = null;
let project: string;
let runId: string;

afterEach(async () => {
  if (server) await server.close();
  server = null;
});

describe("server: suggestion validate / revert + bundle routes", () => {
  beforeEach(async () => {
    const t = await makeProject();
    project = t.project;
    runId = t.runId;
    server = await startServer({
      projectRoot: project,
      port: 0,
      host: "127.0.0.1",
    });
  });

  it("POST .../suggestions/:id/validate returns no_commands_configured before commands.validate is set", async () => {
    const svc = new ReviewSuggestionService(project, runId);
    const s = await svc.addManual({ title: "Touch a", proposedPatch: PATCH_A });
    await svc.approve(s.id);
    await svc.apply(s.id);
    const res = await fetch(
      `${server!.url}/api/runs/${runId}/suggestions/${s.id}/validate`,
      { method: "POST" },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: { status: string };
      suggestion: { status: string };
    };
    expect(body.result.status).toBe("no_commands_configured");
    expect(body.suggestion.status).toBe("applied");
  });

  it("POST .../suggestions/:id/revert flips the suggestion to reverted", async () => {
    const svc = new ReviewSuggestionService(project, runId);
    const s = await svc.addManual({ title: "Touch a", proposedPatch: PATCH_A });
    await svc.approve(s.id);
    await svc.apply(s.id);
    const res = await fetch(
      `${server!.url}/api/runs/${runId}/suggestions/${s.id}/revert`,
      { method: "POST" },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      suggestion: { status: string };
    };
    expect(body.suggestion.status).toBe("reverted");
  });

  it("POST /api/runs/:runId/suggestion-bundles round-trips create + apply", async () => {
    const svc = new ReviewSuggestionService(project, runId);
    const s = await svc.addManual({ title: "Touch a", proposedPatch: PATCH_A });
    await svc.approve(s.id);
    const create = await fetch(
      `${server!.url}/api/runs/${runId}/suggestion-bundles`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "First pass",
          suggestionIds: [s.id],
        }),
      },
    );
    expect(create.status).toBe(200);
    const created = (await create.json()) as {
      bundle: { id: string; status: string };
    };
    expect(created.bundle.status).toBe("draft");

    const approve = await fetch(
      `${server!.url}/api/runs/${runId}/suggestion-bundles/${created.bundle.id}/approve`,
      { method: "POST" },
    );
    const approved = (await approve.json()) as {
      bundle: { status: string };
    };
    expect(approved.bundle.status).toBe("approved");

    const apply = await fetch(
      `${server!.url}/api/runs/${runId}/suggestion-bundles/${created.bundle.id}/apply`,
      { method: "POST" },
    );
    const applied = (await apply.json()) as {
      bundle: { status: string };
      preflight: { ok: boolean };
    };
    expect(applied.bundle.status).toBe("applied");
    expect(applied.preflight.ok).toBe(true);
  });
});

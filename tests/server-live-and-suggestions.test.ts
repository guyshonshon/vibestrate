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
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "amaco-live-srv-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await fs.mkdir(path.join(dir, "src"), { recursive: true });
  await fs.writeFile(
    path.join(dir, "src", "example.ts"),
    "export const x = 1\n",
  );
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({
    options: { projectRoot: dir },
    detectionRunner: noProvider,
  });
  return dir;
}

let project: string;
let server: StartedServer | null = null;

afterEach(async () => {
  if (server) await server.close();
  server = null;
});

describe("server: editor + suggestions routes", () => {
  beforeEach(async () => {
    project = await makeProject();
    server = await startServer({
      projectRoot: project,
      port: 0,
      host: "127.0.0.1",
    });
  });

  it("GET /api/editor/status returns candidate list and configured=null when disabled", async () => {
    const r = (await fetch(`${server!.url}/api/editor/status`).then((r) =>
      r.json(),
    )) as {
      candidates: { command: string; available: boolean }[];
      configured: { config: { enabled: boolean } } | null;
    };
    expect(r.candidates.find((c) => c.command === "code")).toBeDefined();
    // editor.enabled defaults to false in our schema; configured should still
    // serialise when the project is initialised.
    expect(r.configured).not.toBeNull();
    expect(r.configured!.config.enabled).toBe(false);
  });

  it("POST /api/editor/open is 409 when editor handoff is disabled", async () => {
    const res = await fetch(`${server!.url}/api/editor/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "src/example.ts" }),
    });
    expect(res.status).toBe(409);
  });

  it("POST then GET /api/runs/:runId/suggestions round-trips a manual suggestion", async () => {
    const runId = "run-1";
    await ensureDir(runDir(project, runId));
    const state = runStateSchema.parse({
      runId,
      task: "fixture",
      status: "merge_ready",
      projectRoot: project,
      worktreePath: null,
      branchName: null,
      reviewLoopCount: 0,
      maxReviewLoops: 2,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      finalDecision: null,
      verification: null,
      error: null,
    });
    await writeJson(runStatePath(project, runId), state);

    const create = await fetch(
      `${server!.url}/api/runs/${runId}/suggestions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Refactor",
          body: "Pull out helper",
          file: "src/example.ts",
          lineStart: 1,
        }),
      },
    );
    expect(create.status).toBe(200);
    const created = (await create.json()) as {
      suggestion: { id: string; status: string };
    };
    expect(created.suggestion.status).toBe("open");

    const list = (await fetch(
      `${server!.url}/api/runs/${runId}/suggestions`,
    ).then((r) => r.json())) as {
      suggestions: { id: string; title: string }[];
    };
    expect(list.suggestions[0]!.title).toBe("Refactor");

    // Approve resolves into approvals.json.
    const approve = await fetch(
      `${server!.url}/api/runs/${runId}/suggestions/${created.suggestion.id}/approve`,
      { method: "POST" },
    );
    expect(approve.status).toBe(200);
    const approved = (await approve.json()) as {
      suggestion: { status: string; approvalId: string | null };
    };
    expect(approved.suggestion.status).toBe("approved");
    expect(approved.suggestion.approvalId).not.toBeNull();
  });

  it("POST /api/runs/:runId/suggestions/:id/apply 409s when no patch is attached", async () => {
    const runId = "run-2";
    await ensureDir(runDir(project, runId));
    const state = runStateSchema.parse({
      runId,
      task: "fixture",
      status: "merge_ready",
      projectRoot: project,
      worktreePath: null,
      branchName: null,
      reviewLoopCount: 0,
      maxReviewLoops: 2,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      finalDecision: null,
      verification: null,
      error: null,
    });
    await writeJson(runStatePath(project, runId), state);
    const create = await fetch(
      `${server!.url}/api/runs/${runId}/suggestions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "No patch" }),
      },
    );
    const created = (await create.json()) as {
      suggestion: { id: string };
    };
    await fetch(
      `${server!.url}/api/runs/${runId}/suggestions/${created.suggestion.id}/approve`,
      { method: "POST" },
    );
    const apply = await fetch(
      `${server!.url}/api/runs/${runId}/suggestions/${created.suggestion.id}/apply`,
      { method: "POST" },
    );
    expect(apply.status).toBe(409);
  });
});

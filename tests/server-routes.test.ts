import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { startServer, type StartedServer } from "../src/server/server.js";
import { applySetup } from "../src/setup/setup-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "amaco-server-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  return dir;
}

async function writeFakeRun(projectRoot: string, runId: string): Promise<void> {
  const runDir = path.join(projectRoot, ".amaco", "runs", runId);
  await fs.mkdir(path.join(runDir, "artifacts"), { recursive: true });
  const ts = new Date().toISOString();
  const state = {
    runId,
    task: "fixture",
    status: "merge_ready",
    projectRoot,
    worktreePath: null,
    branchName: null,
    reviewLoopCount: 0,
    maxReviewLoops: 2,
    startedAt: ts,
    updatedAt: ts,
    finalDecision: "APPROVED",
    verification: "PASSED",
    error: null,
  };
  await fs.writeFile(
    path.join(runDir, "state.json"),
    JSON.stringify(state, null, 2),
  );
  await fs.writeFile(
    path.join(runDir, "artifacts", "00-idea.md"),
    "# Task\n\nfixture\n",
  );
  await fs.writeFile(
    path.join(runDir, "events.ndjson"),
    JSON.stringify({
      timestamp: ts,
      type: "run.created",
      message: "Run created",
    }) + "\n",
  );
}

let project: string;
let server: StartedServer | null = null;

async function startOnFreePort(projectRoot: string): Promise<StartedServer> {
  // Use port 0 so OS picks an ephemeral free one.
  return startServer({
    projectRoot,
    port: 0,
    host: "127.0.0.1",
  });
}

describe("server routes", () => {
  beforeEach(async () => {
    project = await makeProject();
    await writeFakeRun(project, "20260509-120000-fixture");
    server = await startOnFreePort(project);
  });
  afterEach(async () => {
    if (server) await server.close();
    server = null;
  });

  it("GET /api/health works", async () => {
    const res = await fetch(`${server!.url}/api/health`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; projectRoot: string };
    expect(json.ok).toBe(true);
  });

  it("GET /api/runs returns the fixture", async () => {
    const res = await fetch(`${server!.url}/api/runs`);
    const json = (await res.json()) as { runs: { runId: string }[] };
    expect(json.runs).toHaveLength(1);
    expect(json.runs[0]!.runId).toBe("20260509-120000-fixture");
  });

  it("GET /api/runs/:runId loads state", async () => {
    const res = await fetch(
      `${server!.url}/api/runs/20260509-120000-fixture`,
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { run: { task: string } };
    expect(json.run.task).toBe("fixture");
  });

  it("rejects path traversal in artifact route", async () => {
    const res = await fetch(
      `${server!.url}/api/runs/20260509-120000-fixture/artifacts/..%2F..%2Fpackage.json`,
    );
    // Either 400 (rejected) or 404 (not found after sanitize) — never 200 with file contents.
    expect([400, 404]).toContain(res.status);
  });

  it("rejects path traversal in run id", async () => {
    const res = await fetch(`${server!.url}/api/runs/..%2Fother`);
    expect(res.status).toBe(400);
  });

  it("notes API can add and list", async () => {
    const add = await fetch(
      `${server!.url}/api/runs/20260509-120000-fixture/notes`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope: "run",
          target: "20260509-120000-fixture",
          message: "test note",
        }),
      },
    );
    expect(add.status).toBe(200);
    const list = await fetch(
      `${server!.url}/api/runs/20260509-120000-fixture/notes`,
    );
    const j = (await list.json()) as { notes: { message: string }[] };
    expect(j.notes.some((n) => n.message === "test note")).toBe(true);
  });

  it("404 on unknown api path", async () => {
    const res = await fetch(`${server!.url}/api/unknown`);
    expect(res.status).toBe(404);
  });
});

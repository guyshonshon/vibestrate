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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-server-"));
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
  const runDir = path.join(projectRoot, ".vibestrate", "runs", runId);
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

  it("GET /api/runs/:id/restore-preview returns preview:null for an upstream stage", async () => {
    const res = await fetch(
      `${server!.url}/api/runs/20260509-120000-fixture/restore-preview?stage=executing`,
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { preview: unknown };
    expect(json.preview).toBeNull(); // executing restores no code
  });

  it("GET /api/runs/:id/restore-preview returns preview:null when the run has no snapshot", async () => {
    const res = await fetch(
      `${server!.url}/api/runs/20260509-120000-fixture/restore-preview?stage=reviewing`,
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { preview: unknown };
    expect(json.preview).toBeNull(); // fixture captured no phase snapshot
  });

  it("GET /api/runs/:id/restore-preview 404s for an unknown run", async () => {
    const res = await fetch(
      `${server!.url}/api/runs/no-such-run/restore-preview?stage=reviewing`,
    );
    expect(res.status).toBe(404);
  });

  it("GET /api/runs/:id/restore-preview 400s on a bad stage", async () => {
    const res = await fetch(
      `${server!.url}/api/runs/20260509-120000-fixture/restore-preview?stage=bogus`,
    );
    expect(res.status).toBe(400);
  });

  it("POST /api/runs/snapshots/prune dry-runs with an empty plan (no snapshots)", async () => {
    const res = await fetch(`${server!.url}/api/runs/snapshots/prune`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orphans: true, dryRun: true }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      plan: { runs: string[]; totalRunsWithSnapshots: number };
      pruned: string[] | null;
    };
    expect(json.plan.runs).toEqual([]);
    expect(json.pruned).toBeNull(); // dry run never deletes
  });

  it("POST /api/runs/snapshots/prune 400s on a bad body", async () => {
    const res = await fetch(`${server!.url}/api/runs/snapshots/prune`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ keep: -3 }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/runs/snapshots/prune executes cleanly when there's nothing to prune", async () => {
    // The fixture run has a dir but no captured snapshots, so a non-dry-run
    // prune deletes nothing and 200s (execute path; never wipes on empty refs).
    const res = await fetch(`${server!.url}/api/runs/snapshots/prune`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orphans: true }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { plan: { runs: string[] }; pruned: string[] | null };
    expect(json.plan.runs).toEqual([]);
  });

  it("serves an artifact via the run-dir-relative stamped path (artifacts/ prefix)", async () => {
    // Flow snapshots stamp outputArtifactPath relative to the RUN dir
    // ("artifacts/00-idea.md"); the route must accept that shape too - it
    // used to 404 on the double prefix.
    const direct = await fetch(
      `${server!.url}/api/runs/20260509-120000-fixture/artifacts/00-idea.md`,
    );
    expect(direct.status).toBe(200);
    const prefixed = await fetch(
      `${server!.url}/api/runs/20260509-120000-fixture/artifacts/artifacts/00-idea.md`,
    );
    expect(prefixed.status).toBe(200);
    expect(await prefixed.text()).toBe(await direct.text());
  });

  it("rejects path traversal in artifact route", async () => {
    const res = await fetch(
      `${server!.url}/api/runs/20260509-120000-fixture/artifacts/..%2F..%2Fpackage.json`,
    );
    // Either 400 (rejected) or 404 (not found after sanitize) - never 200 with file contents.
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

  it("POST /api/runs validates the body and rejects empty task", async () => {
    const res = await fetch(`${server!.url}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ task: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/runs accepts a valid body and returns the spawned argv", async () => {
    const res = await fetch(`${server!.url}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        task: "smoke test",
        effort: "low",
        readOnly: true,
      }),
    });
    // The spawn itself may fail (no dist on disk yet in the test
    // sandbox) - either 200 with argv echoed back, or 500 if the
    // binary isn't reachable. Both prove the body shape passes the
    // schema; we just want to confirm the route exists and accepts
    // the body without "application/json"-style noise.
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      const json = (await res.json()) as { argv: string[]; ok: true };
      expect(json.ok).toBe(true);
      expect(json.argv).toEqual([
        "run",
        "smoke test",
        "--effort",
        "low",
        "--read-only",
      ]);
    }
  });

  it("GET /api/events/stream opens an SSE channel", async () => {
    const res = await fetch(`${server!.url}/api/events/stream`, {
      headers: { accept: "text/event-stream" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toMatch(/text\/event-stream/);
    // Read a small slice off the stream so we know it's actually
    // wired up, then close. The server sends a `ready` frame on
    // connect; we shouldn't need to wait long for it.
    const reader = res.body!.getReader();
    const start = Date.now();
    let received = "";
    while (Date.now() - start < 1500) {
      const { value, done } = await reader.read();
      if (done) break;
      received += new TextDecoder().decode(value);
      if (received.includes("event: ready")) break;
    }
    await reader.cancel();
    expect(received).toContain("event: ready");
  });

  it("POST /api/runs/:id/pause tolerates an empty JSON body", async () => {
    // The spawn-empty-body bug we fixed earlier - make sure pause /
    // resume / abort still work with `Content-Type: application/json`
    // and no body.
    const res = await fetch(
      `${server!.url}/api/runs/20260509-120000-fixture/pause`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
      },
    );
    // The fixture run is in terminal status `merge_ready`, so
    // pause-service will return 409. The point of this test is that
    // we DON'T get "Body cannot be empty" anymore.
    expect([200, 409]).toContain(res.status);
    const body = (await res.json()) as { error?: string };
    if (body.error) {
      expect(body.error).not.toMatch(/Body cannot be empty/);
    }
  });
});

// ── T1: the run file viewer shows the RUN's copy, not a stale/absent project one
describe("GET /api/runs/:runId/file - worktree precedence (T1)", () => {
  let proj: string;
  let srv: StartedServer | null = null;
  const runId = "20260612-100000-wt";
  let wt: string;

  beforeEach(async () => {
    proj = await makeProject();
    // A run whose worktree nests under the project root (the real layout).
    const runDir = path.join(proj, ".vibestrate", "runs", runId);
    wt = path.join(proj, ".vibestrate", "worktrees", runId);
    await fs.mkdir(wt, { recursive: true });
    await fs.mkdir(runDir, { recursive: true });
    // A file modified in the worktree (exists in both, different content).
    await fs.writeFile(path.join(proj, "README.md"), "STALE project copy\n");
    await fs.writeFile(path.join(wt, "README.md"), "FRESH worktree copy\n");
    // A file created only in the worktree.
    await fs.writeFile(path.join(wt, "super.md"), "born in the worktree\n");
    // A spaced filename.
    await fs.writeFile(path.join(wt, "my file.md"), "has a space\n");
    const ts = new Date().toISOString();
    await fs.writeFile(
      path.join(runDir, "state.json"),
      JSON.stringify({
        runId,
        task: "wt",
        status: "merge_ready",
        projectRoot: proj,
        worktreePath: wt,
        branchName: `vibestrate/${runId}`,
        reviewLoopCount: 0,
        maxReviewLoops: 2,
        startedAt: ts,
        updatedAt: ts,
        finalDecision: "APPROVED",
        verification: "PASSED",
        error: null,
      }),
    );
    srv = await startOnFreePort(proj);
  });
  afterEach(async () => {
    if (srv) await srv.close();
    srv = null;
  });

  const fileText = async (p: string) => {
    const res = await fetch(
      `${srv!.url}/api/runs/${runId}/file?path=${encodeURIComponent(p)}`,
    );
    const body = (await res.json()) as {
      file?: { lines: { text: string }[] };
      error?: string;
    };
    return { status: res.status, body };
  };

  it("shows the worktree copy of a modified file, not the stale project one", async () => {
    const { status, body } = await fileText("README.md");
    expect(status).toBe(200);
    expect(body.file?.lines.map((l) => l.text).join("\n")).toContain(
      "FRESH worktree copy",
    );
  });

  it("serves a file created only in the worktree (was a 404)", async () => {
    const { status, body } = await fileText("super.md");
    expect(status).toBe(200);
    expect(body.file?.lines.map((l) => l.text).join("\n")).toContain(
      "born in the worktree",
    );
  });

  it("accepts a filename containing a space", async () => {
    const { status } = await fileText("my file.md");
    expect(status).toBe(200);
  });

  it("returns 410 (not a generic 404) once the worktree is pruned", async () => {
    await fs.rm(wt, { recursive: true, force: true });
    const { status, body } = await fileText("README.md");
    expect(status).toBe(410);
    expect(body.error ?? "").toMatch(/cleaned up/i);
  });
});

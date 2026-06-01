import { afterEach, beforeEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { startServer, type StartedServer } from "../src/server/server.js";
import { WorkspaceStore } from "../src/workspace/workspace-store.js";
import {
  readProjectBusyStatus,
  closeProjectServer,
  findFreePort,
} from "../src/workspace/workspace-runtime.js";
import { writeUiLock } from "../src/workspace/ui-lock.js";

let prevEnv: string | undefined;
let regFile: string;

beforeEach(async () => {
  prevEnv = process.env.VIBESTRATE_WORKSPACE_FILE;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-cl-"));
  regFile = path.join(dir, "workspace.json");
  process.env.VIBESTRATE_WORKSPACE_FILE = regFile;
});

afterEach(() => {
  if (prevEnv === undefined) delete process.env.VIBESTRATE_WORKSPACE_FILE;
  else process.env.VIBESTRATE_WORKSPACE_FILE = prevEnv;
});

async function mkProject(label: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `vibestrate-${label}-`));
  await fs.mkdir(path.join(root, ".vibestrate"), { recursive: true });
  await fs.writeFile(path.join(root, ".vibestrate", "project.yml"), "version: 1\n");
  return root;
}

async function writeRun(root: string, runId: string, status: string): Promise<void> {
  const dir = path.join(root, ".vibestrate", "runs", runId);
  await fs.mkdir(dir, { recursive: true });
  const at = new Date().toISOString();
  await fs.writeFile(
    path.join(dir, "state.json"),
    JSON.stringify({
      runId,
      task: `task ${runId}`,
      status,
      projectRoot: root,
      worktreePath: null,
      branchName: null,
      startedAt: at,
      updatedAt: at,
    }),
  );
}

describe("readProjectBusyStatus", () => {
  it("reports idle for an empty project", async () => {
    const root = await mkProject("idle");
    const s = await readProjectBusyStatus(root);
    expect(s.busy).toBe(false);
    expect(s.activeRuns).toBe(0);
    expect(s.queueDepth).toBe(0);
  });

  it("flags active runs and queued tasks as busy", async () => {
    const root = await mkProject("busy");
    await writeRun(root, "r1", "executing"); // non-terminal
    await writeRun(root, "r2", "merge_ready"); // terminal - not counted
    await fs.mkdir(path.join(root, ".vibestrate", "scheduler"), { recursive: true });
    await fs.writeFile(
      path.join(root, ".vibestrate", "scheduler", "queue.json"),
      JSON.stringify({
        entries: [
          { taskId: "t1", enqueuedAt: new Date().toISOString(), priority: "medium", source: "user" },
        ],
      }),
    );

    const s = await readProjectBusyStatus(root);
    expect(s.activeRuns).toBe(1);
    expect(s.queueDepth).toBe(1);
    expect(s.busy).toBe(true);
  });
});

describe("closeProjectServer escalation safety", () => {
  it("never signals an unconfirmed PID: dead port + alive pid → unreachable", async () => {
    const root = await mkProject("hung");
    const dormantPort = await findFreePort(); // nothing is listening there
    await new WorkspaceStore(regFile).register({ root, label: "hung" });
    // ui.lock names OUR pid (alive) on a dead port. If the code wrongly
    // escalated it would signal the test runner; the dead-port branch must
    // return `unreachable` without any kill.
    await writeUiLock(root, { pid: process.pid, port: dormantPort });

    const r = await closeProjectServer({ project: "hung" }, { currentRoot: "/served" });
    expect(r.method).toBe("unreachable");
    expect(r.closed).toBe(false);
    expect(r.forced).toBe(false);
    // We're obviously still running - the test continues past this line.
    expect(typeof process.pid).toBe("number");
  });

  it("no-ops a fully-stopped project (no lock)", async () => {
    const root = await mkProject("gone");
    await new WorkspaceStore(regFile).register({ root, label: "gone" });
    const r = await closeProjectServer({ project: "gone" }, { currentRoot: "/served" });
    expect(r.method).toBe("none");
    expect(r.alreadyStopped).toBe(true);
  });
});

describe("POST /api/server/shutdown", () => {
  it("stops the server and hands off to onShutdownRequested", async () => {
    const served = await mkProject("served");
    let handedOff = false;
    const srv = await startServer({
      projectRoot: served,
      port: 0,
      host: "127.0.0.1",
      onShutdownRequested: () => {
        handedOff = true;
      },
    });

    const res = await fetch(`${srv.url}/api/server/shutdown`, { method: "POST" });
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.shuttingDown).toBe(true);

    // The route flushes, then (after ~80ms) closes the app + hands off.
    await new Promise((r) => setTimeout(r, 500));
    expect(handedOff).toBe(true);

    // The server is closed now - a follow-up request should fail to connect.
    await expect(fetch(`${srv.url}/api/health`)).rejects.toBeTruthy();
  });
});

describe("POST /api/workspace/close + /status", () => {
  let server: StartedServer | null = null;
  afterEach(async () => {
    await server?.close().catch(() => undefined);
    server = null;
  });

  it("reports status, refuses unknown projects, and no-ops a dormant project", async () => {
    const served = await mkProject("served");
    const other = await mkProject("other");
    await new WorkspaceStore(regFile).register({ root: served, label: "served" });
    // `other` is registered but its dashboard is not running (dormant: no lock).
    await new WorkspaceStore(regFile).register({ root: other, label: "other" });
    await writeRun(other, "r1", "executing");

    server = await startServer({ projectRoot: served, port: 0, host: "127.0.0.1" });

    // status of a busy (dormant) project still reads from disk.
    const st = await (
      await fetch(`${server.url}/api/workspace/status?project=other`)
    ).json();
    expect(st.activeRuns).toBe(1);
    expect(st.busy).toBe(true);

    // unknown project → 400 (safety gate).
    const bad = await fetch(`${server.url}/api/workspace/close`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: "/no/such" }),
    });
    expect(bad.status).toBe(400);

    // closing a dormant project is a no-op (nothing live on :1).
    const close = await (
      await fetch(`${server.url}/api/workspace/close`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project: "other" }),
      })
    ).json();
    expect(close.alreadyStopped).toBe(true);
    expect(close.closed).toBe(false);
  });
});

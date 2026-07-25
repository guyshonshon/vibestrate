import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { startServer, type StartedServer } from "../src/server/server.js";
import { WorkspaceStore, canonicalRoot } from "../src/workspace/workspace-store.js";
import { writeUiLock } from "../src/workspace/ui-lock.js";

let server: StartedServer | null = null;
let prevEnv: string | undefined;
afterEach(async () => {
  await server?.close();
  server = null;
  if (prevEnv === undefined) delete process.env.VIBESTRATE_WORKSPACE_FILE;
  else process.env.VIBESTRATE_WORKSPACE_FILE = prevEnv;
});

describe("GET /api/workspace", () => {
  it("lists registered projects and marks the served one current", async () => {
    const regDir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-wsr-"));
    const regFile = path.join(regDir, "workspace.json");
    prevEnv = process.env.VIBESTRATE_WORKSPACE_FILE;
    process.env.VIBESTRATE_WORKSPACE_FILE = regFile;

    const served = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-wsp-"));
    const other = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-wso-"));
    const store = new WorkspaceStore(regFile);
    await store.register({ root: served, label: "served" });
    await store.register({ root: other, label: "other" });
    // Runtime (port/pid) lives in each project's ui.lock now.
    await writeUiLock(other, { pid: process.pid, port: 4400 });

    server = await startServer({ projectRoot: served, port: 0, host: "127.0.0.1" });
    const r = await (await fetch(`${server.url}/api/workspace`)).json();

    expect(r.current).toBe(canonicalRoot(served));
    const servedRow = r.projects.find((p: { label: string }) => p.label === "served");
    const otherRow = r.projects.find((p: { label: string }) => p.label === "other");
    expect(servedRow.current).toBe(true);
    expect(otherRow.current).toBe(false);
    expect(otherRow.lastPort).toBe(4400);
  });
});

describe("GET /api/workspace/overview", () => {
  it("rolls up registered projects and reads each project's runs", async () => {
    const regDir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-ovr-"));
    const regFile = path.join(regDir, "workspace.json");
    prevEnv = process.env.VIBESTRATE_WORKSPACE_FILE;
    process.env.VIBESTRATE_WORKSPACE_FILE = regFile;

    const served = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-ovs-"));
    const other = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-ovo-"));
    const store = new WorkspaceStore(regFile);
    await store.register({ root: served, label: "served" });
    await store.register({ root: other, label: "other" });
    await writeUiLock(served, { pid: process.pid, port: 4317 });

    // One completed run in the served project.
    const runDir = path.join(served, ".vibestrate", "runs", "r1");
    await fs.mkdir(runDir, { recursive: true });
    const at = new Date().toISOString();
    await fs.writeFile(
      path.join(runDir, "state.json"),
      JSON.stringify({
        runId: "r1",
        task: "ship it",
        status: "merge_ready",
        projectRoot: served,
        worktreePath: null,
        branchName: null,
        startedAt: at,
        updatedAt: at,
      }),
    );

    server = await startServer({ projectRoot: served, port: 0, host: "127.0.0.1" });
    const r = await (
      await fetch(`${server.url}/api/workspace/overview?range=7d`)
    ).json();

    expect(r.range).toBe("7d");
    expect(r.totals.projects).toBe(2);
    expect(r.totals.runs).toBe(1);
    expect(r.totals.merged).toBe(1);
    const servedRow = r.projects.find((p: { label: string }) => p.label === "served");
    expect(servedRow.current).toBe(true);
    expect(servedRow.totalRuns).toBe(1);
    expect(servedRow.lastPort).toBe(4317);
  });
});

describe("POST /api/workspace/open (navigator)", () => {
  it("refuses an unregistered project and reuses the live served instance", async () => {
    const regDir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-opn-"));
    const regFile = path.join(regDir, "workspace.json");
    prevEnv = process.env.VIBESTRATE_WORKSPACE_FILE;
    process.env.VIBESTRATE_WORKSPACE_FILE = regFile;

    // An initialized served project (has .vibestrate/project.yml).
    const served = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-ops-"));
    await fs.mkdir(path.join(served, ".vibestrate"), { recursive: true });
    await fs.writeFile(path.join(served, ".vibestrate", "project.yml"), "version: 1\n");

    server = await startServer({ projectRoot: served, port: 0, host: "127.0.0.1" });
    // `vibe ui` self-registers + writes its ui.lock; mirror that here so the
    // served root reads as live + reusable (our pid is alive, port answers).
    const servedPort = new URL(server.url).port;
    await new WorkspaceStore(regFile).register({ root: served, label: "served" });
    await writeUiLock(served, { pid: process.pid, port: Number(servedPort) });

    // Unregistered target is refused by the safety gate.
    const bad = await fetch(`${server.url}/api/workspace/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: "/no/such/project" }),
    });
    expect(bad.status).toBe(400);

    // The served project is already live → reused, not spawned.
    const ok = await fetch(`${server.url}/api/workspace/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: "served" }),
    });
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.started).toBe(false);
    expect(body.port).toBe(Number(servedPort));
  });
});

describe("POST /api/workspace/add", () => {
  it("registers a directory, but registering alone never makes it launchable", async () => {
    const regDir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-add-"));
    const regFile = path.join(regDir, "workspace.json");
    prevEnv = process.env.VIBESTRATE_WORKSPACE_FILE;
    process.env.VIBESTRATE_WORKSPACE_FILE = regFile;

    const served = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-adds-"));
    await fs.mkdir(path.join(served, ".vibestrate"), { recursive: true });
    await fs.writeFile(path.join(served, ".vibestrate", "project.yml"), "version: 1\n");
    server = await startServer({ projectRoot: served, port: 0, host: "127.0.0.1" });

    // An ordinary directory with no .vibestrate/ - registers fine.
    const plain = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-addp-"));
    const added = await fetch(`${server.url}/api/workspace/add`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root: plain }),
    });
    expect(added.status).toBe(200);
    const addedBody = await added.json();
    expect(addedBody.entry.root).toBe(canonicalRoot(plain));
    expect(addedBody.initialized).toBe(false);

    // The seam this route moved: HTTP can now extend the registry, so assert
    // that membership alone does NOT satisfy the cross-root launch gate - the
    // project.yml check is what actually constrains what can be spawned.
    const opened = await fetch(`${server.url}/api/workspace/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: plain }),
    });
    expect(opened.status).toBe(400);
  });

  it("refuses a path that is not a directory, and one that does not exist", async () => {
    const regDir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-addn-"));
    prevEnv = process.env.VIBESTRATE_WORKSPACE_FILE;
    process.env.VIBESTRATE_WORKSPACE_FILE = path.join(regDir, "workspace.json");

    const served = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-addns-"));
    server = await startServer({ projectRoot: served, port: 0, host: "127.0.0.1" });

    const file = path.join(regDir, "not-a-dir.txt");
    await fs.writeFile(file, "x");
    const asFile = await fetch(`${server.url}/api/workspace/add`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root: file }),
    });
    expect(asFile.status).toBe(400);

    const missing = await fetch(`${server.url}/api/workspace/add`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root: path.join(regDir, "nope") }),
    });
    expect(missing.status).toBe(400);
  });
});

describe("WorkspaceStore corruption safety", () => {
  it("never overwrites a corrupt registry in place - it archives it first", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-corrupt-"));
    const regFile = path.join(dir, "workspace.json");
    const store = new WorkspaceStore(regFile);

    const keep = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-keep-"));
    await store.register({ root: keep, label: "keep" });
    expect((await store.list()).length).toBe(1);

    // Truncated/hand-mangled file. read() must surface it as a typed error
    // rather than an empty registry, because register() writes back whatever
    // read() returned - degrading silently would delete every other project.
    const corrupt = '{"version":1,"projects":[{"root"';
    await fs.writeFile(regFile, corrupt);
    await expect(store.read()).rejects.toThrow(/unreadable/);

    // A write still makes progress, but the unreadable bytes are preserved on
    // disk under a .corrupt-* sibling - never destroyed.
    const other = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-other-"));
    await store.register({ root: other, label: "other" });
    const archived = (await fs.readdir(dir)).filter((f) => f.includes(".corrupt-"));
    expect(archived).toHaveLength(1);
    expect(await fs.readFile(path.join(dir, archived[0]!), "utf8")).toBe(corrupt);
  });
});

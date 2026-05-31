import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { startServer, type StartedServer } from "../src/server/server.js";
import { WorkspaceStore, canonicalRoot } from "../src/workspace/workspace-store.js";

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
    await store.register({ root: served, label: "served", port: 4317 });
    await store.register({ root: other, label: "other", port: 4400 });

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
    await store.register({ root: served, label: "served", port: 4317 });
    await store.register({ root: other, label: "other", port: 4400 });

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
    // The server self-registers its bound port via the registry on `vibe ui`;
    // here we register it explicitly so the served root is live + reusable.
    const servedPort = new URL(server.url).port;
    await new WorkspaceStore(regFile).register({
      root: served,
      label: "served",
      port: Number(servedPort),
    });

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

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { startServer, type StartedServer } from "../src/server/server.js";
import { WorkspaceStore } from "../src/workspace/workspace-store.js";
import {
  ensureProjectServer,
  findFreePort,
  probeProjectLive,
} from "../src/workspace/workspace-runtime.js";
import { writeUiLock } from "../src/workspace/ui-lock.js";
import { WorkspaceSafetyError } from "../src/workspace/workspace-safety.js";

let server: StartedServer | null = null;
let prevEnv: string | undefined;
let regFile: string;

beforeEach(async () => {
  prevEnv = process.env.VIBESTRATE_WORKSPACE_FILE;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-rt-"));
  regFile = path.join(dir, "workspace.json");
  process.env.VIBESTRATE_WORKSPACE_FILE = regFile;
});

afterEach(async () => {
  await server?.close();
  server = null;
  if (prevEnv === undefined) delete process.env.VIBESTRATE_WORKSPACE_FILE;
  else process.env.VIBESTRATE_WORKSPACE_FILE = prevEnv;
});

async function mkProject(label: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `vibestrate-${label}-`));
  await fs.mkdir(path.join(root, ".vibestrate"), { recursive: true });
  await fs.writeFile(path.join(root, ".vibestrate", "project.yml"), "version: 1\n");
  return root;
}

describe("findFreePort", () => {
  it("returns a usable loopback port", async () => {
    const port = await findFreePort();
    expect(Number.isInteger(port)).toBe(true);
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThan(65536);
  });
});

describe("probeProjectLive", () => {
  it("is true only when the port serves the expected root", async () => {
    const served = await mkProject("served");
    server = await startServer({ projectRoot: served, port: 0, host: "127.0.0.1" });
    const port = Number(new URL(server.url).port);

    expect(await probeProjectLive(port, served)).toBe(true);
    // Same port, different expected root → not a match.
    expect(await probeProjectLive(port, "/some/other/root")).toBe(false);
  });

  it("is false for a dead port", async () => {
    const free = await findFreePort();
    expect(await probeProjectLive(free, "/whatever", 400)).toBe(false);
  });
});

describe("ensureProjectServer", () => {
  it("reuses an already-live instance instead of spawning", async () => {
    const served = await mkProject("served");
    server = await startServer({ projectRoot: served, port: 0, host: "127.0.0.1" });
    const port = Number(new URL(server.url).port);
    await new WorkspaceStore(regFile).register({ root: served, label: "served" });
    // Runtime now lives in the project's own ui.lock, not the registry. Our test
    // process IS the server, so its pid is alive ⇒ readProjectRuntime → running.
    await writeUiLock(served, { pid: process.pid, port });

    const r = await ensureProjectServer(
      { project: "served" },
      { currentRoot: served },
    );
    expect(r.started).toBe(false);
    expect(r.port).toBe(port);
    expect(r.url).toContain(String(port));
  });

  it("refuses an unregistered project (safety gate)", async () => {
    const served = await mkProject("served");
    await expect(
      ensureProjectServer({ project: "/no/such/project" }, { currentRoot: served }),
    ).rejects.toBeInstanceOf(WorkspaceSafetyError);
  });
});

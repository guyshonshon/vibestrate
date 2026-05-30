import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { startServer, type StartedServer } from "../src/server/server.js";
import { WorkspaceStore } from "../src/workspace/workspace-store.js";

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

    expect(r.current).toBe(path.resolve(served));
    const servedRow = r.projects.find((p: { label: string }) => p.label === "served");
    const otherRow = r.projects.find((p: { label: string }) => p.label === "other");
    expect(servedRow.current).toBe(true);
    expect(otherRow.current).toBe(false);
    expect(otherRow.lastPort).toBe(4400);
  });
});

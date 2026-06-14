import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { startServer, type StartedServer } from "../src/server/server.js";
import { applySetup } from "../src/setup/setup-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const claudeOk: ProviderDetectionRunner = async (cmd) =>
  cmd === "claude"
    ? { exitCode: 0, stdout: "Claude Code 2.1.0", stderr: "" }
    : { exitCode: 127, stdout: "", stderr: "" };

async function makeProject(): Promise<string> {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-crewpresets-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: project });
  await execa("git", ["config", "user.email", "x@x"], { cwd: project });
  await execa("git", ["config", "user.name", "x"], { cwd: project });
  await fs.writeFile(
    path.join(project, "package.json"),
    JSON.stringify({ name: "demo", scripts: { test: "vitest" } }),
  );
  await fs.writeFile(path.join(project, "pnpm-lock.yaml"), "");
  await execa("git", ["add", "."], { cwd: project });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: project });
  await applySetup({ options: { projectRoot: project }, detectionRunner: claudeOk });
  return project;
}

let server: StartedServer | null = null;
afterEach(async () => {
  if (server) await server.close();
  server = null;
});

describe("crew presets routes", () => {
  it("GET /api/crews/presets is not shadowed by /api/crews/:crewId", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await fetch(`${server.url}/api/crews/presets`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      presets: { id: string; installed: boolean }[];
    };
    expect(body.presets.map((p) => p.id).sort()).toEqual(["fast", "thorough"]);
    expect(body.presets.every((p) => p.installed === false)).toBe(true);
  });

  it("POST install adds the crew, then it shows installed + in the crews list", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const install = await fetch(`${server.url}/api/crews/presets/install`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "fast" }),
    });
    expect(install.status).toBe(200);
    const installed = (await install.json()) as { ok: boolean; crewId: string };
    expect(installed.ok).toBe(true);
    expect(installed.crewId).toBe("fast");

    const presets = (await (await fetch(`${server.url}/api/crews/presets`)).json()) as {
      presets: { id: string; installed: boolean }[];
    };
    expect(presets.presets.find((p) => p.id === "fast")?.installed).toBe(true);

    const crews = (await (await fetch(`${server.url}/api/crews`)).json()) as {
      crews: { id: string }[];
    };
    expect(crews.crews.some((c) => c.id === "fast")).toBe(true);
  });

  it("POST install rejects a non-preset id (balanced / bogus) with 400", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    for (const id of ["balanced", "bogus", ""]) {
      const res = await fetch(`${server.url}/api/crews/presets/install`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      expect(res.status).toBe(400);
    }
  });
});

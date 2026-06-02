import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { startServer, type StartedServer } from "../src/server/server.js";
import { applySetup } from "../src/setup/setup-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";
import type { ConfigViewResponse } from "../src/ui/lib/types.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeProject(): Promise<string> {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-cfgview-srv-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: project });
  await execa("git", ["config", "user.email", "x@x"], { cwd: project });
  await execa("git", ["config", "user.name", "x"], { cwd: project });
  await fs.writeFile(path.join(project, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: project });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: project });
  await applySetup({ options: { projectRoot: project }, detectionRunner: noProvider });
  return project;
}

let server: StartedServer | null = null;
afterEach(async () => {
  if (server) await server.close();
  server = null;
});

describe("server: GET /api/config/view", () => {
  it("returns the grouped, editable-aware view of project.yml", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await fetch(`${server.url}/api/config/view`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ConfigViewResponse;

    expect(body.valid).toBe(true);
    expect(body.error).toBeNull();
    expect(body.configPath).toContain("project.yml");
    expect(body.view.project.name.length).toBeGreaterThan(0);

    const ids = body.view.sections.map((s) => s.id);
    expect(ids).toContain("providers");
    expect(ids).toContain("profiles");
    expect(ids).toContain("policies");

    const profiles = body.view.sections.find((s) => s.id === "profiles")!;
    expect(profiles.editable.live).toBe(true);
    expect(profiles.editable.route).toBe("profiles");
  });
});

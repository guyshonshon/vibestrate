import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { startServer, type StartedServer } from "../src/server/server.js";
import { applySetup } from "../src/setup/setup-service.js";
import { addProvider } from "../src/setup/provider-setup-service.js";
import type { ProviderCapabilities } from "../src/providers/provider-catalog.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeProject(): Promise<string> {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-cat-srv-"));
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

describe("GET /api/providers/catalog", () => {
  it("surfaces a configured http-api provider's real knobs under its own id", async () => {
    const project = await makeProject();
    await addProvider(project, {
      id: "myopenai",
      config: {
        type: "http-api",
        api: "openai",
        baseUrl: "https://api.openai.com",
        model: "gpt-5.5",
        apiKey: "env:OPENAI_KEY",
      } as never,
    });
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await fetch(`${server.url}/api/providers/catalog`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { catalog: Record<string, ProviderCapabilities> };

    // The static well-known providers are still present...
    expect(body.catalog.claude!.powerLevels).toContain("medium");
    // ...and the user's http-api provider surfaces its real effort knob by id.
    const mine = body.catalog.myopenai!;
    expect(mine).toBeDefined();
    expect(mine.modelEnabled).toBe(true);
    expect(mine.powerLevels).toEqual(["minimal", "low", "medium", "high"]);
  });
});

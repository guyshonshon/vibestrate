import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { startServer, type StartedServer } from "../src/server/server.js";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeProject(): Promise<string> {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), "amaco-roles-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: project });
  await execa("git", ["config", "user.email", "x@x"], { cwd: project });
  await execa("git", ["config", "user.name", "x"], { cwd: project });
  await fs.writeFile(path.join(project, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: project });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: project });
  await applySetup({ options: { projectRoot: project }, detectionRunner: noProvider });
  // Configure a provider and bind one role to it so we can assert the binding.
  await setConfigValue(
    project,
    "providers.fake",
    JSON.stringify({ type: "cli", command: "true", args: [], input: "stdin" }),
  );
  await setConfigValue(project, "agents.reviewer.provider", "fake");
  // Bind planner to a provider that isn't configured, to assert the flag.
  await setConfigValue(project, "agents.planner.provider", "ghost");
  return project;
}

let server: StartedServer | null = null;
afterEach(async () => {
  if (server) await server.close();
  server = null;
});

describe("GET /api/agents/roles", () => {
  it("returns the role→engine bindings without leaking prompt contents", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await fetch(`${server.url}/api/agents/roles`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      roles: {
        id: string;
        provider: string;
        providerConfigured: boolean;
        permissions: string;
        skills: string[];
      }[];
    };

    const ids = body.roles.map((r) => r.id).sort();
    expect(ids).toEqual(
      ["architect", "executor", "fixer", "planner", "reviewer", "verifier"].sort(),
    );

    const reviewer = body.roles.find((r) => r.id === "reviewer")!;
    expect(reviewer.provider).toBe("fake");
    expect(reviewer.providerConfigured).toBe(true);
    expect(typeof reviewer.permissions).toBe("string");

    // A role bound to a provider that isn't configured is flagged.
    const planner = body.roles.find((r) => r.id === "planner")!;
    expect(planner.providerConfigured).toBe(false);

    // No prompt contents (or any "prompt" field) are exposed.
    for (const r of body.roles as unknown as Record<string, unknown>[]) {
      expect(r.prompt).toBeUndefined();
    }
  });
});

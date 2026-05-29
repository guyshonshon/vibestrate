import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { startServer, type StartedServer } from "../src/server/server.js";
import { applySetup } from "../src/setup/setup-service.js";
import {
  setConfigValue,
  setProfileFields,
} from "../src/setup/config-update-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeProject(): Promise<string> {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-roles-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: project });
  await execa("git", ["config", "user.email", "x@x"], { cwd: project });
  await execa("git", ["config", "user.name", "x"], { cwd: project });
  await fs.writeFile(path.join(project, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: project });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: project });
  await applySetup({ options: { projectRoot: project }, detectionRunner: noProvider });
  // Configure a second provider and a profile that runs on it.
  await setConfigValue(
    project,
    "providers.fake",
    JSON.stringify({ type: "cli", command: "true", args: [], input: "stdin" }),
  );
  await setProfileFields(project, "fake-balanced", { provider: "fake" });
  return project;
}

let server: StartedServer | null = null;
afterEach(async () => {
  if (server) await server.close();
  server = null;
});

describe("GET /api/crews", () => {
  it("returns the crew roster with each role's seats/profile/provider, no prompt contents", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const res = await fetch(`${server.url}/api/crews`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      defaultCrew: string;
      crews: {
        id: string;
        roles: {
          id: string;
          fills: string[];
          profile: string;
          provider: string | null;
          providerConfigured: boolean;
          permissions: string;
          skills: string[];
        }[];
      }[];
    };

    expect(body.defaultCrew).toBe("default");
    const crew = body.crews.find((c) => c.id === "default")!;
    const ids = crew.roles.map((r) => r.id).sort();
    expect(ids).toEqual(
      ["architect", "executor", "fixer", "planner", "reviewer", "verifier"].sort(),
    );

    const reviewer = crew.roles.find((r) => r.id === "reviewer")!;
    expect(reviewer.fills).toContain("reviewer");
    expect(typeof reviewer.profile).toBe("string");
    expect(reviewer.providerConfigured).toBe(true);

    // No prompt contents (or any "prompt" field) are exposed.
    for (const r of crew.roles as unknown as Record<string, unknown>[]) {
      expect(r.prompt).toBeUndefined();
    }
  });
});

describe("PATCH /api/crews/:crewId/roles/:roleId", () => {
  it("points a role at a configured profile; rejects an unknown one", async () => {
    const project = await makeProject();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });

    const ok = await fetch(`${server.url}/api/crews/default/roles/reviewer`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profile: "fake-balanced" }),
    });
    expect(ok.status).toBe(200);

    const after = (await (await fetch(`${server.url}/api/crews/default`)).json()) as {
      crew: { roles: { id: string; profile: string; provider: string | null }[] };
    };
    const reviewer = after.crew.roles.find((r) => r.id === "reviewer")!;
    expect(reviewer.profile).toBe("fake-balanced");
    expect(reviewer.provider).toBe("fake");

    // An unknown profile is refused (no silent write).
    const bad = await fetch(`${server.url}/api/crews/default/roles/reviewer`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profile: "ghost-profile" }),
    });
    expect(bad.status).toBe(400);
  });
});

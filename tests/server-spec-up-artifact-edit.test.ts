import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { startServer, type StartedServer } from "../src/server/server.js";
import { applySetup } from "../src/setup/setup-service.js";
import { ArtifactStore } from "../src/core/artifact-store.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({ exitCode: 127, stdout: "", stderr: "" });

const RUN = "spec-otter";

async function makeProjectWithSpec(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-suedit-srv-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  const store = new ArtifactStore(dir, RUN);
  await store.init();
  await store.write("flows/spec/output.md", "# Spec\n\nThe original spec.\n");
  return dir;
}

let server: StartedServer | null = null;
afterEach(async () => {
  if (server) await server.close();
  server = null;
  delete process.env.VIBESTRATE_API_TOKEN;
});

describe("server: spec-up artifact edit route", () => {
  it("POST edit fails closed (403) when VIBESTRATE_API_TOKEN is unset", async () => {
    delete process.env.VIBESTRATE_API_TOKEN;
    const project = await makeProjectWithSpec();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    const res = await fetch(`${server.url}/api/spec-up/runs/${RUN}/artifact`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ section: "spec", content: "edited" }),
    });
    expect(res.status).toBe(403);
    // The artifact is untouched.
    const store = new ArtifactStore(project, RUN);
    expect(await store.read("flows/spec/output.md")).toContain("The original spec.");
  });

  it("GET returns content + hash; POST with token edits the section; bad section -> 400", async () => {
    process.env.VIBESTRATE_API_TOKEN = "test-token";
    const project = await makeProjectWithSpec();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    const auth = {
      authorization: "Bearer test-token",
      "content-type": "application/json",
    };

    const g = (await fetch(
      `${server.url}/api/spec-up/runs/${RUN}/artifact/spec`,
      { headers: auth },
    ).then((r) => r.json())) as { content: string; hash: string; frozen: boolean };
    expect(g.content).toContain("The original spec.");
    expect(g.hash).toHaveLength(64);
    expect(g.frozen).toBe(false);

    const p = await fetch(`${server.url}/api/spec-up/runs/${RUN}/artifact`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ section: "spec", content: "# Spec\n\nEDITED\n", baseHash: g.hash }),
    });
    expect(p.status).toBe(200);
    const store = new ArtifactStore(project, RUN);
    expect(await store.read("flows/spec/output.md")).toBe("# Spec\n\nEDITED\n");

    const bad = await fetch(`${server.url}/api/spec-up/runs/${RUN}/artifact`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ section: "config", content: "x" }),
    });
    expect(bad.status).toBe(400);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { startServer, type StartedServer } from "../src/server/server.js";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { RunStateStore, createInitialState } from "../src/core/state-machine.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-integ-srv-"));
  const git = (...a: string[]) => execa("git", a, { cwd: dir });
  await git("init", "-q", "-b", "main");
  await git("config", "user.email", "x@x");
  await git("config", "user.name", "x");
  await fs.writeFile(path.join(dir, "base.txt"), "a\n");
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await git("add", ".");
  await git("commit", "-q", "-m", "base");
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  await setConfigValue(dir, "git.worktreeDir", path.join(dir, "worktrees"));
  await git("add", ".");
  await git("commit", "-q", "-m", "setup");
  await git("checkout", "-q", "-b", "feat-a", "main");
  await fs.writeFile(path.join(dir, "a.txt"), "A");
  await git("add", ".");
  await git("commit", "-q", "-m", "feat-a");
  await git("checkout", "-q", "main");
  // A merge_ready run pointing at feat-a.
  const store = new RunStateStore(dir, "r1");
  let s = createInitialState({
    runId: "r1",
    task: "do a",
    projectRoot: dir,
    worktreePath: null,
    branchName: "feat-a",
    maxReviewLoops: 2,
  });
  s = { ...s, status: "merge_ready", branchName: "feat-a" };
  await store.write(s);
  return dir;
}

let server: StartedServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

describe("integration HTTP routes", () => {
  it("lists, previews, and applies; refuses main", async () => {
    const dir = await makeRepo();
    server = await startServer({ projectRoot: dir, port: 0, host: "127.0.0.1" });

    const list = await (await fetch(`${server.url}/api/integration`)).json();
    expect(list.mergeReady).toHaveLength(1);
    expect(list.mergeReady[0].branchName).toBe("feat-a");

    const preview = await (
      await fetch(`${server.url}/api/integration/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
    ).json();
    expect(preview.preview.allClean).toBe(true);

    // Refuse main → 409.
    const refused = await fetch(`${server.url}/api/integration/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ into: "main" }),
    });
    expect(refused.status).toBe(409);

    // Apply into a fresh branch.
    const applied = await fetch(`${server.url}/api/integration/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ into: "integration/x" }),
    });
    expect(applied.status).toBe(200);
    const body = await applied.json();
    expect(body.result.stoppedAt).toBeNull();
    expect(body.result.integrationBranch).toBe("integration/x");
  });
});

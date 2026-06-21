import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { startServer, type StartedServer } from "../src/server/server.js";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { readActionLog } from "../src/safety/action-broker.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({ exitCode: 127, stdout: "", stderr: "" });

async function makeRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-tree-srv-"));
  const git = (...a: string[]) => execa("git", a, { cwd: dir });
  await git("init", "-q", "-b", "main");
  await git("config", "user.email", "x@x");
  await git("config", "user.name", "x");
  await fs.writeFile(path.join(dir, "base.txt"), "a\n");
  await git("add", ".");
  await git("commit", "-q", "-m", "base");
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  await setConfigValue(dir, "git.worktreeDir", path.join(dir, "worktrees"));
  await git("add", ".");
  await git("commit", "-q", "-m", "setup");
  await git("checkout", "-q", "-b", "feat-clean", "main");
  await fs.writeFile(path.join(dir, "clean.txt"), "clean");
  await git("add", ".");
  await git("commit", "-q", "-m", "feat-clean");
  await git("checkout", "-q", "main");
  return dir;
}

let server: StartedServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
  delete process.env.VIBESTRATE_API_TOKEN;
});

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

describe("git-tree routes", () => {
  it("predict (read-only, no token) returns a clean prediction", async () => {
    const dir = await makeRepo();
    server = await startServer({ projectRoot: dir, port: 0, host: "127.0.0.1" });
    const res = await post(`${server.url}/api/project/git/tree/predict`, {
      source: "feat-clean",
      target: "main",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { prediction: { clean: boolean } };
    expect(body.prediction.clean).toBe(true);
  });

  it("maps a service MergeError to 409 (e.g. source === target)", async () => {
    const dir = await makeRepo();
    server = await startServer({ projectRoot: dir, port: 0, host: "127.0.0.1" });
    const res = await post(`${server.url}/api/project/git/tree/predict`, {
      source: "main",
      target: "main",
    });
    expect(res.status).toBe(409);
  });

  it("rejects an invalid branch name with 400", async () => {
    const dir = await makeRepo();
    server = await startServer({ projectRoot: dir, port: 0, host: "127.0.0.1" });
    const res = await post(`${server.url}/api/project/git/tree/predict`, {
      source: "-evil",
      target: "main",
    });
    expect(res.status).toBe(400);
  });

  it("propose-resolutions on a clean merge needs no provider", async () => {
    const dir = await makeRepo();
    server = await startServer({ projectRoot: dir, port: 0, host: "127.0.0.1" });
    const res = await post(`${server.url}/api/project/git/tree/propose-resolutions`, {
      source: "feat-clean",
      target: "main",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { proposal: { clean: boolean } };
    expect(body.proposal.clean).toBe(true);
  });

  it("refuses apply and undo with 403 when no API token is set", async () => {
    const dir = await makeRepo();
    server = await startServer({ projectRoot: dir, port: 0, host: "127.0.0.1" });
    const apply = await post(`${server.url}/api/project/git/tree/apply`, {
      source: "feat-clean",
      target: "main",
      confirm: "apply-merge",
    });
    expect(apply.status).toBe(403);
    const undo = await post(`${server.url}/api/project/git/tree/undo`, {
      target: "main",
      confirm: "undo-merge",
    });
    expect(undo.status).toBe(403);
  });

  it("applies + audits with a token and bearer auth", async () => {
    const dir = await makeRepo();
    process.env.VIBESTRATE_API_TOKEN = "test-token";
    server = await startServer({ projectRoot: dir, port: 0, host: "127.0.0.1" });
    const auth = { authorization: "Bearer test-token" };

    // Missing confirm token -> 400.
    const bad = await post(
      `${server.url}/api/project/git/tree/apply`,
      { source: "feat-clean", target: "main" },
      auth,
    );
    expect(bad.status).toBe(400);

    const res = await post(
      `${server.url}/api/project/git/tree/apply`,
      { source: "feat-clean", target: "main", confirm: "apply-merge" },
      auth,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { mergedSha: string } };
    expect(body.result.mergedSha).toBeTruthy();
    // main advanced to the merge commit.
    const head = (await execa("git", ["rev-parse", "main"], { cwd: dir })).stdout.trim();
    expect(head).toBe(body.result.mergedSha);
    // The broker audit log recorded a git.merge under the git-tree bucket.
    const log = await readActionLog(dir, "git-tree");
    expect(log.some((e) => e.request.kind === "git.merge" && e.evidence?.ok === true)).toBe(true);
  });
});

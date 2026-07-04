import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { startServer, type StartedServer } from "../src/server/server.js";
import { applySetup } from "../src/setup/setup-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

const dirs: string[] = [];
async function makeRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-search-srv-"));
  dirs.push(dir);
  const git = (...a: string[]) => execa("git", a, { cwd: dir });
  await git("init", "-q", "-b", "main");
  await git("config", "user.email", "x@x");
  await git("config", "user.name", "x");
  await fs.mkdir(path.join(dir, "src"), { recursive: true });
  await fs.writeFile(path.join(dir, "src", "app.ts"), "const routeNeedle = 1;\n");
  await git("add", ".");
  await git("commit", "-q", "-m", "base");
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  await git("add", ".");
  await git("commit", "-q", "-m", "setup");
  return dir;
}

let server: StartedServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
  await Promise.all(
    dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })),
  );
});

const post = (url: string, body: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/project/search", () => {
  it("200 with a result for a real query", async () => {
    const dir = await makeRepo();
    server = await startServer({ projectRoot: dir, port: 0, host: "127.0.0.1" });
    const res = await post(`${server.url}/api/project/search`, {
      query: "routeNeedle",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: { available: boolean; totalMatches: number; files: { path: string }[] };
    };
    expect(body.result.available).toBe(true);
    expect(body.result.totalMatches).toBe(1);
    expect(body.result.files[0]!.path).toBe("src/app.ts");
  });

  it("400 for a missing/empty query (searchBody zod min(1))", async () => {
    const dir = await makeRepo();
    server = await startServer({ projectRoot: dir, port: 0, host: "127.0.0.1" });

    const empty = await post(`${server.url}/api/project/search`, { query: "" });
    expect(empty.status).toBe(400);

    const missing = await post(`${server.url}/api/project/search`, {});
    expect(missing.status).toBe(400);
  });
});

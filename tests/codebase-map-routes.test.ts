import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { startServer, type StartedServer } from "../src/server/server.js";
import type { CodebaseMap } from "../src/project/codebase-map.js";

const dirs: string[] = [];
async function makeRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-map-srv-"));
  dirs.push(dir);
  const git = (...a: string[]) => execa("git", a, { cwd: dir });
  await git("init", "-q", "-b", "main");
  await git("config", "user.email", "x@x");
  await git("config", "user.name", "x");
  await fs.writeFile(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "demo-project", scripts: { build: "tsc -p ." } }, null, 2),
  );
  await fs.mkdir(path.join(dir, "src"), { recursive: true });
  await fs.writeFile(path.join(dir, "src", "index.ts"), "export const main = () => {};\n");
  await git("add", ".");
  await git("commit", "-q", "-m", "base");
  return dir;
}

let server: StartedServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
  await Promise.all(dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

const get = (url: string) => fetch(url);
const post = (url: string, body?: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("codebase map routes", () => {
  it("GET /api/codebase-map: present false before a map is ever written", async () => {
    const dir = await makeRepo();
    server = await startServer({ projectRoot: dir, port: 0, host: "127.0.0.1" });

    const res = await get(`${server.url}/api/codebase-map`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { present: boolean; stale: boolean; map: CodebaseMap | null };
    expect(body).toEqual({ present: false, stale: false, map: null });
  });

  it("POST /api/codebase-map/refresh: writes a real map, then GET reflects it as fresh", async () => {
    const dir = await makeRepo();
    server = await startServer({ projectRoot: dir, port: 0, host: "127.0.0.1" });

    const refreshRes = await post(`${server.url}/api/codebase-map/refresh`);
    expect(refreshRes.status).toBe(200);
    const refreshBody = (await refreshRes.json()) as {
      present: boolean;
      stale: boolean;
      map: CodebaseMap | null;
    };
    expect(refreshBody.present).toBe(true);
    expect(refreshBody.stale).toBe(false);
    expect(refreshBody.map).not.toBeNull();
    expect(refreshBody.map!.project.name).toBe("demo-project");
    expect(refreshBody.map!.project.scripts.build).toBe("tsc -p .");
    expect(refreshBody.map!.schemaVersion).toBe(1);

    const getRes = await get(`${server.url}/api/codebase-map`);
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as {
      present: boolean;
      stale: boolean;
      map: CodebaseMap | null;
    };
    expect(getBody.present).toBe(true);
    expect(getBody.stale).toBe(false);
    expect(getBody.map!.project.name).toBe("demo-project");
  });

  it("POST /api/codebase-map/refresh: rejects a non-empty body with 400", async () => {
    const dir = await makeRepo();
    server = await startServer({ projectRoot: dir, port: 0, host: "127.0.0.1" });

    const res = await post(`${server.url}/api/codebase-map/refresh`, { force: true });
    expect(res.status).toBe(400);
  });

  it("POST /api/codebase-map/refresh: never renders a raw secret from the live map object", async () => {
    const dir = await makeRepo();
    const pkgPath = path.join(dir, "package.json");
    const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8"));
    pkg.scripts.deploy = "aws s3 sync --key AKIAIOSFODNN7EXAMPLE .";
    await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2));
    await execa("git", ["add", "."], { cwd: dir });
    await execa("git", ["commit", "-q", "-m", "add deploy script"], { cwd: dir });

    server = await startServer({ projectRoot: dir, port: 0, host: "127.0.0.1" });

    const refreshRes = await post(`${server.url}/api/codebase-map/refresh`);
    expect(refreshRes.status).toBe(200);
    const bodyText = await refreshRes.text();
    expect(bodyText).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });
});

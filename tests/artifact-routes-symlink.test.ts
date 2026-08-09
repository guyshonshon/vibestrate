// The artifacts routes serve files out of a directory the run itself writes
// into, so the directory's contents are untrusted, not just the URL. Each test
// here plants one shape an agent could leave behind and pins the mechanism that
// refuses it; the invariant is that nothing outside the run's artifacts dir can
// be read, listed, or sized through the API, and that no request wedges the
// server.
//
// Mutation-checked, each guard removed on its own and the suite re-run:
//   - walk allow-list -> only "lists neither symlinks nor their sizes" fails
//   - artifacts-dir realpath assert -> only "dir ITSELF is a symlink" fails
//   - isFile() leaf guard -> only "does not hang on a FIFO" fails (by timeout)
//   - secret-like refusal -> only "secret-like artifact name" fails
//   - secret match on the caller's string, not the resolved path -> only the
//     trailing-slash case fails
//   - bare fs.open with unmapped errors -> only "unopenable artifact" fails
// The leaf symlink refusal has no mutation of its own: it and the isFile()
// guard each catch a symlink, so removing either alone changes nothing. With
// both gone plus the old walk - the bug as it shipped - four of the seven
// fail, which is what proves none of them are vacuous.
//
// The first draft of the "dir ITSELF is a symlink" case fetched id_rsa and
// passed with its guard removed: the secret-like name was answering, not the
// containment check. Hence notes.md.
//
// The trailing-slash and unopenable cases exist because a review found both
// live over HTTP after the first version of this file was written and passing.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { startServer, type StartedServer } from "../src/server/server.js";
import { applySetup } from "../src/setup/setup-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const SECRET = "PRIVATE-KEY-BODY";
const RUN_ID = "20260509-120000-fixture";
const isWindows = process.platform === "win32";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-artifact-guard-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  return dir;
}

function artifactsDirOf(projectRoot: string, runId: string): string {
  return path.join(projectRoot, ".vibestrate", "runs", runId, "artifacts");
}

async function writeRun(projectRoot: string, runId: string): Promise<string> {
  const dir = artifactsDirOf(projectRoot, runId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "00-idea.md"), "# Task\n\nfixture\n");
  return dir;
}

let project: string;
let outside: string;
let server: StartedServer | null = null;

async function get(pathname: string, timeoutMs = 5000): Promise<Response> {
  return fetch(`${server!.url}${pathname}`, { signal: AbortSignal.timeout(timeoutMs) });
}

describe("artifact routes refuse what the run's own directory can hide", () => {
  beforeEach(async () => {
    project = await makeProject();
    outside = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-outside-"));
    await fs.writeFile(path.join(outside, "id_rsa"), `${SECRET}\n`);
    await fs.writeFile(path.join(outside, "notes.md"), `${SECRET}\n`);
    await writeRun(project, RUN_ID);
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
  });
  afterEach(async () => {
    if (server) await server.close();
    server = null;
  });

  it.skipIf(isWindows)("refuses a symlinked leaf with a 400, not a 500", async () => {
    // A 500 would also "not leak the file", so the status is load-bearing: the
    // generic error branch records an issue per request, which turns a probe
    // loop into an unbounded append to the issues stream.
    await fs.symlink(path.join(outside, "id_rsa"), path.join(artifactsDirOf(project, RUN_ID), "output.md"));
    const res = await get(`/api/runs/${RUN_ID}/artifacts/output.md`);
    expect(res.status).toBe(400);
    expect(await res.text()).not.toContain(SECRET);
  });

  it.skipIf(isWindows)("lists neither symlinks nor their sizes", async () => {
    const dir = artifactsDirOf(project, RUN_ID);
    await fs.symlink(path.join(outside, "id_rsa"), path.join(dir, "output.md"));
    await fs.symlink(outside, path.join(dir, "sub"));
    const res = await get(`/api/runs/${RUN_ID}/artifacts`);
    expect(res.status).toBe(200);
    const paths = ((await res.json()) as { artifacts: { path: string }[] }).artifacts.map(
      (a) => a.path,
    );
    expect(paths).toContain("00-idea.md");
    expect(paths).not.toContain("output.md");
    expect(paths).not.toContain("sub");
  });

  it.skipIf(isWindows)("refuses to enumerate a symlinked directory", async () => {
    // A symlink to a directory reports isDirectory() false through readdir's
    // lstat semantics, so before the guard it fell through to a following stat
    // and the fetch route then listed the outside tree recursively.
    await fs.symlink(outside, path.join(artifactsDirOf(project, RUN_ID), "sub"));
    const res = await get(`/api/runs/${RUN_ID}/artifacts/sub`);
    expect(res.status).toBe(400);
    expect(await res.text()).not.toContain("id_rsa");
  });

  it.skipIf(isWindows)("refuses when the artifacts dir ITSELF is a symlink", async () => {
    // The escape a realpath-anchored guard misses: replace the root and every
    // path under it is "contained". A run can rm -rf its own artifacts dir.
    // The target is deliberately NOT a secret-like name - fetching id_rsa here
    // passes on the secret refusal alone and proves nothing about containment.
    const runId = "20260509-130000-relinked";
    const dir = await writeRun(project, runId);
    await fs.rm(dir, { recursive: true, force: true });
    await fs.symlink(outside, dir);
    const res = await get(`/api/runs/${runId}/artifacts/notes.md`);
    expect(res.status).not.toBe(200);
    expect(await res.text()).not.toContain(SECRET);
  });

  it.skipIf(isWindows)("does not hang on a FIFO", async () => {
    // readFile on a FIFO blocks in the libuv threadpool (4 slots, no timeout
    // on this path), so a regression wedges every file operation the server
    // makes. The timeout turns that into a failure instead of a hung suite.
    await execa("mkfifo", [path.join(artifactsDirOf(project, RUN_ID), "pipe")]);
    const res = await get(`/api/runs/${RUN_ID}/artifacts/pipe`, 2000);
    expect(res.status).toBe(400);
  });

  it("refuses a secret-like artifact name with no symlink involved", async () => {
    // Orthogonal to everything above: an agent can just copy a key in.
    await fs.writeFile(path.join(artifactsDirOf(project, RUN_ID), "deploy.pem"), `${SECRET}\n`);
    const res = await get(`/api/runs/${RUN_ID}/artifacts/deploy.pem`);
    expect(res.status).toBe(400);
    expect(await res.text()).not.toContain(SECRET);
  });

  it("refuses a secret-like name that a trailing slash would disguise", async () => {
    // The patterns are $-anchored and resolveArtifactPath drops empty segments,
    // so "deploy.pem/" names the same file and matches nothing. Matching the
    // caller's raw string instead of the resolved path served the body.
    await fs.writeFile(path.join(artifactsDirOf(project, RUN_ID), "deploy.pem"), `${SECRET}\n`);
    for (const suffix of ["deploy.pem/", "deploy.pem/."]) {
      const res = await get(`/api/runs/${RUN_ID}/artifacts/${suffix}`);
      expect(res.status, suffix).toBe(400);
      expect(await res.text(), suffix).not.toContain(SECRET);
    }
  });

  it("maps an unopenable artifact to 400 rather than the generic 500", async () => {
    // A 500 goes through the generic handler, which records an issue per
    // request and puts the absolute path in the body. O_NOFOLLOW winning its
    // race raises ELOOP through this same path, so the guard succeeding was
    // what produced the unmapped throw.
    const file = path.join(artifactsDirOf(project, RUN_ID), "locked.md");
    await fs.writeFile(file, "unreadable\n");
    await fs.chmod(file, 0o000);
    const res = await get(`/api/runs/${RUN_ID}/artifacts/locked.md`);
    expect(res.status).toBe(400);
    expect(await res.text()).not.toContain(project);
  });

  it("still serves a real artifact", async () => {
    const res = await get(`/api/runs/${RUN_ID}/artifacts/00-idea.md`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("fixture");
  });
});

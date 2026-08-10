// The stream tail reads NDJSON out of a run's own directory, so the same
// planted-link problem as the artifacts routes applies here. It is worse in one
// place and better in another: `readStream` parses each line and drops anything
// that is not ours, but the SSE tail forwards an unparseable line VERBATIM as a
// `raw` event, so following a link there streams its target to the browser.
//
// Mutation-checked: reverting readStream's guard fails the read case, and
// reverting listStreams' isFile allow-list fails the listing case.
//
// The SSE case needs BOTH of its guards reverted to fail, because either one
// alone is sufficient - with only `verifiedTailStat` removed, O_NOFOLLOW turns
// the read into ELOOP. Reverting both reproduces the original, which answers
// `event: raw` / `data: <the secret>`. Verified by probe, not assumed.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { startServer, type StartedServer } from "../src/server/server.js";
import { applySetup } from "../src/setup/setup-service.js";
import { listStreams, readStream } from "../src/core/stores/provider-stream-store.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const SECRET = "OUTSIDE-STREAM-SECRET";
const RUN_ID = "20260509-120000-fixture";
const isWindows = process.platform === "win32";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-stream-guard-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  return dir;
}

function streamsDirOf(projectRoot: string, runId: string): string {
  return path.join(projectRoot, ".vibestrate", "runs", runId, "streams");
}

let project: string;
let outside: string;
let server: StartedServer | null = null;

describe("stream tail refuses a planted link", () => {
  beforeEach(async () => {
    project = await makeProject();
    outside = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-outside-"));
    // Valid NDJSON of our own shape, so nothing downstream can reject it for
    // being malformed - the guard has to be what refuses it.
    await fs.writeFile(
      path.join(outside, "leak.ndjson"),
      `${JSON.stringify({ stream: "stdout", chunk: SECRET, at: new Date(0).toISOString() })}\n`,
    );
    // And a plain-text file, which the SSE tail would forward as `raw`.
    await fs.writeFile(path.join(outside, "plain.ndjson"), `${SECRET}\n`);
    const dir = streamsDirOf(project, RUN_ID);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "real.ndjson"),
      `${JSON.stringify({ stream: "stdout", chunk: "hello", at: new Date(0).toISOString() })}\n`,
    );
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
  });
  afterEach(async () => {
    if (server) await server.close();
    server = null;
  });

  it.skipIf(isWindows)("readStream returns nothing for a symlinked stream", async () => {
    await fs.symlink(
      path.join(outside, "leak.ndjson"),
      path.join(streamsDirOf(project, RUN_ID), "linked.ndjson"),
    );
    expect(await readStream(project, RUN_ID, "linked")).toEqual([]);
    // The real one still reads, so this is not passing by refusing everything.
    expect(await readStream(project, RUN_ID, "real")).toHaveLength(1);
  });

  it.skipIf(isWindows)("listStreams omits a symlinked stream and its size", async () => {
    await fs.symlink(
      path.join(outside, "leak.ndjson"),
      path.join(streamsDirOf(project, RUN_ID), "linked.ndjson"),
    );
    const names = (await listStreams(project, RUN_ID)).map((s) => s.promptName);
    expect(names).toContain("real");
    expect(names).not.toContain("linked");
  });

  it.skipIf(isWindows)("the SSE tail does not forward a symlinked file", async () => {
    await fs.symlink(
      path.join(outside, "plain.ndjson"),
      path.join(streamsDirOf(project, RUN_ID), "linked.ndjson"),
    );
    const res = await fetch(`${server!.url}/api/runs/${RUN_ID}/streams/linked/stream`, {
      signal: AbortSignal.timeout(1500),
    });
    let body = "";
    try {
      // The tail holds the connection open; take whatever it sends before the
      // abort and assert the secret is not among it.
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        body += decoder.decode(value, { stream: true });
      }
    } catch {
      /* aborted by the timeout, which is the expected way out */
    }
    expect(body).not.toContain(SECRET);
  });
});

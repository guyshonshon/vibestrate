import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { applySetup } from "../src/setup/setup-service.js";
import {
  addProvider,
  runSafeProviderTest,
  SAFE_TEST_MAGIC,
} from "../src/setup/provider-setup-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function tempProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-ptest-"));
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  return dir;
}

async function writeFakeProvider(
  dir: string,
  fileName: string,
  body: string,
): Promise<string> {
  const p = path.join(dir, fileName);
  await fs.writeFile(p, body, { mode: 0o755 });
  await fs.chmod(p, 0o755);
  return p;
}

describe("safe provider test", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await tempProject();
  });

  it("passes when fake CLI echoes the magic token", async () => {
    const script = await writeFakeProvider(
      projectRoot,
      "fake-good.js",
      `#!/usr/bin/env node\nlet i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{console.log("${SAFE_TEST_MAGIC}");});`,
    );
    await addProvider(projectRoot, {
      id: "fake",
      config: { type: "cli", command: "node", args: [script], input: "stdin" },
      alsoAssignAllProfiles: true,
    });
    const r = await runSafeProviderTest({ projectRoot, providerId: "fake" });
    expect(r.ok).toBe(true);
    expect(r.matchedMagic).toBe(true);
  });

  it("fails clearly when CLI exits non-zero", async () => {
    const script = await writeFakeProvider(
      projectRoot,
      "fake-bad-exit.js",
      `#!/usr/bin/env node\nprocess.exit(2);`,
    );
    await addProvider(projectRoot, {
      id: "badexit",
      config: { type: "cli", command: "node", args: [script], input: "stdin" },
      alsoAssignAllProfiles: false,
    });
    const r = await runSafeProviderTest({ projectRoot, providerId: "badexit" });
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(2);
    expect(r.hint).toContain("exit");
  });

  it("fails clearly when CLI runs but does not echo magic", async () => {
    const script = await writeFakeProvider(
      projectRoot,
      "fake-no-magic.js",
      `#!/usr/bin/env node\nlet i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{console.log("hello world");});`,
    );
    await addProvider(projectRoot, {
      id: "nomagic",
      config: { type: "cli", command: "node", args: [script], input: "stdin" },
      alsoAssignAllProfiles: false,
    });
    const r = await runSafeProviderTest({ projectRoot, providerId: "nomagic" });
    expect(r.ok).toBe(false);
    expect(r.matchedMagic).toBe(false);
    expect(r.hint).toContain("did not echo");
  });

  it("returns helpful error if provider id is unknown", async () => {
    const r = await runSafeProviderTest({ projectRoot, providerId: "ghost" });
    expect(r.ok).toBe(false);
    expect(r.hint).toContain("vibe provider setup");
  });
});

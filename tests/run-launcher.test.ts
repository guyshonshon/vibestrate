import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import {
  RunLaunchError,
  runFromSpec,
  runSpecSchema,
} from "../src/core/run-launcher.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

/** Initialise a git repo + Vibestrate project wired to a fake, no-gate provider. */
async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-run-launcher-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });

  const fakeJs = path.join(dir, "fake.js");
  await fs.writeFile(
    fakeJs,
    `#!/usr/bin/env node
let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{
  if (i.includes('Vibestrate Agent: reviewer')) console.log('# Review\\n\\nDECISION: APPROVED');
  else if (i.includes('Vibestrate Agent: verifier')) console.log('VERIFICATION: PASSED');
  else if (i.includes('Vibestrate Agent: planner')) console.log('# Plan');
  else if (i.includes('Vibestrate Agent: architect')) console.log('# Architecture\\nNothing risky.');
  else if (i.includes('Vibestrate Agent: executor')) console.log('# Implementation Summary\\nNone.');
  else console.log('?');
});
`,
    { mode: 0o755 },
  );
  await fs.chmod(fakeJs, 0o755);
  await setConfigValue(
    dir,
    "providers.fake",
    JSON.stringify({ type: "cli", command: "node", args: [fakeJs], input: "stdin" }),
  );
  for (const agent of ["planner", "architect", "executor", "fixer", "reviewer", "verifier"]) {
    await setConfigValue(dir, `roles.${agent}.provider`, "fake");
  }
  return dir;
}

describe("run launcher (shared core run pipeline)", () => {
  it("validates a run spec", () => {
    expect(runSpecSchema.safeParse({ projectRoot: "/x", task: "do it" }).success).toBe(true);
    expect(runSpecSchema.safeParse({ task: "missing root" }).success).toBe(false);
    expect(runSpecSchema.safeParse({ projectRoot: "/x", task: "" }).success).toBe(false);
  });

  it("rejects a non-git directory", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-run-nogit-"));
    await expect(
      runFromSpec({ projectRoot: dir, task: "x" }),
    ).rejects.toMatchObject({ name: "RunLaunchError", code: "not_git_repo" });
  });

  it("rejects an uninitialised git repo", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-run-noinit-"));
    await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
    await expect(
      runFromSpec({ projectRoot: dir, task: "x" }),
    ).rejects.toMatchObject({ name: "RunLaunchError", code: "not_initialized" });
  });

  it("rejects an unknown flow", async () => {
    const dir = await makeProject();
    await expect(
      runFromSpec({ projectRoot: dir, task: "x", flow: { id: "does-not-exist" } }),
    ).rejects.toBeInstanceOf(RunLaunchError);
  });

  it("drives a full run to a terminal state through the core pipeline", async () => {
    const dir = await makeProject();
    const out = await runFromSpec(
      { projectRoot: dir, task: "ship the thing" },
      { onProgress: () => {} },
    );
    // The dashboard path reaches the same terminal states as the CLI — no
    // approval gate here, so the fake crew runs clean to merge_ready.
    expect(out.runId).toBeTruthy();
    expect(out.state.status).toBe("merge_ready");
  }, 30_000);
});

import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { Orchestrator } from "../src/core/orchestrator.js";
import { loadConfig } from "../src/project/config-loader.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { applySetup } from "../src/setup/setup-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({ exitCode: 127, stdout: "", stderr: "" });

/**
 * End to end: a run that genuinely does not complete must leave a typed cause
 * on disk AND a recorded Supervisor intervention.
 *
 * A unit test on the mapping proves nothing about whether it ever RUNS - this
 * repo has been bitten before by a mechanism that was fully wired and inert
 * because nothing produced its input. This drives the real orchestrator and
 * reads what actually landed in state.json and events.ndjson.
 */
const PROVIDER = `#!/usr/bin/env node
let prompt = "";
process.stdin.on("data", (c) => (prompt += c));
process.stdin.on("end", () => {
  if (prompt.includes("Vibestrate Agent: reviewer")) {
    // A reviewer that never approves: the loop exhausts and the run blocks.
    console.log("# Review\\n\\nDECISION: CHANGES_REQUESTED");
  } else {
    console.log("# Output\\n\\nDid the thing.");
  }
});
`;

async function makeRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-sup-e2e-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"sup-e2e"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  const p = path.join(dir, "fake-provider.js");
  await fs.writeFile(p, PROVIDER, { mode: 0o755 });
  await fs.chmod(p, 0o755);
  await setConfigValue(dir, "providers.fake", JSON.stringify({ type: "cli", command: "node", args: [p], input: "stdin" }));
  await setConfigValue(dir, "profiles.claude-balanced.provider", "fake");
  return dir;
}

describe("a blocked run leaves a typed cause and a Supervisor intervention", () => {
  it("records both on disk, from a real run", async () => {
    const dir = await makeRepo();
    const loaded = await loadConfig(dir);
    const result = await new Orchestrator({
      projectRoot: dir,
      config: loaded.config,
      rules: loaded.rules,
      task: "a task the reviewer will never approve",
      isGitRepo: true,
      unattended: true,
      onProgress: () => {},
    }).run();

    // The run must NOT have completed - otherwise this test proves nothing.
    expect(result.state.status).toBe("blocked");

    const state = JSON.parse(
      await fs.readFile(path.join(dir, ".vibestrate", "runs", result.runId, "state.json"), "utf8"),
    ) as { terminalCause: string | null };
    // The SPECIFIC cause, not merely "something non-null". The first version of
    // this assertion accepted anything but null, and it passed while the real
    // value was "unknown" - the one class that must never be acted on. Driving
    // the run and printing the value is what caught it; asserting the exact
    // cause is what keeps it caught.
    expect(state.terminalCause).toBe("review_unresolved");

    const events = (await fs.readFile(path.join(dir, ".vibestrate", "runs", result.runId, "events.ndjson"), "utf8"))
      .split("\n").filter(Boolean).map((l) => JSON.parse(l) as { type: string; data?: Record<string, unknown> });
    const intervention = events.find((e) => e.type === "supervisor.intervention");
    expect(intervention, "the Supervisor never spoke about a blocked run").toBeTruthy();
    expect(intervention?.data?.cause).toBe(state.terminalCause);
    // Default autonomy is advise, so it must propose and NOT claim to act.
    expect(intervention?.data?.autonomy).toBe("advise");
    expect(intervention?.data?.willAct).toBe(false);
    // A reviewer that never certified is real work to do, not an environment
    // fault - so the Supervisor must refuse to self-execute it.
    expect(intervention?.data?.kind).toBe("needs_more_work");
    expect(intervention?.data?.autoExecutable).toBe(false);

    await fs.rm(dir, { recursive: true, force: true });
  }, 120_000);
});

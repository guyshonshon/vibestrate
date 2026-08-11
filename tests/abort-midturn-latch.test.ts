// A mid-turn abort, driven through a real run.
//
// abort-signal.test.ts covers the store primitives - raising the flag and
// reading it back. Nothing covered a real run being stopped by one: every abort
// test worked on the store directly, and no test ever started an Orchestrator
// and interrupted it. This closes that gap.
//
// WHAT THIS DOES NOT COVER, stated because the comment above it in the source
// invites the assumption. runRole's observer latches the abort on the
// orchestrator so it "outlives the interval that saw it", and
// throwIfAbortRequested reads that latch from a different call path. This test
// does NOT pin that latch: verified by deleting the latch write, after which it
// still passes, because throwIfAbortRequested ALSO does a fresh store read and
// that alone catches this scenario.
//
// The latch earns its keep in a narrower case - the turn's own state write
// clobbering `abortRequested` between the observation and the read - which
// needs a race this test cannot force deterministically. So the latch is
// protected structurally instead: both writers hold one object, rather than a
// test watching for them to drift apart.

import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { Orchestrator } from "../src/core/orchestrator.js";
import { loadConfig } from "../src/project/config-loader.js";
import { resolveFlow } from "../src/flows/runtime/flow-resolver.js";
import { flowDefinitionSchema } from "../src/flows/schemas/flow-schema.js";
import { RunStateStore } from "../src/core/state-machine.js";
import { EventLog } from "../src/core/stores/event-log.js";
import { requestAbort } from "../src/core/run/abort-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

// Sleeps well past the observer's 500ms tick, so the abort lands mid-turn -
// while the provider is still running - rather than between turns.
const SLOW_FAKE = `#!/usr/bin/env node
let inp = '';
process.stdin.on('data', (c) => (inp += c));
process.stdin.on('end', () => {
  setTimeout(() => { console.log('# Done\\nSlept through it.'); }, 6000);
});
`;

const twoTurnFlow = flowDefinitionSchema.parse({
  id: "two-slow",
  version: 1,
  label: "Two slow turns",
  description: "two agent turns, each slow enough to be aborted mid-turn",
  seats: { planner: { label: "Planner" } },
  steps: [
    { id: "s1", label: "S1", kind: "agent-turn", seat: "planner", outputs: ["a"] },
    { id: "s2", label: "S2", kind: "agent-turn", seat: "planner", outputs: ["b"] },
  ],
});

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-abort-latch-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  const fakeJs = path.join(dir, "slow.js");
  await fs.writeFile(fakeJs, SLOW_FAKE, { mode: 0o755 });
  await fs.chmod(fakeJs, 0o755);
  await setConfigValue(
    dir,
    "providers.fake",
    JSON.stringify({ type: "cli", command: "node", args: [fakeJs], input: "stdin" }),
  );
  await setConfigValue(dir, "profiles.claude-balanced.provider", "fake");
  return dir;
}

describe("a mid-turn abort stops a real run", () => {
  it("ends the run aborted, without running the remaining turns", async () => {
    const dir = await makeProject();
    const loaded = await loadConfig(dir);
    const task = "sleep through an abort";
    const orchestrator = new Orchestrator({
      projectRoot: dir,
      config: loaded.config,
      rules: loaded.rules,
      task,
      isGitRepo: true,
      flow: resolveFlow({
        flow: twoTurnFlow,
        source: { kind: "fixture", ref: "two-slow" },
        config: loaded.config,
        task,
      }),
      onProgress: () => {},
    });

    const running = orchestrator.run();

    // Raise the flag while the first turn is still in flight. Polls for the run
    // directory rather than sleeping a fixed amount, so a slow machine does not
    // make this fire before the run exists.
    const runsDir = path.join(dir, ".vibestrate", "runs");
    let runId: string | null = null;
    for (let i = 0; i < 100 && !runId; i++) {
      const found = (await fs.readdir(runsDir).catch(() => [])).filter((d) =>
        d !== "assist" && d !== "selection",
      );
      if (found.length) runId = found[0]!;
      else await new Promise((r) => setTimeout(r, 100));
    }
    expect(runId, "the run should have started").toBeTruthy();
    await new Promise((r) => setTimeout(r, 1200));
    await requestAbort(
      new RunStateStore(dir, runId!),
      new EventLog(dir, runId!),
      { reason: "test" },
    );

    const out = await running.catch(() => null);
    const state = JSON.parse(
      await fs.readFile(path.join(runsDir, runId!, "state.json"), "utf8"),
    );

    // The run stopped because it was aborted - it did not run to completion.
    expect(state.status).toBe("aborted");
    expect(out?.state.status ?? "aborted").toBe("aborted");

    // And it stopped EARLY - the second turn never ran. Without this, a run
    // that aborted only after completing everything would still pass.
    const events = (
      await fs.readFile(path.join(runsDir, runId!, "events.ndjson"), "utf8")
    )
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { type: string; data?: { stepId?: string } });
    const completed = events
      .filter((e) => e.type === "flow.step.completed")
      .map((e) => e.data?.stepId);
    expect(completed).not.toContain("s2");
  }, 60_000);
});

import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { Orchestrator } from "../src/core/orchestrator.js";
import { loadConfig } from "../src/project/config-loader.js";
import { chooseRunFlow } from "../src/supervisor/select-workflow.js";
import { runEventsPath } from "../src/utils/paths.js";
import type { VibestrateEvent } from "../src/core/stores/event-log.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

// The seam under test: the orchestrator turns the recorded flow SELECTION into the
// `persona.selected` (always) and `persona.upgraded` (only on an upgrade) events.
// chooseRunFlow's PRODUCTION of those selection fields is covered as pure logic in
// supervisor-personas.test.ts; here we drive a real run and assert the events
// actually land in events.ndjson with the right data.
//
// Execution detail: `selection` is execution-independent by design
// (orchestrator.ts: "Does not affect execution - the launcher has already resolved
// `flow` from it"). We pass the real selection but omit `flow`, so the cheap,
// fake-provider-friendly DEFAULT flow runs while the events still reflect the real
// (possibly upgraded) selection. That keeps this integration test fast and
// deterministic without standing up the heavier panel-review fan-out.

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeRepoWithFakeProvider(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-persona-evt-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });

  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });

  // A fake provider that drives the default flow straight to merge_ready: nothing
  // risky, review approves, verification passes. No approval pause.
  const fakeJs = path.join(dir, "fake.js");
  await fs.writeFile(
    fakeJs,
    `#!/usr/bin/env node
let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{
  if (i.includes('Vibestrate Agent: reviewer')) {
    console.log('# Review\\n\\nDECISION: APPROVED');
  } else if (i.includes('Vibestrate Agent: verifier')) {
    console.log('VERIFICATION: PASSED');
  } else if (i.includes('Vibestrate Agent: planner')) {
    console.log('# Plan');
  } else if (i.includes('Vibestrate Agent: architect')) {
    console.log('# Architecture\\nNothing risky.');
  } else if (i.includes('Vibestrate Agent: executor')) {
    console.log('# Implementation Summary\\nNone.');
  } else if (i.includes('Vibestrate Agent: fixer')) {
    console.log('# Fix\\nNone.');
  } else {
    console.log('?');
  }
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
  await setConfigValue(dir, "profiles.claude-balanced.provider", "fake");
  return dir;
}

async function runWithSelectionForTask(
  dir: string,
  task: string,
): Promise<{ events: VibestrateEvent[]; selectionFlowId: string; upgraded: boolean }> {
  const loaded = await loadConfig(dir);
  const selection = await chooseRunFlow({ projectRoot: dir, task, config: loaded.config });
  const orch = new Orchestrator({
    projectRoot: dir,
    config: loaded.config,
    rules: loaded.rules,
    task,
    isGitRepo: true,
    onProgress: () => {},
    selection,
  });
  const result = await orch.run();
  const raw = await fs.readFile(runEventsPath(dir, result.runId), "utf8");
  const events: VibestrateEvent[] = raw
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as VibestrateEvent);
  return { events, selectionFlowId: selection.flowId, upgraded: selection.personaUpgrade != null };
}

describe("supervisor persona events (orchestrator -> events.ndjson)", () => {
  it("emits persona.selected AND persona.upgraded with from/to/signals on a risk-tagged run", async () => {
    const dir = await makeRepoWithFakeProvider();
    const task = "Refactor the auth login flow and add a DB migration";
    const { events, selectionFlowId, upgraded } = await runWithSelectionForTask(dir, task);

    // Sanity: the selection we fed the orchestrator really is an upgrade (else the
    // test would assert nothing about the upgrade path).
    expect(selectionFlowId).toBe("panel-review");
    expect(upgraded).toBe(true);

    const selected = events.find((e) => e.type === "persona.selected");
    expect(selected, "persona.selected must be emitted").toBeDefined();
    expect(selected!.data?.personaId).toBe("staff-engineer");

    const up = events.find((e) => e.type === "persona.upgraded");
    expect(up, "persona.upgraded must be emitted on a risk-tagged run").toBeDefined();
    expect(up!.data?.personaId).toBe("staff-engineer");
    expect(up!.data?.from).toBe("default");
    expect(up!.data?.to).toBe("panel-review");
    expect(up!.data?.signals as string[]).toContain("auth");
  });

  it("emits persona.selected but NOT persona.upgraded on a non-risky run", async () => {
    const dir = await makeRepoWithFakeProvider();
    const task = "Tweak the footer spacing and copy";
    const { events, selectionFlowId, upgraded } = await runWithSelectionForTask(dir, task);

    expect(selectionFlowId).toBe("default");
    expect(upgraded).toBe(false);

    const selected = events.find((e) => e.type === "persona.selected");
    expect(selected, "persona.selected is always recorded for transparency").toBeDefined();
    expect(selected!.data?.personaId).toBe("staff-engineer");

    expect(events.find((e) => e.type === "persona.upgraded")).toBeUndefined();
  });
});

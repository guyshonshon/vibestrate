import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { Orchestrator } from "../src/core/orchestrator.js";
import { loadConfig } from "../src/project/config-loader.js";
import { resolveFlow } from "../src/flows/runtime/flow-resolver.js";
import { pickupFlow } from "../src/flows/catalog/builtin-flows.js";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";
import { readActionLog } from "../src/safety/action-broker.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

// A fake provider: the implementer writes a per-item file (so each item has a
// real diff to commit) and prints an implementation summary; the reviewer
// approves; planner/micro-plan just echo.
const FAKE = `#!/usr/bin/env node
const fs = require('fs');
let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{
  const m = i.match(/Current checklist item — (\\d+) of/);
  const n = m ? m[1] : 'x';
  if (i.includes('Vibestrate Agent: executor')) {
    fs.writeFileSync('item' + n + '.txt', 'work for item ' + n + '\\n');
    console.log('# Implementation Summary');
    console.log('Implemented checklist item ' + n + ' by adding item' + n + '.txt.');
  } else if (i.includes('Vibestrate Agent: reviewer')) {
    console.log('# Review');
    console.log('DECISION: APPROVED');
  } else if (i.includes('Vibestrate Agent: planner')) {
    console.log('# Plan');
    console.log('Work the checklist items in order.');
  } else {
    console.log('ok');
  }
});
`;

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-pickup-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  const fakeJs = path.join(dir, "fake.js");
  await fs.writeFile(fakeJs, FAKE, { mode: 0o755 });
  await fs.chmod(fakeJs, 0o755);
  await setConfigValue(
    dir,
    "providers.fake",
    JSON.stringify({ type: "cli", command: "node", args: [fakeJs], input: "stdin" }),
  );
  await setConfigValue(dir, "profiles.claude-balanced.provider", "fake");
  return dir;
}

describe("pick-up execution over a checklist", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeProject();
  });

  it("runs the segment once per item, commits each, and carries summaries forward", async () => {
    const svc = new RoadmapService(dir);
    await svc.init();
    const task = await svc.addTask({ title: "Build three small things" });
    await svc.addChecklistItem(task.id, "create the first file");
    await svc.addChecklistItem(task.id, "create the second file");
    await svc.addChecklistItem(task.id, "create the third file");

    const loaded = await loadConfig(dir);
    const resolved = resolveFlow({
      flow: pickupFlow,
      source: { kind: "builtin", ref: "pickup" },
      config: loaded.config,
      task: task.title,
    });
    const orch = new Orchestrator({
      projectRoot: dir,
      config: loaded.config,
      rules: loaded.rules,
      task: task.title,
      isGitRepo: true,
      taskId: task.id,
      flow: resolved,
      checklistMode: "continuous",
      onProgress: () => {},
    });
    const out = await orch.run();

    // Run reached a terminal success (review approved, no validation/verify).
    expect(out.state.status).toBe("merge_ready");

    // All three checklist items are done with a commit sha written back.
    const after = await svc.getTask(task.id);
    expect(after!.checklist.map((c) => c.status)).toEqual(["done", "done", "done"]);
    for (const item of after!.checklist) {
      expect(item.commitSha).toMatch(/^[0-9a-f]{40}$/);
    }

    // Three per-item commits on the run branch, each stamped with its item id.
    const log = await execa(
      "git",
      ["log", "--pretty=%H%n%B%n==="],
      { cwd: out.worktreePath! },
    );
    for (const item of after!.checklist) {
      expect(log.stdout).toContain(`Vibestrate-Checklist-Item: ${item.id}`);
    }

    // Forward-carry: the context handed to item 2 names item 1's work.
    const runDir = path.join(dir, ".vibestrate", "runs", out.runId);
    const before2 = await fs.readFile(
      path.join(runDir, "artifacts", "flows", "checklist", "before-item-2.md"),
      "utf8",
    );
    expect(before2).toContain("create the first file");
    expect(before2).toContain("done");

    // A per-item summary artifact exists for each item, plus the outcomes table.
    for (const n of [1, 2, 3]) {
      const summary = await fs.readFile(
        path.join(runDir, "artifacts", "flows", "checklist", `item-${n}-summary.md`),
        "utf8",
      );
      expect(summary).toContain(`Item ${n}/3`);
    }
    const outcomes = await fs.readFile(
      path.join(runDir, "artifacts", "flows", "checklist", "outcomes.md"),
      "utf8",
    );
    expect(outcomes).toContain("3/3 items completed");

    // Per-item provider spawns were all gated through the Action Broker.
    const actions = await readActionLog(dir, out.runId);
    expect(actions.filter((a) => a.request.kind === "provider.spawn").length).toBeGreaterThanOrEqual(3);
  });
});

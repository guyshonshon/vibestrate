import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../../src/setup/setup-service.js";
import { setConfigValue } from "../../src/setup/config-update-service.js";
import { Orchestrator } from "../../src/core/orchestrator.js";
import { loadConfig } from "../../src/project/config-loader.js";
import { resolveFlow } from "../../src/flows/runtime/flow-resolver.js";
import { pickupAnalysisFlow } from "../../src/flows/catalog/builtin-flows.js";
import { RoadmapService } from "../../src/roadmap/roadmap-service.js";
import type { ProviderDetectionRunner } from "../../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

// Fake provider for the per-item analysis pick-up (Phase D, Shape A). The two
// analysts (`analyze-risk` / `analyze-tests`, both the read-only `reviewer`
// role) each record a start/end timestamp around a 300ms sleep tagged with the
// checklist item number, so the test can prove they ran CONCURRENTLY within an
// item. The implementer (`executor`) writes a per-item file so each item has a
// real diff to commit. The holistic `review` approves.
const FAKE = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const log = path.join(__dirname, 'analysis-concurrency.log');
let i = '';
process.stdin.on('data', (c) => (i += c));
process.stdin.on('end', () => {
  const m = i.match(/Current checklist item - (\\d+) of/);
  const n = m ? m[1] : 'x';
  const sm = i.match(/Flow step:.*\\(([\\w-]+)\\)/);
  const id = sm ? sm[1] : '';
  if (id === 'analyze-risk' || id === 'analyze-tests') {
    fs.appendFileSync(log, JSON.stringify({ phase: 'start', id, n, t: Date.now() }) + '\\n');
    setTimeout(() => {
      fs.appendFileSync(log, JSON.stringify({ phase: 'end', id, n, t: Date.now() }) + '\\n');
      console.log('# Analysis (' + id + ') for item ' + n + '\\n\\nNo blockers from this lens.');
    }, 300);
    return;
  }
  if (i.includes('Vibestrate Agent: executor')) {
    fs.writeFileSync('item' + n + '.txt', 'work for item ' + n + '\\n');
    console.log('# Implementation Summary\\nImplemented checklist item ' + n + ' by adding item' + n + '.txt.');
    return;
  }
  if (id === 'review') { console.log('# Review\\nDECISION: APPROVED'); return; }
  if (i.includes('Vibestrate Agent: planner')) { console.log('# Plan\\nWork the items in order.'); return; }
  console.log('ok');
});
`;

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-checklist-dag-"));
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

type RunEvent = { type: string; data?: Record<string, unknown> };

async function readEvents(dir: string, runId: string): Promise<RunEvent[]> {
  const raw = await fs.readFile(
    path.join(dir, ".vibestrate", "runs", runId, "events.ndjson"),
    "utf8",
  );
  return raw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as RunEvent);
}

describe("checklist DAG (Phase D, Shape A): per-item analysis fan-out", () => {
  it("runs the band as a per-item DAG: 2 analysts in parallel -> writer, once per item", async () => {
    const dir = await makeProject();
    const svc = new RoadmapService(dir);
    await svc.init();
    const task = await svc.addTask({ title: "Build three small things" });
    await svc.addChecklistItem(task.id, "create the first file");
    await svc.addChecklistItem(task.id, "create the second file");
    await svc.addChecklistItem(task.id, "create the third file");

    const loaded = await loadConfig(dir);
    const resolved = resolveFlow({
      flow: pickupAnalysisFlow,
      source: { kind: "builtin", ref: "pickup-analysis" },
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

    // Reached terminal success (review approved, no validation/verify step).
    expect(out.state.status).toBe("merge_ready");

    // All three items done with a commit sha written back.
    const after = await svc.getTask(task.id);
    expect(after!.checklist.map((c) => c.status)).toEqual(["done", "done", "done"]);
    for (const item of after!.checklist) {
      expect(item.commitSha).toMatch(/^[0-9a-f]{40}$/);
    }

    // Three per-item commits on the run branch, each stamped with its item id.
    const log = await execa("git", ["log", "--pretty=%H%n%B%n==="], {
      cwd: out.worktreePath!,
    });
    for (const item of after!.checklist) {
      expect(log.stdout).toContain(`Vibestrate-Checklist-Item: ${item.id}`);
    }

    const events = await readEvents(dir, out.runId);

    // The band ran through the frontier ONCE PER ITEM (3 fan-out waves, each of
    // the two analysts) - not a single whole-flow graph, and not the linear walk.
    const frontier = events.filter((e) => e.type === "flow.frontier.scheduled");
    expect(frontier).toHaveLength(3);
    for (const f of frontier) {
      expect(f.data?.width).toBe(2);
      expect((f.data?.stepIds as string[]).sort()).toEqual([
        "analyze-risk",
        "analyze-tests",
      ]);
    }
    // The per-item band suppresses the whole-flow graph lifecycle events.
    expect(events.some((e) => e.type === "flow.graph.started")).toBe(false);
    // It IS a checklist pick-up run.
    expect(events.some((e) => e.type === "checklist.run.started")).toBe(true);
    expect(
      events.filter((e) => e.type === "checklist.item.completed"),
    ).toHaveLength(3);

    // Forward-carry: item 2's context names item 1's work.
    const runDir = path.join(dir, ".vibestrate", "runs", out.runId);
    const before2 = await fs.readFile(
      path.join(runDir, "artifacts", "flows", "checklist", "before-item-2.md"),
      "utf8",
    );
    expect(before2).toContain("create the first file");
  }, 60_000);

  it("actually runs the two analysts concurrently within each item", async () => {
    const dir = await makeProject();
    const svc = new RoadmapService(dir);
    await svc.init();
    const task = await svc.addTask({ title: "Two things" });
    await svc.addChecklistItem(task.id, "first");
    await svc.addChecklistItem(task.id, "second");

    const loaded = await loadConfig(dir);
    const resolved = resolveFlow({
      flow: pickupAnalysisFlow,
      source: { kind: "builtin", ref: "pickup-analysis" },
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
    await orch.run();

    const raw = await fs.readFile(path.join(dir, "analysis-concurrency.log"), "utf8");
    const marks = raw
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as { phase: "start" | "end"; id: string; n: string; t: number });
    // Two analysts x two items = four start/end pairs.
    expect(marks.filter((m) => m.phase === "start")).toHaveLength(4);

    // Concurrency proof PER ITEM: within each item the two analysts overlap.
    for (const n of ["1", "2"]) {
      const item = marks.filter((m) => m.n === n);
      const timeline = [
        ...item.filter((m) => m.phase === "start").map((m) => ({ t: m.t, d: 1 })),
        ...item.filter((m) => m.phase === "end").map((m) => ({ t: m.t, d: -1 })),
      ].sort((a, b) => a.t - b.t || a.d - b.d);
      let live = 0;
      let maxLive = 0;
      for (const e of timeline) {
        live += e.d;
        maxLive = Math.max(maxLive, live);
      }
      expect(maxLive).toBeGreaterThanOrEqual(2);
    }
  }, 60_000);

  it("read-only run still fans out the analysts via the frontier (writer skipped)", async () => {
    const dir = await makeProject();
    const svc = new RoadmapService(dir);
    await svc.init();
    const task = await svc.addTask({ title: "Investigate" });
    await svc.addChecklistItem(task.id, "look at the first thing");

    const loaded = await loadConfig(dir);
    const resolved = resolveFlow({
      flow: pickupAnalysisFlow,
      source: { kind: "builtin", ref: "pickup-analysis" },
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
      readOnly: true,
      onProgress: () => {},
    });
    const out = await orch.run();
    const events = await readEvents(dir, out.runId);

    // Even with usingChecklist=false (read-only), the band runs ONCE through the
    // frontier - the read-only analysts still fan out (P-CRIT-2).
    const frontier = events.filter((e) => e.type === "flow.frontier.scheduled");
    expect(frontier).toHaveLength(1);
    expect(frontier[0]!.data?.width).toBe(2);

    // The writer is skipped on a read-only run.
    const skipped = events
      .filter((e) => e.type === "flow.step.skipped" && e.data?.readOnly === true)
      .map((e) => e.data?.stepId);
    expect(skipped).toContain("implement");
  }, 60_000);
});

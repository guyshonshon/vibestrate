import { describe, it, expect, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";
import { cmdSequence } from "../src/cli/commands/saga.js";
import { runEventsPath } from "../src/utils/paths.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

// Integration coverage for the conductor-triggered ENHANCE pass (Phase 3),
// driving the REAL orchestrator with a fake provider. The supervisor turn
// returns ENHANCE; the conductor then runs the enhance turn (matched by its own
// header) which emits a JSON step-diff. The fake reads supervisor-output.txt
// (default PROCEED) and enhance-output.txt (the diff).

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

const FAKE = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const counts = path.join(__dirname, 'review-counts.json');
let inp = '';
process.stdin.on('data', (c) => (inp += c));
process.stdin.on('end', () => {
  // The between-steps supervisor turn (matched FIRST by its header).
  if (/Saga supervisor checkpoint/.test(inp)) {
    let out = 'DECISION: PROCEED';
    try { out = fs.readFileSync(path.join(__dirname, 'supervisor-output.txt'), 'utf8'); } catch (e) {}
    process.stdout.write(out + '\\n');
    return;
  }
  // The ENHANCE re-ground turn (its own header). Its diff JSON is controlled by
  // enhance-output.txt; {PENDING_ID} is substituted with the first pending id
  // the prompt lists, so the test doesn't need to know generated ids.
  if (/Saga conductor re-grounding/.test(inp)) {
    let out = '{}';
    try { out = fs.readFileSync(path.join(__dirname, 'enhance-output.txt'), 'utf8'); } catch (e) {}
    const m = inp.match(/Pending steps[\\s\\S]*?\\n- (\\S+):/);
    const id = m ? m[1] : '';
    process.stdout.write(out.replace(/\\{PENDING_ID\\}/g, id) + '\\n');
    return;
  }
  const im = inp.match(/Step (\\d+) of/) || inp.match(/Current checklist item - (\\d+) of/);
  const n = im ? im[1] : 'x';
  const sm = inp.match(/Flow step:.*\\(([\\w-]+)\\)/);
  const id = sm ? sm[1] : '';
  if (id === 'plan' || id === 'micro-plan') {
    console.log('# Plan\\nWork the steps in order.');
    return;
  }
  if (id === 'implement') {
    fs.appendFileSync('item' + n + '.txt', 'work for step ' + n + ' @ ' + Date.now() + '\\n');
    console.log('# Implementation Summary\\nImplemented saga step ' + n + '.');
    return;
  }
  if (id === 'review-item') {
    let state = {};
    try { state = JSON.parse(fs.readFileSync(counts, 'utf8')); } catch (e) {}
    const pass = (state[n] || 0) + 1;
    state[n] = pass;
    fs.writeFileSync(counts, JSON.stringify(state));
    console.log('# Review step ' + n + '\\nDECISION: ' + (pass === 1 ? 'CHANGES_REQUESTED' : 'APPROVED'));
    return;
  }
  if (id === 'review') {
    console.log('# Holistic review\\nDECISION: APPROVED');
    return;
  }
  console.log('ok');
});
`;

async function makeProject(opts: {
  supervisor?: string;
  enhance?: string;
}): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-saga-enh-"));
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
  if (opts.supervisor) {
    await fs.writeFile(path.join(dir, "supervisor-output.txt"), opts.supervisor);
  }
  if (opts.enhance) {
    await fs.writeFile(path.join(dir, "enhance-output.txt"), opts.enhance);
  }
  await setConfigValue(
    dir,
    "providers.fake",
    JSON.stringify({ type: "cli", command: "node", args: [fakeJs], input: "stdin" }),
  );
  await setConfigValue(dir, "profiles.claude-balanced.provider", "fake");
  await setConfigValue(dir, "workflow.maxReviewLoops", "2");
  return dir;
}

async function readEvents(dir: string): Promise<Array<{ type: string; data?: any }>> {
  const runsDir = path.join(dir, ".vibestrate", "runs");
  const runIds = (await fs.readdir(runsDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  const raw = await fs.readFile(runEventsPath(dir, runIds[0]!), "utf8");
  return raw.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
}

async function packetText(dir: string, itemNum: number): Promise<string> {
  const runsDir = path.join(dir, ".vibestrate", "runs");
  const id = (await fs.readdir(runsDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)[0]!;
  return fs.readFile(
    path.join(runsDir, id, "artifacts", "flows", "checklist", `item-${itemNum}-packet.md`),
    "utf8",
  );
}

async function roleMetrics(dir: string): Promise<Array<{ roleId: string }>> {
  const runsDir = path.join(dir, ".vibestrate", "runs");
  const id = (await fs.readdir(runsDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)[0]!;
  const raw = await fs.readFile(path.join(runsDir, id, "runtime-metrics.json"), "utf8");
  return JSON.parse(raw).roles ?? [];
}

describe("saga ENHANCE pass (real executor)", () => {
  const prevCwd = process.cwd();
  afterEach(() => process.chdir(prevCwd));

  it("refines the pending step, runs it revised, and reconciles on completion", async () => {
    const dir = await makeProject({
      supervisor: "DECISION: ENHANCE",
      enhance: '{"refine":[{"id":"{PENDING_ID}","text":"create the second file REGROUNDED"}]}',
    });
    const svc = new RoadmapService(dir);
    await svc.init();
    const task = await svc.addTask({ title: "Two-step build", kind: "saga" });
    await svc.addChecklistItem(task.id, "create the first file");
    await svc.addChecklistItem(task.id, "create the second file");

    process.chdir(dir);
    const code = await cmdSequence(task.id, { json: true });
    expect(code).toBe(0);

    const after = await svc.getTask(task.id);
    expect(after!.checklist.map((c) => c.status)).toEqual(["done", "done"]);
    expect(after!.sagaState).toBe("done");

    // The enhance event records what was applied.
    const events = await readEvents(dir);
    const enh = events.find((e) => e.type === "saga.enhance");
    expect(enh).toBeTruthy();
    expect(enh!.data?.authority).toBe("auto");

    // The revised text drove step 2's execution (its packet predates the
    // original text; the second item's brief/packet reflects the regrounded one).
    const packet2 = await packetText(dir, 2);
    expect(packet2).toContain("REGROUNDED");

    // Reconciled into the persisted checklist on clean completion; overlay cleared.
    expect(after!.checklist[1]!.text).toContain("REGROUNDED");
    expect(after!.sagaPendingRevision).toBeNull();

    // The enhance turn is spend-accounted as its own role.
    const roles = await roleMetrics(dir);
    expect(roles.some((r) => r.roleId === "saga-enhance")).toBe(true);
  }, 90_000);

  it("escalates (halts) when the conductor's diff would add a step", async () => {
    const dir = await makeProject({
      supervisor: "DECISION: ENHANCE",
      enhance: '{"add":[{"text":"a brand new step"}]}',
    });
    const svc = new RoadmapService(dir);
    await svc.init();
    const task = await svc.addTask({ title: "Two-step build", kind: "saga" });
    await svc.addChecklistItem(task.id, "create the first file");
    await svc.addChecklistItem(task.id, "create the second file");

    process.chdir(dir);
    const code = await cmdSequence(task.id, { json: true });
    expect(code).toBe(0);

    const after = await svc.getTask(task.id);
    // Step 1 committed + kept; step 2 never ran; halted on the destructive diff.
    expect(after!.checklist[0]!.status).toBe("done");
    expect(after!.checklist[1]!.status).toBe("pending");
    expect(after!.sagaState).toBe("halted");
    expect(after!.sagaHalt?.reason).toBe("enhance-escalate");

    const events = await readEvents(dir);
    expect(events.some((e) => e.type === "saga.enhance" && e.data?.authority === "escalate")).toBe(
      true,
    );
  }, 90_000);
});

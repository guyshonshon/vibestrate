import { describe, it, expect, afterEach, vi } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";
import { cmdStatus, cmdPause, cmdResume } from "../src/cli/commands/saga.js";
import { getTaskRunStatus, NotSupervisedError } from "../src/core/saga/saga-status.js";
import { acquireTaskLock, taskLockPath } from "../src/core/run-lock.js";
import {
  RunStateStore,
  createInitialState,
} from "../src/core/state-machine.js";

async function makeProject(): Promise<string> {
  const dir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-saga-ctl-")),
  );
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  return dir;
}

/** Simulate a LIVE run sequencing the saga: hold the task lock with `runId` and
 *  seed that run's state (pausable). */
async function seedLiveRun(
  dir: string,
  taskId: string,
  runId: string,
): Promise<void> {
  await acquireTaskLock(dir, taskId, runId);
  const store = new RunStateStore(dir, runId);
  await store.write(
    createInitialState({
      runId,
      task: "saga fixture",
      projectRoot: dir,
      worktreePath: null,
      branchName: null,
      maxReviewLoops: 2,
    }),
  );
}

function captureLog(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
    lines.push(a.map(String).join(" "));
  });
  return { lines, restore: () => spy.mockRestore() };
}

describe("vibe saga status | pause | resume", () => {
  const prevCwd = process.cwd();
  afterEach(() => {
    process.chdir(prevCwd);
    vi.restoreAllMocks();
  });

  it("status --json reports lifecycle, progress, steps", async () => {
    const dir = await makeProject();
    const svc = new RoadmapService(dir);
    await svc.init();
    const task = await svc.addTask({ title: "Build it", runMode: "supervised" });
    await svc.addChecklistItem(task.id, "step one");
    await svc.addChecklistItem(task.id, "step two");

    process.chdir(dir);
    const cap = captureLog();
    const code = await cmdStatus(task.id, { json: true });
    cap.restore();
    expect(code).toBe(0);

    const json = JSON.parse(cap.lines.find((l) => l.trim().startsWith("{"))!);
    expect(json.supervisedState).toBe("idle");
    expect(json.progress).toEqual({ done: 0, total: 2 });
    expect(json.steps.map((s: { text: string }) => s.text)).toEqual([
      "step one",
      "step two",
    ]);
    expect(json.liveRunId).toBeNull();
  });

  it("status surfaces a halt record and invariants", async () => {
    const dir = await makeProject();
    const svc = new RoadmapService(dir);
    await svc.init();
    const task = await svc.addTask({ title: "Build it", runMode: "supervised" });
    await svc.addChecklistItem(task.id, "step one");
    await svc.recordSagaHalt(task.id, {
      reason: "supervisor-escalate",
      atStepId: null,
      summary: "off goal",
    });
    await svc.appendSagaInvariants(task.id, ["all responses use snake_case"]);

    process.chdir(dir);
    const cap = captureLog();
    await cmdStatus(task.id, { json: true });
    cap.restore();

    const json = JSON.parse(cap.lines.find((l) => l.trim().startsWith("{"))!);
    expect(json.supervisedState).toBe("halted");
    expect(json.supervisedHalt.reason).toBe("supervisor-escalate");
    expect(json.supervisedInvariants).toContain("all responses use snake_case");
  });

  it("pause writes pauseRequested on the saga's live run", async () => {
    const dir = await makeProject();
    const svc = new RoadmapService(dir);
    await svc.init();
    const task = await svc.addTask({ title: "Build it", runMode: "supervised" });
    await svc.addChecklistItem(task.id, "step one");
    const runId = "20260629-120000-live-run";
    await seedLiveRun(dir, task.id, runId);

    process.chdir(dir);
    expect(await cmdPause(task.id)).toBe(0);

    const state = await new RunStateStore(dir, runId).read();
    expect(state.pauseRequested).toBe(true);
  });

  it("pause with no live run fails fast (nothing to pause)", async () => {
    const dir = await makeProject();
    const svc = new RoadmapService(dir);
    await svc.init();
    const task = await svc.addTask({ title: "Build it", runMode: "supervised" });
    await svc.addChecklistItem(task.id, "step one");

    process.chdir(dir);
    expect(await cmdPause(task.id)).toBe(1);
  });

  it("a STALE lock (dead pid, run stuck non-terminal) is not a live run", async () => {
    // The crashed-run scenario: a hard crash left the lock held by a dead pid and
    // state.json stuck at a non-terminal status. pause/resume must NOT report a
    // confident success for a process that will never read the flag.
    const dir = await makeProject();
    const svc = new RoadmapService(dir);
    await svc.init();
    const task = await svc.addTask({ title: "Build it", runMode: "supervised" });
    await svc.addChecklistItem(task.id, "step one");
    const runId = "20260629-130000-crashed-run";
    // Non-terminal ("created") run state, but a lock held by a dead pid on this host.
    await new RunStateStore(dir, runId).write(
      createInitialState({
        runId,
        task: "crashed",
        projectRoot: dir,
        worktreePath: null,
        branchName: null,
        maxReviewLoops: 2,
      }),
    );
    const lockPath = taskLockPath(dir, task.id);
    await fs.mkdir(path.dirname(lockPath), { recursive: true });
    await fs.writeFile(
      lockPath,
      JSON.stringify({
        runId,
        pid: 2 ** 31 - 1, // a pid that is effectively never alive
        host: os.hostname(),
        startedAt: new Date(0).toISOString(),
      }),
    );

    process.chdir(dir);
    // Stale holder -> no live run -> pause/resume fail fast instead of lying.
    expect(await cmdPause(task.id)).toBe(1);
    expect(await cmdResume(task.id)).toBe(1);
  });

  it("resume clears the pause flag on the live run", async () => {
    const dir = await makeProject();
    const svc = new RoadmapService(dir);
    await svc.init();
    const task = await svc.addTask({ title: "Build it", runMode: "supervised" });
    await svc.addChecklistItem(task.id, "step one");
    const runId = "20260629-120100-live-run";
    await seedLiveRun(dir, task.id, runId);
    // Mark a pending pause so resume has something to clear.
    const store = new RunStateStore(dir, runId);
    await store.write({ ...(await store.read()), pauseRequested: true });

    process.chdir(dir);
    expect(await cmdResume(task.id)).toBe(0);
    expect((await store.read()).pauseRequested).toBe(false);
  });

  it("resume on a halted saga points to sequence (exit 0)", async () => {
    const dir = await makeProject();
    const svc = new RoadmapService(dir);
    await svc.init();
    const task = await svc.addTask({ title: "Build it", runMode: "supervised" });
    await svc.addChecklistItem(task.id, "step one");
    await svc.recordSagaHalt(task.id, {
      reason: "self-heal-exhausted",
      atStepId: task.checklist?.[0]?.id ?? null,
      summary: "blocked",
    });

    process.chdir(dir);
    expect(await cmdResume(task.id)).toBe(0);
  });

  it("rejects a non-saga task", async () => {
    const dir = await makeProject();
    const svc = new RoadmapService(dir);
    await svc.init();
    const single = await svc.addTask({ title: "One-off", runMode: "plain" });
    process.chdir(dir);
    expect(await cmdStatus(single.id, { json: true })).toBe(1);
    expect(await cmdPause(single.id)).toBe(1);
  });
});

describe("getTaskRunStatus (shared CLI + dashboard source)", () => {
  it("returns lifecycle, live run, progress, halt, invariants", async () => {
    const dir = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-saga-svc-")),
    );
    const svc = new RoadmapService(dir);
    await svc.init();
    const task = await svc.addTask({ title: "Conduct it", runMode: "supervised" });
    await svc.addChecklistItem(task.id, "step one");
    await svc.addChecklistItem(task.id, "step two");
    const withSteps = await svc.getTask(task.id);
    await svc.setChecklistItemStatus(task.id, withSteps!.checklist[0]!.id, "done");
    await svc.appendSagaInvariants(task.id, ["snake_case everywhere"]);
    const runId = "20260629-140000-live";
    await acquireTaskLock(dir, task.id, runId);

    const status = await getTaskRunStatus(dir, task.id);
    expect(status.supervisedState).toBe("idle");
    expect(status.liveRunId).toBe(runId); // live (this pid) lock holder
    expect(status.progress).toEqual({ done: 1, total: 2 });
    expect(status.supervisedInvariants).toContain("snake_case everywhere");
    expect(status.steps).toHaveLength(2);
  });

  it("throws NotSupervisedError for a missing or non-saga task", async () => {
    const dir = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-saga-svc2-")),
    );
    const svc = new RoadmapService(dir);
    await svc.init();
    const single = await svc.addTask({ title: "Plain", runMode: "plain" });
    await expect(getTaskRunStatus(dir, "nope")).rejects.toBeInstanceOf(NotSupervisedError);
    await expect(getTaskRunStatus(dir, single.id)).rejects.toBeInstanceOf(NotSupervisedError);
  });
});

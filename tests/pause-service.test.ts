import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {
  RunStateStore,
  applyTransition,
  createInitialState,
} from "../src/core/state-machine.js";
import { EventLog } from "../src/core/event-log.js";
import {
  applyPauseIfRequested,
  PauseError,
  requestPause,
  requestResume,
} from "../src/core/pause-service.js";

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-pause-"));
  await fs.mkdir(path.join(dir, ".vibestrate", "runs"), { recursive: true });
  return dir;
}

async function seedRun(projectRoot: string, runId: string): Promise<void> {
  await fs.mkdir(path.join(projectRoot, ".vibestrate", "runs", runId), {
    recursive: true,
  });
  const state = createInitialState({
    runId,
    task: "fixture task",
    projectRoot,
    worktreePath: null,
    branchName: null,
    maxReviewLoops: 2,
  });
  // The orchestrator writes state via the store; mirror that here so the
  // schema validation in store.read() sees a sane document.
  const store = new RunStateStore(projectRoot, runId);
  await store.write(state);
}

let project: string;
let runId: string;
let store: RunStateStore;
let events: EventLog;

beforeEach(async () => {
  project = await makeProject();
  runId = "20260516-120000-pause-fixture";
  await seedRun(project, runId);
  store = new RunStateStore(project, runId);
  events = new EventLog(project, runId);
});

afterEach(async () => {
  await fs.rm(project, { recursive: true, force: true });
});

describe("requestPause", () => {
  it("sets pauseRequested=true on a pausable run and emits run.pause_requested", async () => {
    const next = await requestPause(store, events);
    expect(next.pauseRequested).toBe(true);
    // Status itself is unchanged — pause is observed by the orchestrator
    // at the next stage boundary, not synchronously here.
    expect(next.status).toBe("created");
    const log = await fs.readFile(
      path.join(project, ".vibestrate", "runs", runId, "events.ndjson"),
      "utf8",
    );
    expect(log).toContain('"type":"run.pause_requested"');
  });

  it("is idempotent — calling twice doesn't double-emit", async () => {
    await requestPause(store, events);
    const second = await requestPause(store, events);
    expect(second.pauseRequested).toBe(true);
    const log = await fs.readFile(
      path.join(project, ".vibestrate", "runs", runId, "events.ndjson"),
      "utf8",
    );
    const occurrences = log.split('"type":"run.pause_requested"').length - 1;
    expect(occurrences).toBe(1);
  });

  it("refuses to pause a terminal run", async () => {
    let s = await store.read();
    s = applyTransition(s, "failed");
    await store.write(s);
    await expect(requestPause(store, events)).rejects.toBeInstanceOf(
      PauseError,
    );
  });

  it("refuses to re-pause an already-paused run", async () => {
    let s = await store.read();
    s = applyTransition(s, "paused");
    await store.write(s);
    await expect(requestPause(store, events)).rejects.toBeInstanceOf(
      PauseError,
    );
  });
});

describe("requestResume", () => {
  it("clears pauseRequested on a paused run and emits run.resume_requested", async () => {
    await requestPause(store, events);
    let s = await store.read();
    s = applyTransition(s, "paused");
    s = { ...s, pausedAtStatus: "created" };
    await store.write(s);
    const next = await requestResume(store, events);
    expect(next.pauseRequested).toBe(false);
    // Status is still paused — applyPauseIfRequested round-trips back to
    // pausedAtStatus, not requestResume.
    expect(next.status).toBe("paused");
    const log = await fs.readFile(
      path.join(project, ".vibestrate", "runs", runId, "events.ndjson"),
      "utf8",
    );
    expect(log).toContain('"type":"run.resume_requested"');
  });

  it("cancels a pending pause request before it takes effect", async () => {
    await requestPause(store, events);
    const next = await requestResume(store, events);
    expect(next.pauseRequested).toBe(false);
    expect(next.status).toBe("created");
  });

  it("refuses on a non-paused, non-pending-pause run", async () => {
    await expect(requestResume(store, events)).rejects.toBeInstanceOf(
      PauseError,
    );
  });
});

describe("applyPauseIfRequested", () => {
  it("returns the state unchanged when pauseRequested is false", async () => {
    const before = await store.read();
    const after = await applyPauseIfRequested({
      state: before,
      store,
      events,
    });
    expect(after.status).toBe(before.status);
    expect(after.pauseRequested).toBe(false);
  });

  it("enters paused, records pausedAtStatus, and rounds back on resume", async () => {
    // Move the run forward so pause-from-planning has a non-trivial round-trip.
    let s = await store.read();
    s = applyTransition(s, "planning");
    s = applyTransition(s, "planned");
    await store.write(s);
    await requestPause(store, events);

    // Stage a deferred resume — by the time applyPauseIfRequested polls
    // the second time, pauseRequested is false. Poll every 25ms for the
    // test loop to keep things snappy.
    setTimeout(() => {
      void requestResume(store, events);
    }, 60);

    const after = await applyPauseIfRequested({
      state: await store.read(),
      store,
      events,
      pollMs: 25,
    });
    // We round-trip back to the pre-pause status, with both flags cleared.
    expect(after.status).toBe("planned");
    expect(after.pausedAtStatus).toBeNull();
    expect(after.pauseRequested).toBe(false);

    const log = await fs.readFile(
      path.join(project, ".vibestrate", "runs", runId, "events.ndjson"),
      "utf8",
    );
    expect(log).toContain('"type":"run.paused"');
    expect(log).toContain('"type":"run.resumed"');
  });

  it("surfaces an external abort during pause as a terminal state", async () => {
    let s = await store.read();
    s = applyTransition(s, "planning");
    s = applyTransition(s, "planned");
    await store.write(s);
    await requestPause(store, events);

    // While paused, another writer (e.g., `vibestrate abort`) transitions to
    // aborted. applyPauseIfRequested must observe that and return the
    // terminal state so the orchestrator exits cleanly.
    setTimeout(async () => {
      const cur = await store.read();
      const aborted = applyTransition(cur, "aborted");
      await store.write(aborted);
    }, 60);

    const after = await applyPauseIfRequested({
      state: await store.read(),
      store,
      events,
      pollMs: 25,
    });
    expect(after.status).toBe("aborted");
  });

  it("clears an orphaned pauseRequested when the run is already terminal", async () => {
    // Sneak past requestPause's guard by writing the flag directly while
    // the run is still pausable, then drive it to terminal. Real-world
    // analogue: a pause request that lost a race with an abort.
    await requestPause(store, events);
    let s = await store.read();
    s = applyTransition(s, "failed");
    await store.write(s);
    const after = await applyPauseIfRequested({
      state: await store.read(),
      store,
      events,
      pollMs: 25,
    });
    expect(after.status).toBe("failed");
    expect(after.pauseRequested).toBe(false);
  });
});

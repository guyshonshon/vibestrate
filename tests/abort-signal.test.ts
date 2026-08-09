import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { RunStateStore, createInitialState } from "../src/core/state-machine.js";
import { EventLog } from "../src/core/stores/event-log.js";
import { requestAbort, isAbortRequested } from "../src/core/run/abort-service.js";
import { applyPauseIfRequested } from "../src/core/run/pause-service.js";

/**
 * Abort used to be a status four processes wrote directly to state.json. The
 * orchestrator holds its state in memory across a turn and writes the whole
 * object afterwards, so an abort landing in that window was reverted to
 * `executing` - after the user had already been told the run was aborted.
 *
 * It is now a signal: the requester raises a flag, the orchestrator observes it
 * and ends the run itself, so exactly one writer moves a live run. The only
 * exception is a run whose process is gone, where nobody is left to observe
 * anything and the requester has to close it out.
 */
describe("abort as a signal", () => {
  let root: string;
  let store: RunStateStore;
  let events: EventLog;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "abort-signal-"));
    const runId = "run-abort-test";
    await fs.mkdir(path.join(root, ".vibestrate", "runs", runId), { recursive: true });
    store = new RunStateStore(root, runId);
    events = new EventLog(root, runId);
    const initial = createInitialState({
      runId,
      task: "do a thing",
      projectRoot: root,
      worktreePath: null,
      branchName: null,
      maxReviewLoops: 3,
    });
    await store.write({ ...initial, status: "executing" });
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  async function claimForThisProcess(): Promise<void> {
    const s = await store.read();
    await store.write({ ...s, ownerPid: process.pid });
  }

  it("raises the flag and leaves the status alone while a live process owns the run", async () => {
    await claimForThisProcess();
    const res = await requestAbort(store, events, { reason: "test" });

    expect(res.finalized, "a live owner must finalize the run itself").toBe(false);
    expect(res.run.abortRequested).toBe(true);
    // The critical assertion: the requester did NOT write a terminal status.
    // That write is what raced the orchestrator and got silently reverted.
    expect(res.run.status).toBe("executing");
    expect((await store.read()).status).toBe("executing");
  });

  it("the orchestrator's read side sees the raised flag", async () => {
    await claimForThisProcess();
    expect(await isAbortRequested(store)).toBe(false);
    await requestAbort(store, events, { reason: "test" });
    expect(await isAbortRequested(store)).toBe(true);
  });

  it("closes out a run whose process is gone, because nobody is left to", async () => {
    // A pid that cannot be alive stands in for a crashed orchestrator.
    const s = await store.read();
    await store.write({ ...s, ownerPid: 2147483646 });

    const res = await requestAbort(store, events, { reason: "test" });
    expect(res.finalized).toBe(true);
    expect(res.run.status).toBe("aborted");
    expect((await store.read()).status).toBe("aborted");
  });

  it("treats an unclaimed run as unowned rather than assuming a live orchestrator", async () => {
    // ownerPid is null until the orchestrator claims it, so a run that was
    // created and never started must not be left stuck waiting for nobody.
    expect((await store.read()).ownerPid).toBeNull();
    const res = await requestAbort(store, events, { reason: "test" });
    expect(res.finalized).toBe(true);
    expect(res.run.status).toBe("aborted");
  });

  it("is idempotent while an abort is in flight", async () => {
    await claimForThisProcess();
    await requestAbort(store, events, { reason: "first" });
    const second = await requestAbort(store, events, { reason: "second" });
    expect(second.run.abortRequested).toBe(true);
    expect(second.run.status).toBe("executing");
  });

  it("reports an already-terminal run instead of touching it", async () => {
    const s = await store.read();
    await store.write({ ...s, status: "merge_ready" });
    const res = await requestAbort(store, events, { reason: "test" });
    expect(res.alreadyTerminal).toBe(true);
    expect(res.finalized).toBe(false);
    expect((await store.read()).status).toBe("merge_ready");
  });

  // The regression this pins: abort is now a request, so a live paused run
  // keeps status "paused" until the orchestrator ends it. The pause loop used to
  // exit only on a TERMINAL status or on pauseRequested clearing - neither of
  // which an abort produces any more - so aborting a paused run parked it in
  // that loop forever, where before the change it terminated.
  it("does not park a paused run in the pause loop when it is aborted", async () => {
    await claimForThisProcess();
    const s = await store.read();
    await store.write({ ...s, pauseRequested: true });

    const pausing = applyPauseIfRequested({
      state: await store.read(),
      store,
      events,
      pollMs: 10,
    });

    // Let it settle into "paused" and start polling, then abort it.
    await new Promise((r) => setTimeout(r, 60));
    expect((await store.read()).status).toBe("paused");
    await requestAbort(store, events, { reason: "test" });

    const settled = await Promise.race([
      pausing.then(() => "returned" as const),
      new Promise<"hung">((r) => setTimeout(() => r("hung"), 3000)),
    ]);
    expect(settled, "the pause loop must hand control back on an abort").toBe(
      "returned",
    );
    expect((await pausing).abortRequested).toBe(true);
  }, 10_000);

  it("still observes an abort written by an older client as a bare status", async () => {
    const s = await store.read();
    await store.write({ ...s, status: "aborted" });
    expect(await isAbortRequested(store)).toBe(true);
  });
});

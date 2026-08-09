import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import {
  createInitialState,
  renameRun,
  RunStateStore,
  RunNotFoundError,
  type RunState,
} from "../src/core/state-machine.js";
import { withFileMutex } from "../src/utils/file-mutex.js";
import { writeTextAtomic } from "../src/utils/fs.js";

/**
 * state.json is read-modify-written by more than one process. The orchestrator
 * loads it, works for the length of a whole model turn, then writes the whole
 * object back. A rename or a pause from another process did its own
 * read-modify-write with no locking, so whichever finished last won - and when
 * that was the external writer, it put a minutes-old copy of the flow ledger
 * back on disk and the run's progress was gone.
 */
describe("state.json concurrent writers", () => {
  let root: string;
  const runId = "run-lost-update";
  let store: RunStateStore;

  const seed = async (over: Partial<RunState> = {}): Promise<void> => {
    const initial = createInitialState({
      runId,
      task: "do a thing",
      projectRoot: root,
      worktreePath: null,
      branchName: null,
      maxReviewLoops: 3,
    });
    await store.write({ ...initial, status: "executing", ...over });
  };

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-lost-update-"));
    store = new RunStateStore(root, runId);
    await fs.mkdir(path.dirname(store.filePath), { recursive: true });
    await seed();
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("an external rename cannot revert progress that landed while it waited", async () => {
    // Stand in for the orchestrator holding the lock across its own write. The
    // rename must block here, then re-read, rather than writing the copy it
    // read before this section began.
    // Started inside the section but awaited outside it: returning the promise
    // from the section would make the mutex await it before releasing, and the
    // rename is waiting on that release.
    let renaming!: Promise<RunState>;
    await withFileMutex(store.lockPath, async () => {
      renaming = renameRun(root, runId, "Renamed");
      await new Promise((r) => setTimeout(r, 50));
      // Deliberately NOT store.write: that would take this same lock and
      // deadlock. This is the orchestrator's write from inside the section.
      const progressed = { ...(await store.read()), reviewLoopCount: 7 };
      await writeTextAtomic(
        store.filePath,
        `${JSON.stringify(progressed, null, 2)}\n`,
      );
    });
    await renaming;

    const onDisk = await store.read();
    expect(onDisk.displayName).toBe("Renamed");
    // The assertion that distinguishes the two implementations: reading before
    // acquiring makes this 0 again.
    expect(onDisk.reviewLoopCount).toBe(7);
  });

  it("a whole-object write never lowers abortRequested", async () => {
    // The orchestrator's in-memory copy predates the abort request, and the
    // window where nothing is watching for it (post-turn diff gate, approval
    // gate) is exactly where that copy gets written.
    const stale = await store.read();
    await store.write({ ...stale, abortRequested: true });
    await store.write({ ...stale, abortRequested: false, reviewLoopCount: 2 });

    const onDisk = await store.read();
    expect(onDisk.abortRequested, "an abort must survive a stale write").toBe(true);
    expect(onDisk.reviewLoopCount).toBe(2);
  });

  it("mutating a pruned run refuses instead of recreating its directory", async () => {
    // Acquiring the lock creates the run directory, so a mutation aimed at a
    // pruned run would leave an empty one behind - and the orphan sweep reads
    // those directories to decide which snapshot refs are still reachable.
    await fs.rm(path.dirname(store.filePath), { recursive: true, force: true });
    await expect(renameRun(root, runId, "Ghost")).rejects.toThrow(RunNotFoundError);
    await expect(fs.stat(path.dirname(store.filePath))).rejects.toThrow();
  });
});

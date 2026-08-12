import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";
import { RoadmapStore } from "../src/roadmap/roadmap-store.js";

// The checklist is the one part of a task two parties write at once: a live
// run's band marks items done with their commit sha, while the board, the CLI
// and the supervisor add and edit items.
//
// Before these mutations moved under the task lock, each one was a lock-free
// read-modify-write of the whole task JSON. An add that had read the task a
// moment earlier would write its stale copy back and undo a completion the run
// had just recorded - and because the band wraps its own write in a catch, the
// loss was silent: the item simply went from done-with-a-sha back to pending.

async function scratch() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-cl-"));
  return { root, svc: new RoadmapService(root), store: new RoadmapStore(root) };
}

async function taskWithItems(svc: RoadmapService, n: number) {
  const task = await svc.addTask({ title: "landing page" });
  for (let i = 0; i < n; i += 1) {
    await svc.addChecklistItem(task.id, `item ${i}`);
  }
  return task.id;
}

describe("concurrent checklist writes do not lose each other", () => {
  it("keeps every item when adds race", async () => {
    const { svc } = await scratch();
    const task = await svc.addTask({ title: "landing page" });
    await Promise.all(
      Array.from({ length: 10 }, (_, i) => svc.addChecklistItem(task.id, `item ${i}`)),
    );
    const after = await svc.getTask(task.id);
    expect(after?.checklist).toHaveLength(10);
    expect(new Set(after!.checklist.map((c) => c.text)).size).toBe(10);
  });

  it("does not resurrect a completed item when an add races the run's commit", async () => {
    // The exact scenario from the review: the band commits item 1 while the user
    // adds an item from another surface.
    const { svc } = await scratch();
    const id = await taskWithItems(svc, 3);
    const target = (await svc.getTask(id))!.checklist[1]!;

    await Promise.all([
      svc.updateChecklistItem(id, target.id, {
        status: "done",
        commitSha: "abc1234",
      }),
      svc.addChecklistItem(id, "also add a test for the header"),
    ]);

    const after = await svc.getTask(id);
    const committed = after!.checklist.find((c) => c.id === target.id);
    expect(committed?.status, "the run's completion must survive").toBe("done");
    expect(committed?.commitSha, "and so must its commit sha").toBe("abc1234");
    expect(after!.checklist).toHaveLength(4);
    expect(after!.checklist.some((c) => c.text.includes("header"))).toBe(true);
  });

  it("keeps both edits when two different items are patched at once", async () => {
    const { svc } = await scratch();
    const id = await taskWithItems(svc, 4);
    const items = (await svc.getTask(id))!.checklist;

    await Promise.all([
      svc.updateChecklistItem(id, items[0]!.id, { status: "done", commitSha: "aaa" }),
      svc.updateChecklistItem(id, items[3]!.id, { status: "done", commitSha: "bbb" }),
    ]);

    const after = await svc.getTask(id);
    expect(after!.checklist[0]!.commitSha).toBe("aaa");
    expect(after!.checklist[3]!.commitSha).toBe("bbb");
  });

  it("a remove racing an add loses neither the removal nor the addition", async () => {
    const { svc } = await scratch();
    const id = await taskWithItems(svc, 3);
    const doomed = (await svc.getTask(id))!.checklist[0]!;

    await Promise.all([
      svc.removeChecklistItem(id, doomed.id),
      svc.addChecklistItem(id, "brand new"),
    ]);

    const after = await svc.getTask(id);
    expect(after!.checklist.some((c) => c.id === doomed.id)).toBe(false);
    expect(after!.checklist.some((c) => c.text === "brand new")).toBe(true);
    expect(after!.checklist).toHaveLength(3);
  });

  it("still reports a missing item honestly, checked against live state", async () => {
    const { svc } = await scratch();
    const id = await taskWithItems(svc, 1);
    await expect(
      svc.updateChecklistItem(id, "ci-does-not-exist", { status: "done" }),
    ).rejects.toThrow(/not found/);
  });
});

describe("mutateTask", () => {
  it("returns null for a task that does not exist rather than creating one", async () => {
    const { store } = await scratch();
    const out = await store.mutateTask("nope", (t) => t);
    expect(out).toBeNull();
  });

  it("lets a mutator decline by returning null, leaving the task untouched", async () => {
    const { svc, store } = await scratch();
    const task = await svc.addTask({ title: "keep me" });
    const out = await store.mutateTask(task.id, () => null);
    expect(out).toBeNull();
    expect((await svc.getTask(task.id))?.title).toBe("keep me");
  });
});

// The checklist was only half the problem. Every other read-modify-write on the
// task file - status flips, run links, needs-testing flags, comment counters -
// was still lock-free, so a checklist write racing any of them lost whichever
// landed second. These cover the field pairs that a single run genuinely writes
// at the same time.
describe("concurrent task-field writes do not lose each other", () => {
  it("keeps both a status flip and a checklist completion", async () => {
    const { svc } = await scratch();
    const id = await taskWithItems(svc, 2);
    const target = (await svc.getTask(id))!.checklist[0]!;

    await Promise.all([
      svc.updateTaskStatus(id, "running"),
      svc.updateChecklistItem(id, target.id, { status: "done", commitSha: "def5678" }),
    ]);

    const after = await svc.getTask(id);
    expect(after?.status, "the status flip must survive").toBe("running");
    expect(
      after!.checklist.find((c) => c.id === target.id)?.status,
      "the completion must survive",
    ).toBe("done");
  });

  it("keeps every run id when runs link concurrently", async () => {
    // runIds is an append. A lock-free read-modify-write drops all but one.
    const { svc } = await scratch();
    const task = await svc.addTask({ title: "landing page" });
    await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        svc.setTaskRun({ taskId: task.id, runId: `run-${i}` }),
      ),
    );
    const after = await svc.getTask(task.id);
    expect(after?.runIds).toHaveLength(6);
  });

  it("keeps a needs-testing flag and a comment counter written at once", async () => {
    const { svc } = await scratch();
    const task = await svc.addTask({ title: "landing page" });
    await Promise.all([
      svc.flagNeedsTesting(task.id, "check the mobile header"),
      svc.addComment(task.id, { body: "looks off on iOS" }),
    ]);
    const after = await svc.getTask(task.id);
    expect(after?.needsTesting, "the flag must survive").toBe(true);
    expect(after?.commentsCount, "the counter must survive").toBe(1);
  });
});

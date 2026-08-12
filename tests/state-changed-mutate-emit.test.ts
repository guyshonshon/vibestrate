import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { RunStateStore, createInitialState } from "../src/core/state-machine.js";
import { runEventsPath } from "../src/utils/paths.js";

// `write` had a test through the replay e2e; `mutate` did not, and it is the
// path abort and pause actually take (abort-service.ts, pause-service.ts both
// call store.mutate). An emitter that only fires on one of the two funnels is
// the same dead-event bug this whole change exists to fix, just narrower.

async function scratch() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-sc-"));
  return root;
}

async function events(root: string, runId: string): Promise<Array<Record<string, unknown>>> {
  const raw = await fs.readFile(runEventsPath(root, runId), "utf8").catch(() => "");
  return raw
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

describe("state.changed is emitted from mutate, not just write", () => {
  it("emits the transition a mutate caused, with both ends of it", async () => {
    const root = await scratch();
    const runId = "run-mutate-1";
    const store = new RunStateStore(root, runId);
    await store.write(createInitialState({
      runId,
      projectRoot: root,
      task: "t",
      worktreePath: null,
      branchName: null,
      maxReviewLoops: 2,
    }));

    // Creation must not emit - run.created owns a run's birth, and a duplicate
    // would double-count in the replay timeline.
    expect(
      (await events(root, runId)).filter((e) => e.type === "state.changed"),
      "creation emits nothing",
    ).toHaveLength(0);

    await store.mutate((fresh) => ({
      next: { ...fresh, status: "executing" as const },
      result: null,
    }));
    await store.mutate((fresh) => ({
      next: { ...fresh, status: "merge_ready" as const },
      result: null,
    }));

    const changed = (await events(root, runId)).filter((e) => e.type === "state.changed");
    expect(changed).toHaveLength(2);
    expect(changed.map((e) => (e.data as Record<string, unknown>).to)).toEqual([
      "executing",
      "merge_ready",
    ]);
    expect((changed[0]!.data as Record<string, unknown>).from).toBe("created");
  });

  it("does not emit when a mutate changes something other than status", async () => {
    const root = await scratch();
    const runId = "run-mutate-2";
    const store = new RunStateStore(root, runId);
    await store.write(createInitialState({
      runId,
      projectRoot: root,
      task: "t",
      worktreePath: null,
      branchName: null,
      maxReviewLoops: 2,
    }));
    await store.mutate((fresh) => ({
      next: { ...fresh, displayName: "renamed" },
      result: null,
    }));

    expect(
      (await events(root, runId)).filter((e) => e.type === "state.changed"),
      "a non-status write is not a transition",
    ).toHaveLength(0);
  });
});

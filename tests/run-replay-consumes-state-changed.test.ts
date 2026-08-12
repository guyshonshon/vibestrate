import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { RunStateStore, createInitialState } from "../src/core/state-machine.js";
import { buildRunReplay } from "../src/core/run/run-replay-service.js";

// The other half of the timeline. `run-replay-timeline-e2e` proves the store
// EMITS state.changed; this proves the replay service turns those events into
// the snapshots the dashboard's Replay tab and `vibe replay` draw from.
//
// Worth its own test because the two halves were written years apart and never
// met: the consumer shipped with no producer for long enough that the feature
// was dead in every release up to 1.1.5, and a payload-shape disagreement
// between them would have been invisible - both sides pass their own tests
// while the timeline stays empty.

async function seeded(statuses: readonly string[]) {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-rp-"));
  const runId = "run-replay-1";
  const store = new RunStateStore(projectRoot, runId);
  await store.write(
    createInitialState({
      runId,
      projectRoot,
      task: "add a pricing page",
      worktreePath: null,
      branchName: null,
      maxReviewLoops: 2,
    }),
  );
  for (const status of statuses) {
    await store.mutate((fresh) => ({
      next: { ...fresh, status: status as typeof fresh.status },
      result: null,
    }));
  }
  return { projectRoot, runId };
}

describe("the replay service consumes what the state store emits", () => {
  it("turns each transition into a snapshot carrying both ends of it", async () => {
    const { projectRoot, runId } = await seeded(["planning", "executing", "merge_ready"]);
    const replay = await buildRunReplay(projectRoot, runId);

    expect(replay.snapshots.map((s) => s.status)).toEqual([
      "planning",
      "executing",
      "merge_ready",
    ]);
    // previousStatus is what makes it a timeline rather than a list of states.
    expect(replay.snapshots.map((s) => s.previousStatus)).toEqual([
      "created",
      "planning",
      "executing",
    ]);
    expect(
      replay.snapshots.every((s) => typeof s.timestamp === "string" && s.timestamp.length > 0),
      "every snapshot is placed in time",
    ).toBe(true);
  });

  it("is empty, not broken, for a run that never changed status", async () => {
    const { projectRoot, runId } = await seeded([]);
    const replay = await buildRunReplay(projectRoot, runId);
    expect(replay.snapshots).toEqual([]);
  });
});

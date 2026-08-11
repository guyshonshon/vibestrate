// The pairing rule the Mission Control composer's "Break into steps" control
// keys on.
//
// checklistMode and checklistSegment are load-bearing only TOGETHER. Send the
// mode for a flow with no segment and nothing complains: the plan resolves to
// zero items and the run does one ordinary pass, having advertised item-by-item
// execution. That silence is why the offer has to be gated in the UI rather
// than left to the user to get right, and this pins both halves of it.

import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";
import { resolveChecklistPlan } from "../src/core/run-engine/flow-sequence-prologue.js";
import { builtinFlows } from "../src/flows/catalog/builtin-flows.js";

const SEGMENT = { from: "micro-plan", to: "implement" };

async function projectWithCard(items: string[]) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-band-offer-"));
  const roadmap = new RoadmapService(dir);
  const task = await roadmap.addTask({ title: "Harden the uploader" });
  for (const text of items) await roadmap.addChecklistItem(task.id, text);
  return { dir, roadmap, taskId: task.id };
}

/** The plan the run engine would build for this (segment, mode) pair. */
async function planFor(opts: {
  checklistSegment: { from: string; to: string } | null;
  checklistMode: "continuous" | "step" | null;
}) {
  const { dir, roadmap, taskId } = await projectWithCard(["one", "two", "three"]);
  const plan = await resolveChecklistPlan({
    roadmap,
    projectRoot: dir,
    taskId,
    checklistMode: opts.checklistMode,
    sagaMode: false,
    resumeFrom: null,
    // Only the segment is read off the snapshot here.
    snapshot: { checklistSegment: opts.checklistSegment } as never,
    state: { checklistItemIds: [] } as never,
    // The plan records the item ids it locked onto; only the write is reached.
    stateStore: { write: async () => {} } as never,
  });
  return plan.items.map((i) => i.text);
}

describe("the composer only offers item-by-item when the flow can do it", () => {
  it("iterates the card's items when the flow declares a segment", async () => {
    expect(await planFor({ checklistSegment: SEGMENT, checklistMode: "step" })).toEqual([
      "one",
      "two",
      "three",
    ]);
  });

  it("SILENTLY does nothing when the mode is sent for a flow with no segment", async () => {
    // The failure this documents: no error, no warning, just one plain pass.
    expect(await planFor({ checklistSegment: null, checklistMode: "step" })).toEqual([]);
  });

  it("does nothing for a segment flow launched without the mode", async () => {
    expect(await planFor({ checklistSegment: SEGMENT, checklistMode: null })).toEqual([]);
  });

  it("names the built-in flows the control appears for", async () => {
    // The composer shows the offer iff `definition.checklistSegment != null`.
    // If this set changes, the control's reach changed with it - which is the
    // intended behaviour, but it should be a deliberate diff, not a surprise.
    const withBand = builtinFlows.filter((f) => f.checklistSegment != null)
      .map((f) => f.id)
      .sort();
    expect(withBand).toEqual(["pickup", "pickup-analysis", "pickup-review", "saga"]);
  });
});

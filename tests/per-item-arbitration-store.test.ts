import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { runChecklistItemArbitrationPath } from "../src/utils/paths.js";
import {
  FlowArbitrationStore,
  createFlowArbitrationLedger,
} from "../src/flows/runtime/flow-arbitration.js";

const SNAP = { flowId: "pickup-review", flowVersion: 1, steps: [] } as any;

describe("per-item arbitration path + store", () => {
  it("path is item-scoped and 1-based", () => {
    const p0 = runChecklistItemArbitrationPath("/proj", "run1", 0);
    const p1 = runChecklistItemArbitrationPath("/proj", "run1", 1);
    // Absolute fs path - native separators on Windows, so tolerate both.
    expect(p0).toMatch(/flows[\\/]checklist[\\/]item-1-arbitration\.json$/);
    expect(p1).toMatch(/flows[\\/]checklist[\\/]item-2-arbitration\.json$/);
    expect(p0).not.toEqual(p1);
  });

  it("store writes/reads at an explicit per-item path, isolated from the run path", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "vbs-arb-"));
    const itemPath = runChecklistItemArbitrationPath(root, "run1", 0);
    const store = new FlowArbitrationStore(root, "run1", itemPath);
    expect(store.filePath).toBe(itemPath);
    const runStore = new FlowArbitrationStore(root, "run1");
    expect(runStore.filePath).not.toBe(itemPath);

    const ledger = createFlowArbitrationLedger({ runId: "run1", snapshot: SNAP });
    await store.write(ledger);
    const back = await store.read();
    expect(back?.runId).toBe("run1");
    expect(await runStore.read()).toBeNull(); // run-level path untouched
  });
});

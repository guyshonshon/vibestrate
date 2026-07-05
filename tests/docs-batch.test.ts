import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { runDocsBatch, type DocsBatchLauncher } from "../src/core/docs-batch.js";
import { RunStateStore, createInitialState } from "../src/core/state-machine.js";
import type { RunSpec } from "../src/core/run-launcher.js";

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibe-docs-batch-"));
  await fs.mkdir(path.join(dir, ".vibestrate"), { recursive: true });
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

// A launcher that records the specs it was handed and seeds each run's terminal
// state file (so the batch's read-back aggregation has something to read),
// without spawning any process.
function recordingLauncher(opts?: {
  status?: "merge_ready" | "blocked" | "failed";
  exitCode?: number;
}): { launch: DocsBatchLauncher; specs: RunSpec[] } {
  const specs: RunSpec[] = [];
  const launch: DocsBatchLauncher = async (spec) => {
    specs.push(spec);
    const store = new RunStateStore(spec.projectRoot, spec.runId!);
    const state = createInitialState({
      runId: spec.runId!,
      task: spec.task,
      projectRoot: spec.projectRoot,
      worktreePath: null,
      branchName: `vibe/${spec.runId}`,
      maxReviewLoops: 2,
    });
    await store.write({ ...state, status: opts?.status ?? "merge_ready" });
    return opts?.exitCode ?? 0;
  };
  return { launch, specs };
}

describe("runDocsBatch", () => {
  it("runs one isolated `docs` run per item and aggregates status + branch", async () => {
    const { launch, specs } = recordingLauncher();
    const out = await runDocsBatch({
      projectRoot: dir,
      items: [
        { task: "Fix seat page", targetPath: "docs/content/concepts/seat.md" },
        { task: "Fix crew page", targetPath: "docs/content/concepts/crew.md" },
      ],
      launch,
    });

    expect(out).toHaveLength(2);
    // Every run used the docs flow, with selection/spec-up suppressed so a
    // plan-worthy brief can't be diverted to a read-only spec-up run.
    for (const s of specs) {
      expect(s.flow?.id).toBe("docs");
      expect(s.select).toBe(false);
    }
    // Status + branch read back from each run's state file.
    expect(out.map((o) => o.status)).toEqual(["merge_ready", "merge_ready"]);
    expect(out.every((o) => o.branchName === `vibe/${o.runId}`)).toBe(true);
    expect(out.map((o) => o.targetPath)).toEqual([
      "docs/content/concepts/seat.md",
      "docs/content/concepts/crew.md",
    ]);
  });

  it("mints a UNIQUE run id per item (no collisions in a tight batch)", async () => {
    const { launch, specs } = recordingLauncher();
    await runDocsBatch({
      projectRoot: dir,
      items: Array.from({ length: 12 }, (_, i) => ({ task: `doc ${i}` })),
      launch,
      concurrency: 6,
    });
    const ids = specs.map((s) => s.runId);
    expect(new Set(ids).size).toBe(12);
  });

  it("rejects two items targeting the same file (overlap guard, fail fast)", async () => {
    const { launch } = recordingLauncher();
    await expect(
      runDocsBatch({
        projectRoot: dir,
        items: [
          { task: "edit A", targetPath: "docs/content/x.md" },
          { task: "edit A again", targetPath: "./docs/content/x.md" },
        ],
        launch,
      }),
    ).rejects.toThrow(/same path/i);
  });

  it("rejects an empty batch", async () => {
    await expect(
      runDocsBatch({ projectRoot: dir, items: [] }),
    ).rejects.toThrow(/no documents/i);
  });

  it("never exceeds the concurrency cap", async () => {
    let inFlight = 0;
    let peak = 0;
    const gated: DocsBatchLauncher = async (spec) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      // Seed a minimal state so aggregation reads cleanly.
      const store = new RunStateStore(spec.projectRoot, spec.runId!);
      await store.write({
        ...createInitialState({
          runId: spec.runId!,
          task: spec.task,
          projectRoot: spec.projectRoot,
          worktreePath: null,
          branchName: null,
          maxReviewLoops: 2,
        }),
        status: "merge_ready",
      });
      return 0;
    };
    await runDocsBatch({
      projectRoot: dir,
      items: Array.from({ length: 10 }, (_, i) => ({ task: `doc ${i}` })),
      launch: gated,
      concurrency: 3,
    });
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1); // actually ran in parallel
  });

  it("stops starting new runs once aborted", async () => {
    const ac = new AbortController();
    let started = 0;
    const launch: DocsBatchLauncher = async (spec) => {
      started += 1;
      if (started === 1) ac.abort(); // abort right after the first starts
      const store = new RunStateStore(spec.projectRoot, spec.runId!);
      await store.write({
        ...createInitialState({
          runId: spec.runId!,
          task: spec.task,
          projectRoot: spec.projectRoot,
          worktreePath: null,
          branchName: null,
          maxReviewLoops: 2,
        }),
        status: "merge_ready",
      });
      return 0;
    };
    await runDocsBatch({
      projectRoot: dir,
      items: Array.from({ length: 8 }, (_, i) => ({ task: `doc ${i}` })),
      launch,
      concurrency: 1,
      signal: ac.signal,
    });
    // With concurrency 1 and abort after the first, the worker must not start
    // all 8 - it bails once the signal is set.
    expect(started).toBeLessThan(8);
  });

  it("continues past a failing item and records its error, others still succeed", async () => {
    const launch: DocsBatchLauncher = async (spec) => {
      if (spec.task.includes("boom")) throw new Error("launch failed");
      const store = new RunStateStore(spec.projectRoot, spec.runId!);
      await store.write({
        ...createInitialState({
          runId: spec.runId!,
          task: spec.task,
          projectRoot: spec.projectRoot,
          worktreePath: null,
          branchName: null,
          maxReviewLoops: 2,
        }),
        status: "merge_ready",
      });
      return 0;
    };
    const out = await runDocsBatch({
      projectRoot: dir,
      items: [{ task: "ok one" }, { task: "boom" }, { task: "ok two" }],
      launch,
      concurrency: 3,
    });
    expect(out).toHaveLength(3);
    const boom = out.find((o) => o.task === "boom")!;
    expect(boom.error).toMatch(/launch failed/);
    expect(boom.status).toBe("unknown");
    const ok = out.filter((o) => o.task !== "boom");
    expect(ok.every((o) => o.status === "merge_ready" && o.error === null)).toBe(
      true,
    );
  });
});

import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {
  drainGuidance,
  drainGuidanceFor,
  queueGuidance,
  MAX_PENDING,
} from "../src/core/run/guidance-service.js";
import { RunStateStore, createInitialState } from "../src/core/state-machine.js";

const g = (note: string, stepId: string | null = null) => ({
  note,
  at: "2026-08-22T00:00:00.000Z",
  stepId,
});

describe("drainGuidanceFor - which queued notes land on this step", () => {
  it("gives an unaimed note to whatever step runs next", () => {
    const { text, remaining } = drainGuidanceFor([g("use integer cents")], "implement");
    expect(text).toBe("use integer cents");
    expect(remaining).toEqual([]);
  });

  it("holds a step-aimed note until that step runs", () => {
    const q = [g("be stricter", "review-authz")];
    const atImplement = drainGuidanceFor(q, "implement");
    expect(atImplement.text).toBeNull();
    // still queued, so the later step still gets it
    expect(drainGuidanceFor(atImplement.remaining, "review-authz").text).toBe("be stricter");
  });

  it("joins several notes for the same step in the order they were queued", () => {
    const { text } = drainGuidanceFor([g("first"), g("second")], "fix");
    expect(text).toBe("first\n\nsecond");
  });

  it("drains only what applies and leaves the rest queued", () => {
    const q = [g("anyone"), g("only fix", "fix"), g("only verify", "verify")];
    const { text, remaining } = drainGuidanceFor(q, "fix");
    expect(text).toBe("anyone\n\nonly fix");
    expect(remaining.map((r) => r.note)).toEqual(["only verify"]);
  });

  it("is a no-op on an empty queue, so an unguided step is byte-identical", () => {
    expect(drainGuidanceFor([], "plan")).toEqual({ text: null, remaining: [] });
  });
});

/**
 * The pure splitter above is fixture-fed on both sides, so it stayed green
 * while the feature was dead. These exercise the real store, which is where
 * both live defects were.
 */
describe("a queued note survives the orchestrator's whole-object write", () => {
  it("is not clobbered by a write built before it arrived", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-guidance-store-"));
    const store = new RunStateStore(dir, "run-1");
    const initial = createInitialState({
      runId: "run-1",
      task: "t",
      projectRoot: dir,
      worktreePath: null,
      branchName: null,
      maxReviewLoops: 1,
    });
    await store.write(initial);

    // The orchestrator holds `state` across a whole provider turn. This is that
    // stale snapshot: taken before anything was queued.
    const stale = await store.read();

    await queueGuidance(store, "use the existing helper");
    expect((await store.read()).pendingGuidance).toHaveLength(1);

    // ...and this is the post-turn write from that snapshot. It used to put the
    // empty array back and the note was gone with no signal.
    await store.write({ ...stale, updatedAt: new Date(0).toISOString() });

    expect(
      (await store.read()).pendingGuidance,
      "a note queued mid-turn was silently dropped by the post-turn write",
    ).toHaveLength(1);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("does not resurrect a note the run already drained", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-guidance-drain-"));
    const store = new RunStateStore(dir, "run-2");
    await store.write(
      createInitialState({
      runId: "run-2",
      task: "t",
      projectRoot: dir,
      worktreePath: null,
      branchName: null,
      maxReviewLoops: 1,
    }),
    );
    await queueGuidance(store, "aimed at review", { stepId: "review" });

    const stale = await store.read(); // still carries the note
    expect(await drainGuidance(store, "review")).toContain("aimed at review");

    // A later write from the pre-drain snapshot must not bring it back, or the
    // note would be injected into every subsequent step forever.
    await store.write({ ...stale, updatedAt: new Date(0).toISOString() });
    expect(
      (await store.read()).pendingGuidance,
      "a drained note came back and would be re-injected",
    ).toHaveLength(0);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("refuses a note once the queue is full, rather than growing without bound", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-guidance-cap-"));
    const store = new RunStateStore(dir, "run-3");
    await store.write(
      createInitialState({
      runId: "run-3",
      task: "t",
      projectRoot: dir,
      worktreePath: null,
      branchName: null,
      maxReviewLoops: 1,
    }),
    );
    for (let i = 0; i < MAX_PENDING; i += 1) await queueGuidance(store, `note ${i}`);
    await expect(queueGuidance(store, "one too many")).rejects.toThrow(/already waiting/);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("keeps the raw note at rest and redacts only on the way to the prompt", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-guidance-redact-"));
    const store = new RunStateStore(dir, "run-4");
    await store.write(
      createInitialState({
      runId: "run-4",
      task: "t",
      projectRoot: dir,
      worktreePath: null,
      branchName: null,
      maxReviewLoops: 1,
    }),
    );
    // Assembled at runtime rather than written out: a literal of this shape is
    // a fabricated key, but it still trips secret scanners and push protection,
    // and a test fixture is not worth an allowlisted "secret" in the repo.
    const fake = ["sk", "live", `51H${"x".repeat(24)}Q`].join("_");
    await queueGuidance(store, `rotate ${fake} before shipping`);
    // Redacting at rest would be irreversible, and the matcher fires on plain
    // English - "the pass: throughRate metric" reads as a secret assignment.
    expect((await store.read()).pendingGuidance?.[0]?.note).toContain(fake);
    const drained = await drainGuidance(store, "implement");
    expect(drained).not.toContain(fake);
    expect(drained).toContain("[REDACTED");
    await fs.rm(dir, { recursive: true, force: true });
  });
});

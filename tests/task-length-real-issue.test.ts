import { describe, it, expect } from "vitest";
import { taskTextSchema } from "../src/core/run/task-text.js";
import { runSpecSchema } from "../src/core/run/run-launcher.js";
import { resolvedFlowSnapshotSchema } from "../src/flows/schemas/flow-schema.js";

/**
 * A full-length GitHub issue is a valid task.
 *
 * The SWE-bench Verified head-to-head (2026-08-27) had two of six real issues
 * refused at the old 2,000-char cap before any agent ran - a first-contact
 * failure on ordinary input. The bound is now GitHub's own issue-body limit
 * (65,536), funneled through ONE schema so the six entry points that each
 * carried their own literal cannot drift apart again.
 */
describe("task text accepts a real GitHub issue", () => {
  const realIssueSized = "x".repeat(2_400); // the size that was refused
  const githubMax = "x".repeat(65_536);

  it("accepts the sizes that were refused, up to GitHub's issue cap", () => {
    expect(taskTextSchema.safeParse(realIssueSized).success).toBe(true);
    expect(taskTextSchema.safeParse(githubMax).success).toBe(true);
  });

  it("still fails fast on absurd input and on empty", () => {
    expect(taskTextSchema.safeParse("x".repeat(65_537)).success).toBe(false);
    expect(taskTextSchema.safeParse("").success).toBe(false);
  });

  it("the launcher spec routes through the funnel", () => {
    const r = runSpecSchema.safeParse({ projectRoot: "/p", task: realIssueSized });
    expect(r.success).toBe(true);
  });

  it("the persisted flow snapshot routes through the funnel", () => {
    // Only the task field is under test; a full snapshot fixture would couple
    // this to unrelated schema churn, so assert on the field's own bound via
    // a partial parse of the shape.
    const shape = resolvedFlowSnapshotSchema.shape.task;
    expect(shape.safeParse(realIssueSized).success).toBe(true);
  });
});

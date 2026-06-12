import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { defaultDisplayName } from "../src/utils/slug.js";
import {
  createInitialState,
  renameRun,
  RunStateStore,
} from "../src/core/state-machine.js";

describe("defaultDisplayName (T6)", () => {
  it("sentence-cases the first ~6 words", () => {
    expect(defaultDisplayName("fix the login redirect bug")).toBe(
      "Fix the login redirect bug",
    );
  });
  it("truncates with ... past 6 words", () => {
    expect(
      defaultDisplayName("add a parameterized make-website flow with a form and preview"),
    ).toBe("Add a parameterized make-website flow with...");
  });
  it("collapses whitespace and handles empty input", () => {
    expect(defaultDisplayName("  hello   world  ")).toBe("Hello world");
    expect(defaultDisplayName("   ")).toBe("Untitled run");
  });
});

describe("createInitialState seeds a display name", () => {
  it("derives the display name from the task", () => {
    const s = createInitialState({
      runId: "r1",
      task: "refactor the orchestrator state machine into modules",
      projectRoot: "/p",
      worktreePath: null,
      branchName: null,
      maxReviewLoops: 2,
    });
    expect(s.displayName).toBe("Refactor the orchestrator state machine into...");
  });
});

describe("renameRun (T6)", () => {
  let root: string;
  const runId = "20260612-120000-demo";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-rename-"));
    const store = new RunStateStore(root, runId);
    await fs.mkdir(path.dirname(store.filePath), { recursive: true });
    await store.write(
      createInitialState({
        runId,
        task: "do a thing",
        projectRoot: root,
        worktreePath: null,
        branchName: null,
        maxReviewLoops: 2,
      }),
    );
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("sets a trimmed display name and persists it", async () => {
    const next = await renameRun(root, runId, "  Login fix  ");
    expect(next.displayName).toBe("Login fix");
    const reread = await new RunStateStore(root, runId).read();
    expect(reread.displayName).toBe("Login fix");
    // The runId (stable identifier) is untouched.
    expect(reread.runId).toBe(runId);
    expect(reread.task).toBe("do a thing");
  });

  it("rejects an empty name", async () => {
    await expect(renameRun(root, runId, "   ")).rejects.toThrow(/empty/i);
  });

  it("rejects an over-long name", async () => {
    await expect(renameRun(root, runId, "x".repeat(121))).rejects.toThrow(/120/);
  });

  it("throws for an unknown run", async () => {
    await expect(renameRun(root, "nope", "x")).rejects.toThrow(/not found/i);
  });
});

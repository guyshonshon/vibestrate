import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { pauseRun, resumeRun, abortRun } from "../src/shell/shell-actions.js";
import { createInitialState } from "../src/core/state-machine.js";

async function tempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "amaco-shell-act-"));
}

async function writeRun(
  root: string,
  runId: string,
  patches: Record<string, unknown>,
): Promise<void> {
  const dir = path.join(root, ".amaco", "runs", runId);
  await fs.mkdir(dir, { recursive: true });
  const initial = createInitialState({
    runId,
    task: "test",
    projectRoot: root,
    worktreePath: null,
    branchName: null,
    maxReviewLoops: 2,
  });
  await fs.writeFile(
    path.join(dir, "state.json"),
    JSON.stringify({ ...initial, ...patches }, null, 2),
  );
}

async function readState(root: string, runId: string): Promise<Record<string, unknown>> {
  const text = await fs.readFile(
    path.join(root, ".amaco", "runs", runId, "state.json"),
    "utf8",
  );
  return JSON.parse(text) as Record<string, unknown>;
}

describe("shell actions", () => {
  let root: string;
  beforeEach(async () => {
    root = await tempProject();
  });

  it("pauseRun sets pauseRequested on the state", async () => {
    await writeRun(root, "run-1", { status: "executing" });
    const r = await pauseRun(root, "run-1");
    expect(r.ok).toBe(true);
    const after = await readState(root, "run-1");
    expect(after.pauseRequested).toBe(true);
  });

  it("resumeRun clears pauseRequested on a paused run", async () => {
    await writeRun(root, "run-1", {
      status: "paused",
      pauseRequested: true,
      pausedAtStatus: "executing",
    });
    const r = await resumeRun(root, "run-1");
    expect(r.ok).toBe(true);
    const after = await readState(root, "run-1");
    expect(after.pauseRequested).toBe(false);
  });

  it("abortRun transitions a non-terminal run to aborted", async () => {
    await writeRun(root, "run-1", { status: "executing" });
    const r = await abortRun(root, "run-1");
    expect(r.ok).toBe(true);
    const after = await readState(root, "run-1");
    expect(after.status).toBe("aborted");
  });

  it("abortRun refuses to abort an already-terminal run", async () => {
    await writeRun(root, "run-1", { status: "merge_ready" });
    const r = await abortRun(root, "run-1");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/already terminal/);
  });

  it("returns an error rather than throwing when the run id is missing", async () => {
    const r = await abortRun(root, "no-such-run");
    expect(r.ok).toBe(false);
  });
});

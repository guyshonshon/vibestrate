import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {
  buildShellSnapshot,
  activeRunRows,
} from "../src/shell/shell-snapshot.js";
import { renderShell } from "../src/shell/shell-render.js";
import { createInitialState } from "../src/core/state-machine.js";

async function tempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "amaco-shell-snap-"));
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
    task: "test task",
    projectRoot: root,
    worktreePath: null,
    branchName: null,
    maxReviewLoops: 2,
  });
  const merged = { ...initial, ...patches };
  await fs.writeFile(
    path.join(dir, "state.json"),
    JSON.stringify(merged, null, 2),
  );
}

async function appendEvent(
  root: string,
  runId: string,
  ev: Record<string, unknown>,
): Promise<void> {
  const dir = path.join(root, ".amaco", "runs", runId);
  await fs.mkdir(dir, { recursive: true });
  await fs.appendFile(
    path.join(dir, "events.ndjson"),
    JSON.stringify({ timestamp: new Date().toISOString(), ...ev }) + "\n",
  );
}

describe("buildShellSnapshot", () => {
  let root: string;
  beforeEach(async () => {
    root = await tempProject();
  });

  it("returns an empty snapshot when no runs exist", async () => {
    const snap = await buildShellSnapshot(root);
    expect(snap.runs).toEqual([]);
    expect(snap.queue).toEqual([]);
    expect(snap.scheduler).toBeNull();
  });

  it("orders active runs before terminal ones", async () => {
    await writeRun(root, "run-a", { status: "merge_ready", updatedAt: "2026-05-01T00:00:00Z" });
    await writeRun(root, "run-b", { status: "executing", updatedAt: "2026-05-01T00:00:01Z" });
    const snap = await buildShellSnapshot(root);
    expect(snap.runs.map((r) => r.runId)).toEqual(["run-b", "run-a"]);
    expect(activeRunRows(snap).map((r) => r.runId)).toEqual(["run-b"]);
  });

  it("derives currentAgent/provider from the events tail", async () => {
    await writeRun(root, "run-1", { status: "executing" });
    await appendEvent(root, "run-1", {
      type: "agent.started",
      message: "x",
      data: { agentId: "executor", provider: "claude-code" },
    });
    await appendEvent(root, "run-1", {
      type: "mcp.attached",
      message: "y",
      data: { agentId: "executor", servers: [{ name: "fs" }, { name: "sec" }] },
    });
    const snap = await buildShellSnapshot(root);
    const row = snap.runs[0]!;
    expect(row.currentAgent).toBe("executor");
    expect(row.currentProvider).toBe("claude-code");
    expect(row.currentMcpServers).toEqual(["fs", "sec"]);
  });

  it("clears currentAgent when an agent.completed follows", async () => {
    await writeRun(root, "run-1", { status: "reviewing" });
    await appendEvent(root, "run-1", {
      type: "agent.started",
      message: "x",
      data: { agentId: "executor", provider: "claude-code" },
    });
    await appendEvent(root, "run-1", {
      type: "agent.completed",
      message: "done",
      data: { agentId: "executor" },
    });
    const snap = await buildShellSnapshot(root);
    expect(snap.runs[0]!.currentAgent).toBeNull();
  });

  it("surfaces effort + readOnly + pause flags from state.json", async () => {
    await writeRun(root, "run-1", {
      status: "paused",
      effort: "low",
      readOnly: true,
      pauseRequested: true,
      pausedAtStatus: "executing",
      providerOverride: "codex",
      resolvedProviderId: "codex",
    });
    const snap = await buildShellSnapshot(root);
    const row = snap.runs[0]!;
    expect(row.effort).toBe("low");
    expect(row.readOnly).toBe(true);
    expect(row.pauseRequested).toBe(true);
    expect(row.pausedAtStatus).toBe("executing");
    expect(row.providerOverride).toBe("codex");
  });
});

describe("renderShell", () => {
  it("renders a non-empty frame including the run id + status + agent", async () => {
    const root = await tempProject();
    await writeRun(root, "run-xyz", { status: "executing" });
    await appendEvent(root, "run-xyz", {
      type: "agent.started",
      message: "go",
      data: { agentId: "executor", provider: "claude-code" },
    });
    const snap = await buildShellSnapshot(root);
    const frame = renderShell({
      snapshot: snap,
      ui: { selectedIndex: 0, view: "runs", toast: null, pendingConfirm: null },
      size: { cols: 120, rows: 30 },
    });
    expect(frame).toContain("amaco shell");
    expect(frame).toContain("run-xyz");
    expect(frame).toContain("executor");
    expect(frame).toContain("claude-code");
    expect(frame).toContain("p pause");
  });

  it("renders the abort confirmation prompt when pendingConfirm is set", async () => {
    const root = await tempProject();
    await writeRun(root, "run-xyz", { status: "executing" });
    const snap = await buildShellSnapshot(root);
    const frame = renderShell({
      snapshot: snap,
      ui: {
        selectedIndex: 0,
        view: "runs",
        toast: null,
        pendingConfirm: { action: "abort", runId: "run-xyz" },
      },
      size: { cols: 120, rows: 30 },
    });
    expect(frame).toContain("confirm abort of run-xyz");
  });

  it("renders the help overlay in help mode", async () => {
    const root = await tempProject();
    const snap = await buildShellSnapshot(root);
    const frame = renderShell({
      snapshot: snap,
      ui: { selectedIndex: 0, view: "help", toast: null, pendingConfirm: null },
      size: { cols: 80, rows: 20 },
    });
    expect(frame).toContain("keybindings");
    expect(frame).toContain("Ctrl+C");
  });
});

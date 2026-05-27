import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {
  buildShellSnapshot,
  activeRunRows,
} from "../src/shell/shell-snapshot.js";
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

  it("derives currentRole/provider from the events tail", async () => {
    await writeRun(root, "run-1", { status: "executing" });
    await appendEvent(root, "run-1", {
      type: "role.started",
      message: "x",
      data: { roleId: "executor", provider: "claude-code" },
    });
    await appendEvent(root, "run-1", {
      type: "mcp.attached",
      message: "y",
      data: { roleId: "executor", servers: [{ name: "fs" }, { name: "sec" }] },
    });
    const snap = await buildShellSnapshot(root);
    const row = snap.runs[0]!;
    expect(row.currentRole).toBe("executor");
    expect(row.currentProvider).toBe("claude-code");
    expect(row.currentMcpServers).toEqual(["fs", "sec"]);
  });

  it("clears currentRole when an role.completed follows but keeps lastRole", async () => {
    await writeRun(root, "run-1", { status: "reviewing" });
    await appendEvent(root, "run-1", {
      type: "role.started",
      message: "x",
      data: { roleId: "executor", provider: "claude-code" },
    });
    await appendEvent(root, "run-1", {
      type: "role.completed",
      message: "done",
      data: { roleId: "executor" },
    });
    const snap = await buildShellSnapshot(root);
    expect(snap.runs[0]!.currentRole).toBeNull();
    // lastRole is sticky — terminal/between-agent runs still surface
    // "who was here last".
    expect(snap.runs[0]!.lastRole).toBe("executor");
  });

  it("derives `why` from policy.warning when state.error is null (blocked-by-preflight)", async () => {
    // Real-world case: the orchestrator gets blocked by a preflight
    // policy *before* any agent starts. state.error isn't stamped
    // and there are no role.failed events — but the policy.warning
    // carries the actual reason.
    await writeRun(root, "run-1", { status: "blocked", error: null });
    await appendEvent(root, "run-1", {
      type: "run.created",
      message: "Run created.",
    });
    await appendEvent(root, "run-1", {
      type: "policy.warning",
      message: "forbidMainBranchWrites: project main is dirty",
    });
    await appendEvent(root, "run-1", {
      type: "state.changed",
      message: "Run blocked by preflight policy.",
      data: { status: "blocked" },
    });
    const snap = await buildShellSnapshot(root);
    const row = snap.runs[0]!;
    expect(row.lastRole).toBeNull();
    // policy.warning has the most useful "why" — should win over
    // the generic state-change message.
    expect(row.error).toBe(
      "forbidMainBranchWrites: project main is dirty",
    );
  });

  it("a hard failure (role.failed) overrides an earlier soft reason", async () => {
    await writeRun(root, "run-1", { status: "failed", error: null });
    await appendEvent(root, "run-1", {
      type: "policy.warning",
      message: "soft warning",
    });
    await appendEvent(root, "run-1", {
      type: "role.started",
      message: "x",
      data: { roleId: "executor", provider: "claude-code" },
    });
    await appendEvent(root, "run-1", {
      type: "role.failed",
      message: "executor returned non-zero",
      data: { roleId: "executor" },
    });
    const snap = await buildShellSnapshot(root);
    expect(snap.runs[0]!.error).toBe("executor returned non-zero");
  });

  it("surfaces failure context on terminal runs (error + lastRole + decisions)", async () => {
    await writeRun(root, "run-1", {
      status: "failed",
      error: "validate step exited 1",
      finalDecision: "BLOCKED",
      verification: null,
    });
    await appendEvent(root, "run-1", {
      type: "role.started",
      message: "x",
      data: { roleId: "verifier", provider: "claude-code" },
    });
    await appendEvent(root, "run-1", {
      type: "role.failed",
      message: "verifier returned non-zero",
      data: { roleId: "verifier" },
    });
    const snap = await buildShellSnapshot(root);
    const row = snap.runs[0]!;
    expect(row.lastRole).toBe("verifier");
    expect(row.error).toBe("validate step exited 1");
    expect(row.finalDecision).toBe("BLOCKED");
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

  it("surfaces the current Guide step from state.json", async () => {
    await writeRun(root, "run-guide", {
      status: "reviewing",
      guide: {
        guideId: "quality-arbitration",
        guideVersion: 1,
        label: "Quality Arbitration",
        snapshotPath: "guide.json",
        currentStepId: "second-review",
        steps: [
          {
            id: "plan",
            label: "Plan",
            kind: "agent-turn",
            status: "passed",
          },
          {
            id: "second-review",
            label: "Second Review",
            kind: "review-turn",
            status: "running",
          },
        ],
      },
    });
    const snap = await buildShellSnapshot(root);
    expect(snap.runs[0]!.guide).toMatchObject({
      label: "Quality Arbitration",
      currentStepLabel: "Second Review",
      currentStepStatus: "running",
      completedSteps: 1,
      totalSteps: 2,
    });
  });
});

// Render-side coverage moved to component tests under `tests/shell-ui-state`
// + `tests/shell-palette`. The ink view layer renders into a real terminal
// stream and isn't string-comparable like the old hand-rolled renderer.

describe("aggregates and recentActivity", () => {
  let root: string;
  beforeEach(async () => {
    root = await tempProject();
  });

  it("counts pending approvals and suggestions per run", async () => {
    await writeRun(root, "run-1", { status: "executing" });
    await fs.writeFile(
      path.join(root, ".amaco", "runs", "run-1", "approvals.json"),
      JSON.stringify({
        approvals: [{ status: "pending" }, { status: "approved" }, { status: "pending" }],
      }),
    );
    await fs.writeFile(
      path.join(root, ".amaco", "runs", "run-1", "suggestions.json"),
      JSON.stringify({
        suggestions: [
          { status: "pending" },
          { status: "applied" },
        ],
      }),
    );
    const snap = await buildShellSnapshot(root);
    expect(snap.runs[0]!.pendingApprovals).toBe(2);
    expect(snap.runs[0]!.pendingSuggestions).toBe(1);
    expect(snap.aggregates.pendingApprovalsTotal).toBe(2);
    expect(snap.aggregates.pendingSuggestionsTotal).toBe(1);
  });

  it("recentActivity is sorted newest first across runs", async () => {
    await writeRun(root, "run-a", { status: "executing" });
    await writeRun(root, "run-b", { status: "executing" });
    await fs.appendFile(
      path.join(root, ".amaco", "runs", "run-a", "events.ndjson"),
      JSON.stringify({
        timestamp: "2026-05-16T10:00:00Z",
        type: "role.started",
        message: "x",
      }) + "\n",
    );
    await fs.appendFile(
      path.join(root, ".amaco", "runs", "run-b", "events.ndjson"),
      JSON.stringify({
        timestamp: "2026-05-16T11:00:00Z",
        type: "role.started",
        message: "y",
      }) + "\n",
    );
    const snap = await buildShellSnapshot(root);
    expect(snap.recentActivity[0]?.runId).toBe("run-b");
    expect(snap.recentActivity[1]?.runId).toBe("run-a");
  });
});

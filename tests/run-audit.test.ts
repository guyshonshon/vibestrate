import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { deriveRunAudit, buildRunAudit } from "../src/core/run-audit.js";
import type { VibestrateEvent } from "../src/core/event-log.js";
import { runStateSchema } from "../src/core/state-machine.js";
import { runtimeMetricsSchema } from "../src/core/runtime-metrics.js";
import { ensureDir } from "../src/utils/fs.js";
import { runDir, runStatePath, runEventsPath } from "../src/utils/paths.js";
import { writeJson } from "../src/utils/json.js";
import { MetricsStore } from "../src/core/metrics-store.js";

const ts = "2026-06-06T00:00:00.000Z";

function ev(type: string, data: Record<string, unknown>, message = ""): VibestrateEvent {
  return { timestamp: ts, type: type as VibestrateEvent["type"], message, data };
}

function stateWith(steps: { id: string; kind: string; status: string; needs?: string[] }[]) {
  return runStateSchema.parse({
    runId: "r1",
    task: "do the thing",
    status: "merge_ready",
    projectRoot: "/x",
    worktreePath: null,
    branchName: null,
    startedAt: ts,
    updatedAt: ts,
    flow: {
      flowId: "panel-review",
      flowVersion: 1,
      label: "Late review panel",
      snapshotPath: "snapshot.json",
      steps: steps.map((s) => ({
        id: s.id,
        label: s.id,
        kind: s.kind,
        status: s.status,
        seat: "reviewer",
        needs: s.needs ?? [],
      })),
    },
  });
}

function role(stageId: string, over: Partial<{ providerId: string; model: string; totalCostUsd: number; durationMs: number; toolCallCount: number }> = {}) {
  return {
    roleId: stageId,
    stageId,
    providerId: over.providerId ?? "claude",
    providerType: "cli",
    command: "claude",
    args: [],
    cwd: "/x",
    startedAt: ts,
    endedAt: ts,
    durationMs: over.durationMs ?? 1000,
    exitCode: 0,
    model: over.model ?? "sonnet",
    totalCostUsd: over.totalCostUsd ?? 0.01,
    toolCallCount: over.toolCallCount ?? null,
  };
}

describe("deriveRunAudit", () => {
  it("builds steps from state + metrics with the attempt chain", () => {
    const state = stateWith([
      { id: "plan", kind: "agent-turn", status: "passed" },
      { id: "architecture", kind: "agent-turn", status: "passed", needs: ["plan"] },
    ]);
    const metrics = runtimeMetricsSchema.parse({
      runId: "r1",
      task: "t",
      startedAt: ts,
      updatedAt: ts,
      totalCostUsd: 0.05,
      roles: [role("plan"), role("architecture", { model: "haiku", totalCostUsd: 0.02 })],
    });
    const events: VibestrateEvent[] = [
      ev("flow.step.started", { stepId: "plan" }),
      ev("flow.step.completed", { stepId: "plan" }),
      ev("flow.step.started", { stepId: "architecture" }),
      ev("flow.step.retried", { stepId: "architecture", attempt: 1, class: "rate-limit" }),
      ev("flow.step.retried", { stepId: "architecture", attempt: 2, class: "rate-limit" }),
      ev("provider.fallback", { stepId: "architecture", ok: true, fallbackProfile: "cheap" }),
      ev("flow.step.completed", { stepId: "architecture" }),
    ];

    const a = deriveRunAudit({ runId: "r1", state, metrics, events, assuranceVerdict: "partially_verified" });

    expect(a.flow?.id).toBe("panel-review");
    expect(a.assuranceVerdict).toBe("partially_verified");
    expect(a.steps).toHaveLength(2);

    const arch = a.steps.find((s) => s.id === "architecture")!;
    expect(arch.needs).toEqual(["plan"]);
    expect(arch.model).toBe("haiku");
    expect(arch.retries).toBe(2);
    expect(arch.fellBack).toBe(true);
    expect(arch.attempts.map((x) => x.outcome)).toEqual([
      "rate-limit",
      "rate-limit",
      "fallback",
      "success",
    ]);

    expect(a.totals.turns).toBe(2);
    expect(a.totals.retries).toBe(2);
    expect(a.totals.fallbacks).toBe(1);
    expect(a.totals.costUsd).toBeCloseTo(0.03, 5); // plan 0.01 + arch 0.02
  });

  it("marks a tolerated failure distinctly from a fatal one and captures decisions", () => {
    const state = stateWith([
      { id: "review-tests", kind: "review-turn", status: "failed" },
      { id: "arbiter", kind: "review-turn", status: "passed" },
    ]);
    const events: VibestrateEvent[] = [
      ev("flow.step.failed", { stepId: "review-tests", continued: true, error: "provider exited 1" }),
      ev("review.decision", { stepId: "arbiter", decision: "APPROVED" }),
      ev("flow.step.completed", { stepId: "arbiter" }),
      ev("budget.limit", { onLimit: "stop", kind: "daily turns" }, "Budget ceiling reached: daily turns 5/5."),
    ];
    const a = deriveRunAudit({ runId: "r1", state, metrics: null, events, assuranceVerdict: null });

    const rt = a.steps.find((s) => s.id === "review-tests")!;
    expect(rt.attempts.at(-1)?.outcome).toBe("tolerated-failure");
    expect(a.steps.find((s) => s.id === "arbiter")?.decision).toBe("APPROVED");
    expect(a.control.some((c) => c.type === "budget.limit")).toBe(true);
  });

  it("surfaces turn internals (tools + sub-agents) and marks opaque turns", () => {
    const state = stateWith([
      { id: "impl", kind: "agent-turn", status: "passed" },
      { id: "plain", kind: "agent-turn", status: "passed" },
    ]);
    const metrics = runtimeMetricsSchema.parse({
      runId: "r1",
      task: "t",
      startedAt: ts,
      updatedAt: ts,
      roles: [
        {
          ...role("impl"),
          internalsAvailable: true,
          tools: [
            { name: "Read", count: 2 },
            { name: "Edit", count: 1 },
          ],
          subAgents: [{ name: "Agent", description: "explore" }],
        },
        { ...role("plain"), internalsAvailable: false },
      ],
    });
    const a = deriveRunAudit({ runId: "r1", state, metrics, events: [], assuranceVerdict: null });

    const impl = a.steps.find((s) => s.id === "impl")!;
    expect(impl.tools).toEqual([
      { name: "Read", count: 2 },
      { name: "Edit", count: 1 },
    ]);
    expect(impl.subAgents).toEqual([{ name: "Agent", description: "explore" }]);
    expect(impl.internalsOpaque).toBe(false);

    // A turn that streamed nothing structured is honestly opaque.
    expect(a.steps.find((s) => s.id === "plain")?.internalsOpaque).toBe(true);
  });

  it("carries the flow phase, crew role, profile, and token rollup per step + the engagement list", () => {
    const state = runStateSchema.parse({
      runId: "r1",
      task: "t",
      status: "merge_ready",
      projectRoot: "/x",
      worktreePath: null,
      branchName: null,
      startedAt: ts,
      updatedAt: ts,
      flow: {
        flowId: "default",
        flowVersion: 1,
        label: "Default",
        snapshotPath: "s.json",
        steps: [
          {
            id: "impl",
            label: "implement",
            kind: "agent-turn",
            status: "passed",
            seat: "executor",
            stage: "executing",
            resolvedRoleId: "fixer",
            resolvedRoleLabel: "Fixer",
            profileId: "opus-xhigh",
            needs: [],
          },
        ],
      },
    });
    const metrics = runtimeMetricsSchema.parse({
      runId: "r1",
      task: "t",
      startedAt: ts,
      updatedAt: ts,
      roles: [{ ...role("impl"), tokenUsage: { input: 8100, output: 1200 } }],
    });
    const events: VibestrateEvent[] = [
      ev("workflow.selected", { flowId: "default", confidence: "high" }),
      ev("review.decision", { stepId: "impl", decision: "APPROVED" }),
    ];

    const a = deriveRunAudit({ runId: "r1", state, metrics, events, assuranceVerdict: "verified" });
    const impl = a.steps.find((s) => s.id === "impl")!;
    expect(impl.stage).toBe("executing");
    expect(impl.roleLabel).toBe("Fixer");
    expect(impl.profileId).toBe("opus-xhigh");
    expect(impl.tokensIn).toBe(8100);
    expect(impl.tokensOut).toBe(1200);

    expect(a.engagement.map((e) => e.type)).toEqual(["workflow.selected", "review.decision"]);
    expect(a.engagement[0]!.anchor).toBe("root");
    expect(a.engagement[1]!.stepId).toBe("impl");
  });

  it("falls back to event-derived steps when there is no flow state", () => {
    const events: VibestrateEvent[] = [
      ev("flow.step.started", { stepId: "solo" }),
      ev("flow.step.completed", { stepId: "solo" }),
    ];
    const a = deriveRunAudit({ runId: "r1", state: null, metrics: null, events, assuranceVerdict: null });
    expect(a.steps.map((s) => s.id)).toEqual(["solo"]);
    expect(a.status).toBe("unknown");
  });
});

describe("buildRunAudit (from disk)", () => {
  it("reads state + events + metrics and derives the tree", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-audit-"));
    try {
      const runId = "run-1";
      await ensureDir(runDir(root, runId));
      await writeJson(runStatePath(root, runId), stateWith([{ id: "plan", kind: "agent-turn", status: "passed" }]));
      await fs.writeFile(
        runEventsPath(root, runId),
        [
          JSON.stringify(ev("flow.step.started", { stepId: "plan" })),
          JSON.stringify(ev("flow.step.completed", { stepId: "plan" })),
        ].join("\n") + "\n",
      );
      await new MetricsStore(root, runId).write(
        runtimeMetricsSchema.parse({ runId, task: "t", startedAt: ts, updatedAt: ts, roles: [role("plan")] }),
      );

      const a = await buildRunAudit(root, runId);
      expect(a.runId).toBe(runId);
      expect(a.steps).toHaveLength(1);
      expect(a.steps[0]!.attempts.at(-1)?.outcome).toBe("success");
      expect(a.totals.turns).toBe(1);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

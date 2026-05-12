import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import {
  buildRunReplay,
  RunReplayError,
} from "../src/core/run-replay-service.js";
import { startServer, type StartedServer } from "../src/server/server.js";

type RunFixture = { project: string; runId: string };

async function makeRunFixture(opts: {
  withEvents?: boolean;
  withApprovals?: boolean;
  withSuggestions?: boolean;
  withBundles?: boolean;
  withMetrics?: boolean;
  withNotifications?: boolean;
  withTerminalSessions?: boolean;
  withPolicyRefusal?: boolean;
  eventCount?: number;
  malformedJson?: boolean;
} = {}): Promise<RunFixture> {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), "amaco-replay-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: project });
  await execa("git", ["config", "user.email", "x@x"], { cwd: project });
  await execa("git", ["config", "user.name", "x"], { cwd: project });
  await fs.writeFile(path.join(project, "a"), "init\n");
  await execa("git", ["add", "."], { cwd: project });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: project });

  await fs.mkdir(path.join(project, ".amaco"), { recursive: true });
  await fs.writeFile(
    path.join(project, ".amaco/project.yml"),
    [
      "project: { name: replay-test, type: generic }",
      "providers:",
      "  fake: { type: cli, command: /bin/true, inputMode: stdin }",
      "agents:",
      "  reviewer: { provider: fake, prompt: reviewer, permissions: read }",
      "commands: { validate: [] }",
      "",
    ].join("\n"),
  );

  const runId = "20260512-100000-fixture";
  const runDir = path.join(project, ".amaco/runs", runId);
  await fs.mkdir(path.join(runDir, "artifacts"), { recursive: true });
  const startedAt = "2026-05-12T10:00:00.000Z";
  const finalAt = "2026-05-12T10:30:00.000Z";

  await fs.writeFile(
    path.join(runDir, "state.json"),
    JSON.stringify({
      runId,
      task: "Fixture task",
      status: "merge_ready",
      projectRoot: project,
      worktreePath: null,
      branchName: "amaco/fixture",
      reviewLoopCount: 1,
      maxReviewLoops: 2,
      startedAt,
      updatedAt: finalAt,
      finalDecision: "APPROVED",
      verification: "PASSED",
      error: null,
    }),
  );

  await fs.writeFile(
    path.join(runDir, "artifacts/02-plan.md"),
    "# Plan\n\nDo the thing.\n",
  );

  // events.ndjson — covers stage transitions + agent + validation + review
  if (opts.withEvents !== false) {
    const lines: string[] = [];
    const push = (timestamp: string, type: string, message: string, data?: unknown) => {
      lines.push(
        JSON.stringify({
          timestamp,
          type,
          message,
          ...(data ? { data } : {}),
        }),
      );
    };
    push(startedAt, "run.created", "Run created.", { task: "Fixture task" });
    push("2026-05-12T10:00:05.000Z", "state.changed", "planning", {
      from: "created",
      to: "planning",
    });
    push("2026-05-12T10:00:10.000Z", "agent.started", "planner started", {
      agentId: "planner",
      stageId: "planning",
    });
    push("2026-05-12T10:00:30.000Z", "agent.completed", "planner done", {
      agentId: "planner",
      stageId: "planning",
      outputArtifactPath: "02-plan.md",
    });
    push("2026-05-12T10:00:31.000Z", "state.changed", "planned", {
      from: "planning",
      to: "planned",
    });
    push("2026-05-12T10:01:00.000Z", "state.changed", "executing", {
      from: "planned",
      to: "executing",
    });
    push("2026-05-12T10:05:00.000Z", "state.changed", "validating", {
      from: "executing",
      to: "validating",
    });
    push("2026-05-12T10:05:01.000Z", "validation.started", "Running validation.");
    push(
      "2026-05-12T10:05:30.000Z",
      "validation.command.completed",
      "pnpm test passed",
      { exitCode: 0 },
    );
    push("2026-05-12T10:05:31.000Z", "state.changed", "reviewing", {
      from: "validating",
      to: "reviewing",
    });
    push("2026-05-12T10:06:00.000Z", "review.decision", "approved", {
      decision: "APPROVED",
    });
    push("2026-05-12T10:07:00.000Z", "state.changed", "verifying", {
      from: "reviewing",
      to: "verifying",
    });
    push("2026-05-12T10:08:00.000Z", "verification.decision", "passed", {
      decision: "PASSED",
    });
    push("2026-05-12T10:10:00.000Z", "state.changed", "merge_ready", {
      from: "verifying",
      to: "merge_ready",
    });

    if (opts.withPolicyRefusal) {
      push(
        "2026-05-12T10:09:00.000Z",
        "suggestion.apply_failed",
        "Use the logger. (policy rule: no-console-log)",
        {
          id: "sug-1",
          errorMessage: "Use the logger. (policy rule: no-console-log)",
        },
      );
    }

    if (opts.malformedJson) {
      lines.push("this is not json");
    }

    await fs.writeFile(
      path.join(runDir, "events.ndjson"),
      lines.join("\n") + "\n",
    );
  }

  if (opts.withApprovals) {
    await fs.writeFile(
      path.join(runDir, "approvals.json"),
      JSON.stringify([
        {
          id: "appr-1",
          runId,
          stageId: "reviewing",
          agentId: "reviewer",
          createdAt: "2026-05-12T10:05:31.000Z",
          updatedAt: "2026-05-12T10:06:00.000Z",
          status: "approved",
          reason: "looks good",
          prompt: null,
          sourceArtifactPath: null,
          requestedAction: null,
          riskLevel: "low",
          source: "agent",
          alsoRequiredByPolicy: false,
          userMessage: null,
          resolvedAt: "2026-05-12T10:06:00.000Z",
          resolvedBy: "local-user",
          decisionNote: "ok",
        },
      ]),
    );
  }

  if (opts.withSuggestions) {
    await fs.writeFile(
      path.join(runDir, "suggestions.json"),
      JSON.stringify({
        suggestions: [
          {
            id: "sug-1",
            runId,
            createdAt: "2026-05-12T10:06:30.000Z",
            updatedAt: "2026-05-12T10:06:30.000Z",
            source: "reviewer",
            sourceArtifactPath: null,
            file: "src/x.ts",
            lineStart: null,
            lineEnd: null,
            title: "Rename foo",
            body: "",
            status: "open",
            proposedPatch: null,
            requiresApproval: true,
            approvalId: null,
            decisionNote: null,
            errorMessage: null,
            bundleId: null,
            appliedPatchPath: null,
            reversePatchPath: null,
            validationResultPath: null,
            validationProfile: null,
          },
        ],
      }),
    );
  }

  if (opts.withBundles) {
    await fs.writeFile(
      path.join(runDir, "suggestion-bundles.json"),
      JSON.stringify({
        bundles: [
          {
            id: "bun-1",
            runId,
            createdAt: "2026-05-12T10:07:30.000Z",
            updatedAt: "2026-05-12T10:07:30.000Z",
            title: "Review pass A",
            status: "open",
            suggestionIds: ["sug-1"],
            validationProfile: "default",
            errorMessage: null,
          },
        ],
      }),
    );
  }

  if (opts.withMetrics) {
    await fs.writeFile(
      path.join(runDir, "runtime-metrics.json"),
      JSON.stringify({
        runId,
        task: "Fixture task",
        startedAt,
        updatedAt: finalAt,
        finalStatus: "merge_ready",
        totalDurationMs: 1_800_000,
        totalProviderCalls: 4,
        totalCostUsd: 0.42,
        reviewLoopCount: 1,
        filesChanged: 3,
        diffInsertions: 12,
        diffDeletions: 4,
        agents: [
          { stageId: "planning" },
          { stageId: "executing" },
          { stageId: "reviewing" },
          { stageId: "verifying" },
        ],
      }),
    );
  }

  if (opts.withNotifications) {
    await fs.mkdir(path.join(project, ".amaco/notifications"), { recursive: true });
    await fs.writeFile(
      path.join(project, ".amaco/notifications/notifications.json"),
      JSON.stringify({
        notifications: [
          {
            id: "notif-this",
            createdAt: "2026-05-12T10:06:00.000Z",
            updatedAt: "2026-05-12T10:06:00.000Z",
            severity: "info",
            category: "approval",
            title: "Approval resolved",
            message: "",
            runId,
            taskId: null,
            roadmapItemId: null,
            approvalId: "appr-1",
            eventId: null,
            sourceEventType: null,
            actionRequired: false,
            actionLabel: null,
            actionUrl: null,
            readAt: null,
            resolvedAt: null,
            metadata: {},
          },
          {
            id: "notif-other-run",
            createdAt: "2026-05-12T10:00:00.000Z",
            updatedAt: "2026-05-12T10:00:00.000Z",
            severity: "info",
            category: "info",
            title: "Other run notification",
            message: "",
            runId: "some-other-run",
            taskId: null,
            roadmapItemId: null,
            approvalId: null,
            eventId: null,
            sourceEventType: null,
            actionRequired: false,
            actionLabel: null,
            actionUrl: null,
            readAt: null,
            resolvedAt: null,
            metadata: {},
          },
        ],
      }),
    );
  }

  if (opts.withTerminalSessions) {
    await fs.mkdir(path.join(project, ".amaco/terminal"), { recursive: true });
    await fs.writeFile(
      path.join(project, ".amaco/terminal/sessions.json"),
      JSON.stringify({
        sessions: [
          {
            id: "tm-this",
            runId,
            cwd: "/tmp/wt",
            cols: 80,
            rows: 24,
            shell: "/bin/zsh",
            createdAt: "2026-05-12T10:09:00.000Z",
            closedAt: "2026-05-12T10:09:30.000Z",
            exitCode: 0,
          },
          {
            id: "tm-other",
            runId: "some-other-run",
            cwd: "/tmp/wt-other",
            cols: 80,
            rows: 24,
            shell: "/bin/zsh",
            createdAt: "2026-05-12T10:00:00.000Z",
            closedAt: null,
            exitCode: null,
          },
        ],
      }),
    );
  }

  return { project, runId };
}

describe("buildRunReplay — service", () => {
  it("rejects an unknown run with 404", async () => {
    const { project } = await makeRunFixture();
    await expect(buildRunReplay(project, "no-such-run")).rejects.toBeInstanceOf(
      RunReplayError,
    );
  });

  it("returns a coherent timeline + phases from fixture events", async () => {
    const { project, runId } = await makeRunFixture({
      withEvents: true,
      withMetrics: true,
    });
    const r = await buildRunReplay(project, runId);
    expect(r.runId).toBe(runId);
    expect(r.finalStatus).toBe("merge_ready");
    expect(r.events.length).toBeGreaterThan(0);
    // First event should be run.created, last should be the final state.changed.
    expect(r.events[0]!.type).toBe("run.created");
    expect(r.events[r.events.length - 1]!.type).toBe("state.changed");
    // Snapshots recorded for each state.changed.
    expect(r.snapshots.length).toBeGreaterThan(0);
    expect(r.snapshots[0]!.status).toBe("planning");
    // Metrics summarised.
    expect(r.metrics?.totalProviderCalls).toBe(4);
    expect(r.metrics?.agentStageOrder).toEqual([
      "planning",
      "executing",
      "reviewing",
      "verifying",
    ]);
  });

  it("groups events into the expected phases", async () => {
    const { project, runId } = await makeRunFixture({
      withEvents: true,
      withApprovals: true,
    });
    const r = await buildRunReplay(project, runId);
    const phaseOf = (key: typeof r.phases[number]["key"]) =>
      r.phases.find((p) => p.key === key)!;
    // Planning phase should include the agent.started for planner.
    const plannerIdx = r.events.findIndex((e) => e.type === "agent.started");
    expect(plannerIdx).toBeGreaterThanOrEqual(0);
    expect(phaseOf("planning").eventIndices).toContain(plannerIdx);
    // validation.command.completed lands under "validating".
    const valIdx = r.events.findIndex(
      (e) => e.type === "validation.command.completed",
    );
    expect(phaseOf("validating").eventIndices).toContain(valIdx);
    // review.decision lands under "reviewing".
    const reviewIdx = r.events.findIndex((e) => e.type === "review.decision");
    expect(phaseOf("reviewing").eventIndices).toContain(reviewIdx);
    // verification.decision lands under "verifying".
    const verifyIdx = r.events.findIndex((e) => e.type === "verification.decision");
    expect(phaseOf("verifying").eventIndices).toContain(verifyIdx);
  });

  it("surfaces approvals, suggestions, bundles, policy refusals, and notifications", async () => {
    const { project, runId } = await makeRunFixture({
      withEvents: true,
      withApprovals: true,
      withSuggestions: true,
      withBundles: true,
      withNotifications: true,
      withPolicyRefusal: true,
    });
    const r = await buildRunReplay(project, runId);
    expect(r.approvals.map((a) => a.id)).toEqual(["appr-1"]);
    expect(r.suggestions.map((s) => s.id)).toEqual(["sug-1"]);
    expect(r.bundles.map((b) => b.id)).toEqual(["bun-1"]);
    // Notifications must be filtered to this run only.
    expect(r.notifications.map((n) => n.id)).toEqual(["notif-this"]);
    // Policy refusal extracted from the marker in the apply_failed message.
    expect(r.policyRefusals).toHaveLength(1);
    expect(r.policyRefusals[0]!.ruleId).toBe("no-console-log");
    expect(r.policyRefusals[0]!.surface).toBe("suggestion-apply");
  });

  it("filters terminal sessions to this run and exposes metadata only", async () => {
    const { project, runId } = await makeRunFixture({
      withEvents: true,
      withTerminalSessions: true,
    });
    const r = await buildRunReplay(project, runId);
    expect(r.terminalSessions.map((s) => s.id)).toEqual(["tm-this"]);
    const sess = r.terminalSessions[0]!;
    // Metadata fields are present; no transcript/stdout/stderr fields.
    expect(sess).toHaveProperty("cwd");
    expect(sess).toHaveProperty("createdAt");
    expect(sess).toHaveProperty("closedAt");
    expect(sess).toHaveProperty("exitCode");
    expect((sess as Record<string, unknown>).stdout).toBeUndefined();
    expect((sess as Record<string, unknown>).stderr).toBeUndefined();
    expect((sess as Record<string, unknown>).transcript).toBeUndefined();
    // Synthetic timeline rows exist for open + close.
    const types = r.events.map((e) => e.type);
    expect(types).toContain("terminal.session.opened");
    expect(types).toContain("terminal.session.closed");
  });

  it("caps very large event logs at 10k and reports truncation honestly", async () => {
    const { project, runId } = await makeRunFixture({ withEvents: false });
    const lines: string[] = [];
    const baseTime = new Date("2026-05-12T10:00:00.000Z").getTime();
    for (let i = 0; i < 10_500; i++) {
      lines.push(
        JSON.stringify({
          timestamp: new Date(baseTime + i).toISOString(),
          type: i === 0 ? "run.created" : "agent.started",
          message: `event ${i}`,
        }),
      );
    }
    await fs.writeFile(
      path.join(project, ".amaco/runs", runId, "events.ndjson"),
      lines.join("\n") + "\n",
    );
    const r = await buildRunReplay(project, runId);
    expect(r.truncation.truncated).toBe(true);
    expect(r.truncation.totalEventCount).toBe(10_500);
    expect(r.truncation.keptEventCount).toBe(10_000);
    expect(r.truncation.note).toMatch(/Showing the most recent 10000/);
    // The kept window is the latest — the very first "run.created" should
    // have been dropped.
    expect(r.events[0]!.type).not.toBe("run.created");
  });

  it("tolerates malformed optional files without crashing", async () => {
    const { project, runId } = await makeRunFixture({
      withEvents: true,
      malformedJson: true,
    });
    // Drop a corrupt approvals.json + suggestions.json.
    await fs.writeFile(
      path.join(project, ".amaco/runs", runId, "approvals.json"),
      "this is { not json",
    );
    await fs.writeFile(
      path.join(project, ".amaco/runs", runId, "suggestions.json"),
      "{[",
    );
    const r = await buildRunReplay(project, runId);
    // Still got events + state.
    expect(r.events.length).toBeGreaterThan(0);
    expect(r.finalStatus).toBe("merge_ready");
    // Corrupt files surfaced in missingOrMalformed.
    const files = r.missingOrMalformed.map((m) => m.file);
    expect(files.some((f) => f.endsWith("approvals.json"))).toBe(true);
    expect(files.some((f) => f.endsWith("suggestions.json"))).toBe(true);
    // Malformed events.ndjson line also surfaced.
    expect(files.some((f) => f.endsWith("events.ndjson"))).toBe(true);
  });

  it("lists artifacts from the run's artifacts/ dir", async () => {
    const { project, runId } = await makeRunFixture({ withEvents: true });
    const r = await buildRunReplay(project, runId);
    expect(r.artifacts.map((a) => a.path)).toContain("02-plan.md");
  });
});

let server: StartedServer | null = null;
afterEach(async () => {
  if (server) await server.close();
  server = null;
});

describe("GET /api/runs/:runId/replay", () => {
  beforeEach(async () => {
    // ensure no leftover server
    if (server) {
      await server.close();
      server = null;
    }
  });

  it("returns 200 with the projection", async () => {
    const { project, runId } = await makeRunFixture({
      withEvents: true,
      withApprovals: true,
    });
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    const r = await fetch(
      `${server.url}/api/runs/${encodeURIComponent(runId)}/replay`,
    );
    expect(r.status).toBe(200);
    const body = (await r.json()) as { runId: string; finalStatus: string };
    expect(body.runId).toBe(runId);
    expect(body.finalStatus).toBe("merge_ready");
  });

  it("rejects path traversal in runId (400)", async () => {
    const { project } = await makeRunFixture();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    const r = await fetch(`${server.url}/api/runs/..%2Fescape/replay`);
    expect(r.status).toBe(400);
  });

  it("returns 404 for an unknown runId", async () => {
    const { project } = await makeRunFixture();
    server = await startServer({ projectRoot: project, port: 0, host: "127.0.0.1" });
    const r = await fetch(`${server.url}/api/runs/00000000-missing/replay`);
    expect(r.status).toBe(404);
  });
});

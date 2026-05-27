import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { ApprovalService } from "../../src/core/approval-service.js";
import { Orchestrator } from "../../src/core/orchestrator.js";
import { guideDefinitionSchema } from "../../src/guides/schemas/guide-schema.js";
import { resolveGuide } from "../../src/guides/runtime/guide-resolver.js";
import { suggestGuides } from "../../src/guides/runtime/guide-suggestion.js";
import { loadConfig } from "../../src/project/config-loader.js";
import { setConfigValue } from "../../src/setup/config-update-service.js";
import { applySetup } from "../../src/setup/setup-service.js";
import type { ProviderDetectionRunner } from "../../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

const releaseChecklistGuide = guideDefinitionSchema.parse({
  id: "release-checklist",
  version: 1,
  label: "Release Checklist",
  description: "A non-arbitration Guide with an explicit handoff gate.",
  slots: {
    builder: { label: "Builder", defaultRole: "executor" },
    reviewer: { label: "Reviewer", defaultRole: "reviewer" },
    arbiter: { label: "Arbiter", defaultRole: "verifier" },
  },
  steps: [
    {
      id: "plan",
      label: "Plan",
      kind: "agent-turn",
      slot: "builder",
      roleId: "planner",
      inputs: ["task-brief"],
      outputs: ["plan"],
    },
    {
      id: "human-check",
      label: "Human Check",
      kind: "approval-gate",
      inputs: ["plan"],
      outputs: [],
      approval: {
        reason: "Release work needs an explicit handoff before writes.",
        requestedAction: "Approve continuing into implementation.",
        riskLevel: "medium",
      },
    },
    {
      id: "implement",
      label: "Implement",
      kind: "agent-turn",
      slot: "builder",
      roleId: "executor",
      inputs: ["task-brief", "plan"],
      outputs: ["execution"],
    },
    {
      id: "review",
      label: "Review",
      kind: "review-turn",
      slot: "reviewer",
      inputs: ["execution"],
      outputs: ["review-decision"],
      repeat: { times: 2 },
    },
    {
      id: "summary",
      label: "Summary",
      kind: "summary-turn",
      slot: "arbiter",
      inputs: ["execution", "review-decision"],
      outputs: ["decision-summary"],
    },
  ],
});

async function makeGuideRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "amaco-guides-phase5-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"phase5-guide"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });

  const providerPath = path.join(dir, "fake-phase5-provider.js");
  await fs.writeFile(
    providerPath,
    `#!/usr/bin/env node
let prompt = "";
process.stdin.on("data", (chunk) => prompt += chunk);
process.stdin.on("end", () => {
  if (prompt.includes("Amaco Agent: reviewer")) {
    console.log("# Review\\n\\nDECISION: APPROVED");
  } else if (prompt.includes("Amaco Agent: verifier")) {
    console.log("# Summary\\n\\nVERIFICATION: PASSED");
  } else if (prompt.includes("Amaco Agent: planner")) {
    console.log("# Plan\\n\\nPrepare a bounded handoff.");
  } else if (prompt.includes("Amaco Agent: executor")) {
    console.log("# Implementation\\n\\nNo source change required.");
  } else {
    console.log("# Unknown");
  }
});
`,
    { mode: 0o755 },
  );
  await fs.chmod(providerPath, 0o755);
  await setConfigValue(
    dir,
    "providers.fake",
    JSON.stringify({
      type: "cli",
      command: "node",
      args: [providerPath],
      input: "stdin",
    }),
  );
  for (const agent of [
    "planner",
    "architect",
    "executor",
    "fixer",
    "reviewer",
    "verifier",
  ]) {
    await setConfigValue(dir, `roles.${agent}.provider`, "fake");
  }
  return dir;
}

describe("Guide Phase 5 generalization", () => {
  it("runs a non-arbitration Guide through a typed gate and fixed repeat", async () => {
    const projectRoot = await makeGuideRepo();
    const loaded = await loadConfig(projectRoot);
    const snapshot = resolveGuide({
      guide: releaseChecklistGuide,
      source: { kind: "fixture", ref: releaseChecklistGuide.id },
      config: loaded.config,
      task: "Exercise a release checklist handoff.",
    });

    expect(snapshot.steps.map((step) => step.id)).toEqual([
      "plan",
      "human-check",
      "implement",
      "review",
      "review-repeat-2",
      "summary",
    ]);
    expect(snapshot.steps.find((step) => step.id === "review-repeat-2"))
      .toMatchObject({
        sourceStepId: "review",
        repeatIteration: 2,
        repeatCount: 2,
      });

    const orchestrator = new Orchestrator({
      projectRoot,
      config: loaded.config,
      rules: loaded.rules,
      task: snapshot.task,
      guide: snapshot,
      isGitRepo: true,
      onProgress: () => {},
    });
    let approved = false;
    const interval = setInterval(async () => {
      if (approved) return;
      const runs = await fs
        .readdir(path.join(projectRoot, ".amaco", "runs"))
        .catch(() => []);
      const runId = runs[0];
      if (!runId) return;
      const approvals = new ApprovalService(projectRoot, runId);
      const pending = await approvals.firstPending();
      if (!pending) return;
      approved = true;
      await approvals.approve({ approvalId: pending.id });
    }, 50);
    let result: Awaited<ReturnType<Orchestrator["run"]>>;
    try {
      result = await orchestrator.run();
    } finally {
      clearInterval(interval);
    }

    expect(result.state.status).toBe("merge_ready");
    expect(result.state.guide?.guideId).toBe("release-checklist");
    expect(result.state.guide?.steps.map((step) => step.status)).toEqual(
      result.state.guide?.steps.map(() => "passed"),
    );
    const approvals = await new ApprovalService(projectRoot, result.runId).list();
    expect(approvals).toMatchObject([
      {
        stageId: "human-check",
        roleId: "guide",
        source: "policy",
        status: "approved",
      },
    ]);
  });

  it("suggests arbitration from risk, touched files, and prior local outcomes", () => {
    const suggestions = suggestGuides({
      task: "Implement a sandbox policy migration for provider execution.",
      files: [
        "src/core/orchestrator.ts",
        "src/providers/provider-runner.ts",
        ".amaco/project.yml",
      ],
      riskLevel: "high",
      availableGuides: [
        { id: "quality-arbitration", label: "Quality Arbitration" },
      ],
      pastOutcomes: [
        {
          guideId: "quality-arbitration",
          status: "blocked",
          startedAt: "2026-05-21T12:00:00.000Z",
        },
      ],
    });

    expect(suggestions[0]).toMatchObject({
      guideId: "quality-arbitration",
      label: "Quality Arbitration",
    });
    expect(suggestions[0]?.reasons.join(" ")).toContain("Risk level is high");
    expect(suggestions[0]?.reasons.join(" ")).toContain("reached a decision");
  });
});

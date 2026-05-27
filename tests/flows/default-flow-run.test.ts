import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { ApprovalService } from "../../src/core/approval-service.js";
import { Orchestrator } from "../../src/core/orchestrator.js";
import { findFlowById } from "../../src/flows/catalog/flow-discovery.js";
import { resolveFlow } from "../../src/flows/runtime/flow-resolver.js";
import { loadConfig } from "../../src/project/config-loader.js";
import { setConfigValue } from "../../src/setup/config-update-service.js";
import { applySetup } from "../../src/setup/setup-service.js";
import type { ProviderDetectionRunner } from "../../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

// Fake provider for every default-flow role. The reviewer asks for changes on
// its first turn and approves after (counter file), so the review→fix loop runs
// exactly one fix before approving.
const PROVIDER = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const counter = path.join(__dirname, "review-counter.txt");
let prompt = "";
process.stdin.on("data", (chunk) => (prompt += chunk));
process.stdin.on("end", () => {
  if (prompt.includes("Amaco Agent: reviewer")) {
    let n = 0;
    try { n = parseInt(fs.readFileSync(counter, "utf8"), 10) || 0; } catch {}
    n += 1;
    fs.writeFileSync(counter, String(n));
    console.log("# Review\\n\\nDECISION: " + (n === 1 ? "CHANGES_REQUESTED" : "APPROVED"));
  } else if (prompt.includes("Amaco Agent: verifier")) {
    console.log("# Verification\\n\\nVERIFICATION: PASSED");
  } else if (prompt.includes("Amaco Agent: fixer")) {
    console.log("# Fix\\n\\nAddressed the finding.");
  } else if (prompt.includes("Amaco Agent: executor")) {
    console.log("# Implementation\\n\\nNo source change required.");
  } else if (prompt.includes("Amaco Agent: architect")) {
    console.log("# Architecture\\n\\nApproach described.");
  } else if (prompt.includes("Amaco Agent: planner")) {
    console.log("# Plan\\n\\nSteps outlined.");
  } else {
    console.log("# Output");
  }
});
`;

async function makeRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "amaco-default-flow-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"default-flow"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });

  const providerPath = path.join(dir, "fake-provider.js");
  await fs.writeFile(providerPath, PROVIDER, { mode: 0o755 });
  await fs.chmod(providerPath, 0o755);
  await setConfigValue(
    dir,
    "providers.fake",
    JSON.stringify({ type: "cli", command: "node", args: [providerPath], input: "stdin" }),
  );
  for (const role of ["planner", "architect", "executor", "fixer", "reviewer", "verifier"]) {
    await setConfigValue(dir, `roles.${role}.provider`, "fake");
  }
  return dir;
}

describe("Default flow run through the unified runner (D2 phase B-3b)", () => {
  it("discovers `default` and runs the full workflow incl. the review→fix loop", async () => {
    const projectRoot = await makeRepo();

    // The default flow is now a discoverable catalog entry (B-3b).
    const discovered = await findFlowById(projectRoot, "default");
    expect(discovered).not.toBeNull();
    expect(discovered?.source.kind).toBe("builtin");

    const loaded = await loadConfig(projectRoot);
    const snapshot = resolveFlow({
      flow: discovered!.definition,
      source: discovered!.source,
      config: loaded.config,
      task: "Exercise the default flow end to end.",
    });
    expect(snapshot.loop).toMatchObject({ from: "review", decisionStep: "review" });

    const orchestrator = new Orchestrator({
      projectRoot,
      config: loaded.config,
      rules: loaded.rules,
      task: snapshot.task,
      flow: snapshot,
      isGitRepo: true,
      onProgress: () => {},
    });
    let approvedOnce = false;
    const interval = setInterval(async () => {
      if (approvedOnce) return;
      const runs = await fs
        .readdir(path.join(projectRoot, ".amaco", "runs"))
        .catch(() => []);
      const runId = runs[0];
      if (!runId) return;
      const approvals = new ApprovalService(projectRoot, runId);
      const pending = await approvals.firstPending();
      if (!pending) return;
      approvedOnce = true;
      await approvals.approve({ approvalId: pending.id });
    }, 50);

    let result: Awaited<ReturnType<Orchestrator["run"]>>;
    try {
      result = await orchestrator.run();
    } finally {
      clearInterval(interval);
    }

    expect(result.state.status).toBe("merge_ready");
    expect(result.state.flow?.flowId).toBe("default");

    const eventsRaw = await fs.readFile(
      path.join(projectRoot, ".amaco", "runs", result.runId, "events.ndjson"),
      "utf8",
    );
    const events = eventsRaw
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as { type: string; data?: Record<string, unknown> });

    // Two review passes (CHANGES_REQUESTED → fix → APPROVED), one fix, one verify.
    expect(events.filter((e) => e.type === "flow.loop.iteration").length).toBe(2);
    expect(
      events.filter((e) => e.type === "flow.step.started" && e.data?.stepId === "fix").length,
    ).toBe(1);
    expect(
      events.filter((e) => e.type === "flow.step.started" && e.data?.stepId === "verify").length,
    ).toBe(1);
  });
});

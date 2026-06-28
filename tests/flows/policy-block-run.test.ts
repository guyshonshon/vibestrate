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

// End-to-end: a confirmed project `block` policy whose matcher matches the run's
// diff caps merge-readiness even when the reviewer APPROVED - proving the
// deterministic gate is independent of (and not clobbered by) the review lane, and
// fires under the DEFAULT supervisor (the policy is project-scoped, not persona-owned).

const noProvider: ProviderDetectionRunner = async () => ({ exitCode: 127, stdout: "", stderr: "" });

// The executor WRITES a file containing an em-dash into the worktree; the reviewer
// always APPROVES. So without a block rule the run is merge_ready; with one it must
// be blocked.
const PROVIDER = `#!/usr/bin/env node
const fs = require("node:fs");
let prompt = "";
process.stdin.on("data", (c) => (prompt += c));
process.stdin.on("end", () => {
  if (prompt.includes("Vibestrate Agent: reviewer")) console.log("# Review\\n\\nDECISION: APPROVED");
  else if (prompt.includes("Vibestrate Agent: verifier")) console.log("# Verify\\n\\nVERIFICATION: PASSED");
  else if (prompt.includes("Vibestrate Agent: executor")) {
    fs.writeFileSync("notes.ts", "export const note = \\\`done — shipped\\\`;\\n");
    console.log("# Implementation\\n\\nWrote notes.ts");
  } else if (prompt.includes("Vibestrate Agent: fixer")) console.log("# Fix\\n\\nok");
  else if (prompt.includes("Vibestrate Agent: architect")) console.log("# Architecture\\n\\nok");
  else if (prompt.includes("Vibestrate Agent: planner")) console.log("# Plan\\n\\nok");
  else console.log("# Output");
});
`;

// Same, but the executor COMMITS the em-dash file mid-run, so `git diff HEAD` at
// completion is empty - the gate must scan from the fork point (merge-base) or it
// silently no-ops. This is the regression guard for the committed-run base-ref bug.
const COMMITTING_PROVIDER = `#!/usr/bin/env node
const fs = require("node:fs");
const { execSync } = require("node:child_process");
let prompt = "";
process.stdin.on("data", (c) => (prompt += c));
process.stdin.on("end", () => {
  if (prompt.includes("Vibestrate Agent: reviewer")) console.log("# Review\\n\\nDECISION: APPROVED");
  else if (prompt.includes("Vibestrate Agent: verifier")) console.log("# Verify\\n\\nVERIFICATION: PASSED");
  else if (prompt.includes("Vibestrate Agent: executor")) {
    fs.writeFileSync("notes.ts", "export const note = \\\`done — shipped\\\`;\\n");
    execSync("git add -A && git commit -q -m item", { cwd: process.cwd() });
    console.log("# Implementation\\n\\nCommitted notes.ts");
  } else if (prompt.includes("Vibestrate Agent: fixer")) console.log("# Fix\\n\\nok");
  else if (prompt.includes("Vibestrate Agent: architect")) console.log("# Architecture\\n\\nok");
  else if (prompt.includes("Vibestrate Agent: planner")) console.log("# Plan\\n\\nok");
  else console.log("# Output");
});
`;

async function makeRepo(withBlockPolicy: boolean, providerScript: string = PROVIDER): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-prefblock-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"prefblock"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });

  const providerPath = path.join(dir, "fake-provider.js");
  await fs.writeFile(providerPath, providerScript, { mode: 0o755 });
  await fs.chmod(providerPath, 0o755);
  await setConfigValue(
    dir,
    "providers.fake",
    JSON.stringify({ type: "cli", command: "node", args: [providerPath], input: "stdin" }),
  );
  await setConfigValue(dir, "profiles.claude-balanced.provider", "fake");

  if (withBlockPolicy) {
    // A PROJECT-scoped block policy - no persona owns it; it fires under the default
    // supervisor (defaultPersona is left as the built-in staff-engineer).
    await setConfigValue(
      dir,
      "projectPolicies",
      JSON.stringify([
        {
          id: "no-em-dash",
          statement: "do not use em-dash characters",
          tier: "block",
          matcher: "—",
          source: "owner",
          confirmedAt: "2026-06-28T00:00:00.000Z",
        },
      ]),
    );
  }
  return dir;
}

async function run(dir: string) {
  const discovered = await findFlowById(dir, "default");
  const loaded = await loadConfig(dir);
  const snapshot = resolveFlow({
    flow: discovered!.definition,
    source: discovered!.source,
    config: loaded.config,
    task: `block gate ${Math.random().toString(36).slice(2, 8)}`,
  });
  const orch = new Orchestrator({
    projectRoot: dir,
    config: loaded.config,
    rules: loaded.rules,
    task: snapshot.task,
    flow: snapshot,
    isGitRepo: true,
    readOnly: false,
    onProgress: () => {},
  });
  // Auto-approve any pending approval so the flow runs to completion.
  let approved = false;
  const interval = setInterval(async () => {
    if (approved) return;
    const runs = await fs.readdir(path.join(dir, ".vibestrate", "runs")).catch(() => []);
    const runId = runs[0];
    if (!runId) return;
    const approvals = new ApprovalService(dir, runId);
    const pending = await approvals.firstPending();
    if (!pending) return;
    approved = true;
    await approvals.approve({ approvalId: pending.id });
  }, 50);
  try {
    const result = await orch.run();
    const events = (await fs.readFile(path.join(dir, ".vibestrate", "runs", result.runId, "events.ndjson"), "utf8").catch(() => ""))
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { type: string });
    return { result, events };
  } finally {
    clearInterval(interval);
  }
}

describe("project policy block gate - end to end", () => {
  it("control: with no block policy, the em-dash run reaches merge_ready", async () => {
    const dir = await makeRepo(false);
    const { result } = await run(dir);
    expect(result.state.status).toBe("merge_ready");
  }, 60_000);

  it("a confirmed block policy caps the merge under the DEFAULT supervisor even though the review APPROVED", async () => {
    const dir = await makeRepo(true);
    const { result, events } = await run(dir);
    expect(result.state.status).toBe("blocked");
    expect(events.some((e) => e.type === "supervisor.policy_block")).toBe(true);
  }, 60_000);

  it("caps a COMMITTED-mid-run change too (scans from the fork point, not git diff HEAD)", async () => {
    const dir = await makeRepo(true, COMMITTING_PROVIDER);
    const { result, events } = await run(dir);
    expect(result.state.status).toBe("blocked");
    expect(events.some((e) => e.type === "supervisor.policy_block")).toBe(true);
  }, 60_000);
});

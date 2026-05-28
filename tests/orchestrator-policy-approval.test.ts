import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { Orchestrator } from "../src/core/orchestrator.js";
import { loadConfig } from "../src/project/config-loader.js";
import { ApprovalService } from "../src/core/approval-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeRepoWithFakeProvider(input: {
  roleEmitsApproval: "off" | "architect-structured" | "architect-plain";
}): Promise<{
  projectRoot: string;
  runIt: (
    decide: (svc: ApprovalService, runId: string) => Promise<void>,
  ) => Promise<{ status: string; runId: string }>;
}> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-policy-orch-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });

  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });

  const fakeJs = path.join(dir, "fake.js");
  let architectBody: string;
  if (input.roleEmitsApproval === "off") {
    architectBody = `# Architecture\\nNothing risky.`;
  } else if (input.roleEmitsApproval === "architect-structured") {
    architectBody = [
      "# Architecture",
      "",
      "HUMAN_APPROVAL: REQUIRED",
      "HUMAN_APPROVAL_REASON: touches auth boundary",
      "HUMAN_APPROVAL_RISK: high",
      "HUMAN_APPROVAL_REQUEST: Approve auth move",
    ].join("\\n");
  } else {
    architectBody = [
      "# Architecture",
      "",
      "HUMAN_APPROVAL: REQUIRED",
      "HUMAN_APPROVAL_REASON: please pause",
    ].join("\\n");
  }

  await fs.writeFile(
    fakeJs,
    `#!/usr/bin/env node
let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{
  if (i.includes('Vibestrate Agent: reviewer')) {
    console.log('# Review\\nDECISION: APPROVED');
  } else if (i.includes('Vibestrate Agent: verifier')) {
    console.log('VERIFICATION: PASSED');
  } else if (i.includes('Vibestrate Agent: planner')) {
    console.log('# Plan');
  } else if (i.includes('Vibestrate Agent: architect')) {
    console.log(\`${architectBody}\`);
  } else if (i.includes('Vibestrate Agent: executor')) {
    console.log('# Implementation Summary\\nNone.');
  } else {
    console.log('?');
  }
});
`,
    { mode: 0o755 },
  );
  await fs.chmod(fakeJs, 0o755);

  await setConfigValue(
    dir,
    "providers.fake",
    JSON.stringify({
      type: "cli",
      command: "node",
      args: [fakeJs],
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

  return {
    projectRoot: dir,
    runIt: async (decide) => {
      const loaded = await loadConfig(dir);
      const orch = new Orchestrator({
        projectRoot: dir,
        config: loaded.config,
        rules: loaded.rules,
        task: "policy approval test",
        isGitRepo: true,
        onProgress: () => {},
      });
      let resolverDone = false;
      const interval = setInterval(async () => {
        if (resolverDone) return;
        try {
          const runs = await fs.readdir(path.join(dir, ".vibestrate", "runs"));
          if (runs.length === 0) return;
          const runId = runs[runs.length - 1]!;
          const svc = new ApprovalService(dir, runId);
          const pending = await svc.firstPending();
          if (pending) {
            resolverDone = true;
            await decide(svc, runId);
          }
        } catch {
          // ignore
        }
      }, 80);

      const result = await orch.run();
      clearInterval(interval);
      const stateRaw = await fs.readFile(
        path.join(dir, ".vibestrate", "runs", result.runId, "state.json"),
        "utf8",
      );
      const state = JSON.parse(stateRaw) as { status: string };
      return { status: state.status, runId: result.runId };
    },
  };
}

describe("orchestrator: per-stage policy approvals", () => {
  it("creates a policy approval at architecting when configured, even if agent did not request", async () => {
    const harness = await makeRepoWithFakeProvider({
      roleEmitsApproval: "off",
    });
    await setConfigValue(
      harness.projectRoot,
      "policies.requireApprovalAtStages",
      JSON.stringify(["architecting"]),
    );
    const out = await harness.runIt(async (svc) => {
      const pending = await svc.firstPending();
      await svc.approve({ approvalId: pending!.id });
    });
    expect(out.status).toBe("merge_ready");
    const all = await new ApprovalService(harness.projectRoot, out.runId).list();
    expect(all).toHaveLength(1);
    expect(all[0]!.source).toBe("policy");
    expect(all[0]!.alsoRequiredByPolicy).toBe(false);
    expect(all[0]!.requestedAction).toMatch(/architecting/);
    expect(all[0]!.reason).toMatch(/policy/i);
  });

  it("preserves agent metadata (risk + request) when agent emits structured request", async () => {
    const harness = await makeRepoWithFakeProvider({
      roleEmitsApproval: "architect-structured",
    });
    const out = await harness.runIt(async (svc) => {
      const pending = await svc.firstPending();
      await svc.approve({ approvalId: pending!.id });
    });
    expect(out.status).toBe("merge_ready");
    const all = await new ApprovalService(harness.projectRoot, out.runId).list();
    expect(all).toHaveLength(1);
    expect(all[0]!.source).toBe("agent");
    expect(all[0]!.riskLevel).toBe("high");
    expect(all[0]!.requestedAction).toBe("Approve auth move");
    expect(all[0]!.reason).toBe("touches auth boundary");
  });

  it("dedupes: when agent + policy both apply, only one approval is created and source=agent + alsoRequiredByPolicy=true", async () => {
    const harness = await makeRepoWithFakeProvider({
      roleEmitsApproval: "architect-structured",
    });
    await setConfigValue(
      harness.projectRoot,
      "policies.requireApprovalAtStages",
      JSON.stringify(["architecting"]),
    );
    const out = await harness.runIt(async (svc) => {
      const pending = await svc.firstPending();
      await svc.approve({ approvalId: pending!.id, note: "ok" });
    });
    expect(out.status).toBe("merge_ready");
    const all = await new ApprovalService(harness.projectRoot, out.runId).list();
    expect(all).toHaveLength(1);
    expect(all[0]!.source).toBe("agent");
    expect(all[0]!.alsoRequiredByPolicy).toBe(true);
    // Agent metadata wins.
    expect(all[0]!.riskLevel).toBe("high");
    expect(all[0]!.requestedAction).toBe("Approve auth move");
  });

  it("rejecting a structured agent approval blocks the run; final report keeps risk/request", async () => {
    const harness = await makeRepoWithFakeProvider({
      roleEmitsApproval: "architect-structured",
    });
    const out = await harness.runIt(async (svc) => {
      const pending = await svc.firstPending();
      await svc.reject({ approvalId: pending!.id, note: "not now" });
    });
    expect(out.status).toBe("blocked");
    const all = await new ApprovalService(harness.projectRoot, out.runId).list();
    expect(all[0]!.status).toBe("rejected");
    expect(all[0]!.riskLevel).toBe("high");
    expect(all[0]!.requestedAction).toBe("Approve auth move");
    const reportPath = path.join(
      harness.projectRoot,
      ".vibestrate",
      "runs",
      out.runId,
      "artifacts",
      "12-final-report.md",
    );
    const report = await fs.readFile(reportPath, "utf8");
    expect(report).toContain("Approve auth move");
    expect(report).toContain("rejected");
    expect(report).toContain("not now");
  });
});

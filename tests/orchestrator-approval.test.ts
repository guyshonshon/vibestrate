import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { Orchestrator } from "../src/core/orchestrator.js";
import { loadConfig } from "../src/project/config-loader.js";
import { ApprovalService } from "../src/core/approval-service.js";
import { runStateSchema } from "../src/core/state-machine.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeRepoWithFakeProvider(
  whichRoleRequestsApproval: "architect" | "reviewer",
): Promise<{ projectRoot: string; runIt: (decide: (svc: ApprovalService, runId: string) => Promise<void>) => Promise<{ status: string; runId: string }> }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "amaco-orch-appr-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });

  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });

  // Fake provider script.
  const fakeJs = path.join(dir, "fake.js");
  const requestLine =
    'HUMAN_APPROVAL: REQUIRED\\nHUMAN_APPROVAL_REASON: integration test asks for human pause';
  await fs.writeFile(
    fakeJs,
    `#!/usr/bin/env node
let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{
  if (i.includes('Amaco Agent: reviewer')) {
    ${whichRoleRequestsApproval === "reviewer"
      ? `console.log('# Review\\n\\nDECISION: APPROVED\\n\\n${requestLine}');`
      : `console.log('# Review\\n\\nDECISION: APPROVED');`}
  } else if (i.includes('Amaco Agent: verifier')) {
    console.log('VERIFICATION: PASSED');
  } else if (i.includes('Amaco Agent: planner')) {
    console.log('# Plan');
  } else if (i.includes('Amaco Agent: architect')) {
    ${whichRoleRequestsApproval === "architect"
      ? `console.log('# Architecture\\n\\n${requestLine}');`
      : `console.log('# Architecture\\nNothing risky.');`}
  } else if (i.includes('Amaco Agent: executor')) {
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
        task: "approval gate test",
        isGitRepo: true,
        onProgress: () => {},
      });
      // Resolve the pending approval as soon as it appears (poll the file).
      let resolverDone = false;
      const resolverInterval = setInterval(async () => {
        if (resolverDone) return;
        try {
          const runs = await fs.readdir(path.join(dir, ".amaco", "runs"));
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
      clearInterval(resolverInterval);
      const stateRaw = await fs.readFile(
        path.join(dir, ".amaco", "runs", result.runId, "state.json"),
        "utf8",
      );
      const state = runStateSchema.parse(JSON.parse(stateRaw));
      return { status: state.status, runId: result.runId };
    },
  };
}

describe("orchestrator approval gate", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = "";
  });

  it("approves a request from architect → run reaches merge_ready", async () => {
    const harness = await makeRepoWithFakeProvider("architect");
    projectRoot = harness.projectRoot;
    const out = await harness.runIt(async (svc) => {
      const pending = await svc.firstPending();
      await svc.approve({ approvalId: pending!.id, note: "ok" });
    });
    expect(out.status).toBe("merge_ready");
    // Approval recorded.
    const all = await new ApprovalService(projectRoot, out.runId).list();
    expect(all).toHaveLength(1);
    expect(all[0]!.status).toBe("approved");
  });

  it("rejects a request from reviewer → run becomes blocked", async () => {
    const harness = await makeRepoWithFakeProvider("reviewer");
    projectRoot = harness.projectRoot;
    const out = await harness.runIt(async (svc) => {
      const pending = await svc.firstPending();
      await svc.reject({ approvalId: pending!.id, note: "not now" });
    });
    expect(out.status).toBe("blocked");
    const all = await new ApprovalService(projectRoot, out.runId).list();
    expect(all[0]!.status).toBe("rejected");
  });
});

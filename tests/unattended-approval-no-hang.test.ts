import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { Orchestrator } from "../src/core/orchestrator.js";
import { loadConfig } from "../src/project/config-loader.js";
import { runStateSchema } from "../src/core/state-machine.js";
import { ApprovalService } from "../src/core/run/approval-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

// An UNATTENDED run that hits an approval gate must STOP honestly (gate expires ->
// run blocks), never hang forever wedging a scheduler worker. The fix passes a
// timeoutMs to waitForResolution only when this.unattended. Attended runs keep the
// indefinite wait (covered by orchestrator-approval.test.ts). This never approves;
// it only bounds the wait, so no gate is weakened.

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibe-unattended-gate-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });

  // The architect voluntarily asks for human approval; nobody will answer.
  const fakeJs = path.join(dir, "fake.js");
  await fs.writeFile(
    fakeJs,
    `#!/usr/bin/env node
let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{
  if (i.includes('Vibestrate Agent: architect')) {
    console.log('# Architecture\\n\\nHUMAN_APPROVAL: REQUIRED\\nHUMAN_APPROVAL_REASON: unattended no-hang test');
  } else if (i.includes('Vibestrate Agent: reviewer')) {
    console.log('# Review\\n\\nDECISION: APPROVED');
  } else if (i.includes('Vibestrate Agent: verifier')) {
    console.log('VERIFICATION: PASSED');
  } else if (i.includes('Vibestrate Agent: planner')) {
    console.log('# Plan');
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
    JSON.stringify({ type: "cli", command: "node", args: [fakeJs], input: "stdin" }),
  );
  await setConfigValue(dir, "profiles.claude-balanced.provider", "fake");
  return dir;
}

describe("unattended approval gate does not hang", () => {
  it("blocks (gate expires) instead of waiting forever when unattended and nobody answers", async () => {
    const dir = await makeRepo();
    const loaded = await loadConfig(dir);
    const orch = new Orchestrator({
      projectRoot: dir,
      config: loaded.config,
      rules: loaded.rules,
      task: "unattended gate test",
      isGitRepo: true,
      unattended: true,
      onProgress: () => {},
    });

    // If the fix regressed, orch.run() would never resolve and the test times out.
    const result = await orch.run();

    const state = runStateSchema.parse(
      JSON.parse(
        await fs.readFile(
          path.join(dir, ".vibestrate", "runs", result.runId, "state.json"),
          "utf8",
        ),
      ),
    );
    expect(state.status).toBe("blocked");

    // The gate was recorded and resolved honestly as expired (not approved).
    const approvals = await new ApprovalService(dir, result.runId).list();
    expect(approvals.length).toBeGreaterThanOrEqual(1);
    expect(approvals[0]!.status).toBe("expired");
    expect(approvals[0]!.resolvedBy).toBe("system-timeout");
  }, 60_000);
});

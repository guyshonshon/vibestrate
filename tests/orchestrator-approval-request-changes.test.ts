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
import { runStateSchema } from "../src/core/state-machine.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

// Sentinel the fake provider looks for in its own prompt to prove the human
// guidance actually reached the re-run turn (guidance-forward injection).
const GUIDANCE = "CLARIFY_WTF_MEANS_FROBNICATE";

/**
 * M0 scout for the purposeful-approval-gate design: a `changes_requested`
 * decision must NOT re-run the already-committed turn (that would double-apply
 * writes); instead the run continues with a fresh guided turn that SEES the
 * human's guidance. The fake architect requests approval on its first turn and,
 * once the guidance appears in its prompt, produces a clean output - so reaching
 * merge_ready proves the guidance was injected and the run picked up forward.
 */
async function makeRepo(alwaysRequest = false): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-appr-rc-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });

  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });

  const fakeJs = path.join(dir, "fake.js");
  const requestLine =
    "HUMAN_APPROVAL: REQUIRED\\nHUMAN_APPROVAL_REASON: needs the human to clarify the task";
  await fs.writeFile(
    fakeJs,
    `#!/usr/bin/env node
let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{
  if (i.includes('Vibestrate Agent: reviewer')) {
    console.log('# Review\\n\\nDECISION: APPROVED');
  } else if (i.includes('Vibestrate Agent: verifier')) {
    console.log('VERIFICATION: PASSED');
  } else if (i.includes('Vibestrate Agent: planner')) {
    console.log('# Plan');
  } else if (i.includes('Vibestrate Agent: architect')) {
    const hasG = i.includes(${JSON.stringify(GUIDANCE)});
    require('fs').appendFileSync(${JSON.stringify(path.join(dir, "arch.log"))}, 'arch hasG='+hasG+'\\n');
    if (!${alwaysRequest} && hasG) {
      console.log('# Architecture\\nClarified per the human guidance.');
    } else {
      console.log('# Architecture\\n\\n${requestLine}');
    }
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

describe("orchestrator approval gate — request changes (guidance-forward)", () => {
  it("re-runs the stage forward with the human's guidance and reaches merge_ready", async () => {
    const dir = await makeRepo();
    try {
      const loaded = await loadConfig(dir);
      const orch = new Orchestrator({
        projectRoot: dir,
        config: loaded.config,
        rules: loaded.rules,
        task: "request-changes test",
        isGitRepo: true,
        onProgress: () => {},
      });

      let resolved = false;
      const timer = setInterval(async () => {
        if (resolved) return;
        try {
          const runs = await fs.readdir(path.join(dir, ".vibestrate", "runs"));
          if (runs.length === 0) return;
          const runId = runs[runs.length - 1]!;
          const svc = new ApprovalService(dir, runId);
          const pending = await svc.firstPending();
          if (pending) {
            resolved = true;
            await svc.requestChanges({ approvalId: pending.id, guidance: GUIDANCE });
          }
        } catch {
          // ignore
        }
      }, 80);

      const result = await orch.run();
      clearInterval(timer);

      const stateRaw = await fs.readFile(
        path.join(dir, ".vibestrate", "runs", result.runId, "state.json"),
        "utf8",
      );
      const state = runStateSchema.parse(JSON.parse(stateRaw));

      // The run picked up FORWARD after the guidance, not blocked.
      expect(state.status).toBe("merge_ready");

      // The architect must have re-run WITH the guidance (2 turns: request, then
      // clarify) - not merely proceeded past the gate. The 2nd turn saw guidance.
      const archTurns = (await fs.readFile(path.join(dir, "arch.log"), "utf8"))
        .split("\n")
        .filter(Boolean);
      expect(archTurns).toEqual(["arch hasG=false", "arch hasG=true"]);

      const all = await new ApprovalService(dir, result.runId).list();
      expect(all).toHaveLength(1);
      expect(all[0]!.status).toBe("changes_requested");
      expect(all[0]!.guidance).toContain("FROBNICATE");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("blocks after the configured change-round cap (derived from persisted approvals)", async () => {
    const dir = await makeRepo(true); // architect re-asks every time, ignoring guidance
    await setConfigValue(dir, "policies.approvalMaxChangeRounds", "2");
    try {
      const loaded = await loadConfig(dir);
      const orch = new Orchestrator({
        projectRoot: dir,
        config: loaded.config,
        rules: loaded.rules,
        task: "cap test",
        isGitRepo: true,
        onProgress: () => {},
      });

      // Resolve EVERY pending gate with request-changes; the cap must stop the
      // loop rather than let it run forever.
      const seen = new Set<string>();
      const timer = setInterval(async () => {
        try {
          const runs = await fs.readdir(path.join(dir, ".vibestrate", "runs"));
          if (runs.length === 0) return;
          const runId = runs[runs.length - 1]!;
          const svc = new ApprovalService(dir, runId);
          const pending = await svc.firstPending();
          if (pending && !seen.has(pending.id)) {
            seen.add(pending.id);
            await svc.requestChanges({ approvalId: pending.id, guidance: GUIDANCE });
          }
        } catch {
          // ignore
        }
      }, 60);

      const result = await orch.run();
      clearInterval(timer);

      const stateRaw = await fs.readFile(
        path.join(dir, ".vibestrate", "runs", result.runId, "state.json"),
        "utf8",
      );
      const state = runStateSchema.parse(JSON.parse(stateRaw));
      expect(state.status).toBe("blocked");

      // cap=2 -> rounds 1 and 2 re-run, the 3rd request trips the cap and blocks.
      const changed = (await new ApprovalService(dir, result.runId).list()).filter(
        (a) => a.status === "changes_requested",
      );
      expect(changed.length).toBe(3);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }, 60_000);
});

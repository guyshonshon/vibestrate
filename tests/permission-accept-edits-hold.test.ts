import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { Orchestrator } from "../src/core/orchestrator.js";
import { loadConfig } from "../src/project/config-loader.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

// ── P4 follow-up: accept-edits is a REAL hold, not a silent block ────────────
// A run that EARNS merge_ready under accept-edits must HOLD for human sign-off
// (a real approval.requested pause), then resume on approval. Here we drive the
// unattended-expire path: the hold fires, then expires -> blocked. Without the
// resumable-hold wiring the run would either auto-complete or block with no
// approval.requested event.

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

// A fake that drives the default flow to merge_ready: planner ok, reviewer
// APPROVED, verifier PASSED. So the run EARNS merge_ready and accept-edits then
// holds it.
const FAKE = `const fs=require('fs');
let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{
  if (i.includes('Vibestrate Agent: reviewer')) process.stdout.write('# Review\\nDECISION: APPROVED\\n');
  else if (i.includes('Vibestrate Agent: verifier')) process.stdout.write('VERIFICATION: PASSED\\n');
  else process.stdout.write('# Result\\nok\\n');
  process.exit(0);
});
`;

describe("accept-edits holds the run for sign-off (real approval pause)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-p4ae-"));
    await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
    await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
    await execa("git", ["config", "user.name", "x"], { cwd: dir });
    await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
    await execa("git", ["add", "."], { cwd: dir });
    await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
    await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
    await setConfigValue(dir, "git.worktreeDir", path.join(dir, "worktrees"));
    const fakeJs = path.join(dir, "fake.js");
    await fs.writeFile(fakeJs, FAKE);
    await setConfigValue(
      dir,
      "providers.fake",
      JSON.stringify({ type: "cli", command: "node", args: [fakeJs], input: "stdin" }),
    );
    await setConfigValue(dir, "profiles.claude-balanced.provider", "fake");
    // Tiny unattended approval timeout so the hold expires immediately.
    await setConfigValue(dir, "policies.unattendedApprovalTimeoutMs", "1");
  });

  it("a merge-ready run HOLDS at run.complete (approval.requested), then expires -> blocked when unattended", async () => {
    const loaded = await loadConfig(dir);
    const orch = new Orchestrator({
      projectRoot: dir,
      config: loaded.config,
      rules: loaded.rules,
      task: "make a small change",
      isGitRepo: true,
      permissionMode: "accept-edits",
      unattended: true, // so the hold expires instead of waiting forever
      onProgress: () => {},
    });
    const out = await orch.run();

    // The resolved mode is recorded on run state (honest reporting).
    expect(out.state.permissionMode).toBe("accept-edits");

    const eventsPath = path.join(dir, ".vibestrate", "runs", out.runId, "events.ndjson");
    const events = await fs.readFile(eventsPath, "utf8").catch(() => "");
    // The hold FIRED (a real approval pause at the completion boundary), and the
    // resolved mode was recorded.
    expect(events).toContain("approval.requested");
    expect(events).toContain("run.complete");
    expect(events).toContain("policy.permission_mode");
    // Unattended + tiny timeout => the hold expired and the run did not silently
    // reach merge_ready.
    expect(out.state.status).not.toBe("merge_ready");
  }, 60_000);
});

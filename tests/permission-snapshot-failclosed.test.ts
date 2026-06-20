import { describe, it, expect, beforeEach, vi } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { loadConfig } from "../src/project/config-loader.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

// ── P4: the second fail-open seam (the Tier-2 blocker) ───────────────────────
// A write-capable turn whose pre-turn snapshot FAILS must fail CLOSED (refuse the
// turn) instead of silently skipping the diff gate and keeping unevaluated
// writes. Mock snapshotWorktree to throw; the run must NOT reach merge_ready.

vi.mock("../src/safety/diff-gate.js", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    // Keep evaluateTurnDiff real; only the snapshot fails.
    snapshotWorktree: vi.fn(async () => {
      throw new Error("forced snapshot failure");
    }),
  };
});

const { Orchestrator } = await import("../src/core/orchestrator.js");

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

const FAKE = `const fs=require('fs');
let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{
  if (i.includes('Vibestrate Agent: reviewer')) { process.stdout.write('# Review\\nDECISION: APPROVED\\n'); }
  else if (i.includes('Vibestrate Agent: verifier')) { process.stdout.write('VERIFICATION: PASSED\\n'); }
  else { process.stdout.write('# Result\\nok\\n'); }
  process.exit(0);
});
`;

describe("permission modes: write turn fails closed when the snapshot fails", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-p4snap-"));
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
  });

  it("a write-capable run blocks (does not reach merge_ready) when it can't snapshot", async () => {
    const loaded = await loadConfig(dir);
    const orch = new Orchestrator({
      projectRoot: dir,
      config: loaded.config,
      rules: loaded.rules,
      task: "make a change to the project",
      isGitRepo: true,
      // default flow has a write-capable executor; auto mode allows direct writes.
      permissionMode: "auto",
      onProgress: () => {},
    });
    const out = await orch.run();
    // Fail-closed: the executor's snapshot threw, so its writes can't be gated -
    // the run must NOT silently complete merge_ready.
    expect(out.state.status).not.toBe("merge_ready");

    // And it explained itself: a snapshot.unavailable denial was recorded.
    const eventsPath = path.join(dir, ".vibestrate", "runs", out.runId, "events.ndjson");
    const events = await fs.readFile(eventsPath, "utf8").catch(() => "");
    expect(events).toContain("snapshot.unavailable");
  }, 60_000);
});

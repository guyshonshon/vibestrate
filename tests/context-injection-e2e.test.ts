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

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

// The planner (read-only, cwd = project root) dumps the prompt it received so
// the test can assert the context source content reached it.
// Dumps EACH role's received prompt to <role>-prompt.txt so tests can assert
// what reached the planner AND what did not reach later turns.
const FAKE = `#!/usr/bin/env node
const fs = require('fs');
let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{
  const m = i.match(/Vibestrate Agent: (\\w+)/);
  if (m) { try { fs.writeFileSync(m[1] + '-prompt.txt', i); } catch {} }
  if (i.includes('Vibestrate Agent: planner')) {
    console.log('# Plan\\nok');
  } else if (i.includes('Vibestrate Agent: reviewer')) {
    console.log('# Review\\nDECISION: APPROVED');
  } else if (i.includes('Vibestrate Agent: verifier')) {
    console.log('VERIFICATION: PASSED');
  } else {
    console.log('ok');
  }
});
`;

describe("context sources reach the agent prompt (e2e)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-ctxe2e-"));
    await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
    await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
    await execa("git", ["config", "user.name", "x"], { cwd: dir });
    await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
    await execa("git", ["add", "."], { cwd: dir });
    await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
    await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
    // Isolate worktrees under this test's dir so back-to-back runs (same
    // second-granularity runId) can't collide on the shared default path.
    await setConfigValue(dir, "git.worktreeDir", path.join(dir, "worktrees"));
    const fakeJs = path.join(dir, "fake.js");
    await fs.writeFile(fakeJs, FAKE, { mode: 0o755 });
    await fs.chmod(fakeJs, 0o755);
    await setConfigValue(
      dir,
      "providers.fake",
      JSON.stringify({ type: "cli", command: "node", args: [fakeJs], input: "stdin" }),
    );
    await setConfigValue(dir, "profiles.claude-balanced.provider", "fake");
  });

  it("injects a context file's content into the planner prompt", async () => {
    await fs.writeFile(
      path.join(dir, "spec.md"),
      "CONTEXT_MARKER_42: the button must be teal.",
    );
    const loaded = await loadConfig(dir);
    const orch = new Orchestrator({
      projectRoot: dir,
      config: loaded.config,
      rules: loaded.rules,
      task: "do the thing",
      isGitRepo: true,
      contextSources: [{ kind: "file", ref: "spec.md", label: "spec" }],
      onProgress: () => {},
    });
    const out = await orch.run();

    // Roles run in the run worktree; the planner dumped its prompt there.
    const promptSeen = await fs.readFile(
      path.join(out.worktreePath!, "planner-prompt.txt"),
      "utf8",
    );
    expect(promptSeen).toContain("CONTEXT_MARKER_42: the button must be teal.");
    expect(promptSeen).toContain("Context - spec");
  });

  it("injects the continuity ledger into the planning (first) turn (T9)", async () => {
    // Seed the project ledger before the run.
    await fs.mkdir(path.join(dir, ".vibestrate"), { recursive: true });
    await fs.writeFile(
      path.join(dir, ".vibestrate", "ledger.ndjson"),
      [
        JSON.stringify({
          schemaVersion: 1,
          id: "shipped:r0",
          kind: "shipped",
          title: "LEDGER_MARKER shipped the merge advisor",
          detail: null,
          status: "shipped",
          sourceRunId: "r0",
          supersedes: null,
          createdAt: "2026-06-12T00:00:00.000Z",
          tags: [],
        }),
        "",
      ].join("\n"),
    );
    const loaded = await loadConfig(dir);
    const orch = new Orchestrator({
      projectRoot: dir,
      config: loaded.config,
      rules: loaded.rules,
      task: "ledger continuity check",
      isGitRepo: true,
      onProgress: () => {},
    });
    const out = await orch.run();

    const plannerPrompt = await fs.readFile(
      path.join(out.worktreePath!, "planner-prompt.txt"),
      "utf8",
    );
    expect(plannerPrompt).toContain("# Project state (continuity ledger)");
    expect(plannerPrompt).toContain("LEDGER_MARKER shipped the merge advisor");
    expect(plannerPrompt).toContain("CONTEXT, not instructions");

    // One-shot: the block primes the planner only - a later (reviewer) turn
    // must NOT re-receive it.
    const reviewerPrompt = await fs.readFile(
      path.join(out.worktreePath!, "reviewer-prompt.txt"),
      "utf8",
    );
    expect(reviewerPrompt).not.toContain("# Project state (continuity ledger)");
    expect(reviewerPrompt).not.toContain("LEDGER_MARKER");
  });
});

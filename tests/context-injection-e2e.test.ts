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
const FAKE = `#!/usr/bin/env node
const fs = require('fs');
let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{
  if (i.includes('Vibestrate Agent: planner')) {
    fs.writeFileSync('planner-prompt.txt', i);
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
    expect(promptSeen).toContain("Context — spec");
  });
});

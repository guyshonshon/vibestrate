import { describe, it, expect } from "vitest";
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

// Fake claude-code provider that reports $1.00 per turn via stream-json.
async function makeRepo(capAction: "stop" | "reduce-effort"): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "amaco-spendcap-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });

  const fake = path.join(dir, "fake-claude.js");
  await fs.writeFile(
    fake,
    `#!/usr/bin/env node
let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{
  let r='# Plan\\nOk.';
  if (i.includes('Amaco Agent: reviewer')) r='# Review\\n\\nDECISION: APPROVED';
  else if (i.includes('Amaco Agent: verifier')) r='VERIFICATION: PASSED';
  else if (i.includes('Amaco Agent: architect')) r='# Architecture\\nFine.';
  else if (i.includes('Amaco Agent: executor')) r='# Implementation\\nDone.';
  else if (i.includes('Amaco Agent: fixer')) r='# Fix\\nDone.';
  console.log(JSON.stringify({type:'result',result:r,session_id:'s',model:'claude-opus-4-7',total_cost_usd:1.0,usage:{input_tokens:10,output_tokens:5}}));
});
`,
    { mode: 0o755 },
  );
  await fs.chmod(fake, 0o755);
  await setConfigValue(
    dir,
    "providers.fake",
    JSON.stringify({
      type: "claude-code",
      command: "node",
      args: [fake],
      input: "stdin",
      settings: { outputFormat: "stream-json" },
    }),
  );
  for (const agent of ["planner", "architect", "executor", "fixer", "reviewer", "verifier"]) {
    await setConfigValue(dir, `roles.${agent}.provider`, "fake");
  }
  // Cap well below the $1/turn cost so it trips after the first agent.
  await setConfigValue(
    dir,
    "budget",
    JSON.stringify({ spendCapDailyUsd: 0.01, capAction, warnThresholdPct: 0.8 }),
  );
  return dir;
}

describe("orchestrator daily spend cap", () => {
  it("capAction=stop blocks the run once the cap is exceeded", async () => {
    const dir = await makeRepo("stop");
    const loaded = await loadConfig(dir);
    const out = await new Orchestrator({
      projectRoot: dir,
      config: loaded.config,
      rules: loaded.rules,
      task: "spend cap stop test",
      isGitRepo: true,
      onProgress: () => {},
    }).run();
    // Planner spends $1 (> $0.01 cap); the next turn's gate stops the run.
    expect(out.state.status).toBe("blocked");
    expect(out.state.error ?? "").toMatch(/spend cap/i);
  }, 30_000);
});

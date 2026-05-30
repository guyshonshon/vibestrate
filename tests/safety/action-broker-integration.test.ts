import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../../src/setup/setup-service.js";
import { setConfigValue } from "../../src/setup/config-update-service.js";
import { Orchestrator } from "../../src/core/orchestrator.js";
import { loadConfig } from "../../src/project/config-loader.js";
import { readActionLog } from "../../src/safety/action-broker.js";
import type { ProviderDetectionRunner } from "../../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

// Minimal fake claude-code provider — every seat gets a benign approval-shaped
// reply so the default flow runs to completion.
async function makeRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-broker-int-"));
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
  if (i.includes('Vibestrate Agent: reviewer')) r='# Review\\n\\nDECISION: APPROVED';
  else if (i.includes('Vibestrate Agent: verifier')) r='VERIFICATION: PASSED';
  else if (i.includes('Vibestrate Agent: architect')) r='# Architecture\\nFine.';
  else if (i.includes('Vibestrate Agent: executor')) r='# Implementation\\nDone.';
  else if (i.includes('Vibestrate Agent: fixer')) r='# Fix\\nDone.';
  console.log(JSON.stringify({type:'result',result:r,session_id:'s',model:'claude-opus-4-7',total_cost_usd:0,usage:{input_tokens:10,output_tokens:5}}));
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
  await setConfigValue(dir, "profiles.claude-balanced.provider", "fake");
  return dir;
}

describe("orchestrator routes provider spawns through the Action Broker", () => {
  it("records an allowed provider.spawn action per agent turn (default-allow)", async () => {
    const dir = await makeRepo();
    const loaded = await loadConfig(dir);
    const out = await new Orchestrator({
      projectRoot: dir,
      config: loaded.config,
      rules: loaded.rules,
      task: "action broker integration",
      isGitRepo: true,
      onProgress: () => {},
    }).run();

    const log = await readActionLog(dir, out.runId);
    expect(log.length).toBeGreaterThan(0);

    // Every provider.spawn is allowed with post-exec evidence.
    const spawns = log.filter((r) => r.request.kind === "provider.spawn");
    expect(spawns.length).toBeGreaterThan(0);
    for (const rec of spawns) {
      expect(rec.decision.effect).toBe("allow");
      expect(rec.request.subject.providerId).toBe("fake");
      expect(rec.evidence?.ok).toBe(true);
      expect(typeof rec.evidence?.data?.exitCode).toBe("number");
    }
    // The first brokered spawn is the planner seat.
    expect(spawns[0]!.request.roleId).toBe("planner");

    // The run's terminal verdict also crosses the broker exactly once.
    const completes = log.filter((r) => r.request.kind === "run.complete");
    expect(completes).toHaveLength(1);
    expect(completes[0]!.decision.effect).toBe("allow");
    expect(completes[0]!.request.subject.status).toBe("merge_ready");
    expect(completes[0]!.evidence?.ok).toBe(true);
  }, 30_000);
});

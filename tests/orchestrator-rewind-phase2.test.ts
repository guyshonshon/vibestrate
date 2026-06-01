import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { Orchestrator, type ResumeStage } from "../src/core/orchestrator.js";
import { resolveResumeFrom } from "../src/core/run-launcher.js";
import { MetricsStore } from "../src/core/metrics-store.js";
import { readPhaseSnapshots } from "../src/core/phase-snapshots.js";
import { loadConfig } from "../src/project/config-loader.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

const GEN_FILE = "generated.ts";
const GEN_BODY = "export const generated = 1;\n";

/** Repo whose fake EXECUTOR writes a real file into the worktree, so the
 *  per-phase snapshot has genuine content to restore on a downstream rewind. */
async function makeRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-rw2e-"));
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
const fs=require('fs');
let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{
  let r='# Plan\\nPlan body.';
  if (i.includes('Vibestrate Agent: reviewer')) r='# Review\\n\\nDECISION: APPROVED';
  else if (i.includes('Vibestrate Agent: verifier')) r='VERIFICATION: PASSED';
  else if (i.includes('Vibestrate Agent: architect')) r='# Architecture\\nArch body.';
  else if (i.includes('Vibestrate Agent: executor')) { fs.writeFileSync(${JSON.stringify(GEN_FILE)}, ${JSON.stringify(GEN_BODY)}); r='# Implementation\\nDone.'; }
  else if (i.includes('Vibestrate Agent: fixer')) r='# Fix\\nDone.';
  console.log(JSON.stringify({type:'result',result:r,session_id:'s',model:'claude-opus-4-7',total_cost_usd:0.001,usage:{input_tokens:10,output_tokens:5}}));
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

async function runFlow(
  dir: string,
  task: string,
  resume?: { sourceRunId: string; fromStage: ResumeStage },
) {
  const loaded = await loadConfig(dir);
  return new Orchestrator({
    projectRoot: dir,
    config: loaded.config,
    rules: loaded.rules,
    task,
    isGitRepo: true,
    onProgress: () => {},
    ...(resume ? { resumeFrom: await resolveResumeFrom(dir, resume) } : {}),
  }).run();
}

describe("orchestrator rewind phase 2 (resume at review)", () => {
  it("captures an executing snapshot, then a rewind to reviewing restores the code", async () => {
    const dir = await makeRepo();

    const source = await runFlow(dir, "phase2 source");
    expect(source.state.status).toBe("merge_ready");

    // The source run captured a worktree snapshot at the executing phase.
    const snaps = await readPhaseSnapshots(dir, source.runId);
    expect(snaps.some((s) => s.stage === "executing")).toBe(true);

    // Rewind to reviewing: planner/architect/executor are skipped, but the
    // reviewer + verifier re-run - and the executor's file is restored from the
    // snapshot (the only way it can be present, since the executor didn't run).
    const rewound = await runFlow(dir, "phase2 rewind", {
      sourceRunId: source.runId,
      fromStage: "reviewing",
    });

    expect(rewound.runId).not.toBe(source.runId);
    expect(rewound.state.status).toBe("merge_ready");
    expect(rewound.state.resumedFrom).toEqual({
      sourceRunId: source.runId,
      fromStage: "reviewing",
    });

    const roleIds = (
      (await new MetricsStore(dir, rewound.runId).read())?.roles ?? []
    ).map((a) => a.roleId);
    expect(roleIds).not.toContain("planner");
    expect(roleIds).not.toContain("architect");
    expect(roleIds).not.toContain("executor");
    expect(roleIds).toContain("reviewer");

    // The restored worktree contains the executor's generated file.
    expect(rewound.state.worktreePath).toBeTruthy();
    const restored = await fs.readFile(
      path.join(rewound.state.worktreePath!, GEN_FILE),
      "utf8",
    );
    expect(restored).toBe(GEN_BODY);
  }, 90_000);
});

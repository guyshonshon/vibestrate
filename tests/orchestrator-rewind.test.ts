import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { Orchestrator } from "../src/core/orchestrator.js";
import { resolveResumeFrom } from "../src/core/run-launcher.js";
import { ArtifactStore } from "../src/core/artifact-store.js";
import { MetricsStore } from "../src/core/metrics-store.js";
import { loadConfig } from "../src/project/config-loader.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

// Fake claude-code provider that emits distinct per-agent outputs and always
// approves/passes, so a full run reaches merge_ready.
async function makeRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "amaco-rewind-"));
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
  let r='# Plan\\nPlan body.';
  if (i.includes('Amaco Agent: reviewer')) r='# Review\\n\\nDECISION: APPROVED';
  else if (i.includes('Amaco Agent: verifier')) r='VERIFICATION: PASSED';
  else if (i.includes('Amaco Agent: architect')) r='# Architecture\\nArch body.';
  else if (i.includes('Amaco Agent: executor')) r='# Implementation\\nDone.';
  else if (i.includes('Amaco Agent: fixer')) r='# Fix\\nDone.';
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
  for (const agent of ["planner", "architect", "executor", "fixer", "reviewer", "verifier"]) {
    await setConfigValue(dir, `roles.${agent}.provider`, "fake");
  }
  return dir;
}

describe("orchestrator rewind (resume from a stage)", () => {
  it("rewind to executing reuses plan + architecture and skips planner/architect", async () => {
    const dir = await makeRepo();
    const loaded = await loadConfig(dir);

    // Source run → merge_ready, producing plan + architecture artifacts.
    const source = await new Orchestrator({
      projectRoot: dir,
      config: loaded.config,
      rules: loaded.rules,
      task: "rewind source",
      isGitRepo: true,
      onProgress: () => {},
    }).run();
    expect(source.state.status).toBe("merge_ready");

    // Rewind to executing — load the seeded artifacts the same way the
    // launcher and CLI do.
    const resumeFrom = await resolveResumeFrom(dir, {
      sourceRunId: source.runId,
      fromStage: "executing",
    });
    const rewound = await new Orchestrator({
      projectRoot: dir,
      config: loaded.config,
      rules: loaded.rules,
      // Distinct task → distinct runId/worktree. (In real use the rewind
      // happens after the source finished, so the timestamp differs anyway.)
      task: "rewind source redo",
      isGitRepo: true,
      onProgress: () => {},
      resumeFrom,
    }).run();

    // A fresh forked run with lineage recorded; original is untouched.
    expect(rewound.runId).not.toBe(source.runId);
    expect(rewound.state.resumedFrom).toEqual({
      sourceRunId: source.runId,
      fromStage: "executing",
    });

    // Planner + architect were NOT invoked (no metrics entries); executor was.
    const metrics = await new MetricsStore(dir, rewound.runId).read();
    const roleIds = (metrics?.roles ?? []).map((a) => a.roleId);
    expect(roleIds).not.toContain("planner");
    expect(roleIds).not.toContain("architect");
    expect(roleIds).toContain("executor");

    // Seeded artifacts copied into the new run.
    const store = new ArtifactStore(dir, rewound.runId);
    expect(await store.read("02-plan.md")).toContain("Plan body.");
    expect(await store.read("04-architecture.md")).toContain("Arch body.");
  }, 60_000);

  it("resolveResumeFrom validates the source run has the needed artifacts", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "amaco-rewind-unit-"));
    const store = new ArtifactStore(dir, "src-run");
    await store.init();
    await store.write("02-plan.md", "# Plan\nseeded");

    // architecting needs only the plan → ok.
    const arch = await resolveResumeFrom(dir, {
      sourceRunId: "src-run",
      fromStage: "architecting",
    });
    expect(arch.seededPlan).toContain("seeded");
    expect(arch.seededArchitecture).toBeNull();

    // executing needs architecture too → throws.
    await expect(
      resolveResumeFrom(dir, { sourceRunId: "src-run", fromStage: "executing" }),
    ).rejects.toThrow(/architecture/i);

    // missing plan entirely → throws.
    await expect(
      resolveResumeFrom(dir, { sourceRunId: "nope", fromStage: "architecting" }),
    ).rejects.toThrow(/plan/i);
  });
});

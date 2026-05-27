import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { Orchestrator, type ResumeStage } from "../src/core/orchestrator.js";
import { resolveResumeFrom, RunLaunchError } from "../src/core/run-launcher.js";
import { ArtifactStore } from "../src/core/artifact-store.js";
import { MetricsStore } from "../src/core/metrics-store.js";
import { loadConfig } from "../src/project/config-loader.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

// Fake claude-code provider that emits distinct per-role outputs and always
// approves/passes, so a full default-flow run reaches merge_ready.
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

async function runFlow(dir: string, task: string, resume?: { sourceRunId: string; fromStage: ResumeStage }) {
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

describe("orchestrator rewind (resume the default flow from a stage)", () => {
  it("rewind to executing reuses plan + architecture and skips planner/architect", async () => {
    const dir = await makeRepo();

    const source = await runFlow(dir, "rewind source executing");
    expect(source.state.status).toBe("merge_ready");

    const rewound = await runFlow(dir, "rewind redo executing", {
      sourceRunId: source.runId,
      fromStage: "executing",
    });

    expect(rewound.runId).not.toBe(source.runId);
    expect(rewound.state.status).toBe("merge_ready");
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

    // The seeded upstream outputs were copied into the new run's flow artifacts.
    const store = new ArtifactStore(dir, rewound.runId);
    expect(await store.read("flows/plan/output.md")).toContain("Plan body.");
    expect(await store.read("flows/architecture/output.md")).toContain("Arch body.");

    // Both upstream steps are marked skipped (resume), not invisible.
    const skipped = (rewound.state.flow?.steps ?? [])
      .filter((s) => s.status === "skipped")
      .map((s) => s.id);
    expect(skipped).toEqual(expect.arrayContaining(["plan", "architecture"]));
  }, 60_000);

  it("rewind to architecting reuses the plan but re-runs the architect", async () => {
    const dir = await makeRepo();
    const source = await runFlow(dir, "rewind source arch");
    expect(source.state.status).toBe("merge_ready");

    const rewound = await runFlow(dir, "rewind redo arch", {
      sourceRunId: source.runId,
      fromStage: "architecting",
    });
    expect(rewound.state.status).toBe("merge_ready");

    const metrics = await new MetricsStore(dir, rewound.runId).read();
    const roleIds = (metrics?.roles ?? []).map((a) => a.roleId);
    expect(roleIds).not.toContain("planner");
    expect(roleIds).toContain("architect");
    expect(roleIds).toContain("executor");
  }, 60_000);

  it("rewind to planning seeds nothing and re-runs every step", async () => {
    const dir = await makeRepo();
    const source = await runFlow(dir, "rewind source planning");
    expect(source.state.status).toBe("merge_ready");

    const rewound = await runFlow(dir, "rewind redo planning", {
      sourceRunId: source.runId,
      fromStage: "planning",
    });
    expect(rewound.state.status).toBe("merge_ready");
    const metrics = await new MetricsStore(dir, rewound.runId).read();
    const roleIds = (metrics?.roles ?? []).map((a) => a.roleId);
    expect(roleIds).toContain("planner");
    expect(roleIds).toContain("architect");
  }, 60_000);

  it("resolveResumeFrom validates the source run exists", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "amaco-rewind-unit-"));
    const store = new ArtifactStore(dir, "src-run");
    await store.init();
    await store.write("00-idea.md", "# Task\n\nseeded");

    const ok = await resolveResumeFrom(dir, {
      sourceRunId: "src-run",
      fromStage: "architecting",
    });
    expect(ok).toEqual({ sourceRunId: "src-run", fromStage: "architecting" });

    await expect(
      resolveResumeFrom(dir, { sourceRunId: "nope", fromStage: "architecting" }),
    ).rejects.toThrow(RunLaunchError);
  });
});

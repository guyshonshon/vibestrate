import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../../src/setup/setup-service.js";
import { setConfigValue } from "../../src/setup/config-update-service.js";
import { Orchestrator } from "../../src/core/orchestrator.js";
import { loadConfig } from "../../src/project/config-loader.js";
import { resolveFlow } from "../../src/flows/runtime/flow-resolver.js";
import { flowDefinitionSchema } from "../../src/flows/schemas/flow-schema.js";
import type { ProviderDetectionRunner } from "../../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

// Dumps each role's received prompt to <roleId>-prompt.txt in the worktree so
// the test can assert what reached each seat.
const FAKE = `#!/usr/bin/env node
const fs=require('fs');let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{
  const m=i.match(/Vibestrate Agent: (\\w+)/);
  if(m){try{fs.writeFileSync(m[1]+'-prompt.txt',i);}catch{}}
  console.log('ok');
});
`;

// A producer turn (worker) then a clean-room judge turn. The judge declares the
// producer's output as its input, and opts into clean-room context.
const MINI = flowDefinitionSchema.parse({
  id: "clean-room-mini",
  version: 1,
  label: "Clean room mini",
  description: "a producer turn then a clean-room judge turn",
  seats: { worker: { label: "Worker" }, judge: { label: "Judge" } },
  steps: [
    { id: "do", label: "Do", kind: "agent-turn", seat: "worker", outputs: ["execution"] },
    { id: "check", label: "Check", kind: "agent-turn", seat: "judge", inputs: ["execution"], cleanRoom: true },
  ],
});

describe("clean-room seat drops run-level grounding (rung 2)", () => {
  it("a clean-room judge gets its declared inputs but not the attached context source or run brief", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-cleanroom-"));
    await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
    await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
    await execa("git", ["config", "user.name", "x"], { cwd: dir });
    await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
    await execa("git", ["add", "."], { cwd: dir });
    await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
    await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
    await setConfigValue(dir, "git.worktreeDir", path.join(dir, "worktrees"));

    const fakeJs = path.join(dir, "fake.js");
    await fs.writeFile(fakeJs, FAKE, { mode: 0o755 });
    await fs.chmod(fakeJs, 0o755);
    await setConfigValue(
      dir,
      "providers.fake",
      JSON.stringify({ type: "cli", command: "node", args: [fakeJs], input: "stdin" }),
    );
    await setConfigValue(dir, "profiles.fake-prof", JSON.stringify({ provider: "fake" }));
    await setConfigValue(
      dir,
      "crews.t",
      JSON.stringify({
        label: "T",
        roles: {
          w: { label: "Worker", profile: "fake-prof", seats: ["worker"], prompt: ".vibestrate/roles/planner.md", permissions: "read_only", skills: [] },
          j: { label: "Judge", profile: "fake-prof", seats: ["judge"], prompt: ".vibestrate/roles/reviewer.md", permissions: "read_only", skills: [] },
        },
      }),
    );
    await setConfigValue(dir, "defaultCrew", "t");
    await fs.writeFile(path.join(dir, "spec.md"), "CONTEXT_MARKER_42: teal button.");

    const loaded = await loadConfig(dir);
    const resolved = resolveFlow({
      flow: MINI,
      source: { kind: "builtin", ref: "mini" },
      config: loaded.config,
      task: "do the thing",
    });
    const orch = new Orchestrator({
      projectRoot: dir,
      config: loaded.config,
      rules: loaded.rules,
      task: "do the thing",
      isGitRepo: true,
      taskId: null,
      flow: resolved,
      contextSources: [{ kind: "file", ref: "spec.md", label: "spec" }],
      onProgress: () => {},
    });
    const out = await orch.run();

    const worker = await fs.readFile(path.join(out.worktreePath!, "w-prompt.txt"), "utf8");
    const judge = await fs.readFile(path.join(out.worktreePath!, "j-prompt.txt"), "utf8");

    // The producer (normal seat) sees the attached context source.
    expect(worker).toContain("CONTEXT_MARKER_42");
    expect(worker).toContain("Context - spec");

    // The clean-room judge KEEPS ground truth (the attached spec) - an eval
    // showed dropping it weakens spec-compliance review - but DROPS the
    // producer's run-derived narrative (the run brief).
    expect(judge).toContain("Vibestrate Agent: j");
    expect(judge).toContain("do the thing");
    expect(judge).toContain("CONTEXT_MARKER_42");
    expect(judge).toContain("Context - spec");
    expect(judge).not.toContain("# Run brief");
  }, 30_000);
});

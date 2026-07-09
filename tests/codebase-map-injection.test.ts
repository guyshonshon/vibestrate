import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { Orchestrator } from "../src/core/orchestrator.js";
import { loadConfig } from "../src/project/config-loader.js";
import { resolveFlow } from "../src/flows/runtime/flow-resolver.js";
import { flowDefinitionSchema } from "../src/flows/schemas/flow-schema.js";
import { writeCodebaseMap } from "../src/project/codebase-map.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

// Dumps the planner's received prompt to planner-prompt.txt in the worktree,
// same idiom as tests/flows/clean-room-context.test.ts.
const FAKE = `#!/usr/bin/env node
const fs=require('fs');let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{
  const m=i.match(/Vibestrate Agent: (\\w+)/);
  if(m){try{fs.writeFileSync(m[1]+'-prompt.txt',i);}catch{}}
  console.log('ok');
});
`;

function singlePlannerStepFlow(cleanRoom: boolean) {
  return flowDefinitionSchema.parse({
    id: "codebase-map-mini",
    version: 1,
    label: "Codebase map mini",
    description: "a single planner turn",
    seats: { planner: { label: "Planner" } },
    steps: [
      {
        id: "go",
        label: "Go",
        kind: "agent-turn",
        seat: "planner",
        outputs: ["execution"],
        cleanRoom,
      },
    ],
  });
}

async function setupProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-codebase-map-"));
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
        planner: {
          label: "Planner",
          profile: "fake-prof",
          seats: ["planner"],
          prompt: ".vibestrate/roles/planner.md",
          permissions: "read_only",
          skills: [],
        },
      },
    }),
  );
  await setConfigValue(dir, "defaultCrew", "t");

  // A real codebase map so `loadCodebaseMap` reports present: true.
  await writeCodebaseMap(dir, new Date().toISOString());

  return dir;
}

async function runSingleStep(dir: string, cleanRoom: boolean) {
  const loaded = await loadConfig(dir);
  const resolved = resolveFlow({
    flow: singlePlannerStepFlow(cleanRoom),
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
    contextSources: [],
    onProgress: () => {},
  });
  const out = await orch.run();
  return fs.readFile(path.join(out.worktreePath!, "planner-prompt.txt"), "utf8");
}

describe("codebase map rides the continuity channel", () => {
  it("a normal planner turn receives the codebase map section", async () => {
    const dir = await setupProject();
    const prompt = await runSingleStep(dir, false);
    expect(prompt).toContain("Codebase map (auto-derived)");
  }, 30_000);

  it("a clean-room planner turn never receives the codebase map section", async () => {
    const dir = await setupProject();
    const prompt = await runSingleStep(dir, true);
    expect(prompt).not.toContain("Codebase map (auto-derived)");
  }, 30_000);
});

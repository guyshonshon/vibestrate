import { describe, it, expect, beforeEach } from "vitest";
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
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

// A fake "codex" CLI: records its argv to ARGV_OUT, prints a minimal response,
// and exits with FAIL's code (0 unless set). Lets us assert the real spawn.
const FAKE = `const fs=require('fs');
fs.writeFileSync(process.env.ARGV_OUT, JSON.stringify(process.argv.slice(2)));
let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{
  process.stdout.write('# Result\\nok\\n');
  process.exit(Number(process.env.FAIL || '0'));
});
`;

const MINI = flowDefinitionSchema.parse({
  id: "mini",
  version: 1,
  label: "Mini",
  description: "one agent turn",
  seats: { worker: { label: "Worker" } },
  steps: [{ id: "do", label: "Do", kind: "agent-turn", seat: "worker" }],
});

async function makeProject(opts: { fail?: boolean } = {}): Promise<{
  dir: string;
  argvOut: string;
}> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-eff-e2e-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });

  const fakeJs = path.join(dir, "fake-codex.js");
  await fs.writeFile(fakeJs, FAKE);
  const argvOut = path.join(dir, "argv.json");

  // A provider named "codex" (so the apply layer adds --model + -c
  // model_reasoning_effort), a profile that sets model+effort, and a crew whose
  // role fills the flow's seat on that profile.
  await setConfigValue(
    dir,
    "providers.codex",
    JSON.stringify({
      type: "cli",
      command: "node",
      args: [fakeJs],
      input: "stdin",
      env: { ARGV_OUT: argvOut, FAIL: opts.fail ? "1" : "0" },
    }),
  );
  await setConfigValue(
    dir,
    "profiles.codex-hi",
    JSON.stringify({ provider: "codex", model: "gpt-5.5", power: "high" }),
  );
  await setConfigValue(
    dir,
    "crews.t",
    JSON.stringify({
      label: "T",
      roles: {
        w: {
          label: "Worker",
          profile: "codex-hi",
          seats: ["worker"],
          prompt: ".vibestrate/roles/planner.md",
          permissions: "read_only",
          skills: [],
        },
      },
    }),
  );
  await setConfigValue(dir, "defaultCrew", "t");
  return { dir, argvOut };
}

async function runMini(dir: string): Promise<void> {
  const loaded = await loadConfig(dir);
  // Unique task -> unique worktree name (the worktree dir is shared under /tmp).
  const task = `probe ${path.basename(dir)}`;
  const resolved = resolveFlow({
    flow: MINI,
    source: { kind: "builtin", ref: "mini" },
    config: loaded.config,
    task,
  });
  const orch = new Orchestrator({
    projectRoot: dir,
    config: loaded.config,
    rules: loaded.rules,
    task,
    isGitRepo: true,
    taskId: null,
    flow: resolved,
    onProgress: () => {},
  });
  await orch.run();
}

describe("effort/model reach the real spawn (end-to-end)", () => {
  let dir: string;
  let argvOut: string;
  beforeEach(async () => {
    ({ dir, argvOut } = await makeProject());
  });

  it("the spawned codex argv carries --model + -c model_reasoning_effort", async () => {
    await runMini(dir);
    const argv = JSON.parse(await fs.readFile(argvOut, "utf8")) as string[];
    // node fake-codex.js <here>; cli-provider appends the apply args after the
    // preset args, before any prompt positional (input is stdin here).
    expect(argv).toEqual([
      "--model",
      "gpt-5.5",
      "-c",
      "model_reasoning_effort=high",
    ]);
  }, 30_000);
});

describe("a failed invocation fails the run honestly", () => {
  it("non-zero provider exit fails the run and writes a provider.failed notification", async () => {
    const { dir } = await makeProject({ fail: true });
    // The run now FAILS honestly instead of continuing with a suspect/empty
    // output - a non-zero provider exit is a real failure, not swallowed.
    await expect(runMini(dir)).rejects.toThrow(/provider exited 1/);
    const notifPath = path.join(dir, ".vibestrate", "notifications", "notifications.json");
    // notify is fire-and-forget; poll briefly for the persisted entry.
    let found = false;
    for (let i = 0; i < 40 && !found; i++) {
      try {
        const raw = await fs.readFile(notifPath, "utf8");
        const parsed = JSON.parse(raw) as {
          notifications?: Array<{ sourceEventType?: string }>;
        };
        found = (parsed.notifications ?? []).some(
          (n) => n.sourceEventType === "provider.failed",
        );
      } catch {
        /* not written yet */
      }
      if (!found) await new Promise((r) => setTimeout(r, 100));
    }
    expect(found).toBe(true);
  }, 30_000);
});

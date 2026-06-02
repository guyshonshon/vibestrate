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
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

const FAKE = `const fs=require('fs');
fs.writeFileSync(process.env.ARGV_OUT, JSON.stringify(process.argv.slice(2)));
let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{
  process.stdout.write('# Result\\nok\\n');
  process.exit(0);
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

// A provider id Vibestrate ships NO built-in spec for. Its model/effort knobs
// exist only because the user declared them in the overlay - so if the spawned
// argv carries them, the overlay genuinely reached the spawn.
const OVERLAY = [
  "cli:",
  "  mycli:",
  "    models: [turbo]",
  "    model: { kind: flag, flag: --model }",
  "    effort:",
  "      levels: [eco, turbo]",
  "      apply: { kind: config, flag: --set, key: reasoning }",
].join("\n");

async function makeProject(): Promise<{ dir: string; argvOut: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-overlay-e2e-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });

  await fs.writeFile(path.join(dir, ".vibestrate", "providers-catalog.yml"), OVERLAY);

  const fakeJs = path.join(dir, "fake-mycli.js");
  await fs.writeFile(fakeJs, FAKE);
  const argvOut = path.join(dir, "argv.json");

  await setConfigValue(
    dir,
    "providers.mycli",
    JSON.stringify({
      type: "cli",
      command: "node",
      args: [fakeJs],
      input: "stdin",
      env: { ARGV_OUT: argvOut },
    }),
  );
  await setConfigValue(
    dir,
    "profiles.mycli-hi",
    JSON.stringify({ provider: "mycli", model: "turbo", power: "turbo" }),
  );
  await setConfigValue(
    dir,
    "crews.t",
    JSON.stringify({
      label: "T",
      roles: {
        w: {
          label: "Worker",
          profile: "mycli-hi",
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

describe("catalog overlay reaches the real spawn (end-to-end)", () => {
  it("a user-declared provider's model/effort apply-spec is applied to argv", async () => {
    const { dir, argvOut } = await makeProject();
    const loaded = await loadConfig(dir);
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

    const argv = JSON.parse(await fs.readFile(argvOut, "utf8")) as string[];
    expect(argv).toEqual(["--model", "turbo", "--set", "reasoning=turbo"]);
  }, 30_000);
});

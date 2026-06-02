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
let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{
  process.stdout.write('# Result\\nok\\n'); process.exit(0);
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

async function makeProject(power: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-eff-warn-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });

  const fakeJs = path.join(dir, "fake-codex.js");
  await fs.writeFile(fakeJs, FAKE);
  await setConfigValue(
    dir,
    "providers.codex",
    JSON.stringify({ type: "cli", command: "node", args: [fakeJs], input: "stdin" }),
  );
  await setConfigValue(
    dir,
    "profiles.codex-x",
    JSON.stringify({ provider: "codex", power }),
  );
  await setConfigValue(
    dir,
    "crews.t",
    JSON.stringify({
      label: "T",
      roles: {
        w: {
          label: "Worker",
          profile: "codex-x",
          seats: ["worker"],
          prompt: ".vibestrate/roles/planner.md",
          permissions: "read_only",
          skills: [],
        },
      },
    }),
  );
  await setConfigValue(dir, "defaultCrew", "t");
  return dir;
}

async function runMiniAndReadEvents(dir: string): Promise<{ type: string; data?: Record<string, unknown> }[]> {
  const loaded = await loadConfig(dir);
  const task = `probe ${path.basename(dir)}`;
  const resolved = resolveFlow({ flow: MINI, source: { kind: "builtin", ref: "mini" }, config: loaded.config, task });
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

  const runsDir = path.join(dir, ".vibestrate", "runs");
  const runIds = await fs.readdir(runsDir);
  const events: { type: string; data?: Record<string, unknown> }[] = [];
  for (const rid of runIds) {
    try {
      const raw = await fs.readFile(path.join(runsDir, rid, "events.ndjson"), "utf8");
      for (const line of raw.trim().split("\n")) if (line) events.push(JSON.parse(line));
    } catch {
      /* no events file for this run dir */
    }
  }
  return events;
}

describe("fail-loud: effort that the provider won't honor", () => {
  it("emits provider.effort_ignored for an invalid effort level", async () => {
    const dir = await makeProject("ultra"); // codex levels are minimal..xhigh
    const events = await runMiniAndReadEvents(dir);
    const ignored = events.filter((e) => e.type === "provider.effort_ignored");
    expect(ignored.length).toBeGreaterThan(0);
    expect(ignored[0]!.data?.effort).toBe("ultra");
    expect(ignored[0]!.data?.validLevels).toContain("high");
  }, 30_000);

  it("stays quiet for a valid effort level", async () => {
    const dir = await makeProject("high"); // valid for codex
    const events = await runMiniAndReadEvents(dir);
    expect(events.filter((e) => e.type === "provider.effort_ignored")).toHaveLength(0);
  }, 30_000);
});

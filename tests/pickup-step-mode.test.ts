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
import { pickupFlow } from "../src/flows/catalog/builtin-flows.js";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";
import { RunStateStore } from "../src/core/state-machine.js";
import { EventLog } from "../src/core/event-log.js";
import { requestResume, canRequestResume } from "../src/core/pause-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

const FAKE = `#!/usr/bin/env node
const fs = require('fs');
let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{
  const m = i.match(/Current checklist item — (\\d+) of/);
  const n = m ? m[1] : 'x';
  if (i.includes('Vibestrate Agent: executor')) {
    fs.writeFileSync('item' + n + '.txt', 'work ' + n + '\\n');
    console.log('# Implementation Summary\\nAdded item' + n + '.txt.');
  } else if (i.includes('Vibestrate Agent: reviewer')) {
    console.log('# Review\\nDECISION: APPROVED');
  } else { console.log('# Plan\\nok'); }
});
`;

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-pstep-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  const fakeJs = path.join(dir, "fake.js");
  await fs.writeFile(fakeJs, FAKE, { mode: 0o755 });
  await fs.chmod(fakeJs, 0o755);
  await setConfigValue(
    dir,
    "providers.fake",
    JSON.stringify({ type: "cli", command: "node", args: [fakeJs], input: "stdin" }),
  );
  await setConfigValue(dir, "profiles.claude-balanced.provider", "fake");
  return dir;
}

describe("pick-up step-by-step mode", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeProject();
  });

  it("pauses at the between-item gate and resumes to completion", async () => {
    const svc = new RoadmapService(dir);
    await svc.init();
    const task = await svc.addTask({ title: "Two things, gated" });
    await svc.addChecklistItem(task.id, "first file");
    await svc.addChecklistItem(task.id, "second file");

    const loaded = await loadConfig(dir);
    const resolved = resolveFlow({
      flow: pickupFlow,
      source: { kind: "builtin", ref: "pickup" },
      config: loaded.config,
      task: task.title,
    });
    const orch = new Orchestrator({
      projectRoot: dir,
      config: loaded.config,
      rules: loaded.rules,
      task: task.title,
      isGitRepo: true,
      taskId: task.id,
      flow: resolved,
      checklistMode: "step",
      onProgress: () => {},
    });

    // Drive the run; auto-resume whenever it parks at a between-item gate.
    const runPromise = orch.run();
    let sawPause = false;
    let store: RunStateStore | null = null;
    const events = new EventLog(dir, "");
    const resumer = setInterval(() => {
      void (async () => {
        try {
          const runs = await fs.readdir(path.join(dir, ".vibestrate", "runs"));
          if (runs.length === 0) return;
          const runId = runs[runs.length - 1]!;
          store = new RunStateStore(dir, runId);
          const st = await store.read();
          if (st.status === "paused" || st.pauseRequested) {
            sawPause = true;
            const ev = new EventLog(dir, runId);
            if (canRequestResume(st)) await requestResume(store, ev);
          }
        } catch {
          /* state mid-write */
        }
      })();
    }, 200);

    const out = await runPromise;
    clearInterval(resumer);
    void events;

    // The gate fired (we observed a pause) and the run still completed.
    expect(sawPause).toBe(true);
    expect(out.state.status).toBe("merge_ready");
    const after = await svc.getTask(task.id);
    expect(after!.checklist.map((c) => c.status)).toEqual(["done", "done"]);
  }, 20000);
});

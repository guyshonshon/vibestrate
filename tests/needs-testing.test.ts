import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { detectNeedsTesting } from "../src/core/review-parser.js";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { Orchestrator } from "../src/core/orchestrator.js";
import { loadConfig } from "../src/project/config-loader.js";
import { resolveFlow } from "../src/flows/runtime/flow-resolver.js";
import { pickupFlow } from "../src/flows/catalog/builtin-flows.js";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

describe("detectNeedsTesting (parser)", () => {
  it("detects the advisory marker + reason", () => {
    const r = detectNeedsTesting(
      "# Review\nDECISION: APPROVED\nHUMAN_REVIEW: ADVISORY\nHUMAN_REVIEW_REASON: check the hover animation",
    );
    expect(r.advisory).toBe(true);
    expect(r.reason).toBe("check the hover animation");
  });
  it("advisory without a reason is still detected", () => {
    const r = detectNeedsTesting("HUMAN_REVIEW: ADVISORY");
    expect(r.advisory).toBe(true);
    expect(r.reason).toBeNull();
  });
  it("absent marker → not advisory", () => {
    expect(detectNeedsTesting("DECISION: APPROVED").advisory).toBe(false);
    expect(detectNeedsTesting("").advisory).toBe(false);
  });
});

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function tempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-nt-"));
}

describe("RoadmapService — needs-testing verdict", () => {
  let dir: string;
  let svc: RoadmapService;
  beforeEach(async () => {
    dir = await tempProject();
    svc = new RoadmapService(dir);
    await svc.init();
  });

  it("flags and clears with a 'pass' verdict → done", async () => {
    const t = await svc.addTask({ title: "x" });
    await svc.flagNeedsTesting(t.id, "look at the layout");
    let reloaded = await svc.getTask(t.id);
    expect(reloaded!.needsTesting).toBe(true);
    expect(reloaded!.needsTestingReason).toBe("look at the layout");
    await svc.resolveNeedsTesting(t.id, "pass");
    reloaded = await svc.getTask(t.id);
    expect(reloaded!.needsTesting).toBe(false);
    expect(reloaded!.needsTestingReason).toBeNull();
    expect(reloaded!.status).toBe("done");
  });

  it("'fail' verdict reopens the task to ready", async () => {
    const t = await svc.addTask({ title: "x" });
    await svc.flagNeedsTesting(t.id, null);
    await svc.resolveNeedsTesting(t.id, "fail");
    const reloaded = await svc.getTask(t.id);
    expect(reloaded!.needsTesting).toBe(false);
    expect(reloaded!.status).toBe("ready");
  });
});

const FAKE = `#!/usr/bin/env node
const fs=require('fs');let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{
  const m=i.match(/Current checklist item — (\\d+) of/);const n=m?m[1]:'x';
  if(i.includes('Vibestrate Agent: executor')){fs.writeFileSync('f'+n+'.txt','x\\n');console.log('# Implementation Summary\\nAdded f'+n+'.txt');}
  else if(i.includes('Vibestrate Agent: reviewer')){console.log('# Review\\nDECISION: APPROVED\\nHUMAN_REVIEW: ADVISORY\\nHUMAN_REVIEW_REASON: eyeball the spacing');}
  else{console.log('# Plan\\nok');}
});
`;

describe("needs-testing advisory propagates from a run to the card", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await tempProject();
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
  });

  it("reaches merge_ready (non-blocking) and flags the task needsTesting", async () => {
    const svc = new RoadmapService(dir);
    await svc.init();
    const task = await svc.addTask({ title: "Tweak the header" });
    await svc.addChecklistItem(task.id, "adjust spacing");

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
      checklistMode: "continuous",
      onProgress: () => {},
    });
    const out = await orch.run();

    // The advisory is non-blocking: the run still reached a terminal success…
    expect(out.state.status).toBe("merge_ready");
    expect(out.state.needsTesting).toEqual({ reason: "eyeball the spacing" });
    // …and the linked card is flagged for human testing.
    const after = await svc.getTask(task.id);
    expect(after!.needsTesting).toBe(true);
    expect(after!.needsTestingReason).toBe("eyeball the spacing");
  });
});

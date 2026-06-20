import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { loadConfig } from "../src/project/config-loader.js";
import { Orchestrator } from "../src/core/orchestrator.js";
import { RoadmapService } from "../src/roadmap/roadmap-service.js";
import { renderTaskGrounding } from "../src/roadmap/task-grounding.js";
import { taskSchema } from "../src/roadmap/roadmap-types.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

// ── P5 acceptance gate ───────────────────────────────────────────────────────
// acceptanceCriteria (prose) become the LLM-judge gate (carried into the brief ->
// the verifier); acceptanceCommands (user-authored) become a machine gate (an
// extra validation pass that caps merge_ready on failure).

const card = (over: Record<string, unknown>) =>
  taskSchema.parse({ id: "card-1", title: "Build login", createdAt: "t", updatedAt: "t", ...over });

describe("acceptanceCriteria -> task grounding (the LLM-judge half)", () => {
  it("carries acceptance criteria into the grounding block", () => {
    const block = renderTaskGrounding(
      card({ acceptanceCriteria: "Users can sign in with email + password." }),
    );
    expect(block).toContain("Acceptance criteria");
    expect(block).toContain("Users can sign in with email + password.");
  });

  it("a card with no criteria adds no acceptance section", () => {
    const block = renderTaskGrounding(card({ description: "just a title card" }));
    expect(block).not.toContain("Acceptance criteria");
  });
});

const noProvider: ProviderDetectionRunner = async () => ({ exitCode: 127, stdout: "", stderr: "" });
const FAKE = `const fs=require('fs');
let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{
  if (i.includes('Vibestrate Agent: reviewer')) process.stdout.write('# Review\\nDECISION: APPROVED\\n');
  else if (i.includes('Vibestrate Agent: verifier')) process.stdout.write('VERIFICATION: PASSED\\n');
  else process.stdout.write('# Result\\nok\\n');
  process.exit(0);
});
`;

describe("acceptanceCommands -> the machine gate", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-p5-"));
    await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
    await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
    await execa("git", ["config", "user.name", "x"], { cwd: dir });
    await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
    await execa("git", ["add", "."], { cwd: dir });
    await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
    await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
    await setConfigValue(dir, "git.worktreeDir", path.join(dir, "worktrees"));
    const fakeJs = path.join(dir, "fake.js");
    await fs.writeFile(fakeJs, FAKE);
    await setConfigValue(dir, "providers.fake", JSON.stringify({ type: "cli", command: "node", args: [fakeJs], input: "stdin" }));
    await setConfigValue(dir, "profiles.claude-balanced.provider", "fake");
    await setConfigValue(dir, "commands.validate", "[]"); // only the acceptance command runs
  });

  it("round-trips acceptanceCommands through add + patch", async () => {
    const svc = new RoadmapService(dir);
    const t = await svc.addTask({ title: "card", acceptanceCommands: ["test -f README.md", " ", "ls"] });
    expect(t.acceptanceCommands).toEqual(["test -f README.md", "ls"]); // trimmed + blanks dropped
    const patched = await svc.patchTask(t.id, { acceptanceCommands: ["exit 0"] });
    expect(patched.acceptanceCommands).toEqual(["exit 0"]);
  });

  it("a FAILING acceptance command fails validation and caps merge_ready", async () => {
    const svc = new RoadmapService(dir);
    const t = await svc.addTask({ title: "must pass acceptance", acceptanceCommands: ["exit 1"] });
    const loaded = await loadConfig(dir);
    const orch = new Orchestrator({
      projectRoot: dir,
      config: loaded.config,
      rules: loaded.rules,
      task: "build the thing",
      isGitRepo: true,
      taskId: t.id,
      onProgress: () => {},
    });
    const out = await orch.run();

    // The acceptance command ran as a validation command and FAILED.
    const flowsDir = path.join(dir, ".vibestrate", "runs", out.runId, "artifacts", "flows");
    let foundFailingAcceptance = false;
    const steps = await fs.readdir(flowsDir).catch(() => [] as string[]);
    for (const s of steps) {
      const raw = await fs
        .readFile(path.join(flowsDir, s, "validation-results.json"), "utf8")
        .catch(() => "");
      if (raw.includes('"exit 1"') && raw.includes('"failed"')) foundFailingAcceptance = true;
    }
    // The acceptance command ran as a validation command and FAILED...
    expect(foundFailingAcceptance).toBe(true);
    // ...and a failed acceptance gate caps the verdict - the run is NOT merge_ready.
    expect(out.state.status).not.toBe("merge_ready");
  }, 60_000);
});

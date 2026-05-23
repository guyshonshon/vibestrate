import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { Orchestrator } from "../../src/core/orchestrator.js";
import { runStateSchema } from "../../src/core/state-machine.js";
import { qualityArbitrationGuide } from "../../src/guides/catalog/builtin-guides.js";
import { resolveGuide } from "../../src/guides/runtime/guide-resolver.js";
import { loadConfig } from "../../src/project/config-loader.js";
import { setConfigValue } from "../../src/setup/config-update-service.js";
import { applySetup } from "../../src/setup/setup-service.js";
import { buildRunReplay } from "../../src/core/run-replay-service.js";
import type { ProviderDetectionRunner } from "../../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeGuideRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "amaco-guides-phase2-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"guide-demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });

  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  const fakeJs = path.join(dir, "fake-guide-provider.js");
  await fs.writeFile(
    fakeJs,
    `#!/usr/bin/env node
let prompt = "";
process.stdin.on("data", (chunk) => prompt += chunk);
process.stdin.on("end", () => {
  if (prompt.includes("Amaco Agent: reviewer")) {
    console.log("# Review\\n\\nDECISION: APPROVED\\n\\nNo blocking findings.");
  } else if (prompt.includes("Amaco Agent: verifier")) {
    console.log("# Decision Summary\\n\\nVERIFICATION: PASSED\\n\\nEvidence checked.");
  } else if (prompt.includes("Amaco Agent: planner")) {
    console.log("# Plan\\n\\nUse persisted Guide outputs.");
  } else if (prompt.includes("Amaco Agent: executor")) {
    console.log("# Implementation Summary\\n\\nNo source change required.");
  } else if (prompt.includes("Amaco Agent: fixer")) {
    console.log("# Challenge Response\\n\\nNo findings require changes.");
  } else {
    console.log("# Unknown Agent");
  }
});
`,
    { mode: 0o755 },
  );
  await fs.chmod(fakeJs, 0o755);
  await setConfigValue(
    dir,
    "providers.fake",
    JSON.stringify({
      type: "cli",
      command: "node",
      args: [fakeJs],
      input: "stdin",
    }),
  );
  for (const agent of [
    "planner",
    "architect",
    "executor",
    "fixer",
    "reviewer",
    "verifier",
  ]) {
    await setConfigValue(dir, `agents.${agent}.provider`, "fake");
  }
  await setConfigValue(
    dir,
    "commands.validate",
    JSON.stringify(['node -e "process.exit(0)"']),
  );
  return dir;
}

describe("Guide Phase 2 sequential runner", () => {
  it("completes Quality Arbitration from persisted stateless step artifacts", async () => {
    const projectRoot = await makeGuideRepo();
    const loaded = await loadConfig(projectRoot);
    const snapshot = resolveGuide({
      guide: qualityArbitrationGuide,
      source: { kind: "builtin", ref: qualityArbitrationGuide.id },
      config: loaded.config,
      task: "Exercise the Phase 2 Guide runner.",
      brief: "Keep each provider turn stateless.",
    });
    const result = await new Orchestrator({
      projectRoot,
      config: loaded.config,
      rules: loaded.rules,
      task: snapshot.task,
      guide: snapshot,
      isGitRepo: true,
      onProgress: () => {},
    }).run();

    expect(result.state.status).toBe("merge_ready");
    const runDir = path.join(projectRoot, ".amaco", "runs", result.runId);
    const state = runStateSchema.parse(
      JSON.parse(await fs.readFile(path.join(runDir, "state.json"), "utf8")),
    );
    expect(state.guide?.guideId).toBe("quality-arbitration");
    expect(state.guide?.currentStepId).toBe("decision-summary");
    expect(state.guide?.steps.map((step) => step.status)).toEqual(
      state.guide?.steps.map(() => "passed"),
    );

    const persistedSnapshot = JSON.parse(
      await fs.readFile(path.join(runDir, "guide.json"), "utf8"),
    ) as { guideId: string; brief: string };
    expect(persistedSnapshot).toMatchObject({
      guideId: "quality-arbitration",
      brief: "Keep each provider turn stateless.",
    });
    await expect(
      fs.readFile(
        path.join(runDir, "artifacts", "guides", "plan", "prompt.md"),
        "utf8",
      ),
    ).resolves.toContain("Guide step: Plan (plan)");
    await expect(
      fs.readFile(
        path.join(
          runDir,
          "artifacts",
          "guides",
          "implementation-review",
          "context-packet.json",
        ),
        "utf8",
      ),
    ).resolves.toContain("validation");
    await expect(
      fs.readFile(
        path.join(
          runDir,
          "artifacts",
          "guides",
          "validation",
          "validation-results.json",
        ),
        "utf8",
      ),
    ).resolves.toContain('"failed": 0');
    await expect(
      fs.readFile(path.join(runDir, "artifacts", "12-final-report.md"), "utf8"),
    ).resolves.toContain("## Verification\n\nPASSED");

    const replay = await buildRunReplay(projectRoot, result.runId);
    expect(replay.guide?.currentStepId).toBe("decision-summary");
    expect(replay.phases.find((phase) => phase.key === "guides")?.eventIndices)
      .not.toHaveLength(0);

    const participants = JSON.parse(
      await fs.readFile(path.join(runDir, "participants.json"), "utf8"),
    ) as {
      participants: {
        slotId: string;
        turns: { contextMode: string }[];
      }[];
    };
    expect(
      participants.participants
        .find((participant) => participant.slotId === "builder")
        ?.turns.map((turn) => turn.contextMode),
    ).toEqual(["stateless", "rehydrated", "rehydrated"]);
    expect(state.guide?.participants.find((p) => p.slotId === "builder"))
      .toMatchObject({
        providerType: "cli",
        sessionReuse: "none",
        lastContextMode: "rehydrated",
      });
    await expect(
      fs.readFile(path.join(runDir, "events.ndjson"), "utf8"),
    ).resolves.toContain('"guide.session.rehydrated"');
  });
});

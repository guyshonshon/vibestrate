import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { Orchestrator } from "../../src/core/orchestrator.js";
import { runStateSchema } from "../../src/core/state-machine.js";
import { qualityArbitrationFlow } from "../../src/flows/catalog/builtin-flows.js";
import { resolveFlow } from "../../src/flows/runtime/flow-resolver.js";
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

async function makeFlowRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-flows-phase2-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"flow-demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });

  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  const fakeJs = path.join(dir, "fake-flow-provider.js");
  await fs.writeFile(
    fakeJs,
    `#!/usr/bin/env node
let prompt = "";
process.stdin.on("data", (chunk) => prompt += chunk);
process.stdin.on("end", () => {
  if (prompt.includes("Vibestrate Agent: reviewer")) {
    console.log("# Review\\n\\nDECISION: APPROVED\\n\\nNo blocking findings.");
  } else if (prompt.includes("Vibestrate Agent: verifier")) {
    console.log("# Decision Summary\\n\\nVERIFICATION: PASSED\\n\\nEvidence checked.");
  } else if (prompt.includes("Vibestrate Agent: planner")) {
    console.log("# Plan\\n\\nUse persisted Flow outputs.");
  } else if (prompt.includes("Vibestrate Agent: executor")) {
    console.log("# Implementation Summary\\n\\nNo source change required.");
  } else if (prompt.includes("Vibestrate Agent: fixer")) {
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
    await setConfigValue(dir, `roles.${agent}.provider`, "fake");
  }
  await setConfigValue(
    dir,
    "commands.validate",
    JSON.stringify(['node -e "process.exit(0)"']),
  );
  return dir;
}

describe("Flow Phase 2 sequential runner", () => {
  it("completes Quality Arbitration from persisted stateless step artifacts", async () => {
    const projectRoot = await makeFlowRepo();
    const loaded = await loadConfig(projectRoot);
    const snapshot = resolveFlow({
      flow: qualityArbitrationFlow,
      source: { kind: "builtin", ref: qualityArbitrationFlow.id },
      config: loaded.config,
      task: "Exercise the Phase 2 Flow runner.",
      brief: "Keep each provider turn stateless.",
    });
    const result = await new Orchestrator({
      projectRoot,
      config: loaded.config,
      rules: loaded.rules,
      task: snapshot.task,
      flow: snapshot,
      isGitRepo: true,
      onProgress: () => {},
    }).run();

    expect(result.state.status).toBe("merge_ready");
    const runDir = path.join(projectRoot, ".vibestrate", "runs", result.runId);
    const state = runStateSchema.parse(
      JSON.parse(await fs.readFile(path.join(runDir, "state.json"), "utf8")),
    );
    expect(state.flow?.flowId).toBe("quality-arbitration");
    expect(state.flow?.currentStepId).toBe("decision-summary");
    expect(state.flow?.steps.map((step) => step.status)).toEqual(
      state.flow?.steps.map(() => "passed"),
    );

    const persistedSnapshot = JSON.parse(
      await fs.readFile(path.join(runDir, "flow.json"), "utf8"),
    ) as { flowId: string; brief: string };
    expect(persistedSnapshot).toMatchObject({
      flowId: "quality-arbitration",
      brief: "Keep each provider turn stateless.",
    });
    await expect(
      fs.readFile(
        path.join(runDir, "artifacts", "flows", "plan", "prompt.md"),
        "utf8",
      ),
    ).resolves.toContain("Flow step: Plan (plan)");
    await expect(
      fs.readFile(
        path.join(
          runDir,
          "artifacts",
          "flows",
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
          "flows",
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
    expect(replay.flow?.currentStepId).toBe("decision-summary");
    expect(replay.phases.find((phase) => phase.key === "flows")?.eventIndices)
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
    expect(state.flow?.participants.find((p) => p.seat === "builder"))
      .toMatchObject({
        providerType: "cli",
        sessionReuse: "none",
        lastContextMode: "rehydrated",
      });
    await expect(
      fs.readFile(path.join(runDir, "events.ndjson"), "utf8"),
    ).resolves.toContain('"flow.session.rehydrated"');
  });
});

import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execa } from "execa";
import { Orchestrator } from "../../src/core/orchestrator.js";
import { qualityArbitrationGuide } from "../../src/guides/catalog/builtin-guides.js";
import { resolveGuide } from "../../src/guides/runtime/guide-resolver.js";
import { loadConfig } from "../../src/project/config-loader.js";
import { applySetup } from "../../src/setup/setup-service.js";
import { setConfigValue } from "../../src/setup/config-update-service.js";
import type { ProviderDetectionRunner } from "../../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeClaudeGuideRepo(): Promise<{
  projectRoot: string;
  argvLog: string;
}> {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "amaco-guides-phase3-"),
  );
  await execa("git", ["init", "-q", "-b", "main"], { cwd: projectRoot });
  await execa("git", ["config", "user.email", "x@x"], { cwd: projectRoot });
  await execa("git", ["config", "user.name", "x"], { cwd: projectRoot });
  await fs.writeFile(
    path.join(projectRoot, "package.json"),
    '{"name":"guide-session-demo"}',
  );
  await execa("git", ["add", "."], { cwd: projectRoot });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: projectRoot });
  await applySetup({
    options: { projectRoot },
    detectionRunner: noProvider,
  });

  const argvLog = path.join(projectRoot, "claude-argv.ndjson");
  const fakeClaude = path.join(projectRoot, "fake-claude.js");
  await fs.writeFile(
    fakeClaude,
    `#!/usr/bin/env node
const fs = require("node:fs");
const argv = process.argv.slice(2);
fs.appendFileSync(process.env.AMACO_TEST_ARGV_LOG, JSON.stringify(argv) + "\\n");
const flagValue = (flag) => {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
};
const sessionId = flagValue("--resume") || flagValue("--session-id") || "no-session";
let prompt = "";
process.stdin.on("data", (chunk) => prompt += chunk);
process.stdin.on("end", () => {
  let response = "";
  if (prompt.includes("Amaco Agent: reviewer")) {
    response = "# Review\\n\\nDECISION: APPROVED\\n\\nNo blocking findings.";
  } else if (prompt.includes("Amaco Agent: verifier")) {
    response = "# Decision Summary\\n\\nVERIFICATION: PASSED\\n\\nEvidence checked.";
  } else if (prompt.includes("Amaco Agent: planner")) {
    response = "# Plan\\n\\nReuse the builder context.";
  } else if (prompt.includes("Amaco Agent: executor")) {
    response = "# Implementation Summary\\n\\nBuilder kept its session.";
  } else if (prompt.includes("Amaco Agent: fixer")) {
    response = "# Challenge Response\\n\\nBuilder answered findings.";
  }
  // Real claude stream-json puts the answer in the result event's \`result\`.
  console.log(JSON.stringify({
    type: "result",
    result: response,
    session_id: sessionId,
    model: "fake-claude",
    total_cost_usd: 0.001,
    usage: { input_tokens: 4, output_tokens: 2 }
  }));
});
`,
    { mode: 0o755 },
  );
  await fs.chmod(fakeClaude, 0o755);
  await setConfigValue(
    projectRoot,
    "providers.fake-claude",
    JSON.stringify({
      type: "claude-code",
      command: "node",
      args: [fakeClaude],
      input: "stdin",
      env: { AMACO_TEST_ARGV_LOG: argvLog },
      settings: { outputFormat: "stream-json" },
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
    await setConfigValue(projectRoot, `agents.${agent}.provider`, "fake-claude");
  }
  await setConfigValue(
    projectRoot,
    "commands.validate",
    JSON.stringify(['node -e "process.exit(0)"']),
  );
  return { projectRoot, argvLog };
}

describe("Guide Phase 3 participant sessions", () => {
  it("opens and resumes distinct Claude Code sessions by Guide slot", async () => {
    const { projectRoot, argvLog } = await makeClaudeGuideRepo();
    const loaded = await loadConfig(projectRoot);
    const snapshot = resolveGuide({
      guide: qualityArbitrationGuide,
      source: { kind: "builtin", ref: qualityArbitrationGuide.id },
      config: loaded.config,
      task: "Exercise Guide participant sessions.",
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
    const ledger = JSON.parse(
      await fs.readFile(path.join(runDir, "participants.json"), "utf8"),
    ) as {
      participants: {
        slotId: string;
        sessionId: string | null;
        turns: { contextMode: string; sessionId: string | null }[];
      }[];
    };
    const builder = ledger.participants.find(
      (participant) => participant.slotId === "builder",
    );
    const challenger = ledger.participants.find(
      (participant) => participant.slotId === "challenger",
    );
    expect(builder?.turns.map((turn) => turn.contextMode)).toEqual([
      "opened",
      "reused",
      "reused",
    ]);
    expect(challenger?.turns.map((turn) => turn.contextMode)).toEqual([
      "opened",
      "reused",
      "reused",
    ]);
    expect(builder?.sessionId).toBeTruthy();
    expect(challenger?.sessionId).toBeTruthy();
    expect(builder?.sessionId).not.toBe(challenger?.sessionId);

    const argvRows = (await fs.readFile(argvLog, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as string[]);
    expect(argvRows.some((args) => args.includes("--session-id"))).toBe(true);
    expect(argvRows.filter((args) => args.includes("--resume")).length).toBe(4);
    expect(result.state.guide?.participants.find((p) => p.slotId === "builder"))
      .toMatchObject({
        providerType: "claude-code",
        sessionReuse: "resume",
        lastContextMode: "reused",
      });
  });
});

import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { runConsult } from "../src/consult/consult.js";
import type { AssistProviderRunner } from "../src/assist/assist-runner.js";
import type { ProviderRunInput } from "../src/providers/provider-types.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-viewctx-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  return dir;
}

function capturingRunner(json: string, sink: { prompt: string }): AssistProviderRunner {
  return async (_p, input: ProviderRunInput) => {
    sink.prompt = input.prompt;
    return { exitCode: 0, normalized: { responseText: json, metrics: null } };
  };
}

const okAnswer = JSON.stringify({
  answer: "x",
  confidence: "low",
  caveats: [],
  usedContext: [],
  recommendedActions: [],
  proposedManualUpdate: null,
});

describe("consult screen-aware viewContext", () => {
  it("injects the screen snapshot but REDACTS secrets in it", async () => {
    const root = await makeProject();
    const sink = { prompt: "" };
    await runConsult({
      projectRoot: root,
      question: "what should I put for auth?",
      viewContext: {
        screen: "Spec-up questions",
        details: "focused field: accounts. note: my key is AKIAIOSFODNN7EXAMPLE",
      },
      runner: capturingRunner(okAnswer, sink),
    });
    expect(sink.prompt).toContain("Spec-up questions"); // screen label reached the model
    expect(sink.prompt).toContain("accounts"); // typed state reached the model
    expect(sink.prompt).not.toContain("AKIAIOSFODNN7EXAMPLE"); // secret scrubbed
    expect(sink.prompt).toContain("REDACTED");
  });

  it("works exactly as before when no viewContext is passed", async () => {
    const root = await makeProject();
    const sink = { prompt: "" };
    const res = await runConsult({
      projectRoot: root,
      question: "hello?",
      runner: capturingRunner(okAnswer, sink),
    });
    expect(res.answer.answer).toBe("x");
    expect(sink.prompt).not.toContain("Current screen");
  });
});

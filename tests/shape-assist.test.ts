import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { ArtifactStore } from "../src/core/artifact-store.js";
import { FLOW_QUESTIONS_CONTRACT } from "../src/flows/schemas/flow-output-contracts.js";
import type { AssistProviderRunner } from "../src/assist/assist-runner.js";
import type { ProviderRunInput } from "../src/providers/provider-types.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";
import {
  shapeSimplify,
  shapeSuggest,
  shapeSuggestAll,
} from "../src/shape/shape-assist.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-shapeassist-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  return dir;
}

function cannedRunner(json: string): AssistProviderRunner {
  return async () => ({
    exitCode: 0,
    normalized: { responseText: json, metrics: null },
  });
}

/** Captures the prompt the provider would have seen, then replays a canned JSON. */
function capturingRunner(
  json: string,
  sink: { prompt: string },
): AssistProviderRunner {
  return async (_providers, input: ProviderRunInput) => {
    sink.prompt = input.prompt;
    return { exitCode: 0, normalized: { responseText: json, metrics: null } };
  };
}

const Q = [
  { id: "accounts", question: "Do users sign in?", why: "auth", kind: "choice" as const, options: ["yes", "no"], category: "users" },
  { id: "catalog", question: "Where do products come from?", why: "data", kind: "text" as const, options: [], category: "data" },
];

async function seedRun(root: string, runId: string, answersDoc?: string) {
  const store = new ArtifactStore(root, runId);
  await store.init();
  await store.write("00-idea.md", "Build a mini ecommerce store");
  await store.writeJson("flows/intake/questions.json", {
    contract: FLOW_QUESTIONS_CONTRACT,
    stepId: "intake",
    questions: Q,
  });
  if (answersDoc !== undefined) await store.write("spec-up-answers.md", answersDoc);
}

describe("shapeSimplify", () => {
  let root: string;
  beforeEach(async () => {
    root = await makeProject();
  });

  it("returns a plain-language explanation + what it affects", async () => {
    await seedRun(root, "brave-otter");
    const out = await shapeSimplify({
      projectRoot: root,
      sourceRunId: "brave-otter",
      questionId: "accounts",
      runner: cannedRunner(
        JSON.stringify({ text: "Whether people log in.", affects: "Adds an auth system.", analogy: "" }),
      ),
    });
    expect(out.text).toContain("log in");
    expect(out.affects).toContain("auth");
  });

  it("includes an analogy when asked to explain for a non-developer", async () => {
    await seedRun(root, "brave-otter");
    const out = await shapeSimplify({
      projectRoot: root,
      sourceRunId: "brave-otter",
      questionId: "accounts",
      forNonDeveloper: true,
      runner: cannedRunner(
        JSON.stringify({ text: "x", affects: "y", analogy: "Like a key to a locker." }),
      ),
    });
    expect(out.analogy).toContain("locker");
  });
});

describe("shapeSuggest (draft-only, grounded)", () => {
  let root: string;
  beforeEach(async () => {
    root = await makeProject();
  });

  it("returns a draft value + a grounded why (no submit side-effect)", async () => {
    await seedRun(root, "brave-otter", "# answers\n## Round 1\nB2C for teens\n");
    const out = await shapeSuggest({
      projectRoot: root,
      sourceRunId: "brave-otter",
      questionId: "accounts",
      runner: cannedRunner(
        JSON.stringify({ suggestedValue: "Social login", why: "teens expect frictionless sign-in" }),
      ),
    });
    expect(out.suggestedValue).toBe("Social login");
    expect(out.why).toContain("teens");
  });

  it("REDACTS secrets in prior answers before they reach the model (BLOCKER #1)", async () => {
    const secret = "AKIAIOSFODNN7EXAMPLE";
    await seedRun(root, "brave-otter", `# answers\n## Round 1\nmy aws key is ${secret}\n`);
    const sink = { prompt: "" };
    await shapeSuggest({
      projectRoot: root,
      sourceRunId: "brave-otter",
      questionId: "accounts",
      runner: capturingRunner(
        JSON.stringify({ suggestedValue: "x", why: "y" }),
        sink,
      ),
    });
    expect(sink.prompt).not.toContain(secret);
    expect(sink.prompt).toContain("REDACTED");
    // the question itself still reaches the model
    expect(sink.prompt).toContain("sign in");
  });
});

describe("shapeSuggestAll", () => {
  let root: string;
  beforeEach(async () => {
    root = await makeProject();
  });

  it("returns one grounded draft per requested blank", async () => {
    await seedRun(root, "brave-otter");
    const out = await shapeSuggestAll({
      projectRoot: root,
      sourceRunId: "brave-otter",
      questionIds: ["accounts", "catalog"],
      runner: cannedRunner(
        JSON.stringify({
          items: [
            { questionId: "accounts", suggestedValue: "Social", why: "a" },
            { questionId: "catalog", suggestedValue: "Shopify", why: "b" },
          ],
        }),
      ),
    });
    expect(out.items.map((i) => i.questionId)).toEqual(["accounts", "catalog"]);
  });
});

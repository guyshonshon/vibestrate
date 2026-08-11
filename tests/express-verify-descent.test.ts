// The diff-floored VERIFY gate: `skipWhen: "inert_diff"` on a summary-turn.
//
// The sizer that routes a task to express works from task text and can be
// wrong. The diff cannot. So express checks a code change twice - review AND
// verify - no matter what anything believed about the task going in, while a
// genuine prose tweak still costs one turn.
//
// The load-bearing invariant here is the last test: a skipped VERIFY must not
// record review-skip evidence. `state.reviewSkipped` is what lets
// merge-readiness treat the review requirement as satisfied with no reviewer,
// and a verify step has no standing to satisfy it. Get that wrong and a flow
// with a diff-floored verify but no review step reaches merge_ready having
// checked nothing.

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
import {
  flowDefinitionSchema,
  type FlowDefinition,
} from "../src/flows/schemas/flow-schema.js";
import { expressFlow } from "../src/flows/catalog/builtin-flows.js";
import { computeMergeReady } from "../src/core/run/merge-readiness.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

const okBase = {
  id: "t",
  version: 1,
  label: "T",
  description: "test flow",
  seats: {
    implementer: { label: "I" },
    reviewer: { label: "R" },
    verifier: { label: "V" },
  },
};

describe("skipWhen on a summary-turn", () => {
  it("a summary-turn may carry skipWhen (the diff-floored verify gate)", () => {
    const r = flowDefinitionSchema.safeParse({
      ...okBase,
      steps: [
        { id: "impl", label: "I", kind: "agent-turn", seat: "implementer" },
        {
          id: "verify",
          label: "V",
          kind: "summary-turn",
          seat: "verifier",
          skipWhen: "inert_diff",
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  // The exclusion that keeps the gate honest: a step whose own output forms the
  // diff can never be skipped on the strength of that diff.
  it.each(["agent-turn", "response-turn"])(
    "a %s still cannot carry skipWhen (its output IS the diff)",
    (kind) => {
      const r = flowDefinitionSchema.safeParse({
        ...okBase,
        steps: [
          {
            id: "a",
            label: "A",
            kind,
            seat: "implementer",
            skipWhen: "inert_diff",
          },
        ],
      });
      expect(r.success).toBe(false);
      expect(JSON.stringify(r.error?.issues)).toContain(
        "review-turn / summary-turn steps only",
      );
    },
  );

  it("the other skipWhen constraints still bind a summary-turn", () => {
    // Inside the adaptive loop body.
    expect(
      flowDefinitionSchema.safeParse({
        ...okBase,
        steps: [
          { id: "impl", label: "I", kind: "agent-turn", seat: "implementer" },
          { id: "review", label: "R", kind: "review-turn", seat: "reviewer" },
          {
            id: "verify",
            label: "V",
            kind: "summary-turn",
            seat: "verifier",
            skipWhen: "inert_diff",
          },
        ],
        loop: {
          from: "review",
          to: "verify",
          decisionStep: "review",
          maxIterations: 2,
        },
      }).success,
    ).toBe(false);
    // Graph flow (any `needs`).
    expect(
      flowDefinitionSchema.safeParse({
        ...okBase,
        steps: [
          { id: "impl", label: "I", kind: "agent-turn", seat: "implementer" },
          {
            id: "verify",
            label: "V",
            kind: "summary-turn",
            seat: "verifier",
            needs: ["impl"],
            skipWhen: "inert_diff",
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("the express flow's back gates", () => {
  it("carries a diff-floored verify alongside the diff-floored review", () => {
    const verify = expressFlow.steps.find((s) => s.id === "verify");
    expect(verify?.kind).toBe("summary-turn");
    expect(verify?.skipWhen).toBe("inert_diff");
    expect(verify?.outputs).toContain("verification");
    expect(expressFlow.seats.verifier).toBeDefined();
  });

  it("both back gates are diff-floored, and no producing step is", () => {
    const skippable = expressFlow.steps
      .filter((s) => s.skipWhen === "inert_diff")
      .map((s) => s.id);
    expect(skippable).toEqual(["review", "verify"]);
  });
});

describe("merge-readiness with a verify that ran", () => {
  const base = {
    readOnly: false,
    reviewDecision: "APPROVED" as const,
    hasReviewStep: true,
    reviewTurnRan: true,
    reviewSkipEvidence: null,
    validationPassed: true,
  };

  it("a code change in express now needs the verification to PASS", () => {
    expect(
      computeMergeReady({
        ...base,
        verified: true,
        verificationDecision: "PASSED",
      }),
    ).toBe(true);
    // The tightening: before the verify step existed, an approved review plus
    // passing validation was the whole bar for express.
    expect(
      computeMergeReady({
        ...base,
        verified: true,
        verificationDecision: "NEEDS_HUMAN",
      }),
    ).toBe(false);
  });

  it("a SKIPPED verify produces no artifact, so it cannot block a prose run", () => {
    expect(
      computeMergeReady({
        ...base,
        reviewTurnRan: false,
        reviewSkipEvidence: { stepId: "review", files: ["README.md"] },
        verified: false,
        verificationDecision: "NEEDS_HUMAN",
      }),
    ).toBe(true);
  });
});

// ── The invariant that needs a real run ──────────────────────────────────────
// A flow with a diff-floored VERIFY and NO review step at all. On a prose-only
// change the verify skips. If that skip wrongly recorded review evidence,
// `isReviewSatisfied` would return true on a run where nothing was ever
// reviewed, and `state.reviewSkipped` would name a review that does not exist.

const FAKE = `#!/usr/bin/env node
const fs = require('node:fs');
let inp = '';
process.stdin.on('data', (c) => (inp += c));
process.stdin.on('end', () => {
  const sm = inp.match(/Flow step:.*\\(([\\w-]+)\\)/);
  const id = sm ? sm[1] : '';
  if (id === 'implement') {
    fs.appendFileSync('NOTES.md', 'a prose line\\n');
    console.log('# Implementation Summary\\nEdited the notes.');
    return;
  }
  console.log('ok');
});
`;

const verifyOnlyFlow: FlowDefinition = flowDefinitionSchema.parse({
  id: "verify-only",
  version: 1,
  label: "Verify only",
  description: "One implementer turn and a diff-floored verify. No reviewer.",
  seats: {
    implementer: { label: "Implementer" },
    verifier: { label: "Verifier" },
  },
  steps: [
    {
      id: "implement",
      label: "Implement",
      kind: "agent-turn",
      seat: "implementer",
      stage: "executing",
      inputs: ["task-brief"],
      outputs: ["execution", "diff"],
      skipWhenReadOnly: true,
    },
    {
      id: "verify",
      label: "Verify",
      kind: "summary-turn",
      seat: "verifier",
      stage: "verifying",
      inputs: ["task-brief", "execution"],
      outputs: ["verification"],
      skipWhenReadOnly: true,
      skipWhen: "inert_diff",
    },
  ],
});

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-verify-skip-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await fs.writeFile(path.join(dir, "NOTES.md"), "# notes\n");
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  const fakeJs = path.join(dir, "fake.js");
  await fs.writeFile(fakeJs, FAKE, { mode: 0o755 });
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
  await setConfigValue(dir, "profiles.claude-balanced.provider", "fake");
  return dir;
}

describe("a skipped verify records no review evidence", () => {
  it("skips the verify on an inert diff without claiming a review was skipped", async () => {
    const dir = await makeProject();
    const loaded = await loadConfig(dir);
    const task = "tweak the notes";
    const orch = new Orchestrator({
      projectRoot: dir,
      config: loaded.config,
      rules: loaded.rules,
      task,
      isGitRepo: true,
      flow: resolveFlow({
        flow: verifyOnlyFlow,
        source: { kind: "builtin", ref: "verify-only" },
        config: loaded.config,
        task,
      }),
      onProgress: () => {},
    });
    const out = await orch.run();

    // The verify really did skip on diff evidence (a prose-only change).
    const verifyStep = out.state.flow?.steps.find((s) => s.id === "verify");
    expect(verifyStep?.status).toBe("skipped");

    // ...and it did NOT masquerade as a skipped review. This is the assertion
    // that fails if the skip branch stops discriminating on step kind.
    expect(out.state.reviewSkipped).toBeNull();
  }, 60_000);
});

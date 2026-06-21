import { describe, it, expect, beforeEach, vi } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { ArtifactStore } from "../src/core/artifact-store.js";
import { FLOW_QUESTIONS_CONTRACT } from "../src/flows/schemas/flow-output-contracts.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

// ── Deep-questioning loop, end to end ────────────────────────────────────────
// Capture the launched RunSpec instead of spawning (same pattern as the P1 e2e),
// then drive submitSpecUpAnswers across staged rounds and assert the chain
// behaves: gap-check vs finalize branch, server-owned round increment + cap,
// chain-root accumulation, and - the reviewer's load-bearing case - the chosen
// build flow SURVIVES every inserted round.

const captured = vi.hoisted(() => ({ specs: [] as any[] }));
vi.mock("../src/core/detached-run.js", () => ({
  startDetachedRun: vi.fn(async ({ spec }: { spec: unknown }) => {
    captured.specs.push(spec);
    return 4242;
  }),
}));

const { submitSpecUpAnswers, proceedToSpecUpSpec } = await import("../src/spec-up/spec-up-chain.js");

const noProvider: ProviderDetectionRunner = async () => ({ exitCode: 127, stdout: "", stderr: "" });

const q = (id: string, category: string) => ({
  id,
  question: `Q ${id}?`,
  why: `why ${id}`,
  kind: "text" as const,
  options: [] as string[],
  category,
});

let dir: string;

/** Stage a run's artifacts exactly as the orchestrator would write them at start. */
async function stageRound(
  runId: string,
  opts: { round: number; rootRunId: string; targetFlowId?: string; questions: ReturnType<typeof q>[] },
) {
  const store = new ArtifactStore(dir, runId);
  await store.init();
  await store.write("00-idea.md", "# Task\n\nmake a mini e-commerce\n");
  await store.writeJson("flows/intake/questions.json", {
    contract: FLOW_QUESTIONS_CONTRACT,
    stepId: "intake",
    questions: opts.questions,
  });
  await store.writeJson("spec-up-round.json", { round: opts.round });
  await store.writeJson("spec-up-root-run.json", { rootRunId: opts.rootRunId });
  if (opts.targetFlowId) await store.writeJson("spec-up-target-flow.json", { flowId: opts.targetFlowId });
}

beforeEach(async () => {
  captured.specs.length = 0;
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-deeploop-e2e-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
});

describe("deep-questioning loop e2e", () => {
  it("round 1 answer launches a gap-check round carrying round+root+target forward", async () => {
    await stageRound("round-1", { round: 1, rootRunId: "round-1", targetFlowId: "default", questions: [q("accounts", "users")] });
    const r = await submitSpecUpAnswers({ projectRoot: dir, sourceRunId: "round-1", answers: [{ id: "accounts", answer: "social" }] });
    expect(r.action).toBe("gap-check");
    const spec = captured.specs.at(-1);
    expect(spec.flow.id).toBe("spec-up-intake"); // another intake = the gap-check
    expect(spec.specUpRound).toBe(2); // server-incremented
    expect(spec.specUpRootRunId).toBe("round-1"); // chain root carried
    expect(spec.specUpTargetFlowId).toBe("default"); // chosen flow re-threaded
    // accumulated answers landed on the chain root
    const doc = await new ArtifactStore(dir, "round-1").read("spec-up-answers.md");
    expect(doc).toContain("social");
    expect(doc).toContain("Round 1");
  });

  it("finalizes at the round-4 cap (the spec-up flow, not a 5th gap-check)", async () => {
    await stageRound("round-4", { round: 4, rootRunId: "root-x", targetFlowId: "express", questions: [q("scale", "constraints")] });
    const r = await submitSpecUpAnswers({ projectRoot: dir, sourceRunId: "round-4", answers: [{ id: "scale", answer: "small" }] });
    expect(r.action).toBe("finalize");
    const spec = captured.specs.at(-1);
    expect(spec.flow.id).toBe("spec-up"); // the spec-up flow, NOT spec-up-intake
    expect(spec.specUpTargetFlowId).toBe("express"); // target survives the whole loop
  });

  it("'proceed' finalizes early, mid-loop", async () => {
    await stageRound("round-2", { round: 2, rootRunId: "round-2", targetFlowId: "default", questions: [q("a", "scope")] });
    const r = await submitSpecUpAnswers({ projectRoot: dir, sourceRunId: "round-2", answers: [{ id: "a", answer: "yes" }], proceed: true });
    expect(r.action).toBe("finalize");
    expect(captured.specs.at(-1).flow.id).toBe("spec-up");
  });

  it("accumulates answers across rounds onto the chain root", async () => {
    await stageRound("acc", { round: 1, rootRunId: "acc", targetFlowId: "default", questions: [q("accounts", "users")] });
    await submitSpecUpAnswers({ projectRoot: dir, sourceRunId: "acc", answers: [{ id: "accounts", answer: "sociallogin-r1" }] });
    // The gap-check round carries root = "acc"; answering it appends to the same doc.
    await stageRound("acc-r2", { round: 2, rootRunId: "acc", targetFlowId: "default", questions: [q("catalog", "data")] });
    await submitSpecUpAnswers({ projectRoot: dir, sourceRunId: "acc-r2", answers: [{ id: "catalog", answer: "shopify-r2" }] });
    const doc = await new ArtifactStore(dir, "acc").read("spec-up-answers.md");
    expect(doc).toContain("sociallogin-r1");
    expect(doc).toContain("shopify-r2");
    expect(doc).toContain("Round 1");
    expect(doc).toContain("Round 2");
  });

  it("proceedToSpecUpSpec finalizes from accumulated answers with no new input", async () => {
    // Seed an accumulated answers doc on the root, then a coverage-complete run.
    const rootStore = new ArtifactStore(dir, "cc-root");
    await rootStore.init();
    await rootStore.write("spec-up-answers.md", "# answers\n## Round 1\nB2C\n");
    await stageRound("cc-done", { round: 2, rootRunId: "cc-root", targetFlowId: "default", questions: [] });
    const r = await proceedToSpecUpSpec({ projectRoot: dir, sourceRunId: "cc-done" });
    expect(r.runId).toBeTruthy();
    const spec = captured.specs.at(-1);
    expect(spec.flow.id).toBe("spec-up");
    expect(spec.specUpTargetFlowId).toBe("default");
  });
});

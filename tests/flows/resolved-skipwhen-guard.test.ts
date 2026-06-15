import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../../src/setup/setup-service.js";
import { loadConfig } from "../../src/project/config-loader.js";
import { resolveFlow } from "../../src/flows/runtime/flow-resolver.js";
import { resolvedFlowSnapshotSchema } from "../../src/flows/schemas/flow-schema.js";
import { expressFlow } from "../../src/flows/catalog/builtin-flows.js";
import type { ProviderDetectionRunner } from "../../src/providers/provider-detection.js";

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function resolvedExpress() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-skipwhen-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  const loaded = await loadConfig(dir);
  const snapshot = resolveFlow({
    flow: expressFlow,
    source: { kind: "builtin", ref: "express" },
    config: loaded.config,
    task: "guard the resolved snapshot",
  });
  await fs.rm(dir, { recursive: true, force: true });
  return snapshot;
}

// ISSUE-003: the skipWhen constraints are re-asserted on the RESOLVED snapshot,
// not just the authored definition, so a hand-crafted snapshot can't slip a
// skipWhen past them if a future code path ever feeds one straight in.
describe("resolved snapshot re-asserts skipWhen constraints (ISSUE-003)", () => {
  it("the express builtin resolves to a snapshot that carries a valid skipWhen review", async () => {
    const snap = await resolvedExpress();
    const review = snap.steps.find((s) => s.skipWhen === "inert_diff");
    expect(review).toBeTruthy();
    expect(review!.kind).toBe("review-turn");
    // A clean round-trip through the resolved schema still parses.
    expect(resolvedFlowSnapshotSchema.safeParse(snap).success).toBe(true);
  });

  it("rejects a tampered snapshot whose skipWhen step is no longer a review-turn", async () => {
    const snap = await resolvedExpress();
    const tampered = JSON.parse(JSON.stringify(snap));
    const step = tampered.steps.find(
      (s: { skipWhen: string | null }) => s.skipWhen === "inert_diff",
    );
    step.kind = "agent-turn"; // keep skipWhen, break the review-turn-only rule
    expect(resolvedFlowSnapshotSchema.safeParse(tampered).success).toBe(false);
  });

  it("rejects a tampered snapshot that adds `needs` (graph) under a skipWhen step", async () => {
    const snap = await resolvedExpress();
    const tampered = JSON.parse(JSON.stringify(snap));
    const review = tampered.steps.find(
      (s: { skipWhen: string | null }) => s.skipWhen === "inert_diff",
    );
    const other = tampered.steps.find(
      (s: { id: string }) => s.id !== review.id,
    );
    review.needs = [other.id]; // skipWhen is linear-only
    expect(resolvedFlowSnapshotSchema.safeParse(tampered).success).toBe(false);
  });
});

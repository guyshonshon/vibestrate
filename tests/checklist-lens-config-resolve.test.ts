import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { applySetup } from "../src/setup/setup-service.js";
import { loadConfig } from "../src/project/config-loader.js";
import { resolveFlow } from "../src/flows/runtime/flow-resolver.js";
import { getCrew } from "../src/agents/crew-registry.js";
import { pickupReviewFlow } from "../src/flows/catalog/builtin-flows.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const claudeOk: ProviderDetectionRunner = async (cmd) =>
  cmd === "claude"
    ? { exitCode: 0, stdout: "Claude Code 2.1.0", stderr: "" }
    : { exitCode: 127, stdout: "", stderr: "" };

async function initedProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-lenscfg-"));
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "demo", scripts: { test: "vitest" } }),
  );
  await fs.writeFile(path.join(root, "pnpm-lock.yaml"), "");
  await applySetup({ options: { projectRoot: root }, detectionRunner: claudeOk });
  return root;
}

/** The resolved snapshot is what the runner executes - so a lens override is
 *  only real if it reaches the snapshot's band reviewer steps. Asserting the
 *  pure helper alone would pass even if resolveFlow never called it. */
function bandReviewerIds(snapshot: { steps: { id: string; kind: string; needs?: string[] }[] }): string[] {
  return snapshot.steps
    .filter((s) => s.kind === "review-turn" && s.id !== "review" && s.id !== "arbiter")
    .map((s) => s.id);
}

describe("checklistReview.lenses reaches the resolved per-item band", () => {
  let root: string;
  beforeEach(async () => {
    root = await initedProject();
  });

  it("default lenses resolve to correctness + security-risk reviewers", async () => {
    const { config } = await loadConfig(root);
    const snap = resolveFlow({
      flow: pickupReviewFlow,
      source: { kind: "builtin", ref: pickupReviewFlow.id },
      config,
      task: "t",
    });
    expect(bandReviewerIds(snap)).toEqual(["review-correctness", "review-security-risk"]);
    expect(snap.steps.find((s) => s.id === "arbiter")!.needs).toEqual([
      "review-correctness",
      "review-security-risk",
    ]);
  });

  it("a flow checklistReview.lenses override changes which reviewers run", async () => {
    const { config } = await loadConfig(root);
    const snap = resolveFlow({
      flow: { ...pickupReviewFlow, checklistReview: { lenses: ["correctness", "tests", "performance"] } },
      source: { kind: "builtin", ref: pickupReviewFlow.id },
      config,
      task: "t",
    });
    expect(bandReviewerIds(snap)).toEqual([
      "review-correctness",
      "review-tests",
      "review-performance",
    ]);
    expect(snap.steps.find((s) => s.id === "arbiter")!.needs).toEqual([
      "review-correctness",
      "review-tests",
      "review-performance",
    ]);
  });

  it("a crew checklistReviewLenses override wins over the flow's lenses", async () => {
    const { config } = await loadConfig(root);
    // Copy the working default crew's roles into a new crew that aims every
    // per-item panel at secrets + injection (the built-in default may not be a
    // config.crews entry, so inject one).
    const { crew: base } = getCrew(config, undefined);
    config.crews["lensy"] = { ...base, checklistReviewLenses: ["secrets", "injection"] };
    const snap = resolveFlow({
      flow: pickupReviewFlow, // flow declares correctness + security-risk
      source: { kind: "builtin", ref: pickupReviewFlow.id },
      config,
      task: "t",
      crewId: "lensy",
    });
    expect(bandReviewerIds(snap)).toEqual(["review-secrets", "review-injection"]);
  });
});

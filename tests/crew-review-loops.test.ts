import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { applySetup } from "../src/setup/setup-service.js";
import { installCrewPreset } from "../src/setup/config-update-service.js";
import { loadConfig } from "../src/project/config-loader.js";
import { resolveFlow } from "../src/flows/runtime/flow-resolver.js";
import { defaultFlow } from "../src/flows/catalog/builtin-flows.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const claudeOk: ProviderDetectionRunner = async (cmd) =>
  cmd === "claude"
    ? { exitCode: 0, stdout: "Claude Code 2.1.0", stderr: "" }
    : { exitCode: 127, stdout: "", stderr: "" };

async function initedProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-loops-"));
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "demo", scripts: { test: "vitest" } }),
  );
  await fs.writeFile(path.join(root, "pnpm-lock.yaml"), "");
  await applySetup({ options: { projectRoot: root }, detectionRunner: claudeOk });
  return root;
}

/** The crew's maxReviewLoops override must reach the RESOLVED SNAPSHOT's
 *  `loop.maxIterations` - the value the runner actually bounds the review/fix
 *  loop on (orchestrator `loopIteration < loop.maxIterations`). Asserting the
 *  written config alone would pass even if the override were a dead wire. */
function resolveWith(config: Parameters<typeof resolveFlow>[0]["config"], crewId?: string) {
  return resolveFlow({
    flow: defaultFlow,
    source: { kind: "builtin", ref: defaultFlow.id },
    config,
    task: "t",
    ...(crewId ? { crewId } : {}),
  });
}

describe("crew maxReviewLoops reaches the runner's loop bound", () => {
  let root: string;
  beforeEach(async () => {
    root = await initedProject();
  });

  it("the default flow loop is 3 with no crew override", async () => {
    const { config } = await loadConfig(root);
    expect(resolveWith(config).loop?.maxIterations).toBe(3);
    // sanity: the flow definition itself declares 3.
    expect(defaultFlow.loop?.maxIterations).toBe(3);
  });

  it("a fast crew caps the resolved loop at 1", async () => {
    await installCrewPreset(root, "fast");
    const { config } = await loadConfig(root);
    expect(resolveWith(config, "fast").loop?.maxIterations).toBe(1);
  });

  it("a thorough crew sets the resolved loop to 3", async () => {
    await installCrewPreset(root, "thorough");
    const { config } = await loadConfig(root);
    expect(resolveWith(config, "thorough").loop?.maxIterations).toBe(3);
  });
});

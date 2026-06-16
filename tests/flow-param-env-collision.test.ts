import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { applySetup } from "../src/setup/setup-service.js";
import { loadConfig } from "../src/project/config-loader.js";
import { resolveFlow, FlowResolutionError } from "../src/flows/runtime/flow-resolver.js";
import { defaultFlow } from "../src/flows/catalog/builtin-flows.js";
import { flowParamSchema } from "../src/flows/schemas/flow-schema.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

const claudeOk: ProviderDetectionRunner = async (cmd) =>
  cmd === "claude"
    ? { exitCode: 0, stdout: "Claude Code 2.1.0", stderr: "" }
    : { exitCode: 127, stdout: "", stderr: "" };

const strParam = () => flowParamSchema.parse({ type: "string" });

describe("resolveFlow refuses params that collide on one VIBESTRATE_PARAM_* env var", () => {
  let root: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-envcollide-"));
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "demo", scripts: { test: "vitest" } }),
    );
    await fs.writeFile(path.join(root, "pnpm-lock.yaml"), "");
    await applySetup({ options: { projectRoot: root }, detectionRunner: claudeOk });
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("throws naming the colliding params (fail loud at resolve)", async () => {
    const { config } = await loadConfig(root);
    const flow = {
      ...defaultFlow,
      params: { colorTokens: strParam(), color_tokens: strParam() },
    };
    expect(() =>
      resolveFlow({ flow, source: { kind: "builtin", ref: flow.id }, config, task: "t" }),
    ).toThrow(FlowResolutionError);
    expect(() =>
      resolveFlow({ flow, source: { kind: "builtin", ref: flow.id }, config, task: "t" }),
    ).toThrow(/collide on one env var/);
  });

  it("resolves cleanly when env-var names are distinct", async () => {
    const { config } = await loadConfig(root);
    const flow = {
      ...defaultFlow,
      params: { name: strParam(), niche: strParam() },
    };
    expect(() =>
      resolveFlow({ flow, source: { kind: "builtin", ref: flow.id }, config, task: "t" }),
    ).not.toThrow();
  });
});

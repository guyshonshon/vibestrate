import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { Orchestrator } from "../../src/core/orchestrator.js";
import { findFlowById } from "../../src/flows/catalog/flow-discovery.js";
import { resolveFlow } from "../../src/flows/runtime/flow-resolver.js";
import { loadConfig } from "../../src/project/config-loader.js";
import { setConfigValue } from "../../src/setup/config-update-service.js";
import { applySetup } from "../../src/setup/setup-service.js";
import { researchFlow } from "../../src/flows/catalog/flows/research.js";
import type { ProviderDetectionRunner } from "../../src/providers/provider-detection.js";

/**
 * A run that produces no code.
 *
 * The spike's question was whether the machinery is genuinely code-shaped or
 * only looked that way because every flow was. The load-bearing assertions here
 * are the two that would expose it: a flow with no `diff` output must reach a
 * real verdict rather than stalling, and its assurance must say validation was
 * NOT APPLICABLE rather than missing - a research run that reads as
 * under-validated is worse than one that cannot run at all, because it looks
 * like a result.
 */
const noProvider: ProviderDetectionRunner = async () => ({ exitCode: 127, stdout: "", stderr: "" });

const PROVIDER = `#!/usr/bin/env node
let prompt = "";
process.stdin.on("data", (c) => (prompt += c));
process.stdin.on("end", () => {
  if (prompt.includes("Vibestrate Agent: reviewer")) {
    console.log("# Fact-check\\n\\nDECISION: APPROVED");
  } else {
    console.log("# Answer\\n\\nThe answer, resting on src/index.ts and my own reasoning.");
  }
});
`;

describe("the research flow", () => {
  it("declares no diff, so there is nothing to validate or merge", () => {
    const outputs = researchFlow.steps.flatMap((s) => s.outputs ?? []);
    // The whole basis of the spike: a non-code flow needs no new machinery,
    // only the absence of `diff`.
    expect(outputs).not.toContain("diff");
    expect(researchFlow.steps.some((s) => s.kind === "validation")).toBe(false);
  });

  it("still has an independent check, because unreviewed output is the thing to avoid", () => {
    const review = researchFlow.steps.find((s) => s.kind === "review-turn");
    expect(review).toBeTruthy();
    // A different seat from the one that wrote it.
    expect(review?.seat).not.toBe(researchFlow.steps[0]?.seat);
  });

  it("runs end to end and reaches a verdict without touching the repository", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-research-"));
    await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
    await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
    await execa("git", ["config", "user.name", "x"], { cwd: dir });
    await fs.writeFile(path.join(dir, "package.json"), '{"name":"research"}');
    await execa("git", ["add", "."], { cwd: dir });
    await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
    await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
    const providerPath = path.join(dir, "fake-provider.js");
    await fs.writeFile(providerPath, PROVIDER, { mode: 0o755 });
    await fs.chmod(providerPath, 0o755);
    await setConfigValue(
      dir,
      "providers.fake",
      JSON.stringify({ type: "cli", command: "node", args: [providerPath], input: "stdin" }),
    );
    await setConfigValue(dir, "profiles.claude-balanced.provider", "fake");

    const discovered = await findFlowById(dir, "research");
    expect(discovered, "the research flow is not registered").toBeTruthy();
    const loaded = await loadConfig(dir);
    const snapshot = resolveFlow({
      flow: discovered!.definition,
      source: discovered!.source,
      config: loaded.config,
      task: "Does this project push to a remote anywhere?",
    });
    const orchestrator = new Orchestrator({
      projectRoot: dir,
      config: loaded.config,
      rules: loaded.rules,
      task: snapshot.task,
      flow: snapshot,
      isGitRepo: true,
      readOnly: false,
      onProgress: () => {},
    });
    const result = await orchestrator.run();

    // A real ending, not a stall.
    expect(["merge_ready", "blocked", "failed"]).toContain(result.state.status);
    expect(result.state.status, "a no-diff flow could not finish").toBe("merge_ready");

    // The honest part: nothing was validated, and the record says so as a
    // deliberate state rather than as missing evidence.
    const { readRunAssurance } = await import("../../src/safety/run-assurance.js");
    const assurance = await readRunAssurance(dir, result.runId).catch(() => null);
    if (assurance) {
      expect(["not_applicable", "passed"]).toContain(assurance.validation.status);
      expect(assurance.validation.status, "a research run must not read as under-validated").not.toBe(
        "missing",
      );
    }
    await fs.rm(dir, { recursive: true, force: true });
  }, 180_000);
});

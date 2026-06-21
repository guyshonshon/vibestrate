import { describe, it, expect, beforeEach, vi } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { ArtifactStore } from "../src/core/artifact-store.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

// ── P1 Spec-up realignment: the keystone ───────────────────────────────────────
// Spec-up is a pre-flow ENRICHMENT, not a replacement. This proves the terminal
// handoff end to end:
//   (production) `approveSpecUpAndBuild` reads the spec-up run's scope/spec/
//      architecture/risks, assembles ONE approved spec, and launches the CHOSEN
//      flow (carried via the sidecar) seeded with that spec - never a spec-up flow.
//   (consumption) driving that exact RunSpec through the real launcher, the
//      chosen flow's FIRST agent (planner) actually receives the spec as context
//      - it builds FROM the spec, it does not re-derive from the bare task.

// Capture the launched RunSpec instead of spawning a detached process. The real
// launcher (runFromSpec) does NOT import startDetachedRun, so it is unaffected.
const captured = vi.hoisted(() => ({ specs: [] as { spec: unknown }["spec"][] }));
vi.mock("../src/core/detached-run.js", () => ({
  startDetachedRun: vi.fn(async ({ spec }: { spec: unknown }) => {
    captured.specs.push(spec);
    return 4242;
  }),
}));

// Imported AFTER the mock declaration so spec-up-chain picks up the mocked launch.
const { approveSpecUpAndBuild, SpecUpChainError } = await import(
  "../src/spec-up/spec-up-chain.js"
);
const { runFromSpec } = await import("../src/core/run-launcher.js");

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

// The planner (read-only, cwd = run worktree) dumps the prompt it received so we
// can assert the approved spec reached it.
const FAKE = `#!/usr/bin/env node
const fs = require('fs');
let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{
  const m = i.match(/Vibestrate Agent: (\\w+)/);
  if (m) { try { fs.writeFileSync(m[1] + '-prompt.txt', i); } catch {} }
  if (i.includes('Vibestrate Agent: planner')) {
    console.log('# Plan\\nok');
  } else if (i.includes('Vibestrate Agent: reviewer')) {
    console.log('# Review\\nDECISION: APPROVED');
  } else if (i.includes('Vibestrate Agent: verifier')) {
    console.log('VERIFICATION: PASSED');
  } else {
    console.log('ok');
  }
});
`;

const SPEC_UP_RUN = "brisk-otter";
const MARKER = "SPEC_UP_SPEC_MARKER_77";

describe("P1 Spec-up realignment: build from the chosen flow seeded with the spec", () => {
  let dir: string;

  beforeEach(async () => {
    captured.specs.length = 0;
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-p1-"));
    await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
    await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
    await execa("git", ["config", "user.name", "x"], { cwd: dir });
    await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
    await execa("git", ["add", "."], { cwd: dir });
    await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
    await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
    await setConfigValue(dir, "git.worktreeDir", path.join(dir, "worktrees"));
    const fakeJs = path.join(dir, "fake.js");
    await fs.writeFile(fakeJs, FAKE, { mode: 0o755 });
    await fs.chmod(fakeJs, 0o755);
    await setConfigValue(
      dir,
      "providers.fake",
      JSON.stringify({ type: "cli", command: "node", args: [fakeJs], input: "stdin" }),
    );
    await setConfigValue(dir, "profiles.claude-balanced.provider", "fake");

    // A completed spec-up run: its four spec-producing steps + the carried target.
    const store = new ArtifactStore(dir, SPEC_UP_RUN);
    await store.init();
    await store.write("00-idea.md", "# Task\n\nmake a mini e-commerce\n");
    await store.write("flows/scope/output.md", `Scope: ${MARKER} a small storefront.`);
    await store.write("flows/spec/output.md", "Spec: checkout via a payment provider.");
    await store.write("flows/architecture/output.md", "Architecture: a single web app.");
    await store.write("flows/risks/output.md", "Risks: handling card data.");
    await store.writeJson("spec-up-target-flow.json", { flowId: "default" });
  });

  it("assembles the approved spec and targets the CARRIED flow, not a spec-up flow", async () => {
    const res = await approveSpecUpAndBuild({ projectRoot: dir, specUpRunId: SPEC_UP_RUN });
    expect(res.flowId).toBe("default");

    const spec = captured.specs.at(-1) as {
      flow?: { id?: string };
      specUpPhase?: boolean;
      contextSources?: { ref?: string; label?: string }[];
    };
    // The executor is the CHOSEN flow, marked spec-up (loop guard), seeded by file.
    expect(spec.flow?.id).toBe("default");
    expect(spec.specUpPhase).toBe(true);
    expect(spec.contextSources?.[0]?.ref).toMatch(/spec-up-approved-spec\.md$/);

    // The assembled spec carries every section + the marker (fail-fast guard met).
    const specDoc = await fs.readFile(
      path.join(dir, spec.contextSources![0]!.ref!),
      "utf8",
    );
    expect(specDoc).toContain(MARKER);
    expect(specDoc).toContain("# Scope");
    expect(specDoc).toContain("# Spec");
    expect(specDoc).toContain("# Architecture");
    expect(specDoc).toContain("# Risks");
  });

  it("the chosen flow's planner RUNS with the approved spec as context (keystone)", async () => {
    await approveSpecUpAndBuild({ projectRoot: dir, specUpRunId: SPEC_UP_RUN });
    const spec = captured.specs.at(-1) as Parameters<typeof runFromSpec>[0];

    // Drive the assembled RunSpec through the REAL launcher (in-process) with the
    // fake provider; the chosen flow's planner dumps the prompt it received.
    const out = await runFromSpec(spec);
    const plannerPrompt = await fs.readFile(
      path.join(out.worktreePath!, "planner-prompt.txt"),
      "utf8",
    );
    expect(plannerPrompt).toContain(MARKER);
    expect(plannerPrompt).toContain("Context - Spec-up: approved spec");
  }, 60_000);

  it("the adaptive first hop: a needs-spec-up run executes spec-up-intake and writes the target sidecar", async () => {
    // No flow, plan-worthy brief, not already spec'd up -> runFromSpec should run the
    // read-only spec-up-intake AND persist the carried build flow as the sidecar, so
    // the chosen flow survives intake -> spec-up -> build.
    const spec = { projectRoot: dir, task: "build a mini ecommerce store", runId: "spec-up-entry" };
    const out = await runFromSpec(spec);
    // It runs the intake flow, not the chosen flow, and read-only by clamp.
    expect(out.state.readOnly).toBe(true);
    const store = new ArtifactStore(dir, "spec-up-entry");
    expect(await store.exists("spec-up-target-flow.json")).toBe(true);
    const sidecar = JSON.parse(await store.read("spec-up-target-flow.json")) as { flowId?: string };
    expect(sidecar.flowId).toBe("default");
  }, 60_000);

  it("refuses to build when the spec-up run produced no spec (no empty-context build)", async () => {
    const empty = "lone-finch";
    const store = new ArtifactStore(dir, empty);
    await store.init();
    await store.write("00-idea.md", "# Task\n\nx\n");
    await store.writeJson("spec-up-target-flow.json", { flowId: "default" });
    await expect(
      approveSpecUpAndBuild({ projectRoot: dir, specUpRunId: empty }),
    ).rejects.toBeInstanceOf(SpecUpChainError);
    expect(captured.specs.length).toBe(0); // nothing launched
  });

  it("refuses to build with no carried target, no override, no fallback", async () => {
    const noflow = "wise-crane";
    const store = new ArtifactStore(dir, noflow);
    await store.init();
    await store.write("00-idea.md", "# Task\n\nx\n");
    await store.write("flows/scope/output.md", "Scope: something");
    await expect(
      approveSpecUpAndBuild({ projectRoot: dir, specUpRunId: noflow }),
    ).rejects.toBeInstanceOf(SpecUpChainError);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { Orchestrator } from "../src/core/orchestrator.js";
import { loadConfig } from "../src/project/config-loader.js";
import { resolveFlow } from "../src/flows/runtime/flow-resolver.js";
import { flowDefinitionSchema } from "../src/flows/schemas/flow-schema.js";
import { buildRunReplay } from "../src/core/run/run-replay-service.js";
import { runEventsPath } from "../src/utils/paths.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

// The replay STATUS TIMELINE, proven against a run this test actually executed.
//
// Why this test exists: `state.changed` was declared in the event union and read
// by two consumers, but nothing in src/ ever emitted it. Every test that touched
// the timeline hand-wrote `state.changed` lines into a fixture events.ndjson, so
// the suite stayed green while the feature was dead for every real run - the
// replay `snapshots` array was empty and `currentStagePhase` never advanced.
//
// So this test may NOT synthesize events. It drives a real Orchestrator run
// against a fake CLI provider and asserts on the events.ndjson that run wrote.
// If the emitter is removed, this fails; a fixture-fed test would not.

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

const FAKE = `let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{
  process.stdout.write('# Result\\nDECISION: APPROVED\\nok\\n'); process.exit(0);
});
`;

// build (executing) -> review (reviewing). Two stages is the minimum that
// proves the timeline ADVANCES rather than just recording one entry.
const FLOW = flowDefinitionSchema.parse({
  id: "replay-timeline",
  version: 1,
  label: "Replay timeline flow",
  description: "build then review",
  seats: { builder: { label: "Builder" }, reviewer: { label: "Reviewer" } },
  steps: [
    { id: "build", label: "Build", kind: "agent-turn", seat: "builder", stage: "executing" },
    {
      id: "review",
      label: "Review",
      kind: "review-turn",
      seat: "reviewer",
      stage: "reviewing",
      outputs: ["review-decision"],
    },
  ],
});

describe("replay status timeline - end to end on a real run", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-replay-e2e-"));
    await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
    await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
    await execa("git", ["config", "user.name", "x"], { cwd: dir });
    await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
    await execa("git", ["add", "."], { cwd: dir });
    await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
    await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });

    const fakeJs = path.join(dir, "fake.js");
    await fs.writeFile(fakeJs, FAKE);
    await setConfigValue(
      dir,
      "providers.codex",
      JSON.stringify({ type: "cli", command: "node", args: [fakeJs], input: "stdin" }),
    );
    await setConfigValue(
      dir,
      "profiles.codex-x",
      JSON.stringify({ provider: "codex", power: "low" }),
    );
    await setConfigValue(
      dir,
      "crews.t",
      JSON.stringify({
        label: "T",
        roles: {
          r: {
            label: "Role",
            profile: "codex-x",
            seats: ["builder", "reviewer"],
            prompt: ".vibestrate/roles/planner.md",
            permissions: "read_only",
            skills: [],
          },
        },
      }),
    );
    await setConfigValue(dir, "defaultCrew", "t");
  });

  async function runOnce(): Promise<string> {
    const loaded = await loadConfig(dir);
    const resolved = resolveFlow({
      flow: FLOW,
      source: { kind: "builtin", ref: FLOW.id },
      config: loaded.config,
      task: "probe the replay timeline",
    });
    const out = await new Orchestrator({
      projectRoot: dir,
      config: loaded.config,
      rules: loaded.rules,
      task: "probe the replay timeline",
      isGitRepo: true,
      flow: resolved,
      personaId: "staff-engineer",
      onProgress: () => {},
    }).run();
    return out.runId;
  }

  it("records a non-empty status timeline for a run nothing hand-fed", async () => {
    const runId = await runOnce();

    // Nothing wrote these events but the run itself.
    const raw = await fs.readFile(runEventsPath(dir, runId), "utf8");
    const emitted = raw
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { type: string; data?: Record<string, unknown> })
      .filter((e) => e.type === "state.changed");
    expect(emitted.length).toBeGreaterThan(0);

    const replay = await buildRunReplay(dir, runId);

    // THE regression this test owns: the timeline is populated.
    expect(replay.snapshots.length).toBeGreaterThan(0);

    // Every snapshot carries the shape the consumers actually read, and the
    // chain is contiguous: each `previousStatus` is the prior snapshot's status.
    for (const [i, s] of replay.snapshots.entries()) {
      expect(typeof s.status).toBe("string");
      expect(s.status.length).toBeGreaterThan(0);
      expect(s.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      if (i > 0) expect(s.previousStatus).toBe(replay.snapshots[i - 1]!.status);
    }

    // It ADVANCES: the run walked through more than one status, ending where
    // state.json ended.
    const statuses = replay.snapshots.map((s) => s.status);
    expect(new Set(statuses).size).toBeGreaterThan(1);
    expect(statuses).toContain("executing");
    expect(statuses[statuses.length - 1]).toBe(replay.finalStatus);

    // A status change never lands without moving: no self-transitions.
    for (const s of replay.snapshots) expect(s.previousStatus).not.toBe(s.status);
  }, 60_000);

  it("advances currentStagePhase, so stage events stop falling into 'other'", async () => {
    const runId = await runOnce();
    const replay = await buildRunReplay(dir, runId);

    // currentStagePhase is internal to the projection; its OBSERVABLE effect is
    // the STAGE PASS-THROUGH: an event whose own type maps to no phase inherits
    // the phase of the status the run was in when it fired.
    //
    // So assert on an event type `phaseFromEventType` does NOT classify.
    // `role.*` is the case - asserting on `review.decision` would prove nothing,
    // since that type is hard-mapped to "reviewing" and lands there with or
    // without the emitter. Only pass-through can put a role event in a stage.
    const classifiedByType = new Set(["validation.", "review.", "verification."]);
    const passedThrough = replay.events.filter(
      (e) =>
        e.type.startsWith("role.") &&
        ![...classifiedByType].some((p) => e.type.startsWith(p)),
    );
    expect(passedThrough.length).toBeGreaterThan(0);
    expect(passedThrough.some((e) => e.phaseKey === "executing")).toBe(true);

    const phase = (key: string) => replay.phases.find((p) => p.key === key)!;
    expect(phase("executing").eventIndices.length).toBeGreaterThan(0);
    expect(phase("executing").startTimestamp).not.toBeNull();
  }, 60_000);
});

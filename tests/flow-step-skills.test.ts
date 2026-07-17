import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import { setConfigValue } from "../src/setup/config-update-service.js";
import { Orchestrator } from "../src/core/orchestrator.js";
import { ArtifactStore } from "../src/core/stores/artifact-store.js";
import { loadConfig } from "../src/project/config-loader.js";
import { resolveFlow } from "../src/flows/runtime/flow-resolver.js";
import { flowDefinitionSchema, isGraphFlow } from "../src/flows/schemas/flow-schema.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

// ── P2: flow owns skills ─────────────────────────────────────────────────────
// A flow STEP can declare `skills`, injected into THAT step's agent prompt
// (merged with run-level skills, scoped to the turn). No new top-level primitive.

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

const FAKE = `const fs=require('fs');
let i='';process.stdin.on('data',c=>i+=c);process.stdin.on('end',()=>{
  process.stdout.write('# Result\\nok\\n'); process.exit(0);
});
`;

const SKILL_MARKER = "SKILL_MARKER_99 build to the WhatsApp webhook contract.";

describe("flow step skills - schema", () => {
  it("accepts skills (skillReferenceSchema chars) on a turn step", () => {
    const parsed = flowDefinitionSchema.parse({
      id: "f",
      version: 1,
      label: "F",
      description: "d",
      seats: { worker: { label: "Worker" } },
      steps: [
        {
          id: "do",
          label: "Do",
          kind: "agent-turn",
          seat: "worker",
          skills: ["demo-skill", "a.b_c-1"],
        },
      ],
    });
    expect(parsed.steps[0]!.skills).toEqual(["demo-skill", "a.b_c-1"]);
  });

  it("defaults skills to [] when omitted", () => {
    const parsed = flowDefinitionSchema.parse({
      id: "f",
      version: 1,
      label: "F",
      description: "d",
      seats: { worker: { label: "Worker" } },
      steps: [{ id: "do", label: "Do", kind: "agent-turn", seat: "worker" }],
    });
    expect(parsed.steps[0]!.skills).toEqual([]);
  });

  it("rejects skills on a non-turn step kind (validation)", () => {
    const r = flowDefinitionSchema.safeParse({
      id: "f",
      version: 1,
      label: "F",
      description: "d",
      seats: { worker: { label: "Worker" } },
      steps: [
        { id: "do", label: "Do", kind: "agent-turn", seat: "worker" },
        { id: "val", label: "Val", kind: "validation", skills: ["demo-skill"] },
      ],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => /skills \(turn steps only\)/.test(i.message))).toBe(true);
    }
  });
});

const SKILLS_FLOW = flowDefinitionSchema.parse({
  id: "skills-flow",
  version: 1,
  label: "Skills flow",
  description: "two turns; one declares a skill",
  seats: { worker: { label: "Worker" } },
  steps: [
    {
      id: "withskills",
      label: "With skills",
      kind: "agent-turn",
      seat: "worker",
      skills: ["demo-skill"],
    },
    { id: "plain", label: "Plain", kind: "agent-turn", seat: "worker" },
  ],
});

// A GRAPH-shaped flow (the second step declares `needs`) routes the WHOLE flow
// through runGraphFrontier instead of the linear walk - a distinct runRole call
// site. The builtin panel-review / security-review flows are this shape, so step
// skills must inject on the graph path too.
const GRAPH_SKILLS_FLOW = flowDefinitionSchema.parse({
  id: "graph-skills-flow",
  version: 1,
  label: "Graph skills flow",
  description: "a DAG; the downstream step declares a skill",
  seats: { worker: { label: "Worker" } },
  steps: [
    { id: "plan", label: "Plan", kind: "agent-turn", seat: "worker" },
    {
      id: "build",
      label: "Build",
      kind: "agent-turn",
      seat: "worker",
      needs: ["plan"],
      skills: ["demo-skill"],
    },
  ],
});

describe("flow step skills - resolve + inject", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-p2-"));
    await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
    await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
    await execa("git", ["config", "user.name", "x"], { cwd: dir });
    await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
    await execa("git", ["add", "."], { cwd: dir });
    await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
    await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });

    // The skill the step declares - flat .vibestrate/skills/<name>.md path.
    await fs.mkdir(path.join(dir, ".vibestrate", "skills"), { recursive: true });
    await fs.writeFile(
      path.join(dir, ".vibestrate", "skills", "demo-skill.md"),
      `# Demo skill\n\n${SKILL_MARKER}\n`,
    );

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
          w: {
            label: "Worker",
            profile: "codex-x",
            seats: ["worker"],
            prompt: ".vibestrate/roles/planner.md",
            permissions: "read_only",
            skills: [],
          },
        },
      }),
    );
    await setConfigValue(dir, "defaultCrew", "t");
  });

  it("resolveFlow carries the step's skills into the snapshot step", async () => {
    const loaded = await loadConfig(dir);
    const resolved = resolveFlow({
      flow: SKILLS_FLOW,
      source: { kind: "builtin", ref: "skills-flow" },
      config: loaded.config,
      task: "probe",
    });
    const withSkills = resolved.steps.find((s) => s.id === "withskills")!;
    const plain = resolved.steps.find((s) => s.id === "plain")!;
    expect(withSkills.skills).toEqual(["demo-skill"]);
    expect(plain.skills).toEqual([]);
  });

  it("injects the step's skill into THAT step's prompt only (per-turn scope)", async () => {
    const loaded = await loadConfig(dir);
    const resolved = resolveFlow({
      flow: SKILLS_FLOW,
      source: { kind: "builtin", ref: "skills-flow" },
      config: loaded.config,
      task: "probe skills injection",
    });
    const orch = new Orchestrator({
      projectRoot: dir,
      config: loaded.config,
      rules: loaded.rules,
      task: "probe skills injection",
      isGitRepo: true,
      flow: resolved,
      onProgress: () => {},
    });
    const out = await orch.run();

    const store = new ArtifactStore(dir, out.runId);
    const withPrompt = await store.read("flows/withskills/prompt.md");
    const plainPrompt = await store.read("flows/plain/prompt.md");
    // The declaring step's prompt carries the skill; the other step's does not.
    expect(withPrompt).toContain(SKILL_MARKER);
    expect(plainPrompt).not.toContain(SKILL_MARKER);
  }, 60_000);

  it("injects the step's skill on the GRAPH path too (runGraphFrontier)", async () => {
    expect(isGraphFlow(GRAPH_SKILLS_FLOW)).toBe(true);
    const loaded = await loadConfig(dir);
    const resolved = resolveFlow({
      flow: GRAPH_SKILLS_FLOW,
      source: { kind: "builtin", ref: "graph-skills-flow" },
      config: loaded.config,
      task: "probe graph skills injection",
    });
    const orch = new Orchestrator({
      projectRoot: dir,
      config: loaded.config,
      rules: loaded.rules,
      task: "probe graph skills injection",
      isGitRepo: true,
      flow: resolved,
      onProgress: () => {},
    });
    const out = await orch.run();

    const store = new ArtifactStore(dir, out.runId);
    const buildPrompt = await store.read("flows/build/prompt.md");
    const planPrompt = await store.read("flows/plan/prompt.md");
    expect(buildPrompt).toContain(SKILL_MARKER);
    expect(planPrompt).not.toContain(SKILL_MARKER);
  }, 60_000);
});

import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import {
  draftFlowFromDescription,
  FlowAssistError,
} from "../src/flows/authoring/flow-assist.js";
import { discoverFlowCatalog } from "../src/flows/catalog/flow-discovery.js";
import { projectFlowsDir } from "../src/utils/paths.js";
import type { AssistProviderRunner } from "../src/core/assist/assist-runner.js";
import type { ProviderDetectionRunner } from "../src/providers/provider-detection.js";

// Drafting a Flow must be a suggestion, never a creation. The invariants under
// test:
//  - a draft returns a schema-valid flow and writes NO flow file,
//  - the description is redacted before it reaches the model,
//  - a draft whose YAML carries a secret shape is REFUSED, not redacted,
//  - a shape-invalid draft is re-prompted with the real validator's issues,
//  - an unfillable seat surfaces as coverage, not as a rejection,
//  - `currency` (what the agent checked / could not check) survives verbatim.
// A FAKE provider runner replays canned JSON - no real model is called.

const noProvider: ProviderDetectionRunner = async () => ({
  exitCode: 127,
  stdout: "",
  stderr: "",
});

async function makeProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-flowassist-"));
  await execa("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await execa("git", ["config", "user.email", "x@x"], { cwd: dir });
  await execa("git", ["config", "user.name", "x"], { cwd: dir });
  await fs.writeFile(path.join(dir, "package.json"), '{"name":"demo"}');
  await execa("git", ["add", "."], { cwd: dir });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  await applySetup({ options: { projectRoot: dir }, detectionRunner: noProvider });
  return dir;
}

/** Fake assist runner replaying one canned JSON response per attempt (the last
 *  entry repeats), recording every prompt it was handed. */
function scriptedRunner(responses: string[]): {
  runner: AssistProviderRunner;
  prompts: string[];
} {
  const prompts: string[] = [];
  const runner: AssistProviderRunner = async (_providers, input) => {
    prompts.push(input.prompt);
    const response = responses[Math.min(prompts.length - 1, responses.length - 1)]!;
    return { exitCode: 0, normalized: { responseText: response, metrics: null } };
  };
  return { runner, prompts };
}

/** Every file under `.vibestrate/flows/`, content-hashed. Absent dir -> []. */
async function snapshotFlowsDir(projectRoot: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string, rel: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = path.join(dir, entry.name);
      const next = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(abs, next);
      else {
        const hash = createHash("sha256").update(await fs.readFile(abs)).digest("hex");
        out.push(`${next}:${hash}`);
      }
    }
  }
  await walk(projectFlowsDir(projectRoot), "");
  return out;
}

async function projectFlowIds(projectRoot: string): Promise<string[]> {
  const catalog = await discoverFlowCatalog(projectRoot);
  return catalog.flows
    .filter((f) => f.source.kind === "project")
    .map((f) => f.id)
    .sort();
}

const VALID_FLOW = {
  id: "triage-fix",
  version: 1,
  label: "Triage and fix",
  description: "Plan the fix, implement it, then review the diff.",
  seats: {
    planner: { label: "Planner" },
    implementer: { label: "Implementer" },
    reviewer: { label: "Reviewer" },
  },
  steps: [
    {
      id: "plan",
      label: "Plan",
      kind: "agent-turn",
      seat: "planner",
      stage: "planning",
      inputs: ["task-brief"],
      outputs: ["plan"],
    },
    {
      id: "implement",
      label: "Implement",
      kind: "agent-turn",
      seat: "implementer",
      stage: "executing",
      inputs: ["task-brief", "plan"],
      outputs: ["execution", "diff"],
    },
    {
      id: "review",
      label: "Review",
      kind: "review-turn",
      seat: "reviewer",
      stage: "reviewing",
      inputs: ["diff"],
      outputs: ["findings", "review-decision"],
    },
  ],
};

function validDraftJson(
  overrides: { flow?: unknown; currency?: unknown } = {},
): string {
  return JSON.stringify({
    flow: overrides.flow ?? VALID_FLOW,
    rationale: "A linear plan/implement/review shape is the simplest fit.",
    currency: overrides.currency ?? { checked: [], unverified: [] },
  });
}

describe("flow-assist: drafting never creates a flow", () => {
  it("returns a schema-valid draft and writes NO flow file", async () => {
    const project = await makeProject();
    const before = await snapshotFlowsDir(project);
    const idsBefore = await projectFlowIds(project);

    const { runner } = scriptedRunner([validDraftJson()]);
    const { draft } = await draftFlowFromDescription({
      projectRoot: project,
      description: "plan a fix, implement it, then review the diff",
      runner,
    });

    expect(draft.flow.id).toBe("triage-fix");
    expect(draft.flow.steps.map((s) => s.id)).toEqual(["plan", "implement", "review"]);
    expect(draft.yaml).toContain("id: triage-fix");
    expect(draft.targetPath).toBe(
      path.join(".vibestrate", "flows", "triage-fix", "flow.yml"),
    );
    expect(draft.exists).toBe(false);
    // Every declared seat is filled by the default crew, so this is runnable
    // the moment the owner accepts it.
    expect(draft.coverage.runnable).toBe(true);

    // The whole point: nothing reached disk. (The assist's own broker audit line
    // under `runs/flow-assist/` is expected - that is the evidence trail, not a
    // flow file.)
    expect(await snapshotFlowsDir(project)).toEqual(before);
    expect(await projectFlowIds(project)).toEqual(idsBefore);
  });

  it("imports no writer from the flow portability module", async () => {
    // Structural guard for the invariant above: a draft service that cannot
    // reach a writer cannot write, whatever a future edit does to its body.
    const source = await fs.readFile(
      path.join(import.meta.dirname, "..", "src", "flows", "authoring", "flow-assist.ts"),
      "utf8",
    );
    expect(source).not.toMatch(
      /writeProjectFlowDefinition|createProjectFlow|importFlowFrom|fs\.writeFile|writeTextAtomic/,
    );
  });

  it("redacts the description before it reaches the model", async () => {
    const project = await makeProject();
    const { runner, prompts } = scriptedRunner([validDraftJson()]);
    await draftFlowFromDescription({
      projectRoot: project,
      description: 'review any diff adding AKIAIOSFODNN7EXAMPLE to the repo',
      runner,
    });
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(prompts[0]).toContain("[REDACTED");
  });
});

describe("flow-assist: what comes back is held to the writer's own checks", () => {
  it("refuses a drafted flow carrying a secret shape, and writes nothing", async () => {
    const project = await makeProject();
    const before = await snapshotFlowsDir(project);

    const flow = {
      ...VALID_FLOW,
      steps: VALID_FLOW.steps.map((step) =>
        step.id === "implement"
          ? { ...step, instructions: 'use the key AKIAIOSFODNN7EXAMPLE when calling out' }
          : step,
      ),
    };
    const { runner } = scriptedRunner([validDraftJson({ flow })]);

    await expect(
      draftFlowFromDescription({
        projectRoot: project,
        description: "a flow that talks to our AWS account",
        runner,
      }),
    ).rejects.toThrow(FlowAssistError);
    expect(await snapshotFlowsDir(project)).toEqual(before);
  });

  it("re-prompts a shape-invalid draft with the real validator's issues", async () => {
    const project = await makeProject();
    // Attempt 1 breaks the token regex (underscore in a step id) - the single
    // most common failure, and one only flowDefinitionSchema can report.
    const broken = {
      ...VALID_FLOW,
      steps: [{ ...VALID_FLOW.steps[0]!, id: "plan_step" }, ...VALID_FLOW.steps.slice(1)],
    };
    const { runner, prompts } = scriptedRunner([
      validDraftJson({ flow: broken }),
      validDraftJson(),
    ]);

    const { draft } = await draftFlowFromDescription({
      projectRoot: project,
      description: "plan, implement, review",
      runner,
    });

    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("Your previous response was rejected");
    expect(prompts[1]).toContain("lowercase letters, digits, and dashes");
    expect(draft.flow.steps[0]!.id).toBe("plan");
  });

  it("returns a draft whose seat no role fills, with the gap in coverage", async () => {
    const project = await makeProject();
    const flow = {
      ...VALID_FLOW,
      seats: { ...VALID_FLOW.seats, prototyper: { label: "Prototyper" } },
      steps: [
        ...VALID_FLOW.steps,
        {
          id: "prototype",
          label: "Prototype",
          kind: "agent-turn",
          seat: "prototyper",
          inputs: ["plan"],
          outputs: ["execution"],
        },
      ],
    };
    const { runner } = scriptedRunner([validDraftJson({ flow })]);

    const { draft } = await draftFlowFromDescription({
      projectRoot: project,
      description: "add a prototyping step",
      runner,
    });

    // Surfaced in review, not rejected: the owner may be about to add the role.
    expect(draft.coverage.runnable).toBe(false);
    const gap = draft.coverage.seats.find((s) => s.status === "gap");
    expect(gap?.seatId).toBe("prototyper");
  });

  it("carries currency.checked / currency.unverified through verbatim", async () => {
    const project = await makeProject();
    const currency = {
      checked: ["node 24 is the project's engine - package.json engines field"],
      unverified: ["assumed the provider CLI still takes --effort; could not check"],
    };
    const { runner } = scriptedRunner([validDraftJson({ currency })]);

    const { draft } = await draftFlowFromDescription({
      projectRoot: project,
      description: "a flow that pins the toolchain",
      runner,
    });

    // Mutation check: drop the field in `flow-assist.ts` and this fails. The
    // honesty of the draft rests on the owner seeing exactly what was not
    // checked, so it must never be summarized or dropped in transit.
    expect(draft.currency).toEqual(currency);
  });
});

describe("flow-assist: input bounds", () => {
  it("rejects an over-long description without calling the provider", async () => {
    const project = await makeProject();
    const { runner, prompts } = scriptedRunner([validDraftJson()]);

    await expect(
      draftFlowFromDescription({
        projectRoot: project,
        description: "a".repeat(1001),
        runner,
      }),
    ).rejects.toThrow(/exceeds 1000 characters/i);
    expect(prompts).toHaveLength(0);
  });

  it("rejects an empty description", async () => {
    const project = await makeProject();
    const { runner } = scriptedRunner([validDraftJson()]);
    await expect(
      draftFlowFromDescription({ projectRoot: project, description: "   ", runner }),
    ).rejects.toThrow(/description is required/i);
  });

  it("rejects an unknown crew id before spending a provider call", async () => {
    const project = await makeProject();
    const { runner, prompts } = scriptedRunner([validDraftJson()]);
    await expect(
      draftFlowFromDescription({
        projectRoot: project,
        description: "plan, implement, review",
        crewId: "no-such-crew",
        runner,
      }),
    ).rejects.toThrow(FlowAssistError);
    expect(prompts).toHaveLength(0);
  });
});

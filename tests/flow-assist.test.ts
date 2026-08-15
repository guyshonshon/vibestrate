import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { execa } from "execa";
import { applySetup } from "../src/setup/setup-service.js";
import {
  draftFlowFromDescription,
  reviseFlowFromInstruction,
  FlowAssistError,
} from "../src/flows/authoring/flow-assist.js";
import { discoverFlowCatalog } from "../src/flows/catalog/flow-discovery.js";
import { projectFlowsDir, projectRunsDir } from "../src/utils/paths.js";
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

/** Every file in the project, content-hashed, EXCEPT the assist's own broker
 *  audit trail under `.vibestrate/runs/`. That trail is the evidence a provider
 *  was spawned - the thing the security posture requires, not an artifact the
 *  assist produced. Everything else must come back byte-identical. */
async function snapshotProject(projectRoot: string): Promise<string[]> {
  const runsDir = projectRunsDir(projectRoot);
  const out: string[] = [];
  async function walk(dir: string, rel: string): Promise<void> {
    if (dir === runsDir) return;
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
  await walk(projectRoot, "");
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

  // An allowlist, not a denylist: a hand-written list of forbidden names is
  // only ever as current as the last person who remembered to extend it, and
  // the previous version of this guard had already gone stale on
  // `writeFlowYamlAudited`. Reaching for any module not named here fails.
  it("imports only from modules that cannot write", async () => {
    const source = await fs.readFile(
      path.join(import.meta.dirname, "..", "src", "flows", "authoring", "flow-assist.ts"),
      "utf8",
    );
    const allowed = new Set([
      "node:path",
      "zod",
      "yaml",
      "../../utils/errors.js",
      "../../utils/fs.js",
      "../../utils/paths.js",
      "../../core/assist/assist-runner.js",
      "../../project/config-loader.js",
      "../../agents/crew-registry.js",
      "../../agents/crew-schema.js",
      "../catalog/flow-discovery.js",
      "../schemas/flow-schema.js",
      "../runtime/flow-portability.js",
      "../runtime/seat-coverage.js",
    ]);
    const specs = [...source.matchAll(/\bfrom\s+"([^"]+)"/g)].map((m) => m[1]!);
    expect(specs.length).toBeGreaterThan(0);
    expect(specs.filter((s) => !allowed.has(s))).toEqual([]);

    // flow-portability is on the list for its validator alone - it is also
    // where every flow writer lives, so this pins the names, not the module.
    const portability = source.match(
      /import\s*\{([^}]*)\}\s*from\s*"\.\.\/runtime\/flow-portability\.js"/,
    );
    expect(portability).not.toBeNull();
    expect(
      portability![1]!.split(",").map((n) => n.trim()).filter(Boolean),
    ).toEqual(["validateFlowObject"]);
  });

  // What this proves is the END STATE: nothing secret-shaped reaches the
  // provider. `prompts` is what the runner was handed, so the assertion holds
  // wherever the redaction lives - today that is `runAssist`, the single funnel.
  it("nothing secret-shaped in the description reaches the provider", async () => {
    const project = await makeProject();
    const { runner, prompts } = scriptedRunner([validDraftJson()]);
    await draftFlowFromDescription({
      projectRoot: project,
      description: "review any diff adding AKIAIOSFODNN7EXAMPLE to the repo",
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

// ── revision ────────────────────────────────────────────────────────────────
//
// A revision edits the flow the owner is holding, so the invariants differ from
// the drafter's:
//  - what changed is DERIVED from the two definitions, never the model's claim,
//  - an instruction that is a question is answered with no revision at all,
//  - a revision that fails the writer's checks is refused, not shown,
//  - the whole path still writes nothing.

/** The revision answer as the model returns it. `flow: undefined` omits the key
 *  entirely, which is the question case as a real model would send it. */
function revisionJson(input: { flow?: unknown; answer?: string; currency?: unknown }): string {
  return JSON.stringify({
    ...(input.flow === undefined ? {} : { flow: input.flow }),
    answer: input.answer ?? "Added the step you asked for.",
    currency: input.currency ?? { checked: [], unverified: [] },
  });
}

const VALIDATE_STEP = {
  id: "validate",
  label: "Validate",
  kind: "validation",
  inputs: ["diff"],
  outputs: ["validation"],
};

describe("flow-assist: revising the flow the owner is editing", () => {
  it("reports an added step as exactly one change, and touches nothing else", async () => {
    const project = await makeProject();
    const revised = { ...VALID_FLOW, steps: [...VALID_FLOW.steps, VALIDATE_STEP] };
    const { runner } = scriptedRunner([revisionJson({ flow: revised })]);

    const { revision } = await reviseFlowFromInstruction({
      projectRoot: project,
      flow: VALID_FLOW,
      instruction: "this flow never validates - fix that",
      runner,
    });

    expect(revision.flow?.steps.map((s) => s.id)).toEqual([
      "plan",
      "implement",
      "review",
      "validate",
    ]);
    expect(revision.yaml).toContain("id: validate");
    // The three untouched steps must not appear. The before side arrives without
    // the schema's defaults and the after side comes back with them applied, so
    // a naive comparison would report all four steps as changed.
    expect(revision.changes).toHaveLength(1);
    expect(revision.changes[0]).toMatchObject({
      target: "step",
      op: "added",
      id: "validate",
      index: 3,
    });
    expect(revision.changes[0]!.summary).toBe('Added step "Validate".');
  });

  // The failure this whole derivation exists to prevent: the model says it added
  // a reviewer, and added nothing.
  it("reports no change when the model claims one it did not make", async () => {
    const project = await makeProject();
    const { runner } = scriptedRunner([
      revisionJson({ flow: VALID_FLOW, answer: "I added a second reviewer." }),
    ]);

    const { revision } = await reviseFlowFromInstruction({
      projectRoot: project,
      flow: VALID_FLOW,
      instruction: "add a second reviewer",
      runner,
    });

    expect(revision.answer).toBe("I added a second reviewer.");
    expect(revision.changes).toEqual([]);
  });

  it("names both seats when a step moves seat", async () => {
    const project = await makeProject();
    const revised = {
      ...VALID_FLOW,
      seats: { ...VALID_FLOW.seats, challenger: { label: "Challenger" } },
      steps: VALID_FLOW.steps.map((step) =>
        step.id === "review" ? { ...step, seat: "challenger" } : step,
      ),
    };
    const { runner } = scriptedRunner([revisionJson({ flow: revised })]);

    const { revision } = await reviseFlowFromInstruction({
      projectRoot: project,
      flow: VALID_FLOW,
      instruction: "let the challenger do the review instead",
      runner,
    });

    expect(revision.changes.map((c) => `${c.target}:${c.op}:${c.id}`)).toEqual([
      "seat:added:challenger",
      "step:edited:review",
    ]);
    const stepChange = revision.changes[1]!;
    expect(stepChange.fields).toEqual([
      { name: "seat", before: "reviewer", after: "challenger" },
    ]);
    expect(stepChange.summary).toBe(
      'Step "Review" moved from the reviewer seat to the challenger seat.',
    );
    // Coverage is recomputed for the REVISION, locally: the seat the edit just
    // introduced is in it, so the owner learns whether the revision is runnable
    // before accepting it.
    expect(
      revision.coverage?.seats.find((s) => s.seatId === "challenger")?.status,
    ).toBe("filled");
    expect(revision.coverage?.runnable).toBe(true);
  });

  it("reports a dropped key the form never shows, rather than losing it quietly", async () => {
    const project = await makeProject();
    // `complexity` is a real schema key the flow form does not surface; the
    // editor round-trips it untouched. A revision that drops it has to say so.
    const standing = { ...VALID_FLOW, complexity: "medium" };
    const { runner } = scriptedRunner([revisionJson({ flow: VALID_FLOW })]);

    const { revision } = await reviseFlowFromInstruction({
      projectRoot: project,
      flow: standing,
      instruction: "make this cheaper",
      runner,
    });

    expect(revision.changes).toEqual([
      {
        target: "flow",
        op: "removed",
        id: "complexity",
        index: null,
        fields: [{ name: "complexity", before: "medium", after: null }],
        summary: "Dropped complexity (was medium).",
      },
    ]);
  });

  it("answers a question with no revision, and calls that a success", async () => {
    const project = await makeProject();
    const standing = {
      ...VALID_FLOW,
      seats: { ...VALID_FLOW.seats, prototyper: { label: "Prototyper" } },
      steps: [
        VALID_FLOW.steps[0]!,
        {
          id: "prototype",
          label: "Prototype",
          kind: "agent-turn",
          seat: "prototyper",
          inputs: ["plan"],
          outputs: ["execution"],
        },
        ...VALID_FLOW.steps.slice(1),
      ],
    };
    const { runner, prompts } = scriptedRunner([
      revisionJson({ answer: "No role in this crew declares the prototyper seat." }),
    ]);

    const { revision } = await reviseFlowFromInstruction({
      projectRoot: project,
      flow: standing,
      instruction: "why is the prototyper seat uncovered?",
      runner,
    });

    expect(revision.flow).toBeNull();
    expect(revision.yaml).toBeNull();
    expect(revision.changes).toEqual([]);
    expect(revision.answer).toContain("prototyper seat");
    // The question is answerable from fact because the locally-computed coverage
    // of the flow as it stands is in the prompt. Mutation check: drop that block
    // and the model is left guessing at who is in the crew.
    expect(prompts[0]).toContain("Seat coverage against crew");
    expect(prompts[0]).toContain("prototyper: no role in this crew fills it");
    expect(revision.coverage?.seats.find((s) => s.seatId === "prototyper")?.status).toBe(
      "gap",
    );
  });

  it("writes nothing anywhere in the project", async () => {
    const project = await makeProject();
    const before = await snapshotProject(project);
    const revised = { ...VALID_FLOW, steps: [...VALID_FLOW.steps, VALIDATE_STEP] };
    const { runner } = scriptedRunner([revisionJson({ flow: revised })]);

    await reviseFlowFromInstruction({
      projectRoot: project,
      flow: VALID_FLOW,
      instruction: "add a validation step",
      runner,
    });

    // INVARIANT: the assistant proposes; the broker-gated save path is the only
    // writer. Not just the flows directory - the config, the roles, the flow
    // files and everything else come back byte-identical.
    expect(await snapshotProject(project)).toEqual(before);
    expect(await projectFlowIds(project)).toEqual([]);
  });

  it("nothing secret-shaped in the flow being edited reaches the provider", async () => {
    const project = await makeProject();
    const standing = {
      ...VALID_FLOW,
      steps: VALID_FLOW.steps.map((step) =>
        step.id === "implement"
          ? { ...step, instructions: "deploy with AKIAIOSFODNN7EXAMPLE" }
          : step,
      ),
    };
    const { runner, prompts } = scriptedRunner([revisionJson({ flow: VALID_FLOW })]);

    await reviseFlowFromInstruction({
      projectRoot: project,
      flow: standing,
      instruction: "drop the deploy instruction",
      runner,
    });

    // The end state, wherever the redaction lives: the whole assembled prompt
    // goes through one funnel, so the serialized flow is covered too.
    expect(prompts[0]).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(prompts[0]).toContain("[REDACTED");
  });
});

describe("flow-assist: a revision is held to the writer's own checks", () => {
  it("refuses a revision carrying a secret shape, and writes nothing", async () => {
    const project = await makeProject();
    const before = await snapshotProject(project);
    const revised = {
      ...VALID_FLOW,
      steps: VALID_FLOW.steps.map((step) =>
        step.id === "implement"
          ? { ...step, instructions: "use the key AKIAIOSFODNN7EXAMPLE when calling out" }
          : step,
      ),
    };
    const { runner } = scriptedRunner([revisionJson({ flow: revised })]);

    await expect(
      reviseFlowFromInstruction({
        projectRoot: project,
        flow: VALID_FLOW,
        instruction: "make the implement step talk to AWS",
        runner,
      }),
    ).rejects.toThrow(/refusing to return this revised flow/i);
    expect(await snapshotProject(project)).toEqual(before);
  });

  it("re-prompts a shape-invalid revision, then refuses rather than showing it", async () => {
    const project = await makeProject();
    const broken = {
      ...VALID_FLOW,
      steps: [{ ...VALID_FLOW.steps[0]!, id: "plan_step" }, ...VALID_FLOW.steps.slice(1)],
    };
    // The same broken answer every attempt: the model never corrects, so the
    // owner must end up with nothing rather than with an unsaveable flow.
    const { runner, prompts } = scriptedRunner([revisionJson({ flow: broken })]);

    await expect(
      reviseFlowFromInstruction({
        projectRoot: project,
        flow: VALID_FLOW,
        instruction: "rename the first step",
        runner,
      }),
    ).rejects.toThrow();
    expect(prompts).toHaveLength(3);
    expect(prompts[1]).toContain("Your previous response was rejected");
    expect(prompts[1]).toContain("lowercase letters, digits, and dashes");
  });
});

describe("flow-assist: revision input bounds", () => {
  it("rejects an over-long instruction without calling the provider", async () => {
    const project = await makeProject();
    const { runner, prompts } = scriptedRunner([revisionJson({ flow: VALID_FLOW })]);

    await expect(
      reviseFlowFromInstruction({
        projectRoot: project,
        flow: VALID_FLOW,
        instruction: "a".repeat(1001),
        runner,
      }),
    ).rejects.toThrow(/exceeds 1000 characters/i);
    expect(prompts).toHaveLength(0);
  });

  it("rejects an empty instruction and a non-object flow", async () => {
    const project = await makeProject();
    const { runner } = scriptedRunner([revisionJson({ flow: VALID_FLOW })]);
    await expect(
      reviseFlowFromInstruction({
        projectRoot: project,
        flow: VALID_FLOW,
        instruction: "   ",
        runner,
      }),
    ).rejects.toThrow(/instruction is required/i);
    await expect(
      reviseFlowFromInstruction({
        projectRoot: project,
        flow: "not a flow",
        instruction: "add a step",
        runner,
      }),
    ).rejects.toThrow(/flow object is required/i);
  });

  it("rejects an unknown crew id before spending a provider call", async () => {
    const project = await makeProject();
    const { runner, prompts } = scriptedRunner([revisionJson({ flow: VALID_FLOW })]);
    await expect(
      reviseFlowFromInstruction({
        projectRoot: project,
        flow: VALID_FLOW,
        instruction: "add a step",
        crewId: "no-such-crew",
        runner,
      }),
    ).rejects.toThrow(FlowAssistError);
    expect(prompts).toHaveLength(0);
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

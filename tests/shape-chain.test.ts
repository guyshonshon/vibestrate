import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {
  builtinFlows,
  shapeFlow,
  shapeIntakeFlow,
  shapeRoadmapFlow,
} from "../src/flows/catalog/builtin-flows.js";
import { runSpecSchema } from "../src/core/run-launcher.js";
import { ArtifactStore } from "../src/core/artifact-store.js";
import { FLOW_QUESTIONS_CONTRACT } from "../src/flows/schemas/flow-output-contracts.js";
import {
  readShapeQuestions,
  shapeAnswersSchema,
  approveShapeAndStartRoadmap,
  ShapeChainError,
} from "../src/shape/shape-chain.js";

async function tempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-shape-"));
}

describe("shape flows", () => {
  it("registers the three chain links as built-ins", () => {
    const ids = builtinFlows.map((f) => f.id);
    expect(ids).toEqual(
      expect.arrayContaining(["shape-intake", "shape", "shape-roadmap"]),
    );
  });

  it("are read-only by construction (no step emits a diff)", () => {
    for (const f of [shapeIntakeFlow, shapeFlow, shapeRoadmapFlow]) {
      const writes = f.steps.some((s) => (s.outputs ?? []).includes("diff"));
      expect(writes, `${f.id} must not produce a diff`).toBe(false);
    }
  });

  it("the intake step emits the structured questions contract token", () => {
    const intake = shapeIntakeFlow.steps.find((s) => s.id === "intake");
    expect(intake?.outputs).toContain("questions");
  });
});

describe("shape chain integrity (Tier-2 reviewer requirement)", () => {
  // The roadmap link resumes the shape run at stage "executing". seedResumedSteps
  // copies flows/<step.id>/output.md for every roadmap step BEFORE the first
  // executing step, keyed by the ROADMAP flow's step ids - so each seeded id MUST
  // exist in the shape flow with the SAME stage, or the second link throws at seed
  // time ("Cannot resume: source run is missing ..."). This invisible coupling is
  // the single riskiest failure mode; this test is the only guard against it.
  const RESUME_STAGE = "executing";

  it("every seeded roadmap step maps to an identical shape step", () => {
    const firstResumeIdx = shapeRoadmapFlow.steps.findIndex(
      (s) => s.stage === RESUME_STAGE,
    );
    expect(
      firstResumeIdx,
      "roadmap flow must have an executing-stage synthesis step after the seeded ones",
    ).toBeGreaterThan(0);

    const seeded = shapeRoadmapFlow.steps.slice(0, firstResumeIdx);
    const shapeById = new Map(shapeFlow.steps.map((s) => [s.id, s]));
    for (const rs of seeded) {
      const ss = shapeById.get(rs.id);
      expect(ss, `roadmap seeds "${rs.id}" but the shape flow has no such step`).toBeDefined();
      expect(ss!.stage, `stage mismatch on "${rs.id}"`).toBe(rs.stage);
    }
  });

  it("the shape flow actually produces output for every seeded step", () => {
    // A seeded step is only seedable if it ran in the shape flow (every shape
    // step is an agent-/review-turn that writes output.md), so it must NOT be
    // marked skipWhenReadOnly (the whole flow is read-only).
    const firstResumeIdx = shapeRoadmapFlow.steps.findIndex(
      (s) => s.stage === RESUME_STAGE,
    );
    const seededIds = shapeRoadmapFlow.steps
      .slice(0, firstResumeIdx)
      .map((s) => s.id);
    for (const id of seededIds) {
      const ss = shapeFlow.steps.find((s) => s.id === id)!;
      expect(ss.skipWhenReadOnly ?? false, `${id} must run under read-only`).toBe(false);
    }
  });

  it("the synthesis step runs under read-only (not skipped)", () => {
    const synth = shapeRoadmapFlow.steps.find((s) => s.id === "synthesize");
    expect(synth?.skipWhenReadOnly ?? false).toBe(false);
    expect(synth?.outputs).toContain("roadmap-proposal");
  });
});

describe("shape RunSpec contract (the launched spec)", () => {
  it("the shape run spec the keystone builds is valid core input", () => {
    const parsed = runSpecSchema.safeParse({
      projectRoot: "/tmp/p",
      task: "Build a store",
      runId: "brave-otter",
      flow: { id: "shape", brief: null },
      contextSources: [{ kind: "file", ref: ".vibestrate/runs/x/shape-answers.md", label: "answers" }],
    });
    expect(parsed.success).toBe(true);
  });

  it("core accepts resuming the roadmap link at the planning/executing stages", () => {
    for (const fromStage of ["planning", "executing"] as const) {
      const parsed = runSpecSchema.safeParse({
        projectRoot: "/tmp/p",
        task: "x",
        runId: "brave-otter",
        flow: { id: "shape-roadmap", brief: null },
        resumeFrom: { sourceRunId: "calm-yak", fromStage },
      });
      expect(parsed.success, `fromStage ${fromStage}`).toBe(true);
    }
  });
});

describe("shape answers I/O", () => {
  it("readShapeQuestions returns parsed questions + the carried brief", async () => {
    const root = await tempProject();
    const runId = "brave-otter";
    const store = new ArtifactStore(root, runId);
    await store.init();
    await store.write("00-idea.md", "Build a mini ecommerce store");
    await store.writeJson("flows/intake/questions.json", {
      contract: FLOW_QUESTIONS_CONTRACT,
      stepId: "intake",
      questions: [
        { id: "accounts", question: "Do users sign in?", why: "auth", kind: "choice", options: ["yes", "no"], category: "users" },
      ],
    });
    const pending = await readShapeQuestions(root, runId);
    expect(pending?.questions[0]?.id).toBe("accounts");
    expect(pending?.task).toContain("ecommerce");
  });

  it("readShapeQuestions returns null when there is no questions artifact", async () => {
    const root = await tempProject();
    expect(await readShapeQuestions(root, "calm-yak")).toBeNull();
  });

  it("approveShapeAndStartRoadmap refuses a shape run that does not exist (no spawn)", async () => {
    const root = await tempProject();
    await expect(
      approveShapeAndStartRoadmap({ projectRoot: root, shapeRunId: "ghost-run" }),
    ).rejects.toBeInstanceOf(ShapeChainError);
  });

  it("the answer-set is bounded (rejects empty, oversize, and bad ids)", () => {
    expect(shapeAnswersSchema.safeParse([]).success).toBe(false);
    const tooMany = Array.from({ length: 21 }, (_, i) => ({ id: `q${i}`, answer: "a" }));
    expect(shapeAnswersSchema.safeParse(tooMany).success).toBe(false);
    expect(shapeAnswersSchema.safeParse([{ id: "Bad Id", answer: "a" }]).success).toBe(false);
    expect(shapeAnswersSchema.safeParse([{ id: "accounts", answer: "yes" }]).success).toBe(true);
  });
});

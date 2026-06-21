import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {
  builtinFlows,
  specUpFlow,
  specUpIntakeFlow,
  specUpRoadmapFlow,
} from "../src/flows/catalog/builtin-flows.js";
import { runSpecSchema } from "../src/core/run-launcher.js";
import { ArtifactStore } from "../src/core/artifact-store.js";
import { FLOW_QUESTIONS_CONTRACT } from "../src/flows/schemas/flow-output-contracts.js";
import {
  readSpecUpQuestions,
  specUpAnswersSchema,
  approveSpecUpAndStartRoadmap,
  appendAnswersDoc,
  dedupeQuestionIds,
  markIntakeAnswered,
  runAwaitsInput,
  SpecUpChainError,
} from "../src/spec-up/spec-up-chain.js";

async function tempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-shape-"));
}

describe("awaiting-input terminator (the marker that stops the forever-true bug)", () => {
  async function stageIntake(root: string, runId: string): Promise<void> {
    const store = new ArtifactStore(root, runId);
    await store.init();
    await store.write("00-idea.md", "Build a thing");
    await store.writeJson("flows/intake/questions.json", {
      contract: FLOW_QUESTIONS_CONTRACT,
      stepId: "intake",
      questions: [
        { id: "scope", question: "What's in scope?", why: "bounds it", kind: "text", options: [], category: "scope" },
      ],
    });
  }
  const intake = (runId: string) => ({ runId, flow: { flowId: "spec-up-intake" } });

  it("readSpecUpQuestions returns null once marked answered; runAwaitsInput follows", async () => {
    const root = await tempProject();
    await stageIntake(root, "calm-otter");
    expect(await readSpecUpQuestions(root, "calm-otter")).not.toBeNull();
    expect(await runAwaitsInput(root, intake("calm-otter"))).toBe(true);

    await markIntakeAnswered(root, "calm-otter");
    expect(await readSpecUpQuestions(root, "calm-otter")).toBeNull();
    expect(await runAwaitsInput(root, intake("calm-otter"))).toBe(false);
  });

  it("runAwaitsInput is false for a non-intake run", async () => {
    const root = await tempProject();
    expect(
      await runAwaitsInput(root, { runId: "x", flow: { flowId: "default" } }),
    ).toBe(false);
  });
});

describe("shape flows", () => {
  it("registers the three chain links as built-ins", () => {
    const ids = builtinFlows.map((f) => f.id);
    expect(ids).toEqual(
      expect.arrayContaining(["spec-up-intake", "spec-up", "spec-up-roadmap"]),
    );
  });

  it("are read-only by construction (no step emits a diff)", () => {
    for (const f of [specUpIntakeFlow, specUpFlow, specUpRoadmapFlow]) {
      const writes = f.steps.some((s) => (s.outputs ?? []).includes("diff"));
      expect(writes, `${f.id} must not produce a diff`).toBe(false);
    }
  });

  it("the intake step emits the structured questions contract token", () => {
    const intake = specUpIntakeFlow.steps.find((s) => s.id === "intake");
    expect(intake?.outputs).toContain("questions");
  });
});

describe("spec-up chain integrity (Tier-2 reviewer requirement)", () => {
  // The roadmap link resumes the spec-up run at stage "executing". seedResumedSteps
  // copies flows/<step.id>/output.md for every roadmap step BEFORE the first
  // executing step, keyed by the ROADMAP flow's step ids - so each seeded id MUST
  // exist in the shape flow with the SAME stage, or the second link throws at seed
  // time ("Cannot resume: source run is missing ..."). This invisible coupling is
  // the single riskiest failure mode; this test is the only guard against it.
  const RESUME_STAGE = "executing";

  it("every seeded roadmap step maps to an identical shape step", () => {
    const firstResumeIdx = specUpRoadmapFlow.steps.findIndex(
      (s) => s.stage === RESUME_STAGE,
    );
    expect(
      firstResumeIdx,
      "roadmap flow must have an executing-stage synthesis step after the seeded ones",
    ).toBeGreaterThan(0);

    const seeded = specUpRoadmapFlow.steps.slice(0, firstResumeIdx);
    const specUpById = new Map(specUpFlow.steps.map((s) => [s.id, s]));
    for (const rs of seeded) {
      const ss = specUpById.get(rs.id);
      expect(ss, `roadmap seeds "${rs.id}" but the shape flow has no such step`).toBeDefined();
      expect(ss!.stage, `stage mismatch on "${rs.id}"`).toBe(rs.stage);
    }
  });

  it("the shape flow actually produces output for every seeded step", () => {
    // A seeded step is only seedable if it ran in the shape flow (every shape
    // step is an agent-/review-turn that writes output.md), so it must NOT be
    // marked skipWhenReadOnly (the whole flow is read-only).
    const firstResumeIdx = specUpRoadmapFlow.steps.findIndex(
      (s) => s.stage === RESUME_STAGE,
    );
    const seededIds = specUpRoadmapFlow.steps
      .slice(0, firstResumeIdx)
      .map((s) => s.id);
    for (const id of seededIds) {
      const ss = specUpFlow.steps.find((s) => s.id === id)!;
      expect(ss.skipWhenReadOnly ?? false, `${id} must run under read-only`).toBe(false);
    }
  });

  it("the synthesis step runs under read-only (not skipped)", () => {
    const synth = specUpRoadmapFlow.steps.find((s) => s.id === "synthesize");
    expect(synth?.skipWhenReadOnly ?? false).toBe(false);
    expect(synth?.outputs).toContain("roadmap-proposal");
  });
});

describe("shape RunSpec contract (the launched spec)", () => {
  it("the spec-up run spec the keystone builds is valid core input", () => {
    const parsed = runSpecSchema.safeParse({
      projectRoot: "/tmp/p",
      task: "Build a store",
      runId: "brave-otter",
      flow: { id: "spec-up", brief: null },
      contextSources: [{ kind: "file", ref: ".vibestrate/runs/x/spec-up-answers.md", label: "answers" }],
    });
    expect(parsed.success).toBe(true);
  });

  it("core accepts resuming the roadmap link at the planning/executing stages", () => {
    for (const fromStage of ["planning", "executing"] as const) {
      const parsed = runSpecSchema.safeParse({
        projectRoot: "/tmp/p",
        task: "x",
        runId: "brave-otter",
        flow: { id: "spec-up-roadmap", brief: null },
        resumeFrom: { sourceRunId: "calm-yak", fromStage },
      });
      expect(parsed.success, `fromStage ${fromStage}`).toBe(true);
    }
  });
});

describe("shape answers I/O", () => {
  it("readSpecUpQuestions returns parsed questions + the carried brief", async () => {
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
    const pending = await readSpecUpQuestions(root, runId);
    expect(pending?.questions[0]?.id).toBe("accounts");
    expect(pending?.task).toContain("ecommerce");
  });

  it("readSpecUpQuestions returns null when there is no questions artifact", async () => {
    const root = await tempProject();
    expect(await readSpecUpQuestions(root, "calm-yak")).toBeNull();
  });

  it("approveSpecUpAndStartRoadmap refuses a spec-up run that does not exist (no spawn)", async () => {
    const root = await tempProject();
    await expect(
      approveSpecUpAndStartRoadmap({ projectRoot: root, specUpRunId: "ghost-run" }),
    ).rejects.toBeInstanceOf(SpecUpChainError);
  });

  it("the answer-set is bounded (rejects empty, oversize, and bad ids)", () => {
    expect(specUpAnswersSchema.safeParse([]).success).toBe(false);
    const tooMany = Array.from({ length: 21 }, (_, i) => ({ id: `q${i}`, answer: "a" }));
    expect(specUpAnswersSchema.safeParse(tooMany).success).toBe(false);
    expect(specUpAnswersSchema.safeParse([{ id: "Bad Id", answer: "a" }]).success).toBe(false);
    expect(specUpAnswersSchema.safeParse([{ id: "accounts", answer: "yes" }]).success).toBe(true);
  });
});

describe("shape question id de-duplication (correctness: ids are not unique by schema)", () => {
  it("suffixes colliding ids deterministically, preserving order + first occurrence", () => {
    const out = dedupeQuestionIds([
      { id: "scope", question: "a" },
      { id: "scope", question: "b" },
      { id: "scope", question: "c" },
      { id: "users", question: "d" },
    ]);
    expect(out.map((q) => q.id)).toEqual(["scope", "scope-2", "scope-3", "users"]);
    // First occurrence keeps the bare id; questions stay paired with their text.
    expect(out.map((q) => q.question)).toEqual(["a", "b", "c", "d"]);
  });

  it("skips a suffix that would itself collide with an existing id", () => {
    // "dup-2" already exists, so the second "dup" must become "dup-3", not "dup-2".
    const out = dedupeQuestionIds([
      { id: "dup", question: "a" },
      { id: "dup-2", question: "b" },
      { id: "dup", question: "c" },
    ]);
    expect(out.map((q) => q.id)).toEqual(["dup", "dup-2", "dup-3"]);
  });

  it("produces a fully unique id-set", () => {
    const out = dedupeQuestionIds([
      { id: "x" },
      { id: "x" },
      { id: "x" },
      { id: "y" },
      { id: "y" },
    ]);
    const ids = out.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is a no-op when ids are already unique (referential stability of payload)", () => {
    const input = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const out = dedupeQuestionIds(input);
    expect(out.map((q) => q.id)).toEqual(["a", "b", "c"]);
  });

  it("readSpecUpQuestions de-dups a duplicate-id artifact (deterministic + stable across calls)", async () => {
    const root = await tempProject();
    const runId = "brave-otter";
    const store = new ArtifactStore(root, runId);
    await store.init();
    await store.write("00-idea.md", "Build a mini ecommerce store");
    // Two questions share the model-generated id "scope" - the schema permits it.
    await store.writeJson("flows/intake/questions.json", {
      contract: FLOW_QUESTIONS_CONTRACT,
      stepId: "intake",
      questions: [
        { id: "scope", question: "What's in scope?", why: "bounds the work", kind: "text", options: [], category: "scope" },
        { id: "scope", question: "What's explicitly out?", why: "bounds the work", kind: "text", options: [], category: "scope" },
        { id: "accounts", question: "Do users sign in?", why: "auth", kind: "choice", options: ["yes", "no"], category: "users" },
      ],
    });

    const first = await readSpecUpQuestions(root, runId);
    const ids = (first?.questions ?? []).map((q) => q.id);
    expect(ids).toEqual(["scope", "scope-2", "accounts"]);
    expect(new Set(ids).size).toBe(ids.length); // unique
    // The deduped id stays paired with the SECOND question's text, not the first.
    expect(first?.questions[1]?.question).toBe("What's explicitly out?");

    // Stable across calls: the same artifact deterministically yields the same ids.
    const second = await readSpecUpQuestions(root, runId);
    expect((second?.questions ?? []).map((q) => q.id)).toEqual(ids);
  });

  it("submit/record round-trip attributes answers to the right deduped question", async () => {
    // The record path (appendAnswersDoc) consumes the SAME deduped questions
    // readSpecUpQuestions serves, so an answer keyed by the deduped id lands on the
    // intended question - not the first id-twin.
    const root = await tempProject();
    const runId = "calm-yak";
    const store = new ArtifactStore(root, runId);
    await store.init();
    await store.writeJson("flows/intake/questions.json", {
      contract: FLOW_QUESTIONS_CONTRACT,
      stepId: "intake",
      questions: [
        { id: "scope", question: "What's IN scope?", why: "bounds the work", kind: "text", options: [], category: "scope" },
        { id: "scope", question: "What's OUT of scope?", why: "bounds the work", kind: "text", options: [], category: "scope" },
      ],
    });

    const pending = await readSpecUpQuestions(root, runId);
    expect(pending).not.toBeNull();
    const served = pending!.questions;
    expect(served.map((q) => q.id)).toEqual(["scope", "scope-2"]);

    // The client answers each served (deduped) id with a distinct value.
    const answers = [
      { id: "scope", answer: "the storefront" },
      { id: "scope-2", answer: "no admin dashboard" },
    ];
    const doc = appendAnswersDoc("", served, answers, pending!.round);

    // Each answer is paired with ITS question text, proving no mis-attribution.
    const inScopeIdx = doc.indexOf("What's IN scope?");
    const outScopeIdx = doc.indexOf("What's OUT of scope?");
    expect(inScopeIdx).toBeGreaterThanOrEqual(0);
    expect(outScopeIdx).toBeGreaterThanOrEqual(0);
    expect(doc).toContain("the storefront");
    expect(doc).toContain("no admin dashboard");
    // The "IN scope" question appears before the "the storefront" answer body, and
    // the "OUT of scope" question before its answer - i.e. they didn't swap.
    expect(doc.indexOf("the storefront")).toBeGreaterThan(inScopeIdx);
    expect(doc.indexOf("no admin dashboard")).toBeGreaterThan(outScopeIdx);
  });
});

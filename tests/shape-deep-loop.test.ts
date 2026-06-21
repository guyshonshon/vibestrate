import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { ArtifactStore } from "../src/core/artifact-store.js";
import { FLOW_QUESTIONS_CONTRACT } from "../src/flows/schemas/flow-output-contracts.js";
import {
  ROUND_CAP,
  decideShapeNext,
  appendAnswersDoc,
  readShapeQuestions,
} from "../src/shape/shape-chain.js";
import { specUpIntakeFlow } from "../src/flows/catalog/builtin-flows.js";

async function tempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-deeploop-"));
}

const q = (id: string, category: string) => ({
  id,
  question: `Q ${id}?`,
  why: `why ${id}`,
  kind: "text" as const,
  options: [] as string[],
  category: category as never,
});

describe("decideShapeNext (server-owned brakes)", () => {
  it("loops to a gap-check round when under the cap and not proceeding", () => {
    expect(decideShapeNext({ round: 1, proceed: false, cap: ROUND_CAP })).toEqual({
      action: "gap-check",
      nextRound: 2,
    });
  });

  it("finalizes at the hard cap regardless of the model (cap brake)", () => {
    const d = decideShapeNext({ round: ROUND_CAP, proceed: false, cap: ROUND_CAP });
    expect(d.action).toBe("finalize");
  });

  it("finalizes when the user proceeds, even mid-loop (proceed brake)", () => {
    const d = decideShapeNext({ round: 2, proceed: true, cap: ROUND_CAP });
    expect(d.action).toBe("finalize");
  });

  it("never loops past the cap even if a stale round sneaks above it", () => {
    const d = decideShapeNext({ round: ROUND_CAP + 3, proceed: false, cap: ROUND_CAP });
    expect(d.action).toBe("finalize");
  });

  it("the cap is 4", () => {
    expect(ROUND_CAP).toBe(4);
  });
});

describe("appendAnswersDoc (cross-round accumulation)", () => {
  it("seeds a header on the first round", () => {
    const doc = appendAnswersDoc("", [q("accounts", "users")], [{ id: "accounts", answer: "social" }], 1);
    expect(doc).toContain("Round 1");
    expect(doc).toContain("social");
    expect(doc.toLowerCase()).toContain("answers");
  });

  it("appends a later round WITHOUT dropping earlier rounds", () => {
    const r1 = appendAnswersDoc("", [q("accounts", "users")], [{ id: "accounts", answer: "social" }], 1);
    const r2 = appendAnswersDoc(r1, [q("catalog", "data")], [{ id: "catalog", answer: "shopify" }], 2);
    expect(r2).toContain("social"); // round 1 preserved
    expect(r2).toContain("shopify"); // round 2 added
    expect(r2).toContain("Round 1");
    expect(r2).toContain("Round 2");
  });
});

describe("intake prompt: categorize + gap-check coverage", () => {
  it("instructs the model to categorize and to gap-check later rounds", () => {
    const intake = specUpIntakeFlow.steps.find((s) => s.id === "intake");
    const i = (intake?.instructions ?? "").toLowerCase();
    expect(i).toContain("category"); // emit a category per question
    expect(i).toContain("coveragecomplete"); // declare coverage complete when done
    expect(i).toContain("already"); // already-answered context handling
  });
});

describe("readShapeQuestions: server-stamped round + coverageComplete", () => {
  it("stamps the round from the sidecar onto each served question (default 1)", async () => {
    const root = await tempProject();
    const store = new ArtifactStore(root, "brave-otter");
    await store.init();
    await store.write("00-idea.md", "Build a store");
    await store.writeJson("flows/intake/questions.json", {
      contract: FLOW_QUESTIONS_CONTRACT,
      stepId: "intake",
      questions: [q("accounts", "users")],
    });
    await store.writeJson("spec-up-round.json", { round: 3 });
    const pending = await readShapeQuestions(root, "brave-otter");
    expect(pending?.round).toBe(3);
    expect(pending?.questions[0]?.round).toBe(3);
  });

  it("surfaces coverageComplete when a gap-check returns the empty done-set", async () => {
    const root = await tempProject();
    const store = new ArtifactStore(root, "calm-yak");
    await store.init();
    await store.write("00-idea.md", "Build a store");
    await store.writeJson("flows/intake/questions.json", {
      contract: FLOW_QUESTIONS_CONTRACT,
      stepId: "intake",
      coverageComplete: true,
      questions: [],
    });
    const pending = await readShapeQuestions(root, "calm-yak");
    expect(pending?.coverageComplete).toBe(true);
    expect(pending?.questions).toEqual([]);
  });

  it("defaults the round to 1 when no sidecar exists", async () => {
    const root = await tempProject();
    const store = new ArtifactStore(root, "lone-fox");
    await store.init();
    await store.write("00-idea.md", "Build a store");
    await store.writeJson("flows/intake/questions.json", {
      contract: FLOW_QUESTIONS_CONTRACT,
      stepId: "intake",
      questions: [q("accounts", "users")],
    });
    const pending = await readShapeQuestions(root, "lone-fox");
    expect(pending?.round).toBe(1);
  });
});

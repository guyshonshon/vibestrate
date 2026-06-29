import { describe, it, expect } from "vitest";
import { buildSagaCommand } from "../src/cli/commands/saga.js";
import {
  builtinFlows,
  findBuiltinFlow,
} from "../src/flows/catalog/builtin-flows.js";
import { flowDefinitionSchema } from "../src/flows/schemas/flow-schema.js";

describe("vibe saga sequence wiring", () => {
  it("registers the sequence subcommand", () => {
    const names = buildSagaCommand().commands.map((c) => c.name());
    expect(names).toEqual(expect.arrayContaining(["sequence"]));
  });

  it("sequence accepts --json", () => {
    const sequence = buildSagaCommand().commands.find(
      (c) => c.name() === "sequence",
    );
    expect(sequence?.options.map((o) => o.long)).toEqual(
      expect.arrayContaining(["--json"]),
    );
  });
});

describe("the saga flow", () => {
  it("is registered in builtinFlows and parses", () => {
    const ids = builtinFlows.map((f) => f.id);
    expect(ids).toContain("saga");
    const saga = findBuiltinFlow("saga");
    expect(saga).not.toBeNull();
    // Re-parse to prove it satisfies the schema independently of module load.
    expect(() => flowDefinitionSchema.parse(saga)).not.toThrow();
  });

  it("runs ONE per-item reviewer (no arbiter / no second reviewer in the band)", () => {
    const saga = findBuiltinFlow("saga")!;
    expect(saga.checklistSegment).toBeDefined();
    const { from, to } = saga.checklistSegment!;
    const ids = saga.steps.map((s) => s.id);
    const segFrom = ids.indexOf(from);
    const segTo = ids.indexOf(to);
    expect(segFrom).toBeGreaterThanOrEqual(0);
    expect(segTo).toBeGreaterThanOrEqual(segFrom);
    const bandReviewers = saga.steps
      .slice(segFrom, segTo + 1)
      .filter((s) => s.kind === "review-turn");
    // Exactly one reviewer in the band (the lighter single-reviewer model),
    // unlike pickup-review's correctness + risk + arbiter trio.
    expect(bandReviewers).toHaveLength(1);
    expect(bandReviewers[0]!.id).toBe("review-item");
    expect(saga.seats.arbiter).toBeUndefined();
  });

  it("segTo is a review-turn (isReviewBand) and the band has needs (bandIsGraph)", () => {
    const saga = findBuiltinFlow("saga")!;
    const { from, to } = saga.checklistSegment!;
    const ids = saga.steps.map((s) => s.id);
    const segFrom = ids.indexOf(from);
    const segTo = ids.indexOf(to);
    // isReviewBand: the band's tail step is a review-turn.
    expect(saga.steps[segTo]!.kind).toBe("review-turn");
    // bandIsGraph: some step in the band declares `needs`.
    const bandHasNeeds = saga.steps
      .slice(segFrom, segTo + 1)
      .some((s) => s.needs.length > 0);
    expect(bandHasNeeds).toBe(true);
  });

  it("taskKinds includes checklist", () => {
    const saga = findBuiltinFlow("saga")!;
    expect(saga.capabilities?.taskKinds).toContain("checklist");
  });
});

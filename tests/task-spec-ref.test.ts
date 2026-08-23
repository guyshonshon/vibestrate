import { describe, it, expect } from "vitest";
import { taskSchema } from "../src/roadmap/roadmap-types.js";
import { renderTaskGrounding } from "../src/roadmap/task-grounding.js";

const card = (over: Record<string, unknown> = {}) =>
  taskSchema.parse({
    id: "t1",
    title: "Add team billing",
    createdAt: "2026-08-22T00:00:00.000Z",
    updatedAt: "2026-08-22T00:00:00.000Z",
    ...over,
  });

describe("a card remembers the spec it came from", () => {
  it("defaults to null, so a hand-written card claims no spec", () => {
    expect(card().specRef).toBeNull();
  });

  it("round-trips a project-relative spec path", () => {
    // The shape production actually writes: beside the proposal, not inside the
    // source run. See roadmapProposalSpecFile - and spec-up-roadmap-handoff-e2e
    // for the end-to-end proof that a real accept produces one of these.
    const ref = ".vibestrate/roadmap/proposals/specs/spec-up-keen-magpie.md";
    expect(card({ specRef: ref }).specRef).toBe(ref);
  });

  it("survives a parse of a card written before the field existed", () => {
    // Existing boards must load. Absence is null, not a validation failure.
    const raw = JSON.parse(JSON.stringify(card()));
    delete raw.specRef;
    expect(taskSchema.parse(raw).specRef).toBeNull();
  });
});

describe("card grounding still carries the card's own prose", () => {
  it("carries description and acceptance criteria into the brief", () => {
    const block = renderTaskGrounding(
      card({
        description: "Teams own desks; owners invoice monthly.",
        acceptanceCriteria: "An owner can invite a member.",
      }),
    );
    expect(block).toContain("Teams own desks");
    expect(block).toContain("An owner can invite a member");
  });

  it("stays empty for a title-only card rather than inventing grounding", () => {
    expect(renderTaskGrounding(card())).toBe("");
  });
});

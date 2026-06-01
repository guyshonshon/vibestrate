import { describe, it, expect } from "vitest";
import { moveIndex } from "../src/cli/ui/horizontal-select.js";
import {
  buildFlowChoices,
  buildCrewChoices,
} from "../src/cli/wizards/flow-crew-picker.js";
import type { DiscoveredFlow } from "../src/flows/catalog/flow-discovery.js";

function flow(
  id: string,
  label: string,
  kind: "builtin" | "project",
  description = "",
): DiscoveredFlow {
  return {
    id,
    version: 1,
    label,
    description,
    source: { kind, ref: id },
    definitionPath: kind === "project" ? `/p/${id}.yml` : null,
    // The picker only reads id/label/description/source - a stub definition is fine.
    definition: { id, version: 1, label, description, seats: {}, steps: [] } as DiscoveredFlow["definition"],
  };
}

describe("moveIndex (horizontal selector navigation)", () => {
  it("moves right and wraps at the end", () => {
    expect(moveIndex(0, 3, 1)).toBe(1);
    expect(moveIndex(2, 3, 1)).toBe(0);
  });
  it("moves left and wraps at the start", () => {
    expect(moveIndex(1, 3, -1)).toBe(0);
    expect(moveIndex(0, 3, -1)).toBe(2);
  });
  it("is safe for an empty list", () => {
    expect(moveIndex(0, 0, 1)).toBe(0);
  });
});

describe("buildFlowChoices", () => {
  it("orders project flows before built-ins, then by id, with source-tagged hints", () => {
    const choices = buildFlowChoices([
      flow("default", "Default", "builtin", "the standard flow"),
      flow("my-flow", "My Flow", "project"),
      flow("pickup", "Pickup", "builtin"),
    ]);
    expect(choices.map((c) => c.value)).toEqual(["my-flow", "default", "pickup"]);
    expect(choices[0]!.name).toBe("My Flow");
    // Hint carries source + id so same-named flows stay distinguishable.
    expect(choices[1]!.description).toContain("builtin · default");
    expect(choices[1]!.description).toContain("the standard flow");
  });

  it("falls back to the id when a flow has no label", () => {
    const choices = buildFlowChoices([flow("bare", "", "project")]);
    expect(choices[0]!.name).toBe("bare");
  });
});

describe("buildCrewChoices", () => {
  it("puts the default crew first and marks it", () => {
    const choices = buildCrewChoices(
      [
        { id: "extra", label: "Extra" },
        { id: "core", label: "Core" },
      ],
      "core",
    );
    expect(choices.map((c) => c.value)).toEqual(["core", "extra"]);
    expect(choices[0]!.name).toBe("Core (default)");
    expect(choices[1]!.name).toBe("Extra");
  });

  it("sorts by id when there is no default", () => {
    const choices = buildCrewChoices(
      [
        { id: "b", label: "B" },
        { id: "a", label: "A" },
      ],
      null,
    );
    expect(choices.map((c) => c.value)).toEqual(["a", "b"]);
  });
});

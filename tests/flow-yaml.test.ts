import { describe, it, expect } from "vitest";
import {
  renderFlowYaml,
  extractFlowFromYaml,
} from "../src/ui/lib/flow-yaml.js";
import { pickupAnalysisFlow } from "../src/flows/catalog/builtin-flows.js";
import type { FlowDefinition } from "../src/ui/lib/types.js";

describe("flow-yaml client helpers (raw-YAML escape hatch)", () => {
  it("round-trips a real flow definition through render -> extract", () => {
    const yaml = renderFlowYaml(pickupAnalysisFlow as unknown as FlowDefinition);
    expect(yaml).toContain("id: pickup-analysis");
    const out = extractFlowFromYaml(yaml);
    expect(out.error).toBeUndefined();
    expect(out.id).toBe("pickup-analysis");
    // The parsed object preserves the band + a graph edge.
    expect(out.definition?.checklistSegment).toEqual({
      from: "micro-plan",
      to: "implement",
    });
  });

  it("reports a clear error for invalid YAML", () => {
    const out = extractFlowFromYaml("id: [unclosed");
    expect(out.definition).toBeUndefined();
    expect(out.error).toMatch(/YAML parse error/);
  });

  it("rejects YAML that isn't a single object", () => {
    expect(extractFlowFromYaml("- a\n- b").error).toMatch(/single Flow/);
    expect(extractFlowFromYaml("just a string").error).toBeDefined();
  });

  it("requires a string id", () => {
    expect(extractFlowFromYaml("label: No id here\nversion: 1").error).toMatch(
      /needs a string `id`/,
    );
  });
});

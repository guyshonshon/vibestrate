import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { FlowsPage } from "../src/shell/ink/pages/FlowsPage.js";
import {
  isGraphSteps,
  layersOf,
} from "../src/flows/runtime/flow-graph-layout.js";
import type { DiscoveredFlow } from "../src/flows/catalog/flow-discovery.js";
import type { FlowDefinition } from "../src/flows/schemas/flow-schema.js";
import {
  defaultFlow,
  reviewPanelFlow,
} from "../src/flows/catalog/builtin-flows.js";

// Wrap a builtin definition the way flow-discovery does, then render the
// Flows page detail pane and return the painted frame.
function frameFor(definition: FlowDefinition): string {
  const flow: DiscoveredFlow = {
    id: definition.id,
    version: definition.version,
    label: definition.label,
    description: definition.description,
    source: { kind: "builtin", ref: definition.id },
    definitionPath: null,
    definition,
  };
  const { lastFrame } = render(
    React.createElement(FlowsPage, {
      projectRoot: "/tmp/flow-graph-test",
      flows: [flow],
      refresh: async () => {},
      onToast: () => {},
      selectedIndex: 0,
      setSelectedIndex: () => {},
      hubUi: { hubOpen: false, hubFilterOpen: false, hubQuery: "" },
      dispatch: () => {},
      sessionFlowId: null,
      config: null,
      active: false,
    }),
  );
  return lastFrame() ?? "";
}

describe("shared graph layout (new module path)", () => {
  it("re-uses the same layering the web/CLI rely on", () => {
    expect(isGraphSteps(reviewPanelFlow.steps)).toBe(true);
    expect(isGraphSteps(defaultFlow.steps)).toBe(false);
    // The three reviewers share validation as their need -> one parallel layer.
    const reviewerLayer = layersOf(reviewPanelFlow.steps).find(
      (layer) => layer.length > 1,
    );
    expect(reviewerLayer?.map((s) => s.id).sort()).toEqual([
      "review-correctness",
      "review-risk",
      "review-tests",
    ]);
  });
});

describe("TUI flow detail graph render", () => {
  it("draws the DAG with its parallel fan-out for a graph flow", () => {
    const frame = frameFor(reviewPanelFlow);
    expect(frame).toContain("graph ·");
    expect(frame).toContain("parallel ×3");
    expect(frame).toContain("Arbiter verdict");
  });

  it("falls back to a plain numbered list for a linear flow", () => {
    const frame = frameFor(defaultFlow);
    expect(frame).toContain("steps ·");
    expect(frame).not.toContain("parallel ×");
  });
});

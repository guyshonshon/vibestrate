import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { CompletionOverlay } from "../src/shell/ink/components/CompletionOverlay.js";
import type { CompletionItem } from "../src/shell/ink/completion.js";

const items: CompletionItem[] = [
  { value: "view", kind: "command", description: "readable grouped view" },
  { value: "show", kind: "command", description: "raw YAML" },
  { value: "set", kind: "command", description: "edit one value" },
];

describe("CompletionOverlay", () => {
  it("renders candidates with the selected row marked + a hint", () => {
    const { lastFrame } = render(
      React.createElement(CompletionOverlay, { items, selectedIndex: 1 }),
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("view");
    expect(frame).toContain("show");
    expect(frame).toContain("readable grouped view");
    expect(frame).toContain("⇥ complete");
    // The selection marker sits on the second row (index 1).
    expect(frame).toContain("› show");
  });

  it("renders nothing when there are no items", () => {
    const { lastFrame } = render(
      React.createElement(CompletionOverlay, { items: [], selectedIndex: 0 }),
    );
    expect((lastFrame() ?? "").trim()).toBe("");
  });
});

import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import {
  CompletionOverlay,
  COMPLETION_SLOT_ROWS,
} from "../src/shell/ink/components/CompletionOverlay.js";
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

  it("shows the selected item's detail (tip) on its own line", () => {
    const withDetail: CompletionItem[] = [
      { value: "git.mainBranch", kind: "value", description: "= main", detail: "Branch runs merge into." },
      { value: "git.branchPrefix", kind: "value", description: "= vibestrate/", detail: "Prefix for run branches." },
    ];
    const { lastFrame } = render(
      React.createElement(CompletionOverlay, { items: withDetail, selectedIndex: 1 }),
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("= vibestrate/");
    // The selected row's tip is on its own line; the other row's is not shown.
    expect(frame).toContain("Prefix for run branches.");
    expect(frame).not.toContain("Branch runs merge into.");
  });

  it("renders nothing when there are no items", () => {
    const { lastFrame } = render(
      React.createElement(CompletionOverlay, { items: [], selectedIndex: 0 }),
    );
    expect((lastFrame() ?? "").trim()).toBe("");
  });

  it("windows a long list and never exceeds the reserved slot height", () => {
    const many: CompletionItem[] = Array.from({ length: 30 }, (_, i) => ({
      value: `key${i}`,
      kind: "value",
      description: `= v${i}`,
    }));
    const { lastFrame } = render(
      React.createElement(CompletionOverlay, { items: many, selectedIndex: 15 }),
    );
    const frame = lastFrame() ?? "";
    const rows = frame.split("\n").filter((l) => l.trim().length > 0);
    // The App reserves exactly COMPLETION_SLOT_ROWS below the prompt; the
    // overlay must never render taller than that or it would push the layout.
    expect(rows.length).toBeLessThanOrEqual(COMPLETION_SLOT_ROWS);
    expect(frame).toMatch(/more/);
  });
});

import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { TabBar } from "../src/shell/ink/components/TabBar.js";

function frame(width: number, current = "profiles" as const): string {
  const { lastFrame } = render(
    React.createElement(TabBar, { current, width }),
  );
  return lastFrame() ?? "";
}

describe("TabBar", () => {
  it("shows every page label at a wide width", () => {
    const out = frame(120);
    expect(out).toContain("Dashboard");
    expect(out).toContain("Profiles");
    expect(out).toContain("Consult");
  });

  it("collapses to numeric hotkeys on a narrow terminal, labelling only the active page", () => {
    const out = frame(50, "profiles");
    // Active page keeps its label...
    expect(out).toContain("Profiles");
    // ...inactive labels are dropped (only their hotkey number remains).
    expect(out).not.toContain("Dashboard");
    expect(out).not.toContain("Consult");
    // The active page's hotkey is shown, and so are other pages' numbers.
    expect(out).toContain("[4]");
    expect(out).toContain("1");
  });

  it("renders the narrow nav on a single row (no wrapped label rows)", () => {
    const out = frame(50);
    const labelRows = out
      .split("\n")
      .filter((line) => line.trim().length > 0);
    expect(labelRows.length).toBe(1);
  });
});

import { describe, it, expect } from "vitest";
import React from "react";
import { Box, Text } from "ink";
import { render } from "ink-testing-library";

/**
 * Spike + regression: the command input must NOT move when the completion list
 * opens/closes. The fix is structural: a fixed-height root, the prompt ABOVE a
 * flexGrow body, and the completion slot between them. When the list opens the
 * body shrinks (clips) to make room, so the prompt's row never changes - the
 * app never grows past the viewport and never scrolls.
 */
function Layout({ open }: { open: boolean }) {
  return React.createElement(
    Box,
    { flexDirection: "column", height: 20 },
    React.createElement(Text, { key: "h" }, "HEADER"),
    React.createElement(Text, { key: "p" }, "PROMPT_MARKER"),
    open
      ? React.createElement(
          Box,
          { key: "c", height: 5, flexDirection: "column" },
          ...Array.from({ length: 5 }, (_, i) =>
            React.createElement(Text, { key: `c${i}` }, `CAND_${i}`),
          ),
        )
      : null,
    // Mirror the real body: a bordered, padded Panel-like box that flexGrows
    // and clips - to prove the border doesn't defeat the shrink/clip.
    React.createElement(
      Box,
      {
        key: "b",
        flexGrow: 1,
        minHeight: 0,
        flexDirection: "column",
        overflow: "hidden",
        borderStyle: "round",
        paddingX: 1,
      },
      ...Array.from({ length: 40 }, (_, i) =>
        React.createElement(Text, { key: `b${i}` }, `BODY_${i}`),
      ),
    ),
  );
}

function rowOf(frame: string, needle: string): number {
  return frame.split("\n").findIndex((l) => l.includes(needle));
}

describe("prompt stays fixed when the completion list toggles", () => {
  it("prompt row is identical with the list closed vs open", () => {
    const closed = render(React.createElement(Layout, { open: false }));
    const closedFrame = closed.lastFrame() ?? "";
    const openR = render(React.createElement(Layout, { open: true }));
    const openFrame = openR.lastFrame() ?? "";

    const promptClosed = rowOf(closedFrame, "PROMPT_MARKER");
    const promptOpen = rowOf(openFrame, "PROMPT_MARKER");
    expect(promptClosed).toBeGreaterThanOrEqual(0);
    expect(promptOpen).toBe(promptClosed);
  });

  it("the app never exceeds the fixed viewport height (no scroll)", () => {
    const openR = render(React.createElement(Layout, { open: true }));
    const lines = (openR.lastFrame() ?? "").split("\n");
    expect(lines.length).toBeLessThanOrEqual(20);
  });

  it("the body clips (loses bottom rows) instead of growing the app", () => {
    const closed = render(React.createElement(Layout, { open: false }));
    const openR = render(React.createElement(Layout, { open: true }));
    const bodyLinesClosed = (closed.lastFrame() ?? "")
      .split("\n")
      .filter((l) => l.includes("BODY_")).length;
    const bodyLinesOpen = (openR.lastFrame() ?? "")
      .split("\n")
      .filter((l) => l.includes("BODY_")).length;
    // Opening the list steals rows from the body, it doesn't add app height.
    expect(bodyLinesOpen).toBeLessThan(bodyLinesClosed);
  });
});

import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import {
  PromptInput,
  nextWordOffset,
  prevWordOffset,
} from "../src/shell/ink/components/PromptInput.js";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("word-offset helpers", () => {
  const s = 'run "add dark mode" --effort high';
  it("nextWordOffset lands at the end of the next word", () => {
    expect(nextWordOffset(s, 0)).toBe(3); // end of "run"
    expect(nextWordOffset(s, 3)).toBe(8); // skips ' "' to end of "add"
    // from the end, stays at the end
    expect(nextWordOffset(s, s.length)).toBe(s.length);
  });
  it("prevWordOffset lands at the start of the previous word", () => {
    expect(prevWordOffset(s, s.length)).toBe(s.length - 4); // start of "high"
    expect(prevWordOffset(s, 3)).toBe(0); // back to start of "run"
    expect(prevWordOffset(s, 0)).toBe(0);
  });
  it("treats runs of non-word chars as a single gap", () => {
    expect(nextWordOffset("a   b", 1)).toBe(5); // skip spaces + "b"
    expect(prevWordOffset("a   b", 4)).toBe(0); // wait: pos 4 = before 'b'
  });
});

// Stateful wrapper so onChange feeds the value back, like the App reducer does.
function Harness({ initial = "" }: { initial?: string }) {
  const [v, setV] = React.useState(initial);
  return React.createElement(PromptInput, { value: v, onChange: setV, focus: true });
}

describe("PromptInput", () => {
  it("inserts typed characters at the cursor and renders them", async () => {
    const { stdin, lastFrame } = render(React.createElement(Harness));
    stdin.write("h");
    await delay(20);
    stdin.write("i");
    await delay(20);
    expect((lastFrame() ?? "").includes("hi")).toBe(true);
  });

  it("backspace deletes before the cursor", async () => {
    const { stdin, lastFrame } = render(
      React.createElement(Harness, { initial: "ab" }),
    );
    await delay(20);
    stdin.write("\x7f"); // backspace
    await delay(20);
    const frame = lastFrame() ?? "";
    expect(frame.includes("a")).toBe(true);
    expect(frame.includes("ab")).toBe(false);
  });

  it("shows the placeholder when empty + focused", async () => {
    const { lastFrame } = render(
      React.createElement(PromptInput, {
        value: "",
        onChange: () => {},
        focus: true,
        placeholder: "type here",
      }),
    );
    await delay(20);
    expect(lastFrame() ?? "").toContain("type here");
  });
});

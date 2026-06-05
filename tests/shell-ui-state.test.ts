import { describe, it, expect } from "vitest";
import {
  initialUiState,
  reduceShellUi,
  pageIdFromHotkey,
  PAGE_IDS,
} from "../src/shell/ink/ui-state.js";

describe("reduceShellUi", () => {
  it("switches pages and clears modal layers", () => {
    const opened = reduceShellUi(initialUiState, { type: "palette.open" });
    const helped = reduceShellUi(opened, { type: "help.toggle" });
    const navigated = reduceShellUi(helped, { type: "page.set", page: "roadmap" });
    expect(navigated.page).toBe("roadmap");
    expect(navigated.paletteOpen).toBe(false);
    expect(navigated.helpOpen).toBe(false);
    expect(navigated.pendingConfirm).toBeNull();
  });

  it("clamps selection.move to the [0, max] range", () => {
    let s = reduceShellUi(initialUiState, {
      type: "selection.move",
      page: "runs",
      delta: -5,
      max: 10,
    });
    expect(s.selection.runs).toBe(0);
    s = reduceShellUi(s, { type: "selection.move", page: "runs", delta: 50, max: 10 });
    expect(s.selection.runs).toBe(10);
    s = reduceShellUi(s, { type: "selection.move", page: "runs", delta: -3, max: 10 });
    expect(s.selection.runs).toBe(7);
  });

  it("keeps a separate selection cursor per page", () => {
    let s = reduceShellUi(initialUiState, {
      type: "selection.set",
      page: "runs",
      index: 4,
    });
    s = reduceShellUi(s, { type: "selection.set", page: "roadmap", index: 2 });
    expect(s.selection.runs).toBe(4);
    expect(s.selection.roadmap).toBe(2);
  });

  it("pushes toasts and caps the queue at 3", () => {
    let s = initialUiState;
    for (let i = 0; i < 5; i += 1) {
      s = reduceShellUi(s, {
        type: "toast.push",
        kind: "info",
        message: `t${i}`,
      });
    }
    expect(s.toasts.length).toBe(3);
    expect(s.toasts.map((t) => t.message)).toEqual(["t2", "t3", "t4"]);
  });

  it("toast.dismiss removes by id", () => {
    let s = reduceShellUi(initialUiState, {
      type: "toast.push",
      kind: "ok",
      message: "hi",
    });
    const id = s.toasts[0]!.id;
    s = reduceShellUi(s, { type: "toast.dismiss", id });
    expect(s.toasts).toEqual([]);
  });
});

describe("runs inspector + filter actions", () => {
  it("runs.inspector.cycle rotates through the three sub-tabs", () => {
    let s = initialUiState;
    expect(s.runs.inspectorTab).toBe("overview");
    s = reduceShellUi(s, { type: "runs.inspector.cycle", direction: 1 });
    expect(s.runs.inspectorTab).toBe("events");
    s = reduceShellUi(s, { type: "runs.inspector.cycle", direction: 1 });
    expect(s.runs.inspectorTab).toBe("validation");
    s = reduceShellUi(s, { type: "runs.inspector.cycle", direction: 1 });
    expect(s.runs.inspectorTab).toBe("overview");
    s = reduceShellUi(s, { type: "runs.inspector.cycle", direction: -1 });
    expect(s.runs.inspectorTab).toBe("validation");
  });

  it("runs.filter.open jumps to the events tab and opens the filter input", () => {
    const s = reduceShellUi(initialUiState, { type: "runs.filter.open" });
    expect(s.runs.eventFilterOpen).toBe(true);
    expect(s.runs.inspectorTab).toBe("events");
  });

  it("page.set clears the open filter input", () => {
    let s = reduceShellUi(initialUiState, { type: "runs.filter.open" });
    s = reduceShellUi(s, { type: "runs.filter.set", value: "fail" });
    s = reduceShellUi(s, { type: "page.set", page: "dashboard" });
    // The reducer doesn't reset the filter text (so going back to Runs
    // keeps the user's last query) but it does close modal layers.
    expect(s.runs.eventFilter).toBe("fail");
    expect(s.paletteOpen).toBe(false);
    expect(s.helpOpen).toBe(false);
  });
});

describe("page history / back", () => {
  it("page.set pushes the previous page onto history", () => {
    let s = reduceShellUi(initialUiState, { type: "page.set", page: "runs" });
    s = reduceShellUi(s, { type: "page.set", page: "roadmap" });
    expect(s.page).toBe("roadmap");
    expect(s.pageHistory).toEqual(["dashboard", "runs"]);
  });

  it("page.set does not push when the page is already current", () => {
    const s = reduceShellUi(initialUiState, {
      type: "page.set",
      page: "dashboard",
    });
    expect(s.pageHistory).toEqual([]);
  });

  it("page.back pops history and navigates to the previous page", () => {
    let s = reduceShellUi(initialUiState, { type: "page.set", page: "runs" });
    s = reduceShellUi(s, { type: "page.set", page: "roadmap" });
    s = reduceShellUi(s, { type: "page.back" });
    expect(s.page).toBe("runs");
    s = reduceShellUi(s, { type: "page.back" });
    expect(s.page).toBe("dashboard");
    expect(s.pageHistory).toEqual([]);
  });

  it("page.back is a no-op when history is empty", () => {
    const s = reduceShellUi(initialUiState, { type: "page.back" });
    expect(s.page).toBe("dashboard");
  });

  it("history is capped at 16 entries", () => {
    let s = initialUiState;
    const targets: Array<typeof initialUiState.page> = [
      "runs",
      "roadmap",
      "crew",
      "skills",
      "approvals",
    ];
    for (let i = 0; i < 50; i += 1) {
      s = reduceShellUi(s, {
        type: "page.set",
        page: targets[i % targets.length]!,
      });
    }
    expect(s.pageHistory.length).toBeLessThanOrEqual(16);
  });
});

describe("palette cursor", () => {
  it("opens with cursor 0", () => {
    const s = reduceShellUi(initialUiState, { type: "palette.open" });
    expect(s.paletteSelectedIndex).toBe(0);
  });

  it("typing into the palette resets the cursor", () => {
    let s = reduceShellUi(initialUiState, { type: "palette.open" });
    s = reduceShellUi(s, {
      type: "palette.cursor.set",
      index: 3,
    });
    expect(s.paletteSelectedIndex).toBe(3);
    s = reduceShellUi(s, { type: "palette.query", value: "run" });
    expect(s.paletteSelectedIndex).toBe(0);
  });

  it("palette.cursor.move clamps to [0, max]", () => {
    let s = reduceShellUi(initialUiState, { type: "palette.open" });
    s = reduceShellUi(s, { type: "palette.cursor.move", delta: -2, max: 5 });
    expect(s.paletteSelectedIndex).toBe(0);
    s = reduceShellUi(s, { type: "palette.cursor.move", delta: 50, max: 5 });
    expect(s.paletteSelectedIndex).toBe(5);
    s = reduceShellUi(s, { type: "palette.cursor.move", delta: -1, max: 5 });
    expect(s.paletteSelectedIndex).toBe(4);
  });
});

describe("pageIdFromHotkey", () => {
  it("maps '1'..'9' to the first nine pages in order", () => {
    expect(pageIdFromHotkey("1")).toBe(PAGE_IDS[0]);
    expect(pageIdFromHotkey("3")).toBe(PAGE_IDS[2]);
    expect(pageIdFromHotkey("9")).toBe(PAGE_IDS[8]);
  });

  it("maps '0' to the tenth page", () => {
    expect(pageIdFromHotkey("0")).toBe(PAGE_IDS[9]);
  });

  it("returns null for unrelated keys", () => {
    expect(pageIdFromHotkey("q")).toBeNull();
    expect(pageIdFromHotkey("z")).toBeNull();
  });
});

describe("reduceShellUi - session context + prompt + picker", () => {
  it("cycles the safety mode write → read-only → write", () => {
    const a = reduceShellUi(initialUiState, { type: "session.mode.cycle" });
    expect(a.session.mode).toBe("read-only");
    const b = reduceShellUi(a, { type: "session.mode.cycle" });
    expect(b.session.mode).toBe("write");
  });

  it("sets the session crew and flow", () => {
    const a = reduceShellUi(initialUiState, { type: "session.crew.set", crewId: "core" });
    const b = reduceShellUi(a, { type: "session.flow.set", flowId: "pickup" });
    expect(b.session.crewId).toBe("core");
    expect(b.session.flowId).toBe("pickup");
  });

  it("focusing the prompt closes other modal layers", () => {
    const opened = reduceShellUi(initialUiState, { type: "palette.open" });
    const focused = reduceShellUi(opened, { type: "prompt.focus" });
    expect(focused.promptFocused).toBe(true);
    expect(focused.paletteOpen).toBe(false);
    expect(reduceShellUi(focused, { type: "prompt.blur" }).promptFocused).toBe(false);
  });

  it("scrolls the output pane and clamps at the bottom", () => {
    const up = reduceShellUi(initialUiState, { type: "runner.scroll", delta: 5 });
    expect(up.runner.scroll).toBe(5);
    const down = reduceShellUi(up, { type: "runner.scroll", delta: -10 });
    expect(down.runner.scroll).toBe(0);
  });

  it("running a command resets the output scroll", () => {
    const scrolled = reduceShellUi(initialUiState, { type: "runner.scroll", delta: 9 });
    const started = reduceShellUi(scrolled, { type: "runner.started" });
    expect(started.runner.scroll).toBe(0);
  });

  it("drives the docs browser open → loaded → select → content → scroll → close", () => {
    const open = reduceShellUi(initialUiState, { type: "docs.open" });
    expect(open.docs.open).toBe(true);
    const loaded = reduceShellUi(open, {
      type: "docs.loaded",
      topics: [
        { slug: "a", label: "A", section: "S" },
        { slug: "b", label: "B", section: "S" },
      ],
    });
    const sel = reduceShellUi(loaded, { type: "docs.select", index: 1 });
    expect(sel.docs.index).toBe(1);
    expect(sel.docs.loadingContent).toBe(true);
    // index wraps
    expect(reduceShellUi(loaded, { type: "docs.select", index: -1 }).docs.index).toBe(1);
    const content = reduceShellUi(sel, { type: "docs.content", lines: [[{ text: "x" }]] });
    expect(content.docs.loadingContent).toBe(false);
    expect(content.docs.lines).toHaveLength(1);
    const scrolled = reduceShellUi(content, { type: "docs.scroll", delta: 5 });
    expect(scrolled.docs.scroll).toBe(5);
    expect(reduceShellUi(scrolled, { type: "docs.close" }).docs.open).toBe(false);
  });

  it("opens, wraps, and closes the crew/flow picker", () => {
    const items = [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ];
    const open = reduceShellUi(initialUiState, {
      type: "picker.open",
      kind: "crew",
      items,
      index: 0,
    });
    expect(open.picker?.kind).toBe("crew");
    const down = reduceShellUi(open, { type: "picker.move", delta: 1 });
    expect(down.picker?.index).toBe(1);
    // wraps past the end
    expect(reduceShellUi(down, { type: "picker.move", delta: 1 }).picker?.index).toBe(0);
    expect(reduceShellUi(open, { type: "picker.close" }).picker).toBeNull();
  });
});

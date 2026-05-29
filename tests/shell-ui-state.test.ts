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
      "queue",
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

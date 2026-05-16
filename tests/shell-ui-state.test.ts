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

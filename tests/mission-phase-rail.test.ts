import { describe, it, expect } from "vitest";
import {
  PHASES,
  phaseStates,
} from "../src/ui/components/mission/phaseRail.js";

describe("phaseStates", () => {
  it("marks earlier phases done and the current phase active", () => {
    const s = phaseStates({ status: "reviewing", pausedAtStatus: null });
    // PHASES index 4 = review
    expect(s.slice(0, 4)).toEqual(["done", "done", "done", "done"]);
    expect(s[4]).toBe("active");
    expect(s.slice(5)).toEqual(["pending", "pending", "pending"]);
  });

  it("renders blocked on the anchor when status is failed", () => {
    const s = phaseStates({ status: "failed", pausedAtStatus: null });
    expect(s.every((v) => v === "blocked" || v === "pending")).toBe(true);
  });

  it("renders awaiting on the paused-at phase when waiting for approval", () => {
    const s = phaseStates({
      status: "waiting_for_approval",
      pausedAtStatus: "executing",
    });
    const execIdx = PHASES.findIndex((p) => p.key === "exec");
    expect(s[execIdx]).toBe("awaiting");
    expect(s.slice(0, execIdx).every((v) => v === "done")).toBe(true);
  });

  it("merge_ready marks every phase done up to and including ready", () => {
    const s = phaseStates({ status: "merge_ready", pausedAtStatus: null });
    expect(s[s.length - 1]).toBe("active");
    expect(s.slice(0, -1).every((v) => v === "done")).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { applySessionDefaults } from "../src/shell/ink/session-defaults.js";
import type { SessionState } from "../src/shell/ink/ui-state.js";

const session = (over: Partial<SessionState> = {}): SessionState => ({
  mode: "write",
  crewId: null,
  flowId: null,
  ...over,
});

describe("applySessionDefaults (seed the next prompt-launched run)", () => {
  it("leaves non-run commands untouched", () => {
    expect(applySessionDefaults(["status", "--json"], session({ crewId: "core" }))).toEqual([
      "status",
      "--json",
    ]);
  });

  it("injects --crew / --flow / --read-only for a run", () => {
    const out = applySessionDefaults(
      ["run", "add dark mode"],
      session({ crewId: "core", flowId: "pickup", mode: "read-only" }),
    );
    expect(out).toEqual([
      "run",
      "add dark mode",
      "--crew",
      "core",
      "--flow",
      "pickup",
      "--read-only",
    ]);
  });

  it("never overrides flags the user already typed", () => {
    const out = applySessionDefaults(
      ["run", "task", "--crew", "mine", "--flow", "default"],
      session({ crewId: "core", flowId: "pickup" }),
    );
    expect(out).toEqual(["run", "task", "--crew", "mine", "--flow", "default"]);
  });

  it("write mode adds no --read-only", () => {
    expect(applySessionDefaults(["run", "task"], session({ mode: "write" }))).toEqual([
      "run",
      "task",
    ]);
  });
});

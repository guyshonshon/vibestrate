import { describe, it, expect } from "vitest";
import { defaultFlow, deepFlow } from "../src/flows/catalog/flows/core.js";
import { builtinPermissionProfiles, resolveProfile } from "../src/safety/permission-profiles.js";
import { buildClaudeCodeArgs } from "../src/providers/claude-code-settings.js";
import { effectiveDisallowedTools } from "../src/providers/claude-code-provider.js";

/**
 * The lean default flow: planner -> executor -> reviewer, with review findings
 * re-entering the IMPLEMENT step itself (no dedicated fixer seat), and a
 * reviewer that can execute the tests it judges without gaining write tools.
 * Each block pins one half of that reshape (2026-08-27).
 */
describe("default flow is the three-seat loop", () => {
  it("seats exactly planner, implementer, reviewer", () => {
    expect(Object.keys(defaultFlow.seats).sort()).toEqual([
      "implementer",
      "planner",
      "reviewer",
    ]);
  });

  it("the loop re-enters implement, gated by the review decision", () => {
    expect(defaultFlow.loop).toMatchObject({
      from: "implement",
      to: "review",
      decisionStep: "review",
    });
  });

  it("implement declares the findings input - the loop re-entry lane", () => {
    // Without this token the re-entered executor runs blind: findings resolve
    // from the shared outputs map, empty on pass one, the review ledger after.
    const implement = defaultFlow.steps.find((s) => s.id === "implement");
    expect(implement?.inputs).toContain("findings");
    expect(implement?.inputs).toContain("validation");
  });

  it("has no verify summary-turn: APPROVED review + validation is the bar", () => {
    expect(defaultFlow.steps.some((s) => s.kind === "summary-turn")).toBe(false);
  });

  it("the six-seat pipeline survives as `deep`", () => {
    expect(deepFlow.id).toBe("deep");
    expect(Object.keys(deepFlow.seats).sort()).toEqual([
      "architect",
      "fixer",
      "implementer",
      "planner",
      "reviewer",
      "verifier",
    ]);
    expect(deepFlow.steps.some((s) => s.kind === "summary-turn")).toBe(true);
  });
});

describe("review_exec: shell without writes, enforced at the tool layer", () => {
  it("the builtin profile grants shell and denies writes", () => {
    const p = resolveProfile({}, "review_exec");
    expect(p.allowShell).toBe(true);
    expect(p.allowWrite).toBe(false);
    // and the read-only clamp target stays shell-less
    expect(builtinPermissionProfiles.read_only!.allowShell).toBe(false);
  });

  it("a shell-capable turn gets acceptEdits so headless commands run", () => {
    const args = buildClaudeCodeArgs([], undefined, { shellCapable: true });
    const i = args.indexOf("--permission-mode");
    expect(args[i + 1]).toBe("acceptEdits");
  });

  it("a shell-capable turn loses the edit tools at the invocation", () => {
    expect(effectiveDisallowedTools(true, null).sort()).toEqual([
      "Edit",
      "NotebookEdit",
      "Write",
    ]);
    // merges with, never replaces, a profile's own list
    expect(effectiveDisallowedTools(true, ["Task"])).toContain("Task");
    // and a non-shell turn is untouched
    expect(effectiveDisallowedTools(false, ["Task"])).toEqual(["Task"]);
  });

  it("an explicit permissionMode in settings still wins", () => {
    const args = buildClaudeCodeArgs([], { permissionMode: "plan" }, { shellCapable: true });
    expect(args.filter((a) => a === "--permission-mode")).toHaveLength(1);
    expect(args[args.indexOf("--permission-mode") + 1]).toBe("plan");
  });
});

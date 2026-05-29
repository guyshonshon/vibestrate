import { describe, it, expect } from "vitest";
import { hintForRoute } from "../src/ui/lib/cli-hints.js";
import type { Route } from "../src/ui/app/route.js";

describe("hintForRoute", () => {
  it("returns a non-empty hint for every Route kind", () => {
    const routes: Route[] = [
      { kind: "runs" },
      { kind: "run", runId: "run-abc" },
      { kind: "board" },
      { kind: "task", taskId: "T-1" },
      { kind: "queue" },
      { kind: "proposals" },
      { kind: "proposal", proposalId: "P-9" },
      { kind: "settings" },
      { kind: "project" },
      { kind: "codebase", filePath: null, line: null, runId: null },
      { kind: "codebase", filePath: "src/foo.ts", line: 12, runId: "run-1" },
      { kind: "git", runId: null },
    ];
    for (const r of routes) {
      const h = hintForRoute(r);
      expect(h.title.length).toBeGreaterThan(0);
      expect(h.blurb.length).toBeGreaterThan(0);
      expect(h.commands.length).toBeGreaterThan(0);
      for (const c of h.commands) {
        // Every CLI hint command should start with `vibe ` or `$EDITOR `
        // so the user always sees the actual command they'd type.
        expect(/^(vibe |\$EDITOR )/.test(c.cmd)).toBe(true);
      }
    }
  });

  it("interpolates the current runId into run-detail hints", () => {
    const h = hintForRoute({ kind: "run", runId: "run-xyz" });
    const joined = h.commands.map((c) => c.cmd).join("\n");
    expect(joined).toContain("vibe status run-xyz");
    expect(joined).toContain("vibe replay run-xyz");
    expect(joined).toContain("vibe pause run-xyz");
  });

  it("interpolates the current taskId into task-detail hints", () => {
    const h = hintForRoute({ kind: "task", taskId: "T-42" });
    const joined = h.commands.map((c) => c.cmd).join("\n");
    expect(joined).toContain("vibe tasks show T-42");
    expect(joined).toContain("vibe run --task T-42");
  });

  it("adds an $EDITOR command when a codebase path is active", () => {
    const withPath = hintForRoute({
      kind: "codebase",
      filePath: "src/foo.ts",
      line: 7,
      runId: null,
    });
    const withoutPath = hintForRoute({
      kind: "codebase",
      filePath: null,
      line: null,
      runId: null,
    });
    expect(withPath.commands[0]?.cmd).toBe("$EDITOR src/foo.ts:7");
    expect(withoutPath.commands.some((c) => c.cmd.startsWith("$EDITOR"))).toBe(
      false,
    );
  });

  it("includes run-flag tips on routes that can launch runs", () => {
    const tipsRuns = hintForRoute({ kind: "runs" }).tips ?? [];
    const tipsTask = hintForRoute({ kind: "task", taskId: "T-1" }).tips ?? [];
    expect(tipsRuns.some((t) => t.includes("--effort"))).toBe(true);
    expect(tipsRuns.some((t) => t.includes("--read-only"))).toBe(true);
    expect(tipsTask.some((t) => t.includes("--profile"))).toBe(true);
  });
});

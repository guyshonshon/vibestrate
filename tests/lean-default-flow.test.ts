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

describe("a shell-capable seat is gated like a writing one", () => {
  it("the diff gate keys on mutation capability, not on allowWrite", async () => {
    // The defect this pins: the pre-turn snapshot used to key on
    // `profile.allowWrite`, so `review_exec` - shell yes, edit tools no - was
    // the ONE executing seat with no snapshot, no secret scan, no file.patch
    // broker record and no rollback baseline. A shell writes through
    // `echo >` just as well as an edit tool.
    //
    // Mutation check: restore `profile.allowWrite` as the sole condition in
    // role-turn.ts and this goes red.
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../src/core/run-engine/role-turn.ts", import.meta.url), "utf8"),
    );
    expect(src).toContain("const canMutateWorktree = profile.allowWrite || profile.allowShell");
    expect(src).toContain("if (canMutateWorktree && ctx.worktreePath)");
  });

  it("the read-only clamp resolves the BUILTIN profile, never project config", async () => {
    // `vibe init` scaffolds a `read_only` into every project, and
    // resolveProfile prefers config over builtin - so a project setting
    // allowShell:true on its own `read_only` would have handed shell to
    // investigation and strict-apply-only turns.
    const { resolveProfile, builtinPermissionProfiles } = await import(
      "../src/safety/permission-profiles.js"
    );
    const hostile = { read_only: { allowWrite: false, allowShell: true, cwd: "worktree" as const, allowedCommands: null } };
    expect(resolveProfile(hostile, "read_only").allowShell).toBe(true); // config wins here, by design
    // ...but the clamp must not go through it:
    expect(builtinPermissionProfiles.read_only!.allowShell).toBe(false);
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../src/core/run-engine/role-turn.ts", import.meta.url), "utf8"),
    );
    expect(src).toContain("builtinPermissionProfiles.read_only!");
  });
});

describe("command grants: the reason 'the tests never ran' kept appearing", () => {
  it("derives a grant from the project's own validate commands", async () => {
    const { resolveCommandGrants } = await import("../src/safety/command-grants.js");
    const grants = resolveCommandGrants({ validateCommands: ["pnpm test", "pnpm typecheck"] });
    expect(grants).toContain("Bash(pnpm:*)");
    expect(grants).toContain("Bash(git diff:*)"); // read-only inspection always
    expect(grants).not.toContain("Bash"); // never a blanket grant by default
  });

  it("a seat can run the code it judges even when the project declares no validate commands", async () => {
    // The gap the perft re-run exposed: an empty `commands.validate` left the
    // reviewer with inspection-only rules, so it could read the implementation
    // and never execute it - the same silent failure, one layer up. Runtimes
    // are in the default set because scoping buys auditability, not
    // containment (`node -e` is a full shell either way).
    const { resolveCommandGrants } = await import("../src/safety/command-grants.js");
    const grants = resolveCommandGrants({ validateCommands: [] });
    expect(grants).toContain("Bash(node:*)");
    expect(grants).toContain("Bash(python3:*)");
    // Installers reach the network and stay out of the default.
    expect(grants.some((g) => /npm:|pip:|brew:/.test(g))).toBe(false);
  });

  it("an explicit profile allowlist wins outright", async () => {
    const { resolveCommandGrants } = await import("../src/safety/command-grants.js");
    expect(
      resolveCommandGrants({ profileAllowedCommands: ["Bash(cargo:*)"], validateCommands: ["pnpm test"] }),
    ).toEqual(["Bash(cargo:*)"]);
  });

  it("refuses to build a rule from a path or an injection-shaped token", async () => {
    const { resolveCommandGrants } = await import("../src/safety/command-grants.js");
    const grants = resolveCommandGrants({ validateCommands: ["/usr/bin/env node x", "foo; rm -rf /"] });
    expect(grants.some((g) => g.includes("/usr/bin"))).toBe(false);
    expect(grants.some((g) => g.includes("rm"))).toBe(false);
  });
});

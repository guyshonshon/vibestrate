import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolveFlow } from "../src/flows/runtime/flow-resolver.js";
import { flowDefinitionSchema } from "../src/flows/schemas/flow-schema.js";
import { projectConfigSchema, type ProjectConfig } from "../src/project/config-schema.js";

/**
 * One writer per worktree, and what it would take to change that.
 *
 * Steps sharing a `needs` set run CONCURRENTLY. Resolution refuses such a group
 * unless every member is a seated, read-only turn, because they would otherwise
 * write into the same worktree at the same time and interleave into a diff
 * neither agent produced.
 *
 * "Phase C write-parallelism" is the plan to lift this - isolated parallel
 * writers, agent-driven merge, validation-gated, human only at main. It is not
 * built, and this test exists so that whoever builds it has to delete something
 * that says why the rule is here, rather than discovering the reason from a
 * corrupted worktree.
 *
 * WHAT WOULD HAVE TO BE TRUE FIRST, verified against the code as it stands:
 *
 *   1. A run can hold more than one worktree. Today the path is derived from
 *      the runId alone (`<worktreeDir>/<runId>`), so "the run's worktree" is
 *      singular by construction, not by policy.
 *   2. Two agent-written diffs can be combined without a human. That is the
 *      "agent-driven merge" in the entry, and it is the hard half: a merge that
 *      silently picks a winner is worse than no parallelism.
 *   3. The combination is validation-gated before anything reaches the run's
 *      branch, so a merge nobody checked cannot become the run's result.
 *
 * Until all three hold, a parallel group of writers must keep failing at
 * RESOLVE time - before a run starts and before any worktree exists.
 */
const WRITER_PANEL = flowDefinitionSchema.parse({
  id: "two-writers",
  version: 1,
  label: "Two writers",
  description: "A parallel group of two write-capable steps - the shape Phase C would allow.",
  seats: {
    planner: { label: "Planner", description: "Plans." },
    implementer: { label: "Implementer", description: "Writes." },
  },
  steps: [
    { id: "plan", label: "Plan", kind: "agent-turn", seat: "planner", outputs: ["plan"] },
    {
      id: "write-a",
      label: "Write A",
      kind: "agent-turn",
      seat: "implementer",
      needs: ["plan"],
      outputs: ["execution-a"],
    },
    {
      id: "write-b",
      label: "Write B",
      kind: "agent-turn",
      seat: "implementer",
      needs: ["plan"],
      outputs: ["execution-b"],
    },
  ],
});

function configWithWritingImplementer(): ProjectConfig {
  // Parsed through the real schema rather than hand-cast: the resolver reads
  // fields a partial object does not have, and a cast would fail with
  // "cannot read properties of undefined" instead of the invariant under test.
  return projectConfigSchema.parse({
    project: { name: "t", type: "generic" },
    providers: { fake: { type: "cli", command: "node", args: [], input: "stdin" } },
    profiles: { p: { provider: "fake" } },
    crews: {
      default: {
        label: "Default",
        roles: {
          planner: { label: "P", seats: ["planner"], profile: "p", permissions: "read_only", prompt: ".vibestrate/roles/planner.json" },
          // Write-capable, and seated on the fanned-out step.
          impl: { label: "I", seats: ["implementer"], profile: "p", permissions: "code_write", prompt: ".vibestrate/roles/impl.json" },
        },
      },
    },
    defaultCrew: "default",
  }) as ProjectConfig;
}

describe("a parallel group of writers is refused before the run starts", () => {
  it("throws at resolve time, not at run time", () => {
    // Resolve time matters: no worktree exists yet, so there is nothing to
    // corrupt and nothing to clean up.
    expect(() =>
      resolveFlow({
        flow: WRITER_PANEL,
        source: { kind: "builtin", ref: "two-writers" },
        config: configWithWritingImplementer(),
        task: "write two things at once",
      }),
    ).toThrow(/parallel group|read-only|one writer per worktree/i);
  });

  it("names the role and the permission profile, so the fix is obvious", () => {
    let message = "";
    try {
      resolveFlow({
        flow: WRITER_PANEL,
        source: { kind: "builtin", ref: "two-writers" },
        config: configWithWritingImplementer(),
        task: "x",
      });
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toContain("impl");
    expect(message).toContain("code_write");
  });
});

describe("the schema refuses it one layer earlier", () => {
  it("rejects concurrent steps writing the same output, before any crew is known", () => {
    // Defence in depth: the resolver's check is crew-dependent (it needs to
    // know a role's permissions), so the schema catches the shape that is wrong
    // regardless of who fills the seats.
    const sameOutput = {
      ...JSON.parse(JSON.stringify(WRITER_PANEL)),
      steps: [
        { id: "plan", label: "Plan", kind: "agent-turn", seat: "planner", outputs: ["plan"] },
        { id: "a", label: "A", kind: "agent-turn", seat: "implementer", needs: ["plan"], outputs: ["execution"] },
        { id: "b", label: "B", kind: "agent-turn", seat: "implementer", needs: ["plan"], outputs: ["execution"] },
      ],
    };
    const parsed = flowDefinitionSchema.safeParse(sameOutput);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(JSON.stringify(parsed.error)).toContain("must write distinct outputs");
    }
  });
});

describe("the reason the rule exists is still true", () => {
  it("a run's worktree path is derived from the runId alone", () => {
    // This is precondition (1) for Phase C, checked rather than assumed: while
    // the path is a pure function of the runId, "the run's worktree" is
    // singular by construction and parallel writers have nowhere to go.
    const paths = readFileSync("src/utils/paths.ts", "utf8");
    const fn = paths.slice(paths.indexOf("export function runDir("));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).toContain("runId");
    // No second discriminator - no step id, no branch, no index.
    expect(body).not.toMatch(/stepId|branchName|index/);
  });

  it("the resolver still enforces it, rather than only documenting it", () => {
    const resolver = readFileSync("src/flows/runtime/flow-resolver.ts", "utf8");
    expect(resolver).toContain("assertParallelGroupsAreReadOnly");
    // A throw, not a warning: a warning would let the run start.
    expect(resolver).toContain("Parallel-group steps must be read-only");
  });
});

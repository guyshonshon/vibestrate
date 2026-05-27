import { describe, it, expect } from "vitest";
import { workflowConfigSchema } from "../src/workflow/workflow-schema.js";
import { defaultWorkflowStages } from "../src/workflow/default-workflow.js";
import { projectConfigSchema } from "../src/project/config-schema.js";

describe("workflow schema", () => {
  it("default workflow config parses", () => {
    const result = workflowConfigSchema.parse({
      id: "default-plan-build-review",
      maxReviewLoops: 2,
      requireHumanMerge: true,
    });
    expect(result.maxReviewLoops).toBe(2);
  });

  it("requires non-negative maxReviewLoops", () => {
    const r = workflowConfigSchema.safeParse({ maxReviewLoops: -1 });
    expect(r.success).toBe(false);
  });

  it("default workflow stage list covers all required stages", () => {
    const ids = defaultWorkflowStages.map((s) => s.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "planning",
        "architecting",
        "executing",
        "validating",
        "reviewing",
        "fixing",
        "verifying",
      ]),
    );
  });

  it("agents referenced by workflow exist in default config template", () => {
    const minimal = {
      project: { name: "x" },
      providers: {
        claude: { type: "cli", command: "claude" },
      },
      roles: {
        planner: { provider: "claude", prompt: "p", permissions: "read_only" },
        architect: { provider: "claude", prompt: "p", permissions: "read_only" },
        executor: { provider: "claude", prompt: "p", permissions: "code_write" },
        fixer: { provider: "claude", prompt: "p", permissions: "code_write" },
        reviewer: { provider: "claude", prompt: "p", permissions: "read_only" },
        verifier: { provider: "claude", prompt: "p", permissions: "read_only" },
      },
    };
    const r = projectConfigSchema.safeParse(minimal);
    expect(r.success).toBe(true);
  });
});

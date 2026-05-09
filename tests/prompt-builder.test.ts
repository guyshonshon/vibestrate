import { describe, it, expect } from "vitest";
import { buildAgentPrompt } from "../src/core/prompt-builder.js";
import type { PermissionProfile } from "../src/permissions/permission-schema.js";

const writeProfile: PermissionProfile = {
  allowWrite: true,
  allowShell: true,
  cwd: "worktree",
  forbiddenPaths: [".env"],
  forbiddenOperations: ["push"],
};
const readProfile: PermissionProfile = {
  allowWrite: false,
  allowShell: false,
  cwd: "worktree",
};

describe("prompt builder", () => {
  it("includes task, project rules, and role instructions", () => {
    const out = buildAgentPrompt({
      agentId: "planner",
      task: "Add policy reacceptance",
      rules: "## Rules\n- be careful",
      agentPromptTemplate: "Plan the work.",
      skills: [],
      priorArtifacts: [],
      permission: readProfile,
      permissionName: "read_only",
      worktreePath: "/tmp/wt",
      branchName: "amaco/x",
      projectName: "demo",
    });
    expect(out).toContain("Add policy reacceptance");
    expect(out).toContain("Project Rules");
    expect(out).toContain("be careful");
    expect(out).toContain("Plan the work.");
    expect(out).toContain("Amaco Agent: planner");
  });

  it("includes attached skills with names + content", () => {
    const out = buildAgentPrompt({
      agentId: "reviewer",
      task: "x",
      rules: "rules",
      agentPromptTemplate: "Review.",
      skills: [
        { name: "security", filePath: "/sec.md", content: "be safe" },
        { name: "testing", filePath: "/t.md", content: "test it" },
      ],
      priorArtifacts: [],
      permission: readProfile,
      permissionName: "read_only",
      worktreePath: "/wt",
      branchName: "b",
      projectName: "demo",
    });
    expect(out).toContain("# Attached Skills");
    expect(out).toContain("## security");
    expect(out).toContain("be safe");
    expect(out).toContain("## testing");
    expect(out).toContain("test it");
  });

  it("includes prior artifacts when given", () => {
    const out = buildAgentPrompt({
      agentId: "executor",
      task: "x",
      rules: "rules",
      agentPromptTemplate: "Execute.",
      skills: [],
      priorArtifacts: [
        { label: "Plan", content: "Plan content" },
        { label: "Architecture", content: "Arch content" },
      ],
      permission: writeProfile,
      permissionName: "code_write",
      worktreePath: "/wt",
      branchName: "b",
      projectName: "demo",
    });
    expect(out).toContain("# Prior Artifacts");
    expect(out).toContain("## Plan");
    expect(out).toContain("Plan content");
    expect(out).toContain("Arch content");
  });

  it("includes permission boundaries", () => {
    const writeOut = buildAgentPrompt({
      agentId: "executor",
      task: "x",
      rules: "rules",
      agentPromptTemplate: "Execute.",
      skills: [],
      priorArtifacts: [],
      permission: writeProfile,
      permissionName: "code_write",
      worktreePath: "/wt",
      branchName: "b",
      projectName: "demo",
    });
    expect(writeOut).toContain("All code changes must happen only in the git worktree");
    expect(writeOut).toContain("Forbidden paths");
    expect(writeOut).toContain(".env");
    expect(writeOut).toContain("Forbidden operations");
    expect(writeOut).toContain("push");

    const readOut = buildAgentPrompt({
      agentId: "reviewer",
      task: "x",
      rules: "rules",
      agentPromptTemplate: "Review.",
      skills: [],
      priorArtifacts: [],
      permission: readProfile,
      permissionName: "read_only",
      worktreePath: "/wt",
      branchName: "b",
      projectName: "demo",
    });
    expect(readOut).toContain("You are read-only");
  });

  it("does not inline .env contents", () => {
    const out = buildAgentPrompt({
      agentId: "planner",
      task: "x",
      rules: "rules",
      agentPromptTemplate: "Plan.",
      skills: [],
      priorArtifacts: [],
      permission: readProfile,
      permissionName: "read_only",
      worktreePath: "/wt",
      branchName: "b",
      projectName: "demo",
    });
    expect(out).not.toMatch(/SECRET_KEY=/);
    expect(out).not.toMatch(/AWS_ACCESS_KEY_ID=/);
  });
});

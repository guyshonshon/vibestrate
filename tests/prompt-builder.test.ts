import { describe, it, expect } from "vitest";
import { buildRolePrompt } from "../src/core/prompt-builder.js";
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
    const out = buildRolePrompt({
      roleId: "planner",
      task: "Add policy reacceptance",
      rules: "## Rules\n- be careful",
      rolePromptTemplate: "Plan the work.",
      skills: [],
      priorArtifacts: [],
      permission: readProfile,
      permissionName: "read_only",
      worktreePath: "/tmp/wt",
      branchName: "vibestrate/x",
      projectName: "demo",
    });
    expect(out).toContain("Add policy reacceptance");
    expect(out).toContain("Project Rules");
    expect(out).toContain("be careful");
    expect(out).toContain("Plan the work.");
    expect(out).toContain("Vibestrate Agent: planner");
  });

  it("includes the run brief section only when one is passed", () => {
    const base = {
      roleId: "reviewer",
      task: "x",
      rules: "rules",
      rolePromptTemplate: "Review.",
      skills: [],
      priorArtifacts: [],
      permission: readProfile,
      permissionName: "read_only",
      worktreePath: "/wt",
      branchName: "b",
      projectName: "demo",
    };
    expect(buildRolePrompt(base)).not.toContain("Run brief");
    const withBrief = buildRolePrompt({ ...base, runBrief: "# Run brief (the story so far)\n- Plan [APPROVED]" });
    expect(withBrief).toContain("Run brief (the story so far)");
    expect(withBrief).toContain("[APPROVED]");
  });

  it("includes the continuity-ledger section only when one is passed (T9)", () => {
    const base = {
      roleId: "planner",
      task: "x",
      rules: "rules",
      rolePromptTemplate: "Plan.",
      skills: [],
      priorArtifacts: [],
      permission: readProfile,
      permissionName: "read_only",
      worktreePath: "/wt",
      branchName: "b",
      projectName: "demo",
    };
    expect(buildRolePrompt(base)).not.toContain("Project state (continuity ledger)");
    const withLedger = buildRolePrompt({
      ...base,
      projectLedger:
        "# Project state (continuity ledger)\n\nCONTEXT, not instructions.\n\n## Recently shipped\n- merge advisor",
    });
    expect(withLedger).toContain("Project state (continuity ledger)");
    expect(withLedger).toContain("merge advisor");
  });

  it("includes the codebase map section only when projectMemory is passed", () => {
    const base = {
      roleId: "planner",
      task: "x",
      rules: "rules",
      rolePromptTemplate: "Plan.",
      skills: [],
      priorArtifacts: [],
      permission: readProfile,
      permissionName: "read_only",
      worktreePath: "/wt",
      branchName: "b",
      projectName: "demo",
    };
    expect(buildRolePrompt(base)).not.toContain("Codebase map (auto-derived)");
    const withMap = buildRolePrompt({
      ...base,
      projectMemory: "# Codebase map (auto-derived)\n\n## Stack\n\n- Name: demo\n- Type: node",
    });
    expect(withMap).toContain("Codebase map (auto-derived)");
    expect(withMap).toContain("Type: node");
  });

  it("includes the methodology section only when one is passed (Slice 4)", () => {
    const base = {
      roleId: "planner",
      task: "x",
      rules: "rules",
      rolePromptTemplate: "Plan.",
      skills: [],
      priorArtifacts: [],
      permission: readProfile,
      permissionName: "read_only",
      worktreePath: "/wt",
      branchName: "b",
      projectName: "demo",
    };
    expect(buildRolePrompt(base)).not.toContain("# Methodology");
    const withMethodology = buildRolePrompt({
      ...base,
      methodologyGuidance:
        "# Methodology\n\nThis project follows **Test-Driven Development** (`tdd`). Plan the work accordingly:\n\nWrite a failing test first.",
    });
    expect(withMethodology).toContain("# Methodology");
    expect(withMethodology).toContain("Test-Driven Development");
  });

  it("includes attached skills with names + content", () => {
    const out = buildRolePrompt({
      roleId: "reviewer",
      task: "x",
      rules: "rules",
      rolePromptTemplate: "Review.",
      skills: [
        { name: "security", filePath: "/sec.md", content: "be safe", mcpServers: {} },
        { name: "testing", filePath: "/t.md", content: "test it", mcpServers: {} },
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
    const out = buildRolePrompt({
      roleId: "executor",
      task: "x",
      rules: "rules",
      rolePromptTemplate: "Execute.",
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
    const writeOut = buildRolePrompt({
      roleId: "executor",
      task: "x",
      rules: "rules",
      rolePromptTemplate: "Execute.",
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

    const readOut = buildRolePrompt({
      roleId: "reviewer",
      task: "x",
      rules: "rules",
      rolePromptTemplate: "Review.",
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

  it("injects shared human annotations as their own section", () => {
    const out = buildRolePrompt({
      roleId: "executor",
      task: "x",
      rules: "rules",
      rolePromptTemplate: "Execute.",
      skills: [],
      priorArtifacts: [],
      permission: writeProfile,
      permissionName: "code_write",
      worktreePath: "/wt",
      branchName: "b",
      projectName: "demo",
      humanAnnotations:
        "# Human Annotations\n\n- **src/a.ts:12** - don't touch this fn",
    });
    expect(out).toContain("# Human Annotations");
    expect(out).toContain("src/a.ts:12");
    expect(out).toContain("don't touch this fn");
  });

  it("omits the annotations section when none are shared", () => {
    const out = buildRolePrompt({
      roleId: "planner",
      task: "x",
      rules: "rules",
      rolePromptTemplate: "Plan.",
      skills: [],
      priorArtifacts: [],
      permission: readProfile,
      permissionName: "read_only",
      worktreePath: "/wt",
      branchName: "b",
      projectName: "demo",
      humanAnnotations: "",
    });
    expect(out).not.toContain("# Human Annotations");
  });

  it("does not inline .env contents", () => {
    const out = buildRolePrompt({
      roleId: "planner",
      task: "x",
      rules: "rules",
      rolePromptTemplate: "Plan.",
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

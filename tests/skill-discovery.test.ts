import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { discoverSkills } from "../src/skills/skill-discovery.js";

async function tempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "vibestrate-skill-disc-"));
}

describe("skill discovery", () => {
  let projectRoot: string;
  beforeEach(async () => {
    projectRoot = await tempProject();
  });

  it("discovers SKILL.md from .claude/skills/<dir>/SKILL.md", async () => {
    const skillDir = path.join(projectRoot, ".claude", "skills", "design");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      `---\nname: design\ndescription: UI design rules\n---\n\n# Design rules\n\nUse 8px spacing.\n`,
    );
    const skills = await discoverSkills(projectRoot);
    expect(skills).toHaveLength(1);
    expect(skills[0]!.source).toBe("claude");
    expect(skills[0]!.name).toBe("design");
    expect(skills[0]!.description).toBe("UI design rules");
    expect(skills[0]!.bodyPreview).toContain("Design rules");
  });

  it("discovers SKILL.md from .vibestrate/skills/<dir>/SKILL.md and flat .md", async () => {
    const dirSkill = path.join(projectRoot, ".vibestrate", "skills", "security");
    await fs.mkdir(dirSkill, { recursive: true });
    await fs.writeFile(
      path.join(dirSkill, "SKILL.md"),
      `---\nname: security\ndescription: Security review checklist\n---\n\nBe careful.\n`,
    );

    await fs.mkdir(path.join(projectRoot, ".vibestrate", "skills"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(projectRoot, ".vibestrate", "skills", "testing.md"),
      `# Testing skill\nFlat-md format.\n`,
    );
    // README.md should be ignored.
    await fs.writeFile(
      path.join(projectRoot, ".vibestrate", "skills", "README.md"),
      `# Project Skills\nIgnored.\n`,
    );

    const skills = await discoverSkills(projectRoot);
    const names = skills.map((s) => s.name).sort();
    expect(names).toEqual(["security", "testing"]);
    const flat = skills.find((s) => s.name === "testing")!;
    expect(flat.source).toBe("vibestrate");
  });

  it("picks up sibling .mcp.json as the skill's MCP servers", async () => {
    const skillDir = path.join(projectRoot, ".claude", "skills", "fs-skill");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      `---\nname: fs-skill\n---\n\n# fs skill\n`,
    );
    await fs.writeFile(
      path.join(skillDir, ".mcp.json"),
      JSON.stringify({
        mcpServers: { fs: { command: "mcp-fs", args: ["--root", "/tmp"] } },
      }),
    );
    const [skill] = await discoverSkills(projectRoot);
    expect(skill?.mcpServers.fs?.command).toBe("mcp-fs");
    expect(skill?.mcpError).toBeNull();
  });

  it("surfaces a malformed .mcp.json as mcpError instead of throwing", async () => {
    const skillDir = path.join(projectRoot, ".claude", "skills", "broken");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      `---\nname: broken\n---\n\n# broken\n`,
    );
    await fs.writeFile(path.join(skillDir, ".mcp.json"), "{ not json");
    const [skill] = await discoverSkills(projectRoot);
    expect(skill?.mcpServers).toEqual({});
    expect(skill?.mcpError).toMatch(/not valid JSON/);
  });

  it("returns [] when no skill folders exist", async () => {
    const skills = await discoverSkills(projectRoot);
    expect(skills).toEqual([]);
  });

  it("does not read outside .claude/.vibestrate roots", async () => {
    const outside = path.join(projectRoot, "elsewhere", "SKILL.md");
    await fs.mkdir(path.dirname(outside), { recursive: true });
    await fs.writeFile(
      outside,
      `---\nname: rogue\n---\nshould not load.`,
    );
    const skills = await discoverSkills(projectRoot);
    expect(skills.find((s) => s.name === "rogue")).toBeUndefined();
  });
});

import path from "node:path";
import { ConfigError } from "../utils/errors.js";
import { readText, pathExists } from "../utils/fs.js";
import { isPathInside, projectSkillsDir } from "../utils/paths.js";
import { skillReferenceSchema, type LoadedSkill } from "./skill-schema.js";
import { discoverSkills } from "./skill-discovery.js";

export async function loadSkill(
  projectRoot: string,
  reference: string,
): Promise<LoadedSkill> {
  skillReferenceSchema.parse(reference);

  // 1. Try the legacy flat .amaco/skills/<name>.md path (kept for back-compat).
  const skillsDir = projectSkillsDir(projectRoot);
  const flatPath = path.join(skillsDir, `${reference}.md`);
  if (isPathInside(skillsDir, flatPath) && (await pathExists(flatPath))) {
    const content = await readText(flatPath);
    return { name: reference, filePath: flatPath, content, mcpServers: {} };
  }

  // 2. Fall back to discovery (handles .claude/skills/<dir>/SKILL.md and .amaco/skills/<dir>/SKILL.md).
  const discovered = await discoverSkills(projectRoot);
  const match = discovered.find((s) => s.name === reference);
  if (match) {
    if (match.mcpError) {
      throw new ConfigError(
        `Skill "${reference}" has an invalid .mcp.json: ${match.mcpError}`,
      );
    }
    const content = await readText(match.filePath);
    return {
      name: reference,
      filePath: match.filePath,
      content,
      mcpServers: match.mcpServers,
    };
  }

  throw new ConfigError(
    `Configured skill "${reference}" was not found. Looked at .amaco/skills/${reference}.md, .amaco/skills/<dir>/SKILL.md, and .claude/skills/<dir>/SKILL.md.`,
  );
}

export async function loadSkills(
  projectRoot: string,
  references: readonly string[],
): Promise<LoadedSkill[]> {
  const out: LoadedSkill[] = [];
  for (const ref of references) {
    out.push(await loadSkill(projectRoot, ref));
  }
  return out;
}

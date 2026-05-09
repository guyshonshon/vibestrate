import path from "node:path";
import { ConfigError } from "../utils/errors.js";
import { readText, pathExists } from "../utils/fs.js";
import { isPathInside, projectSkillsDir } from "../utils/paths.js";
import { skillReferenceSchema, type LoadedSkill } from "./skill-schema.js";

export async function loadSkill(
  projectRoot: string,
  reference: string,
): Promise<LoadedSkill> {
  skillReferenceSchema.parse(reference);
  const skillsDir = projectSkillsDir(projectRoot);
  const skillPath = path.join(skillsDir, `${reference}.md`);

  if (!isPathInside(skillsDir, skillPath)) {
    throw new ConfigError(`Skill path outside skills dir: ${reference}`);
  }

  if (!(await pathExists(skillPath))) {
    throw new ConfigError(
      `Configured skill "${reference}" not found at ${skillPath}.`,
    );
  }

  const content = await readText(skillPath);
  return { name: reference, filePath: skillPath, content };
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

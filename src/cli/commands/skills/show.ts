import { detectProject } from "../../../project/project-detector.js";
import {
  discoverSkills,
  findSkillByName,
} from "../../../skills/skill-discovery.js";
import { readText } from "../../../utils/fs.js";
import { color, header, indent, symbol } from "../../ui/format.js";

export async function runSkillsShow(name: string): Promise<number> {
  if (!name) {
    console.error(
      `${symbol.fail()} Skill name is required. Try ${color.bold("amaco skills list")} to see what is available.`,
    );
    return 1;
  }
  const detected = await detectProject(process.cwd());
  const skill = await findSkillByName(detected.projectRoot, name);
  if (!skill) {
    const all = await discoverSkills(detected.projectRoot);
    console.error(
      `${symbol.fail()} No skill named "${name}". Found: ${
        all.map((s) => s.name).join(", ") || "(none)"
      }.`,
    );
    return 1;
  }
  const body = await readText(skill.filePath);
  console.log(header(skill.name));
  console.log(indent(color.dim(`source: ${skill.source}`)));
  console.log(indent(color.dim(`path: ${skill.filePath}`)));
  if (skill.description) {
    console.log("");
    console.log(skill.description);
  }
  console.log("");
  console.log(body);
  return 0;
}

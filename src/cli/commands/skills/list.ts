import { detectProject } from "../../../project/project-detector.js";
import { discoverSkills } from "../../../skills/skill-discovery.js";
import { listRoleSkillAssignments } from "../../../skills/skill-assignment-service.js";
import { color, header, indent, symbol } from "../../ui/format.js";

export async function runSkillsList(opts: { json?: boolean }): Promise<number> {
  const detected = await detectProject(process.cwd());
  const skills = await discoverSkills(detected.projectRoot);
  let assignments: { roleId: string; skills: string[] }[] = [];
  try {
    assignments = await listRoleSkillAssignments(detected.projectRoot);
  } catch {
    // ignore — config may not exist yet
  }

  if (opts.json) {
    console.log(JSON.stringify({ skills, assignments }, null, 2));
    return 0;
  }

  if (skills.length === 0) {
    console.log(
      `${symbol.warn()} No skills discovered in ${color.dim(".amaco/skills/")} or ${color.dim(".claude/skills/")}.`,
    );
    console.log(
      `  ${symbol.arrow()} Drop a folder with ${color.bold("SKILL.md")} or a flat ${color.bold("<name>.md")} into ${color.dim(".amaco/skills/")}.`,
    );
    console.log("");
    console.log(
      color.dim(
        "Skills attach reusable instructions to agents at run time. They do not train the model.",
      ),
    );
    return 0;
  }

  console.log(header("Discovered skills:"));
  console.log("");
  for (const s of skills) {
    const using = assignments
      .filter((a) => a.skills.includes(s.name))
      .map((a) => a.roleId);
    console.log(`${color.bold(s.name)} ${color.dim(`(${s.source})`)}`);
    if (s.description) console.log(indent(color.dim(s.description)));
    console.log(indent(color.dim(s.filePath)));
    console.log(
      indent(
        using.length > 0
          ? `Assigned to: ${using.join(", ")}`
          : color.dim("Not assigned to any agent."),
      ),
    );
    console.log("");
  }
  console.log(
    color.dim(
      "Use `amaco skills assign <agent> <skill>` to attach a skill to an agent.",
    ),
  );
  return 0;
}

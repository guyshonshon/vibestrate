import { detectProject } from "../../../project/project-detector.js";
import { configExists } from "../../../project/config-loader.js";
import {
  assignSkillToRole,
  unassignSkillFromRole,
} from "../../../skills/skill-assignment-service.js";
import { color, indent, symbol } from "../../ui/format.js";
import { isVibestrateError } from "../../../utils/errors.js";

export async function runSkillsAssign(
  roleId: string,
  skillName: string,
): Promise<number> {
  return change(roleId, skillName, "assign");
}

export async function runSkillsUnassign(
  roleId: string,
  skillName: string,
): Promise<number> {
  return change(roleId, skillName, "unassign");
}

async function change(
  roleId: string,
  skillName: string,
  action: "assign" | "unassign",
): Promise<number> {
  if (!roleId || !skillName) {
    console.error(
      `${symbol.fail()} Both agent and skill are required. Example: ${color.bold(
        `vibe skills ${action} reviewer security`,
      )}`,
    );
    return 1;
  }
  const detected = await detectProject(process.cwd());
  if (!(await configExists(detected.projectRoot))) {
    console.error(
      `${symbol.fail()} No Vibestrate config found. Run ${color.bold("vibe init")} first.`,
    );
    return 1;
  }
  try {
    const result = action === "assign"
      ? await assignSkillToRole(detected.projectRoot, roleId, skillName)
      : await unassignSkillFromRole(detected.projectRoot, roleId, skillName);
    console.log(
      `${symbol.ok()} ${
        action === "assign" ? "Attached" : "Removed"
      } ${color.bold(skillName)} ${
        action === "assign" ? "to" : "from"
      } ${color.bold(roleId)}.`,
    );
    console.log(
      indent(
        `Skills now: ${
          result.skills.length > 0 ? result.skills.join(", ") : "(none)"
        }`,
      ),
    );
    return 0;
  } catch (err) {
    console.error(
      `${symbol.fail()} ${
        isVibestrateError(err) ? err.message : err instanceof Error ? err.message : String(err)
      }`,
    );
    return 1;
  }
}

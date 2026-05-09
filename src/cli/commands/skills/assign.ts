import { detectProject } from "../../../project/project-detector.js";
import { configExists } from "../../../project/config-loader.js";
import {
  assignSkillToAgent,
  unassignSkillFromAgent,
} from "../../../skills/skill-assignment-service.js";
import { color, indent, symbol } from "../../ui/format.js";
import { isAmacoError } from "../../../utils/errors.js";

export async function runSkillsAssign(
  agentId: string,
  skillName: string,
): Promise<number> {
  return change(agentId, skillName, "assign");
}

export async function runSkillsUnassign(
  agentId: string,
  skillName: string,
): Promise<number> {
  return change(agentId, skillName, "unassign");
}

async function change(
  agentId: string,
  skillName: string,
  action: "assign" | "unassign",
): Promise<number> {
  if (!agentId || !skillName) {
    console.error(
      `${symbol.fail()} Both agent and skill are required. Example: ${color.bold(
        `amaco skills ${action} reviewer security`,
      )}`,
    );
    return 1;
  }
  const detected = await detectProject(process.cwd());
  if (!(await configExists(detected.projectRoot))) {
    console.error(
      `${symbol.fail()} No Amaco config found. Run ${color.bold("amaco init")} first.`,
    );
    return 1;
  }
  try {
    const result = action === "assign"
      ? await assignSkillToAgent(detected.projectRoot, agentId, skillName)
      : await unassignSkillFromAgent(detected.projectRoot, agentId, skillName);
    console.log(
      `${symbol.ok()} ${
        action === "assign" ? "Attached" : "Removed"
      } ${color.bold(skillName)} ${
        action === "assign" ? "to" : "from"
      } ${color.bold(agentId)}.`,
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
        isAmacoError(err) ? err.message : err instanceof Error ? err.message : String(err)
      }`,
    );
    return 1;
  }
}

import { ConfigError } from "../utils/errors.js";
import {
  readDocument,
  writeDocument,
} from "../setup/config-update-service.js";
import { discoverSkills, findSkillByName } from "./skill-discovery.js";
import { builtinRoleIds } from "../roles/role-schema.js";

export type SkillAssignmentSummary = {
  roleId: string;
  skills: string[];
};

export async function listRoleSkillAssignments(
  projectRoot: string,
): Promise<SkillAssignmentSummary[]> {
  const { doc } = await readDocument(projectRoot);
  const js = doc.toJS() as { roles?: Record<string, { skills?: string[] }> };
  const out: SkillAssignmentSummary[] = [];
  for (const [roleId, agent] of Object.entries(js.roles ?? {})) {
    out.push({ roleId, skills: agent.skills ?? [] });
  }
  return out.sort((a, b) => a.roleId.localeCompare(b.roleId));
}

async function assertRoleExists(projectRoot: string, roleId: string): Promise<void> {
  const { doc } = await readDocument(projectRoot);
  if (!doc.hasIn(["roles", roleId])) {
    throw new ConfigError(
      `Agent "${roleId}" is not defined in this project. Available: ${
        builtinRoleIds.join(", ")
      }.`,
    );
  }
}

export async function assignSkillToRole(
  projectRoot: string,
  roleId: string,
  skillName: string,
): Promise<{ skills: string[] }> {
  await assertRoleExists(projectRoot, roleId);
  const skill = await findSkillByName(projectRoot, skillName);
  if (!skill) {
    const all = await discoverSkills(projectRoot);
    const known = all.map((s) => s.name).sort().join(", ");
    throw new ConfigError(
      `No skill named "${skillName}" was discovered. Found: ${known || "(none)"}.`,
    );
  }

  const { doc } = await readDocument(projectRoot);
  const current = (doc.getIn(["roles", roleId, "skills"]) as unknown as { toJSON?: () => unknown[] } | unknown[] | undefined);
  let arr: string[] = [];
  if (Array.isArray(current)) {
    arr = current as string[];
  } else if (current && typeof (current as { toJSON?: () => unknown }).toJSON === "function") {
    const j = (current as { toJSON: () => unknown }).toJSON();
    arr = Array.isArray(j) ? (j as string[]) : [];
  }
  if (arr.includes(skillName)) return { skills: arr };
  const next = [...arr, skillName];
  doc.setIn(["roles", roleId, "skills"], next);
  await writeDocument(projectRoot, doc);
  return { skills: next };
}

export async function unassignSkillFromRole(
  projectRoot: string,
  roleId: string,
  skillName: string,
): Promise<{ skills: string[] }> {
  await assertRoleExists(projectRoot, roleId);
  const { doc } = await readDocument(projectRoot);
  const current = doc.getIn(["roles", roleId, "skills"]);
  let arr: string[] = [];
  if (Array.isArray(current)) {
    arr = current as string[];
  } else if (current && typeof (current as { toJSON?: () => unknown }).toJSON === "function") {
    const j = (current as { toJSON: () => unknown }).toJSON();
    arr = Array.isArray(j) ? (j as string[]) : [];
  }
  const next = arr.filter((s) => s !== skillName);
  doc.setIn(["roles", roleId, "skills"], next);
  await writeDocument(projectRoot, doc);
  return { skills: next };
}

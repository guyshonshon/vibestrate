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

// Skill assignment edits Roles inside the project's default Crew. Roles now
// live under `crews.<defaultCrew>.roles.<roleId>`.
function defaultCrewId(doc: { get: (k: string) => unknown }): string {
  const raw = doc.get("defaultCrew");
  return typeof raw === "string" && raw.length > 0 ? raw : "default";
}

function readSkillArray(
  current: unknown,
): string[] {
  if (Array.isArray(current)) return current as string[];
  if (current && typeof (current as { toJSON?: () => unknown }).toJSON === "function") {
    const j = (current as { toJSON: () => unknown }).toJSON();
    return Array.isArray(j) ? (j as string[]) : [];
  }
  return [];
}

export async function listRoleSkillAssignments(
  projectRoot: string,
): Promise<SkillAssignmentSummary[]> {
  const { doc } = await readDocument(projectRoot);
  const js = doc.toJS() as {
    crews?: Record<string, { roles?: Record<string, { skills?: string[] }> }>;
    defaultCrew?: string;
  };
  const crewId = js.defaultCrew ?? "default";
  const roles = js.crews?.[crewId]?.roles ?? {};
  const out: SkillAssignmentSummary[] = [];
  for (const [roleId, role] of Object.entries(roles)) {
    out.push({ roleId, skills: role.skills ?? [] });
  }
  return out.sort((a, b) => a.roleId.localeCompare(b.roleId));
}

function skillsPath(crewId: string, roleId: string): string[] {
  return ["crews", crewId, "roles", roleId, "skills"];
}

async function assertRoleExists(
  doc: {
    get: (k: string) => unknown;
    hasIn: (p: string[]) => boolean;
    toJS: () => unknown;
  },
  roleId: string,
): Promise<string> {
  const crewId = defaultCrewId(doc);
  if (!doc.hasIn(["crews", crewId, "roles", roleId])) {
    const available = Object.keys(
      (doc.toJS() as {
        crews?: Record<string, { roles?: Record<string, unknown> }>;
      }).crews?.[crewId]?.roles ?? {},
    );
    throw new ConfigError(
      `Role "${roleId}" is not defined in crew "${crewId}". Available: ${
        (available.length > 0 ? available : [...builtinRoleIds]).join(", ")
      }.`,
    );
  }
  return crewId;
}

export async function assignSkillToRole(
  projectRoot: string,
  roleId: string,
  skillName: string,
): Promise<{ skills: string[] }> {
  const skill = await findSkillByName(projectRoot, skillName);
  if (!skill) {
    const all = await discoverSkills(projectRoot);
    const known = all.map((s) => s.name).sort().join(", ");
    throw new ConfigError(
      `No skill named "${skillName}" was discovered. Found: ${known || "(none)"}.`,
    );
  }

  const { doc } = await readDocument(projectRoot);
  const crewId = await assertRoleExists(doc, roleId);
  const arr = readSkillArray(doc.getIn(skillsPath(crewId, roleId)));
  if (arr.includes(skillName)) return { skills: arr };
  const next = [...arr, skillName];
  doc.setIn(skillsPath(crewId, roleId), next);
  await writeDocument(projectRoot, doc);
  return { skills: next };
}

export async function unassignSkillFromRole(
  projectRoot: string,
  roleId: string,
  skillName: string,
): Promise<{ skills: string[] }> {
  const { doc } = await readDocument(projectRoot);
  const crewId = await assertRoleExists(doc, roleId);
  const arr = readSkillArray(doc.getIn(skillsPath(crewId, roleId)));
  const next = arr.filter((s) => s !== skillName);
  doc.setIn(skillsPath(crewId, roleId), next);
  await writeDocument(projectRoot, doc);
  return { skills: next };
}

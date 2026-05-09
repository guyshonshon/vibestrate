import { ConfigError } from "../utils/errors.js";
import {
  readDocument,
  writeDocument,
} from "../setup/config-update-service.js";
import { discoverSkills, findSkillByName } from "./skill-discovery.js";
import { builtinAgentIds } from "../agents/agent-schema.js";

export type SkillAssignmentSummary = {
  agentId: string;
  skills: string[];
};

export async function listAgentSkillAssignments(
  projectRoot: string,
): Promise<SkillAssignmentSummary[]> {
  const { doc } = await readDocument(projectRoot);
  const js = doc.toJS() as { agents?: Record<string, { skills?: string[] }> };
  const out: SkillAssignmentSummary[] = [];
  for (const [agentId, agent] of Object.entries(js.agents ?? {})) {
    out.push({ agentId, skills: agent.skills ?? [] });
  }
  return out.sort((a, b) => a.agentId.localeCompare(b.agentId));
}

async function assertAgentExists(projectRoot: string, agentId: string): Promise<void> {
  const { doc } = await readDocument(projectRoot);
  if (!doc.hasIn(["agents", agentId])) {
    throw new ConfigError(
      `Agent "${agentId}" is not defined in this project. Available: ${
        builtinAgentIds.join(", ")
      }.`,
    );
  }
}

export async function assignSkillToAgent(
  projectRoot: string,
  agentId: string,
  skillName: string,
): Promise<{ skills: string[] }> {
  await assertAgentExists(projectRoot, agentId);
  const skill = await findSkillByName(projectRoot, skillName);
  if (!skill) {
    const all = await discoverSkills(projectRoot);
    const known = all.map((s) => s.name).sort().join(", ");
    throw new ConfigError(
      `No skill named "${skillName}" was discovered. Found: ${known || "(none)"}.`,
    );
  }

  const { doc } = await readDocument(projectRoot);
  const current = (doc.getIn(["agents", agentId, "skills"]) as unknown as { toJSON?: () => unknown[] } | unknown[] | undefined);
  let arr: string[] = [];
  if (Array.isArray(current)) {
    arr = current as string[];
  } else if (current && typeof (current as { toJSON?: () => unknown }).toJSON === "function") {
    const j = (current as { toJSON: () => unknown }).toJSON();
    arr = Array.isArray(j) ? (j as string[]) : [];
  }
  if (arr.includes(skillName)) return { skills: arr };
  const next = [...arr, skillName];
  doc.setIn(["agents", agentId, "skills"], next);
  await writeDocument(projectRoot, doc);
  return { skills: next };
}

export async function unassignSkillFromAgent(
  projectRoot: string,
  agentId: string,
  skillName: string,
): Promise<{ skills: string[] }> {
  await assertAgentExists(projectRoot, agentId);
  const { doc } = await readDocument(projectRoot);
  const current = doc.getIn(["agents", agentId, "skills"]);
  let arr: string[] = [];
  if (Array.isArray(current)) {
    arr = current as string[];
  } else if (current && typeof (current as { toJSON?: () => unknown }).toJSON === "function") {
    const j = (current as { toJSON: () => unknown }).toJSON();
    arr = Array.isArray(j) ? (j as string[]) : [];
  }
  const next = arr.filter((s) => s !== skillName);
  doc.setIn(["agents", agentId, "skills"], next);
  await writeDocument(projectRoot, doc);
  return { skills: next };
}

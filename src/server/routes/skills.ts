import { z } from "zod";
import type { FastifyInstance } from "fastify";
import {
  discoverSkills,
  findSkillById,
} from "../../skills/skill-discovery.js";
import {
  assignSkillToAgent,
  listAgentSkillAssignments,
  unassignSkillFromAgent,
} from "../../skills/skill-assignment-service.js";
import { HttpError } from "../security.js";

const assignBody = z.object({ agentId: z.string().min(1) });

export type SkillsRoutesDeps = {
  projectRoot: string;
};

export async function registerSkillsRoutes(
  app: FastifyInstance,
  deps: SkillsRoutesDeps,
): Promise<void> {
  const { projectRoot } = deps;

  app.get("/api/skills", async () => {
    const [skills, assignments] = await Promise.all([
      discoverSkills(projectRoot),
      listAgentSkillAssignments(projectRoot).catch(() => []),
    ]);
    return { skills, assignments };
  });

  app.get<{ Params: { skillId: string } }>(
    "/api/skills/:skillId",
    async (req) => {
      const decoded = decodeURIComponent(req.params.skillId);
      const skill = await findSkillById(projectRoot, decoded);
      if (!skill) throw new HttpError(404, "Skill not found.");
      const assignments = await listAgentSkillAssignments(projectRoot).catch(
        () => [],
      );
      const assignedAgents = assignments
        .filter((a) => a.skills.includes(skill.name))
        .map((a) => a.agentId);
      return { skill, assignedAgents };
    },
  );

  async function ensureSkillExists(skillId: string): Promise<string> {
    const decoded = decodeURIComponent(skillId);
    const skill = await findSkillById(projectRoot, decoded);
    if (!skill) {
      throw new HttpError(
        404,
        `No skill matches id "${decoded}". Use GET /api/skills to list available skill ids.`,
      );
    }
    return skill.name;
  }

  app.post<{ Params: { skillId: string }; Body: unknown }>(
    "/api/skills/:skillId/assign",
    async (req) => {
      const parsed = assignBody.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, "Body must be { agentId: string }.");
      }
      const skillName = await ensureSkillExists(req.params.skillId);
      try {
        const result = await assignSkillToAgent(
          projectRoot,
          parsed.data.agentId,
          skillName,
        );
        const assignments = await listAgentSkillAssignments(projectRoot);
        return { agentId: parsed.data.agentId, skills: result.skills, assignments };
      } catch (err) {
        throw new HttpError(
          400,
          err instanceof Error ? err.message : String(err),
        );
      }
    },
  );

  app.post<{ Params: { skillId: string }; Body: unknown }>(
    "/api/skills/:skillId/unassign",
    async (req) => {
      const parsed = assignBody.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, "Body must be { agentId: string }.");
      }
      const skillName = await ensureSkillExists(req.params.skillId);
      try {
        const result = await unassignSkillFromAgent(
          projectRoot,
          parsed.data.agentId,
          skillName,
        );
        const assignments = await listAgentSkillAssignments(projectRoot);
        return { agentId: parsed.data.agentId, skills: result.skills, assignments };
      } catch (err) {
        throw new HttpError(
          400,
          err instanceof Error ? err.message : String(err),
        );
      }
    },
  );
}

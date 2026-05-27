import { z } from "zod";
import type { FastifyInstance } from "fastify";
import {
  discoverSkills,
  findSkillById,
} from "../../skills/skill-discovery.js";
import {
  assignSkillToRole,
  listRoleSkillAssignments,
  unassignSkillFromRole,
} from "../../skills/skill-assignment-service.js";
import { HttpError } from "../security.js";

const assignBody = z.object({ roleId: z.string().min(1) });

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
      listRoleSkillAssignments(projectRoot).catch(() => []),
    ]);
    return { skills, assignments };
  });

  app.get<{ Params: { skillId: string } }>(
    "/api/skills/:skillId",
    async (req) => {
      const decoded = decodeURIComponent(req.params.skillId);
      const skill = await findSkillById(projectRoot, decoded);
      if (!skill) throw new HttpError(404, "Skill not found.");
      const assignments = await listRoleSkillAssignments(projectRoot).catch(
        () => [],
      );
      const assignedRoles = assignments
        .filter((a) => a.skills.includes(skill.name))
        .map((a) => a.roleId);
      return { skill, assignedRoles };
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
        throw new HttpError(400, "Body must be { roleId: string }.");
      }
      const skillName = await ensureSkillExists(req.params.skillId);
      try {
        const result = await assignSkillToRole(
          projectRoot,
          parsed.data.roleId,
          skillName,
        );
        const assignments = await listRoleSkillAssignments(projectRoot);
        return { roleId: parsed.data.roleId, skills: result.skills, assignments };
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
        throw new HttpError(400, "Body must be { roleId: string }.");
      }
      const skillName = await ensureSkillExists(req.params.skillId);
      try {
        const result = await unassignSkillFromRole(
          projectRoot,
          parsed.data.roleId,
          skillName,
        );
        const assignments = await listRoleSkillAssignments(projectRoot);
        return { roleId: parsed.data.roleId, skills: result.skills, assignments };
      } catch (err) {
        throw new HttpError(
          400,
          err instanceof Error ? err.message : String(err),
        );
      }
    },
  );
}

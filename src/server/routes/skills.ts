import type { FastifyInstance } from "fastify";
import {
  discoverSkills,
  findSkillById,
} from "../../skills/skill-discovery.js";
import { listAgentSkillAssignments } from "../../skills/skill-assignment-service.js";
import { HttpError } from "../security.js";

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
      return { skill };
    },
  );
}

// Skill routes: list and read the discovered skills, assign or unassign one to
// a role, and install one from a URL.
//
// The two read routes are thin wiring over skill-discovery. The other three
// each write something and each carry their own guard.
//
// Assign and unassign reach the config through agents/role-skills-write, which
// owns the Action Broker gate and the write; this file resolves the skill id to
// a name and rejects an unknown one. No route here writes bytes itself.
//
// `POST /api/skills/fetch` is the third: a browser-reachable route that makes
// an outbound network request and then writes a file into the project. Its
// guards all live in
// agents/skill-fetch.ts - the fetch goes through `fetchGuardedText` (which
// refuses private hosts, so a page cannot use this to reach the local network),
// the body is passed through `redactSecretsInText` before it is stored, the
// destination is checked with `isPathInside` against the project's skills dir,
// and an existing file is only replaced when the caller asked for `overwrite`.
// Keep those guards there rather than moving decisions into this file.
//
// The optional `assess` step feeds the stored text to a model for a read-only
// overview; it is wrapped so a failure degrades to a null assessment and never
// fails the install.
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import {
  discoverSkills,
  findSkillById,
} from "../../agents/skill-discovery.js";
import { listRoleSkillAssignments } from "../../agents/skill-assignment-service.js";
import {
  setRoleSkillAudited,
  type RoleSkillMode,
} from "../../agents/role-skills-write.js";
import { HttpError } from "../security.js";

const assignBody = z.object({ roleId: z.string().min(1) });

export type SkillsRoutesDeps = {
  projectRoot: string;
};

const skillFetchBody = z.object({
  url: z.string().url().max(2000),
  name: z.string().min(1).max(80).optional(),
  assess: z.boolean().optional(),
  overwrite: z.boolean().optional(),
});

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

  // Fetch a skill from a URL (guarded + secret-redacted), optionally with a
  // read-only AI overview. The API never allows private hosts (SSRF).
  app.post<{ Body: unknown }>("/api/skills/fetch", async (req) => {
    const parsed = skillFetchBody.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.message);
    const { installSkillFromUrl, assessSkill } = await import(
      "../../agents/skill-fetch.js"
    );
    const r = await installSkillFromUrl({
      projectRoot,
      url: parsed.data.url,
      name: parsed.data.name,
      overwrite: parsed.data.overwrite,
    });
    if (!r.ok) throw new HttpError(409, r.reason);
    let assessment = null;
    if (parsed.data.assess) {
      try {
        const { readText } = await import("../../utils/fs.js");
        const { projectSkillsDir } = await import("../../utils/paths.js");
        const path = await import("node:path");
        const skillText = await readText(
          path.join(projectSkillsDir(projectRoot), `${r.name}.md`),
        );
        assessment = await assessSkill({ projectRoot, skillText });
      } catch {
        assessment = null;
      }
    }
    return { skill: r, assessment };
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

  // Assign and unassign are one handler because they are one effect with a
  // direction. Both write `crews.<defaultCrew>.roles.<roleId>.skills` in
  // project.yml - the same field the Crew editor's role PATCH writes - so both
  // go through setRoleSkillAudited, which owns the Action Broker gate and the
  // write. Without it this page was a second, ungated door onto a field the
  // Crew editor's gate protects, and the door that grants a role new
  // instructions and new tools at that.
  async function applySkillAssignment(
    mode: RoleSkillMode,
    skillId: string,
    body: unknown,
  ) {
    const parsed = assignBody.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, "Body must be { roleId: string }.");
    }
    const skillName = await ensureSkillExists(skillId);
    const written = await setRoleSkillAudited({
      projectRoot,
      roleId: parsed.data.roleId,
      skillName,
      mode,
    });
    if (!written.ok) {
      throw new HttpError(written.status, written.reasons.join(" "));
    }
    const assignments = await listRoleSkillAssignments(projectRoot);
    return { roleId: parsed.data.roleId, skills: written.skills, assignments };
  }

  app.post<{ Params: { skillId: string }; Body: unknown }>(
    "/api/skills/:skillId/assign",
    async (req) => applySkillAssignment("assign", req.params.skillId, req.body),
  );

  app.post<{ Params: { skillId: string }; Body: unknown }>(
    "/api/skills/:skillId/unassign",
    async (req) =>
      applySkillAssignment("unassign", req.params.skillId, req.body),
  );
}
